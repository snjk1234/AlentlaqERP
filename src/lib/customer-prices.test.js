/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const { saveCustomerPrices } = require('./customer-prices');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const quietConsole = { ...console, error() {} };
const copy = value => JSON.parse(JSON.stringify(value));

function priceStore() {
  let rows = [{ id: 'old', customerId: 'customer', productId: 'first', price: 10 }];
  const client = {
    customer: {
      findUnique: async ({ where }) => where.id === 'customer' ? { id: where.id } : null,
      findMany: async ({ include }) => {
        assert.equal(include.customPrices, true);
        return [{ id: 'customer', customPrices: copy(rows) }];
      }
    },
    product: { findMany: async ({ where }) => where.id.in.filter(id => ['first', 'second'].includes(id)).map(id => ({ id })) },
    customerPrice: {
      findMany: async () => copy(rows),
      delete: async ({ where }) => { rows = rows.filter(row => row.id !== where.id); },
      upsert: async ({ create, update }) => {
        const existing = rows.find(row => row.customerId === create.customerId && row.productId === create.productId);
        if (existing) Object.assign(existing, update);
        else rows.push({ id: create.productId, ...create });
      }
    },
    $transaction: async callback => {
      const previous = copy(rows);
      try { return await callback(client); }
      catch (error) { rows = previous; throw error; }
    }
  };
  return client;
}

test('customer prices validate values before writes, support zero, update and remove cleared overrides', async () => {
  const client = priceStore();
  for (const prices of [null, [{}], [{ productId: 'first', price: -1 }], [{ productId: 'first', price: NaN }],
    [{ productId: 'first', price: Infinity }], [{ productId: 'first', price: '12' }],
    [{ productId: 'first', price: 1 }, { productId: 'first', price: 2 }]]) {
    await assert.rejects(saveCustomerPrices(client, 'customer', prices), { code: 'INVALID_CUSTOMER_PRICES' });
  }
  await assert.rejects(saveCustomerPrices(client, 'missing', []), /العميل غير موجود/);
  await assert.rejects(saveCustomerPrices(client, 'customer', [{ productId: 'missing', price: 1 }]), /الأصناف/);
  assert.equal((await client.customerPrice.findMany())[0].price, 10);
  let saved = await saveCustomerPrices(client, 'customer', [{ productId: 'first', price: 12.5 }, { productId: 'second', price: 0 }]);
  assert.deepEqual(saved.map(row => row.price), [12.5, 0]);
  saved = await saveCustomerPrices(client, 'customer', [{ productId: 'second', price: 5 }]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].productId, 'second');
  assert.deepEqual(await saveCustomerPrices(client, 'customer', []), []);
});

test('customer prices web API awaits route params, returns persisted prices and reports validation/database errors', async () => {
  const client = priceStore();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'customers', '[id]', 'prices', 'route.ts')), {
    exports, Error, SyntaxError, console: quietConsole,
    require: id => {
      if (id === '@/lib/prisma') return { prisma: client };
      if (id === '@/lib/customer-prices') return { saveCustomerPrices };
      if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      throw new Error(`Unexpected import: ${id}`);
    }
  });
  const post = prices => exports.POST(new Request('http://localhost/api/customers/customer/prices', {
    method: 'POST', body: JSON.stringify({ prices })
  }), { params: Promise.resolve({ id: 'customer' }) });
  let response = await post([{ productId: 'first', price: 8.75 }]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).prices[0].price, 8.75);
  response = await post([{ productId: 'first', price: -1 }]);
  assert.equal(response.status, 400);
  assert.ok((await response.json()).error);
  client.$transaction = async () => { throw new Error('Database offline'); };
  response = await post([]);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Database offline');
});

