/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { editDocument, purchaseTaxRate, editQuotation } = require('./document-edits');
const { createUserSessionToken, verifyUserSessionToken } = require('./user-session-token');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const version = '2026-10-20T10:00:00.000Z';
const base = { userId: 'admin', updatedAt: version, date: '2026-10-24T00:00:00.000Z' };
const purchaseInput = {
  ...base, id: 'purchase', supplierId: 's1', billNumber: 'PUR-1', invoiceType: 'فاتورة ضريبية',
  items: [{ productId: 'a', quantity: 10, unitCost: 100 }]
};
const expenseInput = { ...base, id: 'expense', supplierId: 's1', bankId: 'bank1', amount: 100, notes: 'تعديل', reference: 'REF' };
const generalInput = { ...base, id: 'general', categoryId: 'cat1', bankId: 'bank1', amount: 50 };
const copy = value => structuredClone(value);

test('purchase receipt number can be saved, cleared and preserved by older edit clients without monetary or stock changes', async () => {
  for (const [value, expected] of [[' WR-0007 ', 'WR-0007'], ['', null], [null, null], [undefined, 'OLD-WR']]) {
    const db = store();
    db.state.purchaseOrder[0].warehouseReceiptNumber = 'OLD-WR';
    const stock = db.state.product[0].stockQty;
    const balance = db.state.supplier[0].balance;
    const saved = await editDocument(db.database, 'purchase', { ...purchaseInput, warehouseReceiptNumber: value });
    assert.equal(saved.warehouseReceiptNumber, expected);
    assert.equal(db.state.product[0].stockQty, stock);
    assert.equal(db.state.supplier[0].balance, balance);
    assert.equal(saved.netAmount, 1140);
  }
  for (const value of [123, 'a'.repeat(256), 'bad\0number']) {
    const db = store();
    await assert.rejects(editDocument(db.database, 'purchase', { ...purchaseInput, warehouseReceiptNumber: value }), /رقم استلام المخزن/);
    assert.equal(db.calls.length, 0);
  }
});

function store() {
  let state = {
    user: [{ id: 'admin', role: 'ADMIN' }, { id: 'cashier', role: 'CASHIER' }],
    supplier: [{ id: 's1', balance: 1040, openingBalance: 0 }, { id: 's2', balance: 300, openingBalance: 300 }],
    bank: [{ id: 'bank1', balance: 850 }, { id: 'bank2', balance: 500 }],
    expenseCategory: [{ id: 'cat1' }, { id: 'cat2' }],
    product: [
      { id: 'a', name: 'Product A', stockQty: 8, taxRate: 0.14, price: 180, costPrice: 150 },
      { id: 'b', name: 'Product B', stockQty: 20, taxRate: 0, price: 400, costPrice: 300 }
    ],
    order: [{ id: 'quotation', invoiceNumber: 'QT-00001', isQuotation: true, status: 'PENDING',
      customerId: 'customer', customerName: 'Customer', receiverName: 'Receiver', siteReceiptNumber: 'SITE',
      invoiceType: 'فاتورة ضريبية', createdAt: version, updatedAt: version,
      totalAmount: 100, taxAmount: 14, netAmount: 114 }],
    orderItem: [{ id: 'quote-line', orderId: 'quotation', productId: 'a', quantity: 1,
      unitPrice: 100, taxAmount: 14, total: 114, position: 0 }],
    purchaseOrder: [{ id: 'purchase', supplierId: 's1', billNumber: 'PUR-1', invoiceType: 'فاتورة ضريبية',
      totalAmount: 1000, taxAmount: 140, netAmount: 1140, date: version, createdAt: version, updatedAt: version }],
    purchaseOrderItem: [{ id: 'line1', purchaseOrderId: 'purchase', productId: 'a', quantity: 10, unitCost: 100, taxAmount: 140, total: 1140 }],
    expensePayment: [{ id: 'expense', expenseNumber: 'EXP-1', supplierId: 's1', bankId: 'bank1', amount: 100,
      reference: null, notes: null, date: version, createdAt: version, updatedAt: version }],
    generalExpense: [{ id: 'general', expenseNumber: 'GEX-1', categoryId: 'cat1', bankId: 'bank1', amount: 50,
      reference: null, notes: null, date: version, createdAt: version, updatedAt: version }]
  };
  const calls = [];
  let failOn = '';
  let sequence = 0;
  const tx = {};
  function withRelations(model, row, include) {
    if (!row) return null;
    const result = copy(row);
    if (include?.items) {
      result.items = model === 'order'
        ? copy(state.orderItem.filter(item => item.orderId === row.id).sort((a, b) => a.position - b.position))
        : copy(state.purchaseOrderItem.filter(item => item.purchaseOrderId === row.id));
    }

    if (include?.supplier) result.supplier = copy(state.supplier.find(s => s.id === row.supplierId));
    if (include?.bank) result.bank = copy(state.bank.find(b => b.id === row.bankId));
    if (include?.category) result.category = copy(state.expenseCategory.find(c => c.id === row.categoryId));
    return result;
  }
  for (const model of Object.keys(state)) {
    tx[model] = {
      findUnique: async ({ where, include }) => withRelations(model,
        state[model].find(row => Object.entries(where).every(([key, value]) => row[key] === value)), include),
      update: async ({ where, data, include }) => {
        calls.push(`${model}.update`);
        if (failOn === `${model}.update`) throw new Error('Injected database failure');
        const row = state[model].find(row => row.id === where.id);
        assert.ok(row, model);
        for (const [key, value] of Object.entries(data)) {
          row[key] = value && typeof value === 'object' && 'increment' in value
            ? row[key] + value.increment : value;
        }
        if ('updatedAt' in row) row.updatedAt = '2026-10-24T12:00:00.000Z';
        return withRelations(model, row, include);
      },
      delete: async ({ where }) => {
        calls.push(`${model}.delete`);
        state[model] = state[model].filter(row => row.id !== where.id);
      },
      create: async ({ data }) => {
        calls.push(`${model}.create`);
        if (failOn === `${model}.create`) throw new Error('Injected database failure');
        const row = { id: `new-${++sequence}`, ...data };
        state[model].push(row);
        return copy(row);
      }
    };
  }
  return {
    get state() { return state; }, calls,
    fail(operation) { failOn = operation; },
    database: {
      ...tx,
      $transaction: async callback => {
        const before = copy(state);
        try { return await callback(tx); }
        catch (error) { state = before; throw error; }
      }
    }
  };
}

