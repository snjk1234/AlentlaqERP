/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { editInvoiceDetails } = require('./document-edits');
const { createUserSessionToken } = require('./user-session-token');
const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const version = '2026-10-25T10:00:00.000Z';
const base = { id: 'invoice', userId: 'admin', updatedAt: version, customerId: 'c1', receiverName: ' New receiver ', siteReceiptNumber: ' NEW-SITE ' };
function store() {
  const state = {
    user: [{ id: 'admin', role: 'ADMIN' }, { id: 'cashier', role: 'CASHIER' }, { id: 'keeper', role: 'STOREKEEPER' }],
    customer: [{ id: 'c1', name: 'Original', openingBalance: 10 }, { id: 'c2', name: 'Target', openingBalance: 20 }],
    order: [{ id: 'invoice', invoiceNumber: 'INV-1', isQuotation: false, status: 'COMPLETED', customerId: 'c1', customerName: 'Old snapshot',
      receiverName: 'Old receiver', siteReceiptNumber: 'OLD-SITE', totalAmount: 500, taxAmount: 70, netAmount: 570,
      invoiceType: 'فاتورة ضريبية', qrCode: 'original-qr', createdAt: version, updatedAt: version, userId: 'cashier' }],
    orderItem: [
      { id: 'i1', orderId: 'invoice', productId: 'p1', quantity: 2, unitPrice: 100, taxAmount: 28, total: 228, position: 0 },
      { id: 'i2', orderId: 'invoice', productId: 'p2', quantity: 3, unitPrice: 100, taxAmount: 42, total: 342, position: 1 }
    ],
    product: [{ id: 'p1', name: 'Product 1', stockQty: 50 }, { id: 'p2', name: 'Product 2', stockQty: 80 }],
    customerCeilingQuota: [
      { id: 'q1', customerId: 'c1', productId: 'p1', deliveredQuantity: 12, totalQuantity: 100 },
      { id: 'q2', customerId: 'c1', productId: 'p2', deliveredQuantity: 23, totalQuantity: 100 },
      { id: 'q3', customerId: 'c2', productId: 'p1', deliveredQuantity: 4, totalQuantity: 100 },
      { id: 'q4', customerId: 'c2', productId: 'p2', deliveredQuantity: 7, totalQuantity: 100 }
    ],
    orderReturn: [], payment: [], accountDiscount: [], bank: [{ id: 'bank', balance: 1000 }]
  };
  let failAt = 0;
  let writes = 0;
  const calls = [];
  const client = {};
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'customerId_productId') return row.customerId === value.customerId && row.productId === value.productId;
    return row[key] === value;
  });
  const project = (model, row, include) => {
    if (!row) return null;
    const result = structuredClone(row);
    if (model === 'order') {
      if (include?.items) result.items = state.orderItem.filter(item => item.orderId === row.id).map(item => ({
        ...structuredClone(item), ...(include.items?.include?.product ? { product: structuredClone(state.product.find(p => p.id === item.productId)) } : {})
      }));
      if (include?.customer) result.customer = structuredClone(state.customer.find(c => c.id === row.customerId) || null);
      if (include?.orderReturns) result.orderReturns = structuredClone(state.orderReturn.filter(r => r.orderId === row.id));
    }
    return result;
  };
  for (const model of Object.keys(state)) {
    client[model] = {
      findUnique: async ({ where, include }) => project(model, state[model].find(row => matches(row, where)), include),
      findMany: async ({ where } = {}) => structuredClone(state[model].filter(row => matches(row, where))),
      update: async ({ where, data, include }) => {
        const row = state[model].find(row => matches(row, where));
        assert.ok(row);
        calls.push({ model, data: structuredClone(data) });
        Object.assign(row, structuredClone(data), model === 'order' ? { updatedAt: '2026-10-25T11:00:00Z' } : {});
        if (++writes === failAt) throw new Error('Injected write failure');
        return project(model, row, include);
      }
    };
  }
  let tail = Promise.resolve();
  client.$transaction = callback => {
    const result = tail.then(async () => {
      const before = structuredClone(state);
      try { return await callback(client); }
      catch (error) { Object.assign(state, before); throw error; }
    });
    tail = result.catch(() => {});
    return result;
  };
  return { client, state, calls, failWrite: index => { writes = 0; failAt = index; } };
}