test('Electron bridges saving prices and reloads customer overrides; packaged files include the shared service', async () => {
  const client = priceStore();
  const handlers = new Map();
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase();', {
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
      if (id === '../src/lib/customer-prices') return { saveCustomerPrices };
      return require(id);
    },
    process, Error, Buffer, console: quietConsole, __dirname: path.join(root, 'electron')
  });
  let bridge;
  vm.runInNewContext(read('electron', 'preload.js'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } },
      ipcRenderer: { invoke: (channel, data) => handlers.get(channel)(null, data) }
    })
  });
  await bridge.saveCustomerPrices({ customerId: 'customer', prices: [{ productId: 'first', price: 7.25 }] });
  assert.equal((await bridge.getCustomers())[0].customPrices[0].price, 7.25);
  await assert.rejects(bridge.saveCustomerPrices({ customerId: 'customer', prices: [{ productId: 'first', price: -1 }] }));
  const files = JSON.parse(read('package.json')).build.files;
  assert.ok(files.includes('src/lib/customer-prices.js'));
});

test('price modal saves via desktop or browser, keeps edits on failure and rejects invalid values', async () => {
  const page = read('src', 'app', 'page.tsx');
  const start = page.indexOf('  const handleSaveCustomerPrices =');
  const end = page.indexOf('  const [showCustomerCeilingsModal', start);
  assert.ok(start > 0 && end > start);
  for (const desktop of [true, false]) {
    for (const failure of [false, true]) {
      const exports = {};
      const alerts = [];
      const pending = [];
      const state = { customers: [{ id: 'customer', customPrices: [] }], open: true };
      const saved = [{ id: 'saved', productId: 'first', price: 7.25 }];
      const save = async data => {
        assert.equal(data.customerId, 'customer');
        assert.deepEqual(copy(data.prices), [{ productId: 'first', price: 7.25 }]);
        if (failure) throw new Error('Connection failed');
        return saved;
      };
      const context = {
        exports, Error, console: quietConsole,
        selectedCustomerForPrices: { id: 'customer' }, savingCustomerPrices: false,
        customerPricesMap: { first: 7.25 },
        setSavingCustomerPrices: value => pending.push(value),
        setCustomers: update => { state.customers = update(state.customers); },
        setShowCustomerPricesModal: value => { state.open = value; },
        alert: message => alerts.push(message),
        window: desktop ? { electronAPI: { saveCustomerPrices: save } } : {},
        fetch: async (_url, options) => {
          assert.equal(options.method, 'POST');
          try {
            const prices = await save({ customerId: 'customer', ...JSON.parse(options.body) });
            return Response.json({ prices });
          } catch (error) {
            return Response.json({ error: error.message, code: error.code }, { status: 500 });
          }
        }
      };
      vm.runInNewContext(compile(page.slice(start, end) + '\nexports.save = handleSaveCustomerPrices;'), context);
      await exports.save();
      assert.deepEqual(pending, [true, false]);
      assert.equal(state.open, failure);
      assert.equal(state.customers[0].customPrices.length, failure ? 0 : 1);
      assert.ok(alerts[0].includes(failure ? 'Connection failed' : 'بنجاح'));
      context.customerPricesMap = { first: -1 };
      pending.length = 0;
      await exports.save();
      assert.deepEqual(pending, []);
      assert.ok(alerts.at(-1).includes('لا تقل عن صفر'));
    }
  }
});

test('customer price product details show only requested fields on one horizontally scrollable line', () => {
  const page = read('src', 'app', 'page.tsx');
  const start = page.indexOf('<div className="mt-2 max-w-full overflow-x-auto custom-scrollbar">');
  const end = page.indexOf('</dl>', start);
  assert.ok(start >= 0 && end > start);
  const details = page.slice(start, end);
  const labels = ['اسم الصنف:', "['الكود'", "['النوع'", "['المقاس'", "['الدرجة'", "['اللون'",
    "['المورد'", "['الطول'", "['الوزن'", "['سعر الكيلو'"];
  let previous = -1;
  for (const label of labels) {
    const index = details.indexOf(label);
    assert.ok(index > previous, `${label} appears in the requested order on the product details row`);
    previous = index;
  }
  for (const omitted of ['الباركود', 'الضريبة', 'المخزون', 'الحد الأدنى', 'الحد الأقصى', 'التكلفة', 'معامل التسعير']) {
    assert.ok(!details.includes(omitted), `${omitted} is not part of the product details row`);
  }
  assert.ok(details.includes('flex w-max items-center'));
  assert.ok(details.includes('whitespace-nowrap'));
  assert.ok(page.includes('max-w-7xl'));
  assert.ok(page.includes('w-[72%]') && page.includes('w-[12%]') && page.includes('w-[16%]'));
  assert.ok(page.includes('min-w-[650px] table-fixed'));
});