const quotationInput = { id: 'quotation', userId: 'admin', updatedAt: version, items: [
  { productId: 'b', quantity: 3, unitPrice: 20 }, { productId: 'a', quantity: 2, unitPrice: 50 }
] };

test('quotation edits preserve identity, parties, dates and inventory while replacing ordered lines and totals', async () => {
  const context = store();
  const original = copy(context.state.order[0]);
  context.state.product[0].taxRate = 0.2;
  const products = copy(context.state.product);
  const result = await editQuotation(context.database, { ...quotationInput, customerId: 'forged', invoiceNumber: 'NEW' });
  assert.deepEqual(result.items.map(item => [item.productId, item.position]), [['b', 0], ['a', 1]]);
  assert.equal(result.totalAmount, 160);
  assert.equal(result.taxAmount, 14);
  assert.equal(result.netAmount, 174);
  for (const key of ['invoiceNumber', 'customerId', 'customerName', 'receiverName', 'siteReceiptNumber', 'createdAt', 'invoiceType', 'isQuotation', 'status']) {
    assert.equal(result[key], original[key], key);
  }
  assert.deepEqual(context.state.product, products);
  assert.ok(context.calls.every(call => call.startsWith('orderItem.') || call === 'order.update'));
});

test('quotation edits reject non-admins, final invoices, converted and stale quotations before any write', async () => {
  for (const change of ['cashier', 'invoice', 'converted', 'stale']) {
    const context = store();
    const input = copy(quotationInput);
    if (change === 'cashier') input.userId = 'cashier';
    if (change === 'invoice') context.state.order[0].isQuotation = false;
    if (change === 'converted') context.state.order[0].status = 'CONVERTED';
    if (change === 'stale') input.updatedAt = '2026-01-01';
    await assert.rejects(editQuotation(context.database, input), { statusCode: change === 'cashier' ? 403 : 409 });
    assert.equal(context.calls.length, 0);
  }
});