test('metadata edits retain monetary fields, items, stock, QR, invoice identity and quotas, even with existing payments and returns', async () => {
  const { client, state, calls } = store();
  state.payment.push({ id: 'payment', customerId: 'c1', amount: 100 });
  state.orderReturn.push({ id: 'return', orderId: 'invoice', customerId: 'c1' });
  const before = structuredClone(state);
  const saved = await editInvoiceDetails(client, { ...base, items: [], netAmount: 1, invoiceNumber: 'FORGED', createdAt: '2000-01-01' });
  assert.equal(saved.receiverName, 'New receiver');
  assert.equal(saved.siteReceiptNumber, 'NEW-SITE');
  assert.equal(saved.customerName, 'Original');
  for (const field of ['id', 'invoiceNumber', 'totalAmount', 'taxAmount', 'netAmount', 'qrCode', 'invoiceType', 'createdAt', 'status', 'userId']) {
    assert.equal(saved[field], before.order[0][field], field);
  }
  for (const field of ['product', 'orderItem', 'customerCeilingQuota', 'customer', 'payment', 'orderReturn', 'bank']) assert.deepEqual(state[field], before[field]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'order');
  assert.equal(saved.orderReturns.length, 1);
});

test('reassigns invoice and account effect and transfers existing quota deliveries only without moving payments or stock', async () => {
  const { client, state } = store();
  state.payment.push({ id: 'target-payment', customerId: 'c2', amount: 5 });
  const before = structuredClone(state);
  const saved = await editInvoiceDetails(client, { ...base, customerId: 'c2', customerName: 'Forged name' });
  assert.equal(saved.customerId, 'c2');
  assert.equal(saved.customerName, 'Target');
  assert.equal(saved.customer.name, 'Target');
  assert.deepEqual(state.customerCeilingQuota.map(q => q.deliveredQuantity), [10, 20, 6, 10]);
  for (const field of ['customer', 'product', 'orderItem', 'payment', 'bank']) assert.deepEqual(state[field], before[field]);
  const accountTotal = id => state.order.filter(order => order.customerId === id).reduce((sum, order) => sum + order.netAmount, 0);
  assert.equal(accountTotal('c1'), 0);
  assert.equal(accountTotal('c2'), 570);
});

test('reassignment is rejected for any invoice return or any original customer payment, including unrelated invoices and zero amounts', async () => {
  for (const mode of ['return', 'payment', 'zero-payment']) {
    const { client, state, calls } = store();
    if (mode === 'return') state.orderReturn.push({ id: 'return', orderId: 'invoice' });
    else state.payment.push({ id: 'payment', customerId: 'c1', amount: mode === 'zero-payment' ? 0 : 100 });
    const before = structuredClone(state);
    for (const customerId of ['c2', null]) {
      await assert.rejects(editInvoiceDetails(client, { ...base, customerId, customerName: 'Cash' }), { statusCode: 409 });
      assert.deepEqual(state, before);
    }
    assert.equal(calls.length, 0);
  }
});

test('returns and payments of unrelated accounts do not block reassignment', async () => {
  const { client, state } = store();
  state.payment.push({ id: 'other-payment', customerId: 'c2' });
  state.orderReturn.push({ id: 'other-return', orderId: 'other-invoice' });
  state.accountDiscount.push({ id: 'other-discount', customerId: 'c2', amount: 10 });
  await editInvoiceDetails(client, { ...base, customerId: 'c2' });
  assert.equal(state.order[0].customerId, 'c2');
});

test('original customer discounts block reassignment but permit metadata edits', async () => {
  const { client, state, calls } = store();
  state.accountDiscount.push({ id: 'discount', customerId: 'c1', amount: 20 });
  const before = structuredClone(state);
  for (const customerId of ['c2', null]) {
    await assert.rejects(editInvoiceDetails(client, { ...base, customerId, customerName: 'Cash' }),
      { statusCode: 409, message: /سندات خصم/ });
    assert.deepEqual(state, before);
  }
  assert.equal(calls.length, 0);
  const saved = await editInvoiceDetails(client, base);
  assert.equal(saved.customerId, 'c1');
  assert.equal(saved.receiverName, 'New receiver');
  assert.deepEqual(state.accountDiscount, before.accountDiscount);
});