test('price list renders only requested product properties and preserves zero-valued price per kilo', () => {
  const source = read('src', 'app', 'page.tsx');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let details;
  const visit = node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'dl'
      && node.getText(tree).includes('flex w-max items-center')) {
      details = node.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(details);
  const exports = {};
  vm.runInNewContext(compile(`exports.details = (${details});`), {
    exports, require, suppliers: [{ id: 'supplier', name: 'Variant supplier' }],
    p: {
      name: 'Test product', imageUrl: null, code: 'P-1', type: 'PIPE', size: '20mm',
      gauge: 'Heavy', color: 'Blue', supplierId: 'supplier', length: '10m',
      weight: '5kg', pricePerKilo: 0
    }
  });
  const html = renderToStaticMarkup(exports.details);
  for (const value of ['Test product', 'P-1', 'PIPE', '20mm', 'Heavy', 'Blue', 'Variant supplier', '10m', '5kg']) {
    assert.ok(html.includes(value), value);
  }
  for (const label of ['اسم الصنف:', 'الكود:', 'النوع:', 'المقاس:', 'الدرجة:', 'اللون:', 'المورد:', 'الطول:', 'الوزن:', 'سعر الكيلو:']) {
    assert.ok(html.includes(label), label);
  }
  assert.ok(html.includes('>0</dd>'));
  for (const omitted of ['BARCODE-123', 'الباركود', 'الضريبة', 'المخزون', 'الحد الأدنى', 'الحد الأقصى', 'التكلفة', 'معامل التسعير']) {
    assert.ok(!html.includes(omitted), omitted);
  }
});

test('custom-priced products move to the top and print reports include only assigned prices', () => {
  const source = read('src', 'app', 'page.tsx');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let sortExpression;
  let printHandler;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'customerPriceProducts') {
      sortExpression = node.initializer.getText(tree);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handlePrintCustomPrices') {
      printHandler = node.initializer.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(sortExpression);
  assert.ok(printHandler);

  const products = [
    { id: 'regular', name: 'Regular', price: 10 },
    { id: 'custom', name: 'Custom', code: 'C-1', type: 'PIPE', size: '20', price: 15, pricePerKilo: 0,
      supplierId: 'supplier', supplier: null },
    { id: 'also-custom', name: 'Also custom', code: 'C-2', price: 20, supplier: { name: 'Direct supplier' } }
  ];
  const customerPricesMap = { custom: 0, 'also-custom': 12.5 };
  const sortedContext = { exports: {}, products, customerPricesMap };
  vm.runInNewContext(compile(`exports.value = (${sortExpression});`), sortedContext);
  assert.deepEqual(Array.from(sortedContext.exports.value, product => product.id), ['custom', 'also-custom', 'regular']);

  const reports = [];
  const printContext = {
    exports: {}, products, customerPricesMap, selectedCustomerForPrices: { name: 'Customer A' },
    suppliers: [{ id: 'supplier', name: 'Supplier A' }],
    setPrintTableData: report => reports.push(report)
  };
  vm.runInNewContext(compile(`exports.print = (${printHandler});`), printContext);
  printContext.exports.print();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, 'قائمة الأسعار المخصصة للعميل: Customer A');
  assert.equal(reports[0].rows.length, 2);
  assert.deepEqual(Array.from(reports[0].rows, row => row[0]), ['Custom', 'Also custom']);
  assert.equal(reports[0].rows[0][6], 'Supplier A');
  assert.equal(reports[0].rows[0][9], 0);
  assert.equal(reports[0].rows[0][11], '0.00');
  assert.equal(reports[0].rows[1][11], '12.50');
  printContext.customerPricesMap = {};
  printContext.exports.print();
  assert.equal(reports.length, 1);
  assert.ok(source.includes('طباعة الأصناف المخصصة'));
});