test('quotation edits validate every item and roll back replacements and totals on database failure', async () => {
  for (const items of [[], [{ productId: 'a', quantity: 0, unitPrice: 1 }],
    [{ productId: 'a', quantity: 1.2, unitPrice: 1 }], [{ productId: 'a', quantity: 1, unitPrice: -1 }],
    [{ productId: 'missing', quantity: 1, unitPrice: 1 }],
    [{ productId: 'a', quantity: 1, unitPrice: 1 }, { productId: 'a', quantity: 2, unitPrice: 2 }]]) {
    const context = store();
    await assert.rejects(editQuotation(context.database, { ...quotationInput, items }));
    assert.equal(context.calls.length, 0);
  }
  for (const operation of ['orderItem.create', 'order.update']) {
    const context = store();
    const before = copy(context.state);
    context.fail(operation);
    await assert.rejects(editQuotation(context.database, quotationInput), /Injected/);
    assert.deepEqual(context.state, before);
  }
});

test('quotation edits keep non-tax quotations tax-free and support zero prices and out-of-stock quote items', async () => {
  const context = store();
  context.state.order[0].invoiceType = 'فاتورة';
  context.state.product[0].stockQty = 0;
  const result = await editQuotation(context.database, { ...quotationInput, items: [
    { productId: 'a', quantity: 10, unitPrice: 0 }, { productId: 'b', quantity: 2, unitPrice: 10 }
  ] });
  assert.equal(result.taxAmount, 0);
  assert.equal(result.netAmount, 20);
  assert.equal(context.state.product[0].stockQty, 0);
});