test('supports named cash invoices, cash-to-registered and registered-to-cash moves without fictional quota creation', async () => {
  const { client, state } = store();
  const saved = await editInvoiceDetails(client, { ...base, customerId: null, customerName: ' Named cash ' });
  assert.equal(saved.customerId, null);
  assert.equal(saved.customerName, 'Named cash');
  assert.equal(saved.customer, null);
  assert.deepEqual(state.customerCeilingQuota.map(q => q.deliveredQuantity), [10, 20, 4, 7]);
  const renamed = await editInvoiceDetails(client, { ...base, updatedAt: saved.updatedAt, customerId: null, customerName: 'Updated cash', receiverName: '', siteReceiptNumber: '' });
  assert.equal(renamed.customerName, 'Updated cash');
  assert.equal(renamed.receiverName, null);
  assert.equal(renamed.siteReceiptNumber, null);
  const linked = await editInvoiceDetails(client, { ...base, updatedAt: renamed.updatedAt, customerId: 'c2' });
  assert.equal(linked.customerId, 'c2');
  assert.deepEqual(state.customerCeilingQuota.map(q => q.deliveredQuantity), [10, 20, 6, 10]);
  const absent = store();
  absent.state.customerCeilingQuota = [];
  await editInvoiceDetails(absent.client, { ...base, customerId: 'c2' });
  assert.equal(absent.state.customerCeilingQuota.length, 0);
});

test('aggregates repeated product rows and rejects inconsistent or overflowing delivery balances atomically', async () => {
  const context = store();
  context.state.orderItem.push({ id: 'i3', orderId: 'invoice', productId: 'p1', quantity: 5 });
  await editInvoiceDetails(context.client, { ...base, customerId: 'c2' });
  assert.deepEqual(context.state.customerCeilingQuota.map(q => q.deliveredQuantity), [5, 20, 11, 10]);
  for (const [index, value] of [[0, 1], [2, 2147483647], [1, NaN], [1, 1.5]]) {
    const { client, state } = store();
    state.customerCeilingQuota[index].deliveredQuantity = value;
    const before = structuredClone(state);
    await assert.rejects(editInvoiceDetails(client, { ...base, customerId: 'c2' }), { statusCode: 409 });
    assert.deepEqual(state, before);
  }
});

test('only current administrators edit completed sales invoices and stale or invalid inputs do not write', async () => {
  for (const userId of ['cashier', 'keeper', 'missing']) {
    const { client, calls } = store();
    await assert.rejects(editInvoiceDetails(client, { ...base, userId, role: 'ADMIN' }), { statusCode: 403 });
    assert.equal(calls.length, 0);
  }
  for (const extra of [{ updatedAt: 'bad' }, { updatedAt: '2020-01-01' }, { id: 'missing' },
    { customerId: 'missing' }, { customerId: undefined }, { customerId: '' }, { receiverName: 4 },
    { receiverName: 'x'.repeat(256) }, { siteReceiptNumber: '\0' }, { customerId: null, customerName: ' ' }]) {
    const { client, calls } = store();
    await assert.rejects(editInvoiceDetails(client, { ...base, ...extra }));
    assert.equal(calls.length, 0);
  }
  for (const extra of [{ isQuotation: true }, { status: 'CANCELLED' }]) {
    const { client, state } = store();
    Object.assign(state.order[0], extra);
    await assert.rejects(editInvoiceDetails(client, base), { statusCode: 409 });
  }
});

