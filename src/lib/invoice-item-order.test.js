/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;

test('cart, checkout and invoice rendering preserve input order instead of applying a product sort', () => {
  const source = read('src', 'app', 'page.tsx');
  assert.ok(!source.includes('sortCartAndInvoiceItems'));
  assert.ok(source.includes('items: cart.map(item => ({'));
  assert.ok(source.includes('{cart.map((item) => ('));
  assert.ok(source.includes('invoice={invoice}'));
  assert.ok(source.includes('const newCart = invoice.items.map'));
  assert.ok(source.includes('return [...prev, {'));
});

test('Access assigns sequential persisted positions from the nested invoice input, ignoring caller positions', async () => {
  const source = read('src', 'lib', 'access-client.js');
  const tree = ts.createSourceFile('access-client.js', source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'insert');
  const { models } = require('./access-client');
  const inserted = [];
  let sequence = 0;
  const exports = {};
  vm.runInNewContext(declaration.getText(tree) + '\nexports.insert = insert;', {
    exports, models,
    defaultedData: (model, input) => {
      const data = { id: `record-${++sequence}`, ...input };
      inserted.push({ model, data: structuredClone(data) });
      return data;
    },
    ensureField: (model, field) => models[model].fields[field],
    quoteIdentifier: name => `[${name}]`, encodeValue: () => 'NULL',
    execute: async () => {}, findOne: async (_connection, _model, args) => ({ id: args.where.id })
  });
  await exports.insert({}, 'order', {
    items: { create: [
      { productId: 'z-last-code', position: 99 },
      { productId: 'a-first-code', position: 0 },
      { productId: 'm-middle-code' }
    ] }
  });
  const items = inserted.filter(row => row.model === 'orderItem').map(row => row.data);
  assert.deepEqual(items.map(item => [item.productId, item.position]), [
    ['z-last-code', 0], ['a-first-code', 1], ['m-middle-code', 2]
  ]);
  assert.ok(items.every(item => item.orderId === 'record-1'));
  assert.ok(models.orderItem.fields.position);
});

test('Access adds the position column to existing databases only once without rewriting historical invoice lines', async () => {
  const source = read('src', 'lib', 'access-client.js');
  const tree = ts.createSourceFile('access-client.js', source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'ensureSchema');
  const queries = [];
  let columnExists = false;
  const connection = {
    tables: async () => [{ TABLE_NAME: 'OrderItem' }],
    columns: async (_catalog, _schema, table) => {
      if (table === 'OrderItem') return columnExists ? [{ COLUMN_NAME: 'position' }] : [];
      if (table === 'StocktakeItem') return [{ COLUMN_NAME: 'unitCost' }];
      if (table === 'PurchaseOrder') return [{ COLUMN_NAME: 'warehouseReceiptNumber' }];
      return [{ COLUMN_NAME: table === 'Supplier' ? 'openingBalance' : 'correctionHistory' }];
    },
    query: async sql => {
      queries.push(sql);
      if (sql === 'ALTER TABLE [OrderItem] ADD COLUMN [position] LONG') columnExists = true;
      return [];
    },
    beginTransaction: async () => {}, commit: async () => {}, close: async () => {}
  };
  const exports = {};
  vm.runInNewContext(declaration.getText(tree) + '\nexports.migrate = ensureSchema;', {
    exports, poolState: { pool: { connect: async () => connection } },
    models: { orderItem: { table: 'OrderItem', unique: [] } }, modelNames: ['orderItem'],
    assignMissingPaymentNumbers: async () => {}, normalizeError: error => error
  });
  await exports.migrate();
  await exports.migrate();
  assert.equal(queries.filter(sql => sql.startsWith('ALTER TABLE')).length, 1);
  assert.ok(columnExists);
  assert.ok(!queries.some(sql => /UPDATE \[OrderItem\]/i.test(sql)));
});