test('quotation API verifies signed admin identity, rejects malformed requests and ignores forged identities', async () => {
  process.env.POS_API_TOKEN = 'quotation-session-test-secret';
  const context = store();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'quotations', 'route.ts')), {
    exports, process, Error, console: { error() {} },
    require: id => {
      if (id === '@/lib/prisma') return { prisma: context.database };
      if (id === '@/lib/document-edits') return { editQuotation };
      if (id === '@/lib/user-session-token') return { verifyUserSessionToken };
      if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } };
      throw new Error(id);
    }
  });
  const post = (user, body, token) => exports.PUT(new Request('http://localhost/api/quotations', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token ?? createUserSessionToken(user)}` },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }));
  assert.equal((await post({}, quotationInput, 'invalid')).status, 401);
  assert.equal((await post({ id: 'cashier', role: 'CASHIER' }, quotationInput)).status, 403);
  assert.equal((await post({ id: 'admin', role: 'ADMIN' }, '{')).status, 400);
  assert.equal((await post({ id: 'cashier', role: 'ADMIN' }, quotationInput)).status, 403);
  const response = await post({ id: 'admin', role: 'ADMIN' }, { ...quotationInput, userId: 'cashier' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).invoiceNumber, 'QT-00001');
});

test('quotation Electron editing uses authenticated sender and cannot forge the admin user', async () => {
  const context = store();
  const handlers = new Map();
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase(); authenticatedUsers.set(10, {id:"admin", role:"ADMIN"});', {
    process, Buffer, console: { error() {} }, __dirname: path.join(root, 'electron'),
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => context.database };
      if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
      return require(id);
    }
  });
  const update = handlers.get('update-quotation');
  await assert.rejects(update({ sender: { id: 99 } }, quotationInput), /للمدير فقط/);
  const saved = await update({ sender: { id: 10 } }, { ...quotationInput, userId: 'cashier' });
  assert.equal(saved.id, 'quotation');
  assert.equal(saved.netAmount, 174);
  assert.ok(read('electron', 'preload.js').includes("ipcRenderer.invoke('update-quotation', data)"));
});

test('quotation editor uses update transports, retains edits on failure and exposes only permitted fields', async () => {
  const source = read('src', 'components', 'QuotationEdit.tsx');
  const tree = ts.createSourceFile('QuotationEdit.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'save') declaration = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const desktop of [false, true]) {
    for (const fail of [false, true]) {
      const errors = [];
      const calls = [];
      const saved = [];
      const exports = {};
      const send = async data => {
        calls.push(data);
        if (fail) throw new Error('stale quotation');
        return { id: 'quotation', items: [] };
      };
      vm.runInNewContext(compile(`const ${declaration}; exports.save = save;`), {
        exports, Error, busy: false, user: { role: 'ADMIN', sessionToken: 'signed-token' },
        quotation: { id: 'quotation', updatedAt: version }, items: quotationInput.items,
        setError: error => errors.push(error), setBusy() {}, onSaved: data => saved.push(data),
        confirmQuotationProfit: async () => true,
        window: desktop ? { electronAPI: { updateQuotation: send } } : {},
        fetch: async (url, options) => {
          assert.equal(url, '/api/quotations');
          assert.equal(options.method, 'PUT');
          assert.equal(options.headers.Authorization, 'Bearer signed-token');
          return Response.json(await send(JSON.parse(options.body)));
        }
      });
      await exports.save({ preventDefault() {} });
      assert.equal(calls.length, 1);
      assert.deepEqual(Object.keys(calls[0]).sort(), ['id', 'items', 'updatedAt']);
      assert.equal(saved.length, fail ? 0 : 1);
      if (fail) assert.ok(errors.includes('stale quotation'));
    }
  }
  const page = read('src', 'app', 'page.tsx');
  assert.ok(page.includes("currentUser?.role === 'ADMIN' && inv.isQuotation && inv.status !== 'CONVERTED'"));
  assert.ok(page.includes('setEditingQuotation(inv)'));
  assert.ok(page.includes('setEditingQuotation(invoice)'));
});

test('purchase edit replaces lines and adjusts stock and supplier only by net differences', async () => {
  const db = store();
  const beforePrices = db.state.product.map(p => [p.costPrice, p.price]);
  const saved = await editDocument(db.database, 'purchase', {
    ...purchaseInput, billNumber: 'PUR-EDIT', supplierId: 's2', invoiceType: 'فاتورة',
    items: [{ productId: 'a', quantity: 6, unitCost: 100 }, { productId: 'b', quantity: 3, unitCost: 50 }]
  });
  assert.equal(saved.id, 'purchase');
  assert.equal(saved.billNumber, 'PUR-EDIT');
  assert.equal(saved.createdAt, version);
  assert.equal(saved.totalAmount, 750);
  assert.equal(saved.taxAmount, 0);
  assert.equal(saved.netAmount, 750);
  assert.equal(saved.items.length, 2);
  assert.equal(db.state.purchaseOrder.length, 1);
  assert.deepEqual(db.state.product.map(p => p.stockQty), [4, 23]);
  assert.deepEqual(db.state.product.map(p => [p.costPrice, p.price]), beforePrices);
  assert.deepEqual(db.state.supplier.map(s => s.balance), [-100, 1050]);
  assert.deepEqual(db.state.bank.map(b => b.balance), [850, 500]);
  assert.equal(new Date(saved.date).toISOString(), base.date);
});

test('same-supplier purchase changes apply only the amount difference and zero tax stays zero', async () => {
  const db = store();
  const saved = await editDocument(db.database, 'purchase', {
    ...purchaseInput, items: [{ productId: 'a', quantity: 10, unitCost: 50 }, { productId: 'b', quantity: 1, unitCost: 50 }]
  });

  assert.equal(saved.totalAmount, 550);
  assert.equal(saved.taxAmount, 70);
  assert.equal(saved.netAmount, 620);
  assert.equal(db.state.supplier[0].balance, 520);
  assert.deepEqual(db.state.product.map(p => p.stockQty), [8, 21]);
});

test('metadata-only purchase edits keep historical item taxes when the product tax has changed', async () => {
  const db = store();
  db.state.product[0].taxRate = 0.2;
  const saved = await editDocument(db.database, 'purchase', {
    ...purchaseInput, items: [{ ...purchaseInput.items[0], id: 'line1' }]
  });

  assert.equal(saved.taxAmount, 140);
  assert.equal(saved.netAmount, 1140);
  assert.equal(db.state.supplier[0].balance, 1040);
  assert.equal(db.state.product[0].stockQty, 8);
});

test('purchase preview shares historical tax rules with saving and uses current tax only for new products or tax type changes', () => {
  const original = { quantity: 10, unitCost: 100, taxAmount: 140 };
  assert.equal(purchaseTaxRate('فاتورة ضريبية', 0.2, original, 'فاتورة ضريبية'), 0.14);
  assert.equal(purchaseTaxRate('فاتورة', 0.2, original, 'فاتورة ضريبية'), 0);
  assert.equal(purchaseTaxRate('فاتورة ضريبية', 0.2, undefined, 'فاتورة ضريبية'), 0.2);
  assert.equal(purchaseTaxRate('فاتورة ضريبية', 0, undefined, 'فاتورة ضريبية'), 0);
  assert.equal(purchaseTaxRate('فاتورة ضريبية', 0.2, original, 'فاتورة'), 0.2);
});

test('repeated product lines are aggregated before validating remaining stock', async () => {
  const db = store();
  await editDocument(db.database, 'purchase', {
    ...purchaseInput, items: [{ productId: 'a', quantity: 1, unitCost: 0 }, { productId: 'a', quantity: 1, unitCost: 100 }]
  });
  assert.equal(db.state.product[0].stockQty, 0);
  assert.equal(db.state.purchaseOrderItem.length, 2);
  assert.equal(db.state.purchaseOrder[0].netAmount, 114);
});

test('purchase reductions cannot remove already consumed stock and perform no writes', async () => {
  for (const items of [[{ productId: 'a', quantity: 1, unitCost: 100 }], [{ productId: 'b', quantity: 2, unitCost: 100 }]]) {
    const db = store();
    const before = copy(db.state);
    await assert.rejects(editDocument(db.database, 'purchase', { ...purchaseInput, items }), { statusCode: 409 });
    assert.deepEqual(db.state, before);
    assert.equal(db.calls.length, 0);
  }
});

test('supplier vouchers reverse old bank/supplier effects and apply edited ones without new voucher numbers', async () => {
  const db = store();
  const saved = await editDocument(db.database, 'expense', { ...expenseInput, bankId: 'bank2', supplierId: 's2', amount: 250 });
  assert.equal(saved.expenseNumber, 'EXP-1');
  assert.equal(saved.id, 'expense');
  assert.equal(saved.createdAt, version);
  assert.deepEqual(db.state.bank.map(b => b.balance), [950, 250]);
  assert.deepEqual(db.state.supplier.map(s => s.balance), [1140, 50]);
  assert.equal(saved.notes, 'تعديل');
  assert.equal(saved.reference, 'REF');
  assert.equal(db.state.expensePayment.length, 1);
});

test('same bank and supplier expense edits debit only the difference and metadata edits do not move balances', async () => {
  for (const amount of [50, 100, 200]) {
    const db = store();
    await editDocument(db.database, 'expense', { ...expenseInput, amount });
    assert.equal(db.state.bank[0].balance, 950 - amount);
    assert.equal(db.state.supplier[0].balance, 1140 - amount);
    if (amount === 100) assert.equal(db.calls.filter(c => c === 'bank.update' || c === 'supplier.update').length, 0);
  }
});

test('general expenses can change bank, category and amount without touching supplier debt', async () => {
  const db = store();
  const saved = await editDocument(db.database, 'generalExpense', {
    ...generalInput, bankId: 'bank2', categoryId: 'cat2', amount: 75, reference: ' NEW ', notes: 'مصروف معدل'
  });
  assert.deepEqual(db.state.bank.map(b => b.balance), [900, 425]);
  assert.deepEqual(db.state.supplier.map(s => s.balance), [1040, 300]);
  assert.equal(saved.categoryId, 'cat2');
  assert.equal(saved.reference, 'NEW');
  assert.equal(saved.notes, 'مصروف معدل');
  assert.equal(saved.expenseNumber, 'GEX-1');
  assert.equal(db.state.generalExpense.length, 1);
});

test('all document edits roll back stock, balances and lines when any database write fails', async () => {
  for (const [kind, input, failure] of [
    ['purchase', { ...purchaseInput, items: [{ productId: 'a', quantity: 5, unitCost: 100 }] }, 'purchaseOrderItem.create'],
    ['expense', { ...expenseInput, amount: 200 }, 'expensePayment.update'],
    ['generalExpense', { ...generalInput, amount: 100 }, 'generalExpense.update']
  ]) {
    const db = store();
    const before = copy(db.state);
    db.fail(failure);
    await assert.rejects(editDocument(db.database, kind, input), /Injected database failure/);
    assert.ok(db.calls.length > 1);
    assert.deepEqual(db.state, before);
  }
});

test('invalid, missing, duplicate and stale documents reject before any writes', async () => {
  for (const [kind, input, statusCode] of [
    ['purchase', { ...purchaseInput, id: 'missing' }, 404],
    ['purchase', { ...purchaseInput, items: [] }, 400],
    ['purchase', { ...purchaseInput, items: [null] }, 400],
    ['purchase', { ...purchaseInput, items: [{ productId: 'a', quantity: 1.5, unitCost: 1 }] }, 400],
    ['purchase', { ...purchaseInput, items: [{ productId: 'a', quantity: 10, unitCost: '' }] }, 400],
    ['purchase', { ...purchaseInput, items: [{ productId: 'a', quantity: true, unitCost: 10 }] }, 400],
    ['purchase', { ...purchaseInput, items: [{ productId: 'a', quantity: 10, unitCost: '  ' }] }, 400],
    ['purchase', { ...purchaseInput, items: [{ productId: 'a', quantity: 10, unitCost: -1 }] }, 400],
    ['purchase', { ...purchaseInput, supplierId: 'missing' }, 404],
    ['purchase', { ...purchaseInput, items: [{ productId: 'missing', quantity: 1, unitCost: 1 }] }, 404],
    ['expense', { ...expenseInput, amount: Infinity }, 400],
    ['expense', { ...expenseInput, amount: true }, 400],
    ['expense', { ...expenseInput, amount: 0 }, 400],
    ['expense', { ...expenseInput, bankId: 'missing' }, 404],
    ['generalExpense', { ...generalInput, categoryId: 'missing' }, 404],
    ['generalExpense', { ...generalInput, date: 'invalid' }, 400],
    ['generalExpense', { ...generalInput, updatedAt: '2026-01-01' }, 409]
  ]) {
    const db = store();
    await assert.rejects(editDocument(db.database, kind, input), { statusCode });
    assert.equal(db.calls.length, 0);
  }
  const db = store();
  db.state.purchaseOrder.push({ id: 'another', billNumber: 'TAKEN' });
  await assert.rejects(editDocument(db.database, 'purchase', { ...purchaseInput, billNumber: 'TAKEN' }), { statusCode: 400 });
  assert.equal(db.calls.length, 0);
});

test('all shared editing services require a current database admin role, not a caller-supplied role', async () => {
  for (const [kind, input] of [['purchase', purchaseInput], ['expense', expenseInput], ['generalExpense', generalInput]]) {
    for (const userId of ['cashier', 'missing']) {
      const db = store();
      await assert.rejects(editDocument(db.database, kind, { ...input, userId, role: 'ADMIN' }), { statusCode: 403 });
      assert.equal(db.calls.length, 0);
    }
  }
});

test('saving a stale form twice cannot apply stock or balance changes twice', async () => {
  const db = store();
  await editDocument(db.database, 'expense', { ...expenseInput, amount: 200 });
  const before = copy(db.state);
  await assert.rejects(editDocument(db.database, 'expense', { ...expenseInput, amount: 200 }), { statusCode: 409 });
  assert.deepEqual(db.state, before);
});

test('API update handler verifies signed admin sessions and ignores forged body user IDs', async () => {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'test-only-document-edit-secret';
  try {
    const db = store();
    const exports = {};
    vm.runInNewContext(compile(read('src', 'lib', 'document-edit-route.ts')), {
      exports, process, Error, console: { error() {} },
      require: id => {
        if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
        if (id === '@/lib/prisma') return { prisma: db.database };
        if (id === '@/lib/document-edits') return { editDocument };
        if (id === '@/lib/user-session-token') return { verifyUserSessionToken };
        throw new Error(id);
      }
    });
    const request = (token, data = generalInput) => new Request('http://localhost/api/general-expenses', {
      method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(data)
    });
    const cashier = createUserSessionToken({ id: 'cashier', role: 'CASHIER' });
    const admin = createUserSessionToken({ id: 'admin', role: 'ADMIN' });
    assert.equal((await exports.updateDocument(request('invalid'), 'generalExpense')).status, 401);
    assert.equal((await exports.updateDocument(request(cashier), 'generalExpense')).status, 403);
    const saved = await exports.updateDocument(request(admin, { ...generalInput, userId: 'cashier', amount: 75 }), 'generalExpense');
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).amount, 75);
    assert.equal((await exports.updateDocument(request(admin), 'generalExpense')).status, 409);
    db.state.user[0].role = 'CASHIER';
    assert.equal((await exports.updateDocument(request(admin, expenseInput), 'expense')).status, 403);
  } finally {
    if (previous === undefined) delete process.env.POS_API_TOKEN;
    else process.env.POS_API_TOKEN = previous;
  }
});

test('proxy accepts signed sessions only for the three new PUT paths, leaving other API access unchanged', () => {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'test-only-proxy-secret';
  try {
    const exports = {};
    vm.runInNewContext(compile(read('src', 'proxy.ts')), {
      exports, process,
      require: id => id === '@/lib/user-session-token' ? { verifyUserSessionToken }
        : { NextResponse: { next: () => ({ status: 200 }), json: (data, init) => Response.json(data, init) } }
    });
    const token = createUserSessionToken({ id: 'admin', role: 'ADMIN' });
    for (const pathname of ['/api/purchases', '/api/expenses', '/api/general-expenses']) {
      const request = { method: 'PUT', nextUrl: { pathname }, headers: new Headers({ authorization: `Bearer ${token}` }) };
      assert.equal(exports.proxy(request).status, 200);
      assert.equal(exports.proxy({ ...request, headers: new Headers() }).status, 401);
      assert.equal(exports.proxy({ ...request, method: 'POST' }).status, 401);
    }
    assert.equal(exports.proxy({
      method: 'PUT', nextUrl: { pathname: '/api/db' }, headers: new Headers({ authorization: `Bearer ${token}` })
    }).status, 401);
  } finally {
    if (previous === undefined) delete process.env.POS_API_TOKEN;
    else process.env.POS_API_TOKEN = previous;
  }
});

test('Electron edit bridges require the authenticated sender and execute the shared atomic services', async () => {
  const db = store();
  const handlers = new Map();
  let bridge;
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase(); authenticatedUsers.set(10, {id:"admin", role:"ADMIN"});', {
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => db.database };
      if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
      return require(id);
    },
    process, Error, Buffer, console: { error() {} }, __dirname: path.join(root, 'electron')
  });
  vm.runInNewContext(read('electron', 'preload.js'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } },
      ipcRenderer: { invoke: (channel, data) => handlers.get(channel)({ sender: { id: 10 } }, data) }
    })
  });
  const purchase = await bridge.updatePurchase({ ...purchaseInput, userId: 'cashier' });
  const expense = await bridge.updateExpense({ ...expenseInput, amount: 200 });
  const general = await bridge.updateGeneralExpense({ ...generalInput, amount: 75 });
  assert.equal(purchase.id, 'purchase');
  assert.equal(expense.amount, 200);
  assert.equal(general.amount, 75);
  await assert.rejects(handlers.get('update-expense')({ sender: { id: 99 } }, expenseInput), /مدير النظام/);
  const files = JSON.parse(read('package.json')).build.files;
  assert.ok(files.includes('src/lib/document-edits.js'));
});

function pageDeclarations(names) {
  const source = read('src', 'app', 'page.tsx');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
      declarations.push(`const ${node.getText(tree)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(declarations.length, names.length);
  return compile(declarations.join('\n') + `\nObject.assign(exports, {${names.join(',')}});`);
}

test('all page save handlers route additions to POST/create and edits to authenticated PUT/update', async () => {
  const names = ['handleSavePurchase', 'handleSaveExpense', 'handleSaveGeneralExpense', 'documentEditHeaders', 'documentEditData', 'formatPaymentInputDate'];
  const compiled = pageDeclarations(names);
  for (const desktop of [true, false]) {
    for (const editing of [true, false]) {
      for (const kind of ['Purchase', 'Expense', 'GeneralExpense']) {
        const calls = [];
        const errors = [];
        let closed = false;
        const exports = {};
        const result = { id: 'saved' };
        const context = {
          exports, Error, Date, submitting: false, currentUser: { id: 'admin', role: 'ADMIN', sessionToken: 'signed-session' },
          purchaseForm: copy(purchaseInput), expenseForm: copy(expenseInput), generalExpenseForm: copy(generalInput),
          editingPurchase: editing ? { id: 'purchase', updatedAt: version, date: '2026-10-24', originalDate: version } : null,
          editingExpense: editing ? { id: 'expense', updatedAt: version, date: '2026-10-24', originalDate: version } : null,
          editingGeneralExpense: editing ? { id: 'general', updatedAt: version, date: '2026-10-24', originalDate: version } : null,
          setSubmitting() {}, fetchPurchases() {}, fetchProducts() {}, fetchSuppliers() {}, fetchBanks() {},
          fetchExpenses() {}, fetchGeneralExpenses() {}, fetchExpenseCategories() {},
          setSelectedPurchase() {}, setSelectedExpense() {}, setShowExpenseReceiptModal() {},
          setPurchaseForm() {}, setExpenseForm() {}, setGeneralExpenseForm() {},
          setEditingPurchase() {}, setEditingExpense() {}, setEditingGeneralExpense() {},
          setShowPurchaseModal: value => { closed = !value; },
          setShowExpenseModal: value => { closed = !value; },
          setShowGeneralExpenseModal: value => { closed = !value; },
          alert: message => errors.push(message), console: { error() {} },
          window: desktop ? { electronAPI: Object.fromEntries(['Purchase', 'Expense', 'GeneralExpense'].flatMap(name =>
            ['create', 'update'].map(action => [`${action}${name}`, async data => {
              calls.push({ action, data });
              return result;
            }])
          )) } : {},
          fetch: async (url, options) => {
            calls.push({ url, action: options.method, data: JSON.parse(options.body), headers: options.headers });
            return Response.json(result);
          }
        };
        for (const field of ['purchaseForm', 'expenseForm', 'generalExpenseForm']) {
          delete context[field].id;
          delete context[field].updatedAt;
          delete context[field].userId;
          delete context[field].date;
        }
        vm.runInNewContext(compiled, context);
        await exports[`handleSave${kind}`]({ preventDefault() {} });
        assert.equal(errors.length, 0);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].action, desktop ? editing ? 'update' : 'create' : editing ? 'PUT' : 'POST');
        assert.equal(closed, true);
        if (editing) {
          assert.equal(calls[0].data.updatedAt, version);
          assert.equal(new Date(calls[0].data.date).getDate(), 24);
          if (!desktop) assert.equal(calls[0].headers.Authorization, 'Bearer signed-session');
        } else assert.equal(calls[0].data.id, undefined);
      }
    }
  }
});