test('all quota and invoice writes roll back on failure and concurrent stale forms cannot move an invoice twice', async () => {
  for (const fail of [1, 2, 3, 4, 5]) {
    const { client, state, failWrite } = store();
    const before = structuredClone(state);
    failWrite(fail);
    await assert.rejects(editInvoiceDetails(client, { ...base, customerId: 'c2' }), /Injected/);
    assert.deepEqual(state, before);
  }
  const { client, state } = store();
  const results = await Promise.allSettled([1, 2].map(() => editInvoiceDetails(client, { ...base, customerId: 'c2' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
  assert.deepEqual(state.customerCeilingQuota.map(q => q.deliveredQuantity), [10, 20, 6, 10]);
});

test('signed API ignores forged actor, rejects machine tokens, stale role and malformed body, and returns transaction errors', async t => {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'invoice-details-test';
  t.after(() => { if (previous === undefined) delete process.env.POS_API_TOKEN; else process.env.POS_API_TOKEN = previous; });
  const context = store();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'invoice-details', 'route.ts')), {
    exports, process, Error, console: { error() {} }, require: id => {
      if (id === '@/lib/prisma') return { prisma: context.client };
      if (id === '@/lib/document-edits') return { editInvoiceDetails };
      if (id === '@/lib/user-session-token') return require('./user-session-token');
      if (id === 'next/server') return { NextResponse: { json: (data, options) => Response.json(data, options) } };
      throw new Error(id);
    }
  });
  const send = (token, input = base) => exports.PUT(new Request('http://localhost/api/invoice-details', {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: typeof input === 'string' ? input : JSON.stringify(input)
  }));
  const token = createUserSessionToken({ id: 'admin', role: 'ADMIN' });
  assert.equal((await send(process.env.POS_API_TOKEN)).status, 401);
  assert.equal((await send(createUserSessionToken({ id: 'cashier', role: 'CASHIER' }))).status, 403);
  assert.equal((await send(createUserSessionToken({ id: 'cashier', role: 'ADMIN' }))).status, 403);
  assert.equal((await send(token, '{')).status, 400);
  assert.equal((await send(token, { ...base, updatedAt: '2020-01-01' })).status, 409);
  const result = await send(token, { ...base, userId: 'cashier', customerId: 'c2' });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).customerId, 'c2');
  const proxyExports = {};
  vm.runInNewContext(compile(read('src', 'proxy.ts')), {
    exports: proxyExports, process, require: id => id === 'next/server'
      ? { NextResponse: { json: (data, options) => Response.json(data, options), next: () => 'allowed' } }
      : require('./user-session-token')
  });
  const request = signed => ({ method: 'PUT', nextUrl: { pathname: '/api/invoice-details' }, headers: new Headers({ authorization: `Bearer ${signed}` }) });
  assert.equal(proxyExports.proxy(request(process.env.POS_API_TOKEN)).status, 401);
  assert.equal(proxyExports.proxy(request(token)), 'allowed');
});

test('Electron correction uses authenticated sender identity and exposes the preload bridge', async () => {
  const context = store();
  context.client.editInvoiceDetails = (input, token) => {
    assert.equal(token, 'signed-admin');
    return editInvoiceDetails(context.client, { ...input, userId: 'admin' });
  };
  const handlers = new Map();
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase(); authenticatedUsers.set(10, {id:"admin",role:"ADMIN",sessionToken:"signed-admin"});', {
    process, Buffer, console: { error() {} }, __dirname: path.join(root, 'electron'), require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => context.client };
      if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
      return require(id);
    }
  });
  await assert.rejects(handlers.get('update-invoice-details')({ sender: { id: 99 } }, base), /للمدير فقط/);
  const saved = await handlers.get('update-invoice-details')({ sender: { id: 10 } }, { ...base, customerId: 'c2', userId: 'cashier' });
  assert.equal(saved.customerId, 'c2');
  assert.ok(read('electron', 'preload.js').includes("ipcRenderer.invoke('update-invoice-details', data)"));
});

const elements = tree => tree && typeof tree === 'object' ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)] : [];
function harness(desktop, send, confirm = true) {
  const hooks = [];
  let cursor = 0;
  let saved;
  const exports = {};
  const ReactHooks = { ...React,
    useState: initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return hooks[i] || (hooks[i] = { current: initial }); }
  };
  vm.runInNewContext(compile(read('src', 'components', 'InvoiceDetailsEdit.tsx')), {
    exports, Error, AbortSignal,
    window: { confirm: () => confirm, ...(desktop ? { electronAPI: { updateInvoiceDetails: send } } : {}) },
    fetch: async (url, options) => {
      assert.equal(url, '/api/invoice-details');
      assert.equal(options.method, 'PUT');
      assert.equal(options.headers.Authorization, 'Bearer signed-admin');
      return Response.json(await send(JSON.parse(options.body)));
    },
    require: id => id === 'react' ? ReactHooks : require(id)
  });
  return {
    component: exports.default, saved: () => saved,
    render: () => { cursor = 0; return exports.default({
      invoice: store().state.order[0], customers: store().state.customer, user: { role: 'ADMIN', sessionToken: 'signed-admin' },
      onClose() {}, onSaved: result => { saved = result; }
    }); }
  };
}