test('customer prices persist through remote Access transactions, reconnect and rollback partial writes',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const access = require('./access-client');
    const { createRemoteClient } = require('./remote-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-prices-test-'));
    const databasePath = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previousPath = process.env.ACCESS_DB_PATH;
    const previousFetch = global.fetch;
    process.env.ACCESS_DB_PATH = databasePath;
    const database = access.createAccessClient();
    let failProduct = null;
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      try {
        let data = null;
        if (body.action === 'begin') data = await access.beginRemoteTransaction();
        else if (body.action === 'commit') await access.commitRemoteTransaction(body.transactionId);
        else if (body.action === 'rollback') await access.rollbackRemoteTransaction(body.transactionId);
        else {
          if (body.operation === 'upsert' && body.args.create.productId === failProduct) throw new Error('Simulated write failure');
          data = await access.runRemoteOperation(body.modelName, body.operation, body.args, body.transactionId);
        }
        return Response.json({ data });
      } catch (error) {
        return Response.json({ error: error.message, code: error.code }, { status: 500 });
      }
    };
    try {
      const customer = await database.customer.create({ data: { name: `prices-test-${Date.now()}` } });
      const other = await database.customer.create({ data: { name: `prices-other-${Date.now()}` } });
      const supplier = await database.supplier.create({ data: { name: `prices-supplier-${Date.now()}` } });
      const products = [];
      for (const color of ['Blue', 'Red']) {
        products.push(await database.product.create({
          data: { code: 'PRICE-TEST', name: 'Same product', type: 'PIPE', size: '20', color, price: 13, supplierId: supplier.id }
        }));
      }
      const remote = createRemoteClient(() => ({ serverUrl: 'http://localhost', apiToken: 'test-only' }));
      await assert.rejects(saveCustomerPrices(database, 'missing-customer', []), { code: 'INVALID_CUSTOMER_PRICES' });
      await saveCustomerPrices(remote, other.id, [{ productId: products[0].id, price: 99 }]);
      await saveCustomerPrices(remote, customer.id, products.map((p, index) => ({ productId: p.id, price: index ? 0 : 10.25 })));
      await database.$disconnect();
      let reloaded = await database.customer.findUnique({ where: { id: customer.id }, include: { customPrices: true } });
      assert.equal(reloaded.customPrices.length, 2);
      assert.deepEqual(reloaded.customPrices.map(row => row.price).sort((a, b) => a - b), [0, 10.25]);
      failProduct = products[1].id;
      await assert.rejects(saveCustomerPrices(remote, customer.id, products.map(p => ({ productId: p.id, price: 42 }))), /Simulated write failure/);
      reloaded = await database.customer.findUnique({ where: { id: customer.id }, include: { customPrices: true } });
      assert.deepEqual(reloaded.customPrices.map(row => row.price).sort((a, b) => a - b), [0, 10.25]);
      failProduct = null;
      await saveCustomerPrices(remote, customer.id, [{ productId: products[1].id, price: 5 }]);
      await database.$disconnect();
      reloaded = await database.customer.findUnique({ where: { id: customer.id }, include: { customPrices: true } });
      assert.equal(reloaded.customPrices.length, 1);
      assert.equal(reloaded.customPrices[0].productId, products[1].id);
      assert.equal(reloaded.customPrices[0].price, 5);
      assert.equal((await database.customer.findUnique({ where: { id: other.id }, include: { customPrices: true } })).customPrices[0].price, 99);
      const product = await database.product.findUnique({ where: { id: products[1].id }, include: { supplier: true } });
      assert.equal(product.color, 'Red');
      assert.equal(product.supplier.name, supplier.name);
    } finally {
      global.fetch = previousFetch;
      await database.$disconnect();
      if (previousPath === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previousPath;
      fs.unlinkSync(databasePath);
      const lockPath = path.join(directory, 'test.laccdb');
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      fs.rmdirSync(directory);
    }
  });
