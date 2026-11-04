/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const edits = require('./document-edits');
const root = path.join(__dirname, '..', '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

test('web and Electron purchase creation persist normalized receipt numbers and reject invalid input before writes', async () => {
  for (const desktop of [false, true]) {
    let saved;
    let writes = 0;
    const tx = {
      product: { findUnique: async () => ({ costPrice: 100, taxRate: 0.14, markup: 30 }),
        update: async () => { writes++; } },
      supplier: { update: async () => { writes++; } },
      purchaseOrder: { create: async ({ data }) => { saved = data; writes++; return data; } }
    };
    const prisma = { $transaction: async callback => callback(tx) };
    let create;
    if (desktop) {
      const source = ts.createSourceFile('main.js', read('electron\\main.js'), ts.ScriptTarget.Latest, true);
      const node = source.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
        && node.expression.expression.getText(source) === 'ipcMain.handle' && node.expression.arguments[0]?.text === 'create-purchase');
      vm.runInNewContext(node.getText(source), {
        prisma, ...edits, console: { error() {} }, ipcMain: { handle: (_name, handler) => { create = body => handler({}, body); } }
      });
    } else {
      const exports = {};
      vm.runInNewContext(compile(read('src\\app\\api\\purchases\\route.ts')), {
        exports, console: { error() {} }, require: name => {
          if (name === '@/lib/prisma') return { prisma };
          if (name === '@/lib/document-edits') return edits;
          if (name === '@/lib/document-edit-route') return {};
          if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
          throw Error(`Unexpected import ${name}`);
        }
      });
      create = body => exports.POST({ json: async () => body });
    }
    const body = { billNumber: 'PUR-7', supplierId: 'supplier', invoiceType: 'فاتورة',
      items: [{ productId: 'p1', quantity: 2, unitCost: 100 }], warehouseReceiptNumber: ' WR-007 ' };
    await create(body);
    assert.equal(saved.warehouseReceiptNumber, 'WR-007');
    assert.equal(saved.totalAmount, 200);
    assert.equal(saved.netAmount, 200);
    assert.equal(writes, 3);
    await create({ ...body, warehouseReceiptNumber: '' });
    assert.equal(saved.warehouseReceiptNumber, null);
    writes = 0;
    if (desktop) await assert.rejects(create({ ...body, warehouseReceiptNumber: 123 }), /رقم استلام المخزن/);
    else {
      const response = await create({ ...body, warehouseReceiptNumber: 123 });
      assert.equal(response.status, 400);
      assert.match(response.body.error, /رقم استلام المخزن/);
    }
    assert.equal(writes, 0);
  }
});

test('purchase form loads the saved receipt for editing and sends it with existing create/update payloads', () => {
  const page = read('src\\app\\page.tsx');
  assert.ok(page.includes("warehouseReceiptNumber: purchase.warehouseReceiptNumber || ''"));
  assert.ok(page.includes('aria-label="رقم استلام المخزن" maxLength={255}'));
  assert.ok(page.includes('warehouseReceiptNumber: e.target.value'));
  assert.ok(page.includes('htmlFor="purchase-warehouse-receipt" className="text-xs text-slate-300 block mb-1"'));
  assert.ok(page.includes('id="purchase-warehouse-receipt"'));
  assert.ok(!page.includes('<label className="space-y-1 block text-xs text-slate-300">رقم استلام المخزن'));
  const save = page.slice(page.indexOf('const handleSavePurchase'), page.indexOf('const handleSavePurchase') + 3500);
  assert.ok(save.includes('...purchaseForm'));
});

test('Access saves and reloads warehouse receipt number without modifying items or totals',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-warehouse-receipt-'));
    const file = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, file);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = file;
    const db = createAccessClient();
    try {
      const supplier = await db.supplier.create({ data: { name: 'Receipt test supplier' } });
      const product = await db.product.create({ data: {
        code: 'WR', name: 'Receipt test product', type: 'Test', size: '20', stockQty: 5, price: 100
      } });
      const order = await db.purchaseOrder.create({ data: {
        billNumber: 'PUR-WR-1', supplierId: supplier.id, warehouseReceiptNumber: 'WR-007',
        totalAmount: 200, taxAmount: 28, netAmount: 228,
        items: { create: [{ productId: product.id, quantity: 2, unitCost: 100, taxAmount: 28, total: 228 }] }
      } });
      await db.$disconnect();
      const loaded = await db.purchaseOrder.findUnique({ where: { id: order.id }, include: { items: true } });
      assert.equal(loaded.warehouseReceiptNumber, 'WR-007');
      assert.equal(loaded.netAmount, 228);
      assert.equal(loaded.items[0].quantity, 2);
      await db.purchaseOrder.update({ where: { id: order.id }, data: { warehouseReceiptNumber: null } });
      assert.equal((await db.purchaseOrder.findUnique({ where: { id: order.id } })).warehouseReceiptNumber, null);
      assert.equal((await db.product.findUnique({ where: { id: product.id } })).stockQty, 5);
      await db.$disconnect();
      const connection = await require('odbc').connect(`Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${file};`);
      try { await connection.query('ALTER TABLE [PurchaseOrder] DROP COLUMN [warehouseReceiptNumber]'); }
      finally { await connection.close(); }
      const migrated = await db.purchaseOrder.findUnique({ where: { id: order.id }, include: { items: true } });
      assert.equal(migrated.warehouseReceiptNumber, null);
      assert.equal(migrated.netAmount, 228);
      assert.equal(migrated.items[0].quantity, 2);
      await db.purchaseOrder.update({ where: { id: order.id }, data: { warehouseReceiptNumber: 'AFTER-UPGRADE' } });
      assert.equal((await db.purchaseOrder.findUnique({ where: { id: order.id } })).warehouseReceiptNumber, 'AFTER-UPGRADE');
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previous;
      fs.rmSync(file);
      fs.rmdirSync(directory);
    }
  });