test('dialog sends only allowed metadata over web/desktop, preserves input on failure and blocks duplicate submits', async () => {
  for (const desktop of [false, true]) for (const fail of [false, true]) {
    const calls = [];
    const ui = harness(desktop, async data => {
      calls.push(data);
      if (fail) throw new Error('Transfer blocked');
      return { ...data, invoiceNumber: 'INV-1' };
    });
    let tree = ui.render();
    elements(tree).find(node => node.props?.['aria-label'] === 'اسم المستلم').props.onChange({ target: { value: 'Edited receiver' } });
    elements(tree).find(node => node.props?.['aria-label'] === 'عميل الفاتورة').props.onChange({ target: { value: 'c2' } });
    tree = ui.render();
    const submit = elements(tree).find(node => node.type === 'form').props.onSubmit;
    await Promise.all([submit({ preventDefault() {} }), submit({ preventDefault() {} })]);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]).sort(), ['customerId', 'customerName', 'id', 'receiverName', 'siteReceiptNumber', 'updatedAt']);
    assert.equal(calls[0].receiverName, 'Edited receiver');
    assert.equal(calls[0].customerId, 'c2');
    if (fail) {
      assert.equal(ui.saved(), undefined);
      tree = ui.render();
      assert.equal(elements(tree).find(node => node.props?.['aria-label'] === 'اسم المستلم').props.value, 'Edited receiver');
      assert.ok(renderToStaticMarkup(tree).includes('Transfer blocked'));
    } else assert.equal(ui.saved().invoiceNumber, 'INV-1');
  }
});

test('non-admin sees no dialog and cancelled reassignment never calls save', async () => {
  let calls = 0;
  const ui = harness(false, async () => { calls++; }, false);
  let tree = ui.render();
  assert.equal(ui.component({ invoice: store().state.order[0], user: { role: 'CASHIER' } }), null);
  elements(tree).find(node => node.props?.['aria-label'] === 'عميل الفاتورة').props.onChange({ target: { value: 'c2' } });
  tree = ui.render();
  await elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls, 0);
});

test('customer invoice print reflects saved customer, receiver and receipt while preserving totals, line order and QR', async () => {
  const { client } = store();
  const saved = await editInvoiceDetails(client, { ...base, customerId: 'c2' });
  const exports = {};
  vm.runInNewContext(compile(read('src', 'components', 'PrintDocuments.tsx')), { exports, require });
  const html = renderToStaticMarkup(React.createElement(exports.InvoicePrint, { invoice: saved, qrCodeUrl: 'data:image/png;base64,original', onClose() {} }));
  for (const text of ['Target', 'New receiver', 'NEW-SITE', '570.00', 'INV-1', 'data:image/png;base64,original']) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('Product 1') < html.indexOf('Product 2'));
  assert.ok(!html.includes('Old receiver'));
  const page = read('src', 'app', 'page.tsx');
  assert.ok(page.includes('setEditingInvoiceDetails(inv)'));
  assert.ok(page.includes('setEditingInvoiceDetails(invoice)'));
});