test('Access reloads order item relations by persisted position even when database physical order differs', async () => {
  const source = read('src', 'lib', 'access-client.js');
  const tree = ts.createSourceFile('access-client.js', source, ts.ScriptTarget.Latest, true);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['findMany', 'loadIncludes'].includes(node.name.text)).map(node => node.getText(tree));
  const { models } = require('./access-client');
  const rows = [
    { id: 'a', orderId: 'invoice', position: 1, productId: 'a-first-code' },
    { id: 'm', orderId: 'invoice', position: 2, productId: 'm-middle-code' },
    { id: 'z', orderId: 'invoice', position: 0, productId: 'z-last-code' }
  ];
  const queries = [];
  const exports = {};
  vm.runInNewContext(functions.join('\n') + '\nexports.load = loadIncludes;', {
    exports, models, quoteIdentifier: name => `[${name}]`, whereSql: () => '',
    orderBySql: (_model, orderBy) => orderBy ? ` ORDER BY [position] ${orderBy.position.toUpperCase()}` : '',
    executeRows: async (_connection, model, sql) => {
      queries.push(sql);
      assert.equal(model, 'orderItem');
      assert.ok(sql.endsWith('ORDER BY [position] ASC'));
      return [...rows].sort((a, b) => a.position - b.position);
    },
    selectedRow: row => row
  });
  const loaded = await exports.load({}, 'order', [{ id: 'invoice' }], { items: true });
  assert.deepEqual(Array.from(loaded[0].items, item => item.productId), ['z-last-code', 'a-first-code', 'm-middle-code']);
  assert.equal(queries.length, 1);
});

test('browser and Electron preserve item order, totals and stock for invoices, quotations and conversions', async () => {
  for (const [desktop, isQuotation, linkedQuotationId] of [
    [false, false, null], [false, true, null], [false, false, 'quotation'],
    [true, false, null], [true, true, null], [true, false, 'quotation']
  ]) {
    const products = ['z', 'a', 'm'].map(id => ({ id, price: 10, taxRate: 0 }));
    const deductions = [];
    const conversions = [];
    let created;
    const client = {
      product: {
        findMany: async () => [...products].reverse(),
        update: async ({ where, data }) => deductions.push([where.id, data.stockQty.decrement])
      },
      order: {
        count: async () => 0,
        create: async ({ data }) => { created = data; return { id: 'invoice', ...data }; },
        update: async ({ where, data }) => conversions.push([where.id, data.status])
      },
      $transaction: async callback => callback(client)
    };
    const handlers = new Map();
    const exports = {};
    if (desktop) {
      vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase();', {
        require: id => {
          if (id === 'electron') return {
            app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
            ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
            protocol: { registerSchemesAsPrivileged() {} }
          };
          if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
          if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
          return require(id);
        },
        process, Buffer, console, __dirname: path.join(root, 'electron')
      });
    } else {
      vm.runInNewContext(compile(read('src', 'app', 'api', 'orders', 'route.ts')), {
        exports, console,
        require: id => {
          if (id === '@/lib/prisma') return { prisma: client };
          if (id === '@/lib/zatca') return { generateZatcaQrCode: () => 'QR' };
          if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
          throw new Error(id);
        }
      });
    }
    const input = { userId: 'admin', isQuotation, linkedQuotationId, invoiceType: 'فاتورة',
      items: products.map(p => ({ productId: p.id, quantity: 1, unitPrice: 10 })) };
    if (desktop) await handlers.get('create-order')(null, input);
    else {
      const response = await exports.POST(new Request('http://localhost/api/orders', { method: 'POST', body: JSON.stringify(input) }));
      assert.equal(response.status, 200);
    }
    assert.deepEqual(Array.from(created.items.create, item => item.productId), ['z', 'a', 'm']);
    assert.equal(created.netAmount, 30);
    assert.deepEqual(deductions, isQuotation ? [] : [['z', 1], ['a', 1], ['m', 1]]);
    assert.deepEqual(conversions, linkedQuotationId ? [['quotation', 'CONVERTED']] : []);
  }
});

test('invoice printing keeps input order rather than sorting by code, size or color', () => {
  const exports = {};
  vm.runInNewContext(compile(read('src', 'components', 'PrintDocuments.tsx')), { exports, require });
  const invoice = { invoiceNumber: 'INV-1', createdAt: '2026-10-24', totalAmount: 30, taxAmount: 0, netAmount: 30,
    items: ['Z-30', 'A-10', 'M-20'].map(code => ({
      product: { code, name: code }, quantity: 1, unitPrice: 10, taxAmount: 0, total: 10
    })) };
  const html = renderToStaticMarkup(React.createElement(exports.InvoicePrint, { invoice, onClose() {} }));
  assert.ok(html.indexOf('Z-30') < html.indexOf('A-10'));
  assert.ok(html.indexOf('A-10') < html.indexOf('M-20'));
});