test('failed edits retain the open form and errors are surfaced; non-admin edits never call the server', async () => {
  const compiled = pageDeclarations(['handleSavePurchase', 'handleSaveExpense', 'handleSaveGeneralExpense', 'documentEditHeaders', 'documentEditData', 'formatPaymentInputDate']);
  for (const role of ['ADMIN', 'CASHIER']) {
    for (const kind of ['Purchase', 'Expense', 'GeneralExpense']) {
      let calls = 0;
      let closes = 0;
      let error = '';
      const exports = {};
      vm.runInNewContext(compiled, {
        exports, Error, Date, submitting: false, currentUser: { role, sessionToken: 'signed' },
        purchaseForm: purchaseInput, expenseForm: expenseInput, generalExpenseForm: generalInput,
        editingPurchase: { id: 'purchase', updatedAt: version, date: '2026-10-24', originalDate: version },
        editingExpense: { id: 'expense', updatedAt: version, date: '2026-10-24', originalDate: version },
        editingGeneralExpense: { id: 'general', updatedAt: version, date: '2026-10-24', originalDate: version },
        setSubmitting() {}, window: {}, console: { error() {} },
        setShowPurchaseModal: () => closes++, setShowExpenseModal: () => closes++, setShowGeneralExpenseModal: () => closes++,
        alert: message => { error = message; },
        fetch: async () => { calls++; return Response.json({ error: 'Stock conflict' }, { status: 409 }); }
      });
      await exports[`handleSave${kind}`]({ preventDefault() {} });
      assert.equal(calls, role === 'ADMIN' ? 1 : 0);
      assert.equal(closes, 0);
      assert.ok(error.includes(role === 'ADMIN' ? 'Stock conflict' : 'مدير النظام'));
    }
  }
});

test('editing metadata preserves original timestamp unless the document day is changed', () => {
  const exports = {};
  vm.runInNewContext(pageDeclarations(['documentEditData', 'formatPaymentInputDate']), { exports, Date });
  const edit = { id: 'expense', updatedAt: version, originalDate: version, date: exports.formatPaymentInputDate(version) };
  assert.equal(exports.documentEditData(edit).date, version);
  const changed = exports.documentEditData({ ...edit, date: '2026-10-24' });
  assert.equal(new Date(changed.date).getDate(), 24);
  assert.equal(new Date(changed.date).getHours(), 0);
  assert.equal(changed.id, edit.id);
  assert.equal(changed.updatedAt, version);
  assert.equal(changed.originalDate, undefined);
});