test('open customer statement reads refreshed account data after invoice reassignment', () => {
  const source = ts.createSourceFile('page.tsx', read('src', 'app', 'page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['currentHistoryCustomer', 'selectedHistoryCustomer'].includes(node.name.getText(source))) {
      initializers[node.name.getText(source)] = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const old = { id: 'c1', openingBalance: 100, orders: [{ id: 'invoice' }] };
  const refreshed = { ...old, orders: [] };
  const context = { selectedHistoryCustomerRaw: old, customers: [refreshed], stmtFrom: '', stmtTo: '', customerInPeriod: customer => customer };
  context.currentHistoryCustomer = vm.runInNewContext(`(${initializers.currentHistoryCustomer})`, context);
  assert.equal(vm.runInNewContext(`(${initializers.selectedHistoryCustomer})`, context), refreshed);
  context.selectedHistoryCustomerRaw = null;
  assert.equal(vm.runInNewContext(`(${initializers.currentHistoryCustomer})`, context), null);
});

test('Access persists invoice reassignment, quota movement and metadata edits without changing inventory, amounts or document lines',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-invoice-details-'));
    const file = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, file);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = file;
    const db = createAccessClient();
    try {
      const user = await db.user.create({ data: { username: 'invoice-test-admin', name: 'مدير الاختبار', password: 'test', role: 'ADMIN' } });
      const old = await db.customer.create({ data: { name: 'العميل الأصلي', openingBalance: 10 } });
      const target = await db.customer.create({ data: { name: 'العميل الجديد', openingBalance: 20 } });
      const product = await db.product.create({ data: { code: 'INVOICE-TEST', name: 'صنف تجريبي', type: 'اختبار', size: '20', price: 100, costPrice: 80, stockQty: 50 } });
      const q1 = await db.customerCeilingQuota.create({ data: { customerId: old.id, productId: product.id, buildingsCount: 1, floorsCount: 6, quantityPerFloor: 10, totalQuantity: 60, deliveredQuantity: 5 } });
      const q2 = await db.customerCeilingQuota.create({ data: { customerId: target.id, productId: product.id, buildingsCount: 1, floorsCount: 6, quantityPerFloor: 10, totalQuantity: 60, deliveredQuantity: 10 } });
      const invoice = await db.order.create({ data: { invoiceNumber: 'INV-DETAIL-TEST', customerId: old.id, customerName: old.name, userId: user.id,
        totalAmount: 200, taxAmount: 28, netAmount: 228, qrCode: 'original-qr', receiverName: 'قديم', siteReceiptNumber: 'OLD',
        items: { create: [{ productId: product.id, quantity: 2, unitPrice: 100, taxAmount: 28, total: 228 }] }
      }, include: { items: true } });
      const input = { ...base, id: invoice.id, userId: user.id, updatedAt: invoice.updatedAt, customerId: target.id, receiverName: 'مستلم جديد', siteReceiptNumber: 'إذن-123' };
      const failing = { ...db, $transaction: callback => db.$transaction(tx => callback({
        ...tx, order: { ...tx.order, update: async () => { throw new Error('Injected final invoice failure'); } }
      })) };
      await assert.rejects(editInvoiceDetails(failing, input), /Injected/);
      assert.equal((await db.customerCeilingQuota.findUnique({ where: { id: q1.id } })).deliveredQuantity, 5);
      assert.equal((await db.customerCeilingQuota.findUnique({ where: { id: q2.id } })).deliveredQuantity, 10);
      assert.equal((await db.order.findUnique({ where: { id: invoice.id } })).customerId, old.id);
      const saved = await editInvoiceDetails(db, input);
      await db.$disconnect();
      const reloaded = await db.order.findUnique({ where: { id: invoice.id }, include: { items: true, customer: true } });
      assert.equal(reloaded.customerId, target.id);
      assert.equal(reloaded.customer.name, target.name);
      assert.equal(reloaded.customerName, target.name);
      assert.equal(reloaded.receiverName, input.receiverName);
      assert.equal(reloaded.siteReceiptNumber, input.siteReceiptNumber);
      assert.equal(reloaded.createdAt.toISOString(), invoice.createdAt.toISOString());
      assert.equal(reloaded.netAmount, invoice.netAmount);
      assert.equal(reloaded.qrCode, invoice.qrCode);
      assert.deepEqual(reloaded.items, invoice.items);
      assert.equal((await db.product.findUnique({ where: { id: product.id } })).stockQty, 50);
      assert.equal((await db.customerCeilingQuota.findUnique({ where: { id: q1.id } })).deliveredQuantity, 3);
      assert.equal((await db.customerCeilingQuota.findUnique({ where: { id: q2.id } })).deliveredQuantity, 12);
      await assert.rejects(editInvoiceDetails(db, input), { statusCode: 409 });
      await require('./account-discounts').createAccountDiscount(db, user.id, {
        kind: 'ALLOWED', accountId: target.id, amount: 5, requestId: '00000000-0000-4000-8000-000000000001'
      });
      await assert.rejects(editInvoiceDetails(db, { ...input, updatedAt: saved.updatedAt, customerId: old.id }),
        { statusCode: 409, message: /سندات خصم/ });
      const bank = await db.bank.create({ data: { name: 'بنك الاختبار', balance: 100 } });
      await db.payment.create({ data: { customerId: target.id, bankId: bank.id, amount: 100, date: new Date() } });
      await assert.rejects(editInvoiceDetails(db, { ...input, updatedAt: saved.updatedAt, customerId: old.id }), { statusCode: 409 });
      const metadata = await editInvoiceDetails(db, { ...input, updatedAt: saved.updatedAt, receiverName: '', siteReceiptNumber: '' });
      assert.equal(metadata.receiverName, null);
      assert.equal(metadata.siteReceiptNumber, null);
      assert.equal((await db.bank.findUnique({ where: { id: bank.id } })).balance, 100);
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previous;
      fs.unlinkSync(file);
      const lock = path.join(directory, 'test.laccdb');
      if (fs.existsSync(lock)) fs.unlinkSync(lock);
      fs.rmdirSync(directory);
    }
  });
