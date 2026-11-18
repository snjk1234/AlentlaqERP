/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..', '..');

function loadOrderHandler(client) {
  const source = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const handlers = new Map();
  vm.runInNewContext(source + '\ninitializeDatabase();', {
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
      if (id === '../src/lib/customer-prices') return require('./customer-prices');
      if (id.startsWith('../src/lib/')) return require(id.replace('../src/lib/', './'));
      return require(id);
    },
    process, Buffer, console: { ...console, error() {} }, __dirname: path.join(root, 'electron')
  });
  return data => handlers.get('create-order')(null, data);
}

function store() {
  const state = { stock: 100, delivered: 0, orders: [], converted: [] };
  const client = {
    product: {
      findMany: async () => [{ id: 'product', price: 13, taxRate: 0.14 }],
      findUnique: async () => ({ id: 'product', name: 'Product', price: 13, taxRate: 0.14, stockQty: state.stock }),
      update: async ({ data }) => { state.stock -= data.stockQty.decrement; }
    },
    user: { findFirst: async () => ({ id: 'default-user' }) },
    order: {
      count: async () => state.orders.length,
      create: async ({ data }) => {
        const order = { id: `order-${state.orders.length + 1}`, ...data };
        state.orders.push(order);
        return order;
      },
      update: async ({ where, data }) => { state.converted.push({ id: where.id, status: data.status }); }
    },
    customerCeilingQuota: {
      findUnique: async () => ({ id: 'quota' }),
      update: async ({ data }) => { state.delivered += data.deliveredQuantity.increment; }
    },
    $transaction: async callback => {
      const before = structuredClone(state);
      try { return await callback(client); }
      catch (error) { Object.assign(state, before); throw error; }
    }
  };
  return { client, state };
}

test('cashier invoices without a linked quotation save successfully and deduct stock once', async () => {
  for (const linked of [{}, { linkedQuotationId: null }]) {
    const { client, state } = store();
    const issue = loadOrderHandler(client);
    const invoice = await issue({
      userId: 'cashier', customerId: 'customer', invoiceType: 'فاتورة', purchaseOrderNumber: 'PO-123',
      items: [{ productId: 'product', quantity: 2, unitPrice: 12 }], ...linked
    });
    assert.equal(invoice.purchaseOrderNumber, 'PO-123');
    assert.equal(invoice.userId, 'cashier');
    assert.equal(invoice.totalAmount, 24);
    assert.equal(invoice.taxAmount, 0);
    assert.equal(invoice.netAmount, 24);
    assert.equal(invoice.status, 'COMPLETED');
    assert.ok(invoice.qrCode);
    assert.ok(invoice.qrCode.startsWith('بيانات الفاتورة\n'));
    assert.ok(invoice.qrCode.includes('رقم الفاتورة: INV-'));
    assert.equal(state.orders.length, 1);
    assert.equal(state.stock, 98);
    assert.equal(state.delivered, 2);
    assert.deepEqual(state.converted, []);
  }
});

test('converting a quotation marks it converted only for a final invoice', async () => {
  for (const isQuotation of [false, true]) {
    const { client, state } = store();
    const issue = loadOrderHandler(client);
    const invoice = await issue({
      userId: 'cashier', customerId: 'customer', invoiceType: 'فاتورة ضريبية',
      isQuotation, linkedQuotationId: 'quotation',
      items: [{ productId: 'product', quantity: 2, unitPrice: 10 }]
    });
    assert.equal(invoice.netAmount, 22.8);
    assert.equal(invoice.status, isQuotation ? 'PENDING' : 'COMPLETED');
    assert.equal(state.stock, isQuotation ? 100 : 98);
    assert.equal(state.delivered, isQuotation ? 0 : 2);
    assert.deepEqual(state.converted, isQuotation ? [] : [{ id: 'quotation', status: 'CONVERTED' }]);
  }
});

test('quotation update failure rolls back the invoice and stock changes', async () => {
  const { client, state } = store();
  client.order.update = async () => { throw new Error('Quotation unavailable'); };
  const issue = loadOrderHandler(client);
  await assert.rejects(issue({
    userId: 'cashier', customerId: 'customer', invoiceType: 'فاتورة',
    linkedQuotationId: 'quotation', items: [{ productId: 'product', quantity: 2 }]
  }), /Quotation unavailable/);
  assert.equal(state.orders.length, 0);
  assert.equal(state.stock, 100);
  assert.equal(state.delivered, 0);
});

test('quotations save even without stock while invoices reject shortages inside the transaction', async () => {
  const { client, state } = store();
  state.stock = 1;
  const issue = loadOrderHandler(client);
  const quotation = await issue({
    userId: 'cashier', customerId: 'customer', invoiceType: 'فاتورة ضريبية', isQuotation: true,
    items: [{ productId: 'product', quantity: 5, unitPrice: 10 }]
  });
  assert.equal(quotation.status, 'PENDING');
  assert.equal(state.orders.length, 1);
  assert.equal(state.stock, 1);
  await assert.rejects(issue({
    userId: 'cashier', customerId: 'customer', invoiceType: 'فاتورة ضريبية',
    items: [{ productId: 'product', quantity: 5, unitPrice: 10 }]
  }), /لا يكفي/);
  assert.equal(state.orders.length, 1);
  assert.equal(state.stock, 1);
  assert.equal(state.delivered, 0);
});

test('browser invoices without linked quotations save and preserve cashier attribution', async () => {
  const { client, state } = store();
  const exports = {};
  const source = fs.readFileSync(path.join(root, 'src', 'app', 'api', 'orders', 'route.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports, console: { ...console, error() {} },
    require: id => {
      if (id === '@/lib/prisma') return { prisma: client };
      if (id === '@/lib/invoice-qr') return require('./invoice-qr');
      if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      throw new Error(`Unexpected import: ${id}`);
    }
  });
  const response = await exports.POST(new Request('http://localhost/api/orders', {
    method: 'POST', body: JSON.stringify({
      userId: 'cashier', invoiceType: 'فاتورة', items: [{ productId: 'product', quantity: 2 }]
    })
  }));
  assert.equal(response.status, 200);
  const invoice = await response.json();
  assert.equal(invoice.userId, 'cashier');
  assert.ok(invoice.qrCode.includes('رقم الفاتورة: INV-'));
  assert.ok(invoice.qrCode.includes('الإجمالي شامل الضريبة: 26.00 جنيه مصري'));
  assert.ok(invoice.qrCode.includes('ضريبة القيمة المضافة: 0.00 جنيه مصري'));
  assert.equal(state.stock, 98);
});
