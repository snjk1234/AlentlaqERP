/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const quietConsole = { ...console, error() {} };

function createOrderClient() {
  const products = [{ id: 'limited', name: 'صنف محدود', price: 10, taxRate: 0, stockQty: 1 }];
  const orders = [];
  const convertedQuotations = [];
  const client = {
    product: {
      findMany: async ({ where }) => products.filter(product => where.id.in.includes(product.id)),
      findUnique: async ({ where }) => products.find(product => product.id === where.id) || null,
      update: async ({ where, data }) => {
        const product = products.find(entry => entry.id === where.id);
        product.stockQty -= data.stockQty.decrement;
        return product;
      }
    },
    order: {
      count: async () => orders.length,
      create: async ({ data }) => {
        const order = { id: `order-${orders.length + 1}`, ...data };
        orders.push(order);
        return order;
      },
      update: async ({ where, data }) => {
        const order = orders.find(entry => entry.id === where.id);
        convertedQuotations.push([where.id, data.status]);
        Object.assign(order, data);
        return order;
      }
    },
    $transaction: async callback => {
      const previousProducts = products.map(product => ({ ...product }));
      const previousOrders = orders.map(order => structuredClone(order));
      try {
        return await callback(client);
      } catch (error) {
        products.splice(0, products.length, ...previousProducts);
        orders.splice(0, orders.length, ...previousOrders);
        throw error;
      }
    }
  };
  return { client, products, orders, convertedQuotations };
}

async function createOrderSubmitter(desktop, client) {
  if (desktop) {
    const handlers = new Map();
    vm.runInNewContext(`${read('electron', 'main.js')}\ninitializeDatabase();`, {
      require: id => {
        if (id === 'electron') return {
          app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
          ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
          protocol: { registerSchemesAsPrivileged() {} }
        };
        if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
        if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
        return require(id);
      },
      process, Buffer, console: quietConsole, __dirname: path.join(root, 'electron')
    });
    return data => handlers.get('create-order')(null, data);
  }

  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'orders', 'route.ts')), {
    exports, console: quietConsole, Response,
    require: id => {
      if (id === '@/lib/prisma') return { prisma: client };
      if (id === '@/lib/invoice-qr') return { invoiceQrText: () => 'QR' };
      if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      throw new Error(`Unexpected import: ${id}`);
    }
  });
  return async data => {
    const response = await exports.POST(new Request('http://localhost/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    }));
    return { status: response.status, body: await response.json() };
  };
}

test('out-of-stock quantities are allowed in quotations but blocked when issuing or converting invoices', async () => {
  for (const desktop of [false, true]) {
    const { client, products, orders, convertedQuotations } = createOrderClient();
    const submit = await createOrderSubmitter(desktop, client);
    const request = (isQuotation, quantity, linkedQuotationId) => ({
      userId: 'admin', customerId: null, isQuotation, linkedQuotationId, invoiceType: 'فاتورة',
      items: [{ productId: 'limited', quantity, unitPrice: 10 }]
    });

    const quotationResult = await submit(request(true, 5, null));
    if (desktop) assert.equal(quotationResult.isQuotation, true);
    else assert.equal(quotationResult.status, 200);
    assert.equal(products[0].stockQty, 1);
    assert.equal(orders.length, 1);

    const invoicePromise = submit(request(false, 5, orders[0].id));
    if (desktop) {
      await assert.rejects(invoicePromise, /المخزون المتاح/);
    } else {
      const invoiceResult = await invoicePromise;
      assert.equal(invoiceResult.status, 500);
      assert.match(invoiceResult.body.error, /المخزون المتاح/);
    }
    assert.equal(products[0].stockQty, 1);
    assert.equal(orders.length, 1);
    assert.deepEqual(convertedQuotations, []);

    const convertedResult = await submit(request(false, 1, orders[0].id));
    if (desktop) assert.equal(convertedResult.status, 'COMPLETED');
    else assert.equal(convertedResult.status, 200);
    assert.equal(products[0].stockQty, 0);
    assert.equal(orders.length, 2);
    assert.deepEqual(convertedQuotations, [[orders[0].id, 'CONVERTED']]);
  }
});

test('POS cart can add an out-of-stock product repeatedly for a quotation', () => {
  const page = read('src', 'app', 'page.tsx');
  const start = page.indexOf('  const addToCart =');
  const end = page.indexOf('  const removeFromCart =', start);
  assert.ok(start >= 0 && end > start);
  const exports = {};
  const state = { cart: [] };
  const alerts = [];
  vm.runInNewContext(compile(`${page.slice(start, end)}\nexports.addToCart = addToCart; exports.updateQty = updateQty;`), {
    exports, selectedCustomerId: 'CASH', customers: [], alert: message => alerts.push(message),
    setCart: update => { state.cart = update(state.cart); }
  });

  const product = { id: 'limited', name: 'صنف محدود', price: 10, taxRate: 0, stockQty: 0 };
  exports.addToCart(product);
  exports.addToCart(product);
  exports.updateQty(product.id, 3);

  assert.equal(state.cart[0].qty, 5);
  assert.deepEqual(alerts, []);

  const tree = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let quantityChange;
  const findQuantityInput = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'input') {
      const attributes = node.attributes.properties;
      const type = attributes.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'type');
      const value = attributes.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'value');
      const change = attributes.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onChange');
      if (type?.initializer && ts.isStringLiteral(type.initializer) && type.initializer.text === 'number'
        && value?.initializer && ts.isJsxExpression(value.initializer)
        && value.initializer.expression?.getText(tree) === 'item.qty'
        && change?.initializer && ts.isJsxExpression(change.initializer)) {
        quantityChange = change.initializer.expression?.getText(tree);
      }
    }
    ts.forEachChild(node, findQuantityInput);
  };
  findQuantityInput(tree);
  assert.ok(quantityChange);
  const typedQuantityState = { cart: [{ id: product.id, qty: 1 }] };
  const quantityExports = {};
  vm.runInNewContext(compile(`exports.onChange = ${quantityChange};`), {
    exports: quantityExports, products: [product], item: { id: product.id },
    setCart: update => { typedQuantityState.cart = update(typedQuantityState.cart); },
    alert: message => alerts.push(message)
  });
  quantityExports.onChange({ target: { value: '5' } });
  assert.equal(typedQuantityState.cart[0].qty, 5);
  assert.deepEqual(alerts, []);
});
