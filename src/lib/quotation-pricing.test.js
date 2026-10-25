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
const { getQuotationCosts } = require('./document-edits');
const { createRemoteClient } = require('./remote-client');
const { createUserSessionToken } = require('./user-session-token');
const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
function pricing(context = {}) {
  const exports = {};
  vm.runInNewContext(compile(read('src', 'lib', 'quotation-pricing.ts')), {
    exports, Error, AbortSignal, ...context
  });
  return exports;
}
const { quotationAnalysis, priceQuotation, priceFromProfit } = pricing();
const costs = { checkedAt: '2026-10-25T10:00:00Z', costs: [{ productId: 'a', costPrice: 100 }, { productId: 'b', costPrice: 200 }] };
const lines = [
  { productId: 'a', quantity: '2', unitPrice: '120' },
  { productId: 'b', quantity: '3', unitPrice: '250' }
];
const plain = data => JSON.parse(JSON.stringify(data));
function database() {
  const products = [{ id: 'a', costPrice: 100, price: 900, stockQty: 20 }, { id: 'b', costPrice: 200, price: 400, stockQty: 30 }];
  const users = [{ id: 'admin', role: 'ADMIN' }, { id: 'keeper', role: 'STOREKEEPER' }, { id: 'cashier', role: 'CASHIER' }];
  const client = {
    user: { findUnique: async ({ where }) => users.find(user => user.id === where.id) },
    product: { findUnique: async ({ where }) => products.find(product => product.id === where.id) }
  };
  client.$transaction = async fn => fn(client);
  return { client, users, products };
}
const elements = tree => tree && typeof tree === 'object' ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)] : [];

test('profit uses current unit cost, quantities and pre-tax revenue, with explicit markup denominator', () => {
  const result = quotationAnalysis(lines, costs);
  assert.equal(result.cost, 800);
  assert.equal(result.revenue, 990);
  assert.equal(result.profit, 190);
  assert.equal(result.markup, 23.75);
  assert.equal(result.rows[0].unitProfit, 20);
  assert.equal(result.rows[0].profit, 40);
  assert.equal(result.rows[0].markup, 20);
  const updated = quotationAnalysis(lines, { ...costs, costs: [{ productId: 'a', costPrice: 130 }, costs.costs[1]] });
  assert.equal(updated.rows[0].unitProfit, -10);
  assert.equal(updated.belowCost, 1);
  assert.equal(updated.profit, 130);
  assert.equal(lines[0].unitPrice, '120');
});

test('a 30 percent markup sets each price from its cost, not existing selling price or equal profit per item', () => {
  const next = priceQuotation(lines, costs, new Set(), '30', 'markup');
  assert.deepEqual(plain(next.map(line => line.unitPrice)), ['130', '260']);
  const result = quotationAnalysis(next, costs);
  assert.equal(result.profit, 240);
  assert.equal(result.markup, 30);
  assert.deepEqual(plain(lines.map(line => line.unitPrice)), ['120', '250']);
  assert.equal(priceFromProfit(100, '35.25', 'unitProfit'), '135.25');
  assert.equal(priceFromProfit(100, '-10', 'markup'), '90');
});

test('locked prices are excluded from markup and target distribution accounts for their existing profits', () => {
  const locked = new Set(['a']);
  const byRate = priceQuotation(lines, costs, locked, '30', 'markup');
  assert.equal(byRate[0].unitPrice, '120');
  assert.equal(byRate[1].unitPrice, '260');
  const byTotal = priceQuotation(lines, costs, locked, '340', 'totalProfit');
  assert.equal(byTotal[0].unitPrice, '120');
  assert.equal(byTotal[1].unitPrice, '300');
  assert.equal(quotationAnalysis(byTotal, costs).profit, 340);
  const negative = priceQuotation(lines, costs, locked, '-80', 'totalProfit');
  assert.equal(negative[1].unitPrice, '160');
  assert.equal(quotationAnalysis(negative, costs).profit, -80);
});

test('target profit distributes proportionately to cost times quantity and reports actual rounded result', () => {
  const result = priceQuotation(lines, costs, new Set(), '200', 'totalProfit');
  assert.deepEqual(plain(result.map(line => line.unitPrice)), ['125', '250']);
  assert.equal(quotationAnalysis(result, costs).profit, 200);
  const rounding = priceQuotation([{ productId: 'a', quantity: '3', unitPrice: '100' }], costs, new Set(), '1', 'totalProfit');
  assert.equal(rounding[0].unitPrice, '100.33');
  assert.equal(quotationAnalysis(rounding, costs).profit, 0.99);
});

test('missing, zero or invalid costs never create fictional profit; incomplete totals and invalid input stay unavailable', () => {
  for (const costPrice of [null, undefined, 0, -1, NaN, Infinity]) {
    const unavailable = { ...costs, costs: [{ productId: 'a', costPrice }, costs.costs[1]] };
    const analysis = quotationAnalysis(lines, unavailable);
    assert.equal(analysis.profit, null);
    assert.equal(analysis.cost, null);
    assert.equal(analysis.rows[0].profit, null);
    assert.equal(analysis.missing, 1);
    assert.throws(() => priceQuotation(lines, unavailable, new Set(), '30', 'markup'));
  }
  for (const changed of [{ quantity: '' }, { quantity: '1.5' }, { quantity: '-1' }, { unitPrice: '' }, { unitPrice: 'NaN' }, { unitPrice: '-1' }]) {
    assert.equal(quotationAnalysis([{ ...lines[0], ...changed }], costs).profit, null);
    assert.throws(() => priceQuotation([{ ...lines[0], ...changed }], costs, new Set(), '30', 'markup'));
  }
  for (const input of ['', 'bad', 'Infinity', '-101', '10000000000000000']) {
    assert.throws(() => priceQuotation(lines, costs, new Set(), input, 'markup'));
  }
  assert.throws(() => priceQuotation(lines, costs, new Set(['a', 'b']), '30', 'markup'), /مثبتة/);
  assert.throws(() => priceQuotation(lines, costs, new Set(['a']), '-1000', 'totalProfit'));
  assert.throws(() => priceQuotation([], costs, new Set(), '30', 'markup'));
});

test('cost lookup rechecks database admin role, returns only current costs with no history or writes, and deduplicates IDs', async () => {
  const { client, users, products } = database();
  const before = structuredClone(products);
  for (const userId of ['cashier', 'keeper', 'missing', undefined]) {
    await assert.rejects(getQuotationCosts(client, userId, { productIds: ['a'], userId: 'admin', role: 'ADMIN' }), { statusCode: 403 });
  }
  const first = await getQuotationCosts(client, 'admin', { productIds: ['a', 'b', 'a'] });
  assert.deepEqual(first.costs, costs.costs);
  assert.deepEqual(Object.keys(first.costs[0]).sort(), ['costPrice', 'productId']);
  assert.deepEqual(products, before);
  products[0].costPrice = 170;
  assert.equal((await getQuotationCosts(client, 'admin', { productIds: ['a'] })).costs[0].costPrice, 170);
  products[0].costPrice = 0;
  assert.equal((await getQuotationCosts(client, 'admin', { productIds: ['a'] })).costs[0].costPrice, null);
  users[0].role = 'CASHIER';
  await assert.rejects(getQuotationCosts(client, 'admin', { productIds: ['a'] }), { statusCode: 403 });
});

test('cost lookup rejects invalid input and nonexistent products explicitly', async () => {
  const { client } = database();
  for (const input of [null, {}, { productIds: [] }, { productIds: [''] }, { productIds: [123] }, { productIds: Array(5001).fill('a') }]) {
    await assert.rejects(getQuotationCosts(client, 'admin', input), { statusCode: 400 });
  }
  await assert.rejects(getQuotationCosts(client, 'admin', { productIds: ['missing'] }), { statusCode: 404 });
});

test('cost API requires signed admin identity and current role, ignores body identity, is uncached and handles failures', async t => {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'quotation-cost-test';
  t.after(() => { if (previous === undefined) delete process.env.POS_API_TOKEN; else process.env.POS_API_TOKEN = previous; });
  const db = database();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'quotation-costs', 'route.ts')), {
    exports, process, Error, console: { error() {} }, require: id => {
      if (id === '@/lib/prisma') return { prisma: db.client };
      if (id === '@/lib/document-edits') return { getQuotationCosts };
      if (id === '@/lib/user-session-token') return require('./user-session-token');
      if (id === 'next/server') return { NextResponse: { json: (data, options) => Response.json(data, options) } };
      throw new Error(id);
    }
  });
  const send = (token, body) => exports.POST(new Request('http://localhost/api/quotation-costs', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: typeof body === 'string' ? body : JSON.stringify(body)
  }));
  const token = createUserSessionToken({ id: 'admin', role: 'ADMIN' });
  assert.equal((await send(process.env.POS_API_TOKEN, { productIds: ['a'] })).status, 401);
  assert.equal((await send(createUserSessionToken({ id: 'keeper', role: 'STOREKEEPER' }), { productIds: ['a'], userId: 'admin' })).status, 403);
  assert.equal((await send(token, '{')).status, 400);
  const response = await send(token, { productIds: ['a'], userId: 'cashier' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).costs[0].costPrice, 100);
  db.users[0].role = 'CASHIER';
  assert.equal((await send(token, { productIds: ['a'] })).status, 403);
  const proxyExports = {};
  vm.runInNewContext(compile(read('src', 'proxy.ts')), {
    exports: proxyExports, process, require: id => id === 'next/server'
      ? { NextResponse: { json: (body, options) => Response.json(body, options), next: () => 'allowed' } }
      : require('./user-session-token')
  });
  const request = signed => ({ method: 'POST', nextUrl: { pathname: '/api/quotation-costs' }, headers: new Headers({ authorization: `Bearer ${signed}` }) });
  assert.equal(proxyExports.proxy(request(process.env.POS_API_TOKEN)).status, 401);
  assert.equal(proxyExports.proxy(request(token)), 'allowed');
});

test('remote client and Electron bridge use authenticated session rather than a caller token', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(costs);
  });
  const remote = createRemoteClient(() => ({ serverUrl: 'http://localhost:3000', apiToken: 'machine' }));
  assert.throws(() => remote.quotationCosts({ productIds: ['a'] }), /جلسة/);
  assert.deepEqual(await remote.quotationCosts({ productIds: ['a'] }, 'signed-admin'), costs);
  assert.equal(calls[0].url, 'http://localhost:3000/api/quotation-costs');
  assert.equal(calls[0].options.headers.authorization, 'Bearer signed-admin');
  const handlers = new Map();
  let usedToken;
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase(); authenticatedUsers.set(10, {id:"admin",role:"ADMIN",sessionToken:"real-token"}); authenticatedUsers.set(11, {id:"keeper",role:"STOREKEEPER"});', {
    process, Buffer, console: { error() {} }, __dirname: path.join(root, 'electron'), require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => ({ quotationCosts: async (_, token) => { usedToken = token; return costs; } }) };
      if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
      return require(id);
    }
  });
  const lookup = handlers.get('quotation-costs');
  await assert.rejects(lookup({ sender: { id: 99 } }, { productIds: ['a'] }), /للمدير فقط/);
  await assert.rejects(lookup({ sender: { id: 11 } }, { productIds: ['a'] }), /للمدير فقط/);
  await lookup({ sender: { id: 10 } }, { productIds: ['a'], sessionToken: 'forged', userId: 'forged' });
  assert.equal(usedToken, 'real-token');
  assert.ok(read('electron', 'preload.js').includes("ipcRenderer.invoke('quotation-costs', data)"));
});

test('browser lookup sends no-store signed request and save confirmation rereads current cost and handles missing/loss/cancel explicitly', async () => {
  const requests = [];
  const confirms = [];
  let response = costs;
  let answer = true;
  const pricingClient = pricing({
    window: { confirm: message => { confirms.push(message); return answer; } },
    fetch: async (url, options) => { requests.push({ url, options }); return Response.json(response); }
  });
  const user = { role: 'ADMIN', sessionToken: 'signed-admin' };
  assert.equal(await pricingClient.confirmQuotationProfit(user, lines), true);
  assert.equal(confirms.length, 0);
  response = { ...costs, costs: [{ productId: 'a', costPrice: 150 }, costs.costs[1]] };
  answer = false;
  assert.equal(await pricingClient.confirmQuotationProfit(user, lines), false);
  assert.match(confirms[0], /بأقل من التكلفة الحالية/);
  response = { ...costs, costs: [{ productId: 'a', costPrice: null }, costs.costs[1]] };
  assert.equal(await pricingClient.confirmQuotationProfit(user, lines), false);
  assert.match(confirms[1], /غير متاحة/);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer signed-admin');
  await assert.rejects(pricingClient.loadQuotationCosts({ role: 'CASHIER' }, ['a']), /للمدير فقط/);
  assert.equal(requests.length, 3);
  const unavailable = pricing({ window: {}, fetch: async () => Response.json({ error: 'Server unavailable' }, { status: 503 }) });
  await assert.rejects(unavailable.loadQuotationCosts(user, ['a']), /Server unavailable/);
});

function panelHarness(data = costs) {
  const hooks = [];
  let cursor = 0;
  let current = structuredClone(lines);
  let yes = true;
  const exports = {};
  const fakeReact = {
    ...React, useEffect() {},
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = index === 0 ? data : index === 3 ? `${JSON.stringify(current.map(line => line.productId))}:0` : initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    }
  };
  vm.runInNewContext(compile(read('src', 'components', 'QuotationPricing.tsx') + '\nexport { ManagerPricing };'), {
    exports, Error, Set, window: { confirm: () => yes }, require: id => {
      if (id === 'react') return fakeReact;
      if (id === './MoneyInput') return { default: 'money-input' };
      if (id === '../lib/money-format') return require('./money-format');
      if (id === '../lib/quotation-pricing') return pricing();
      return require(id);
    }
  });
  return {
    component: exports.default, lines: () => current, answer: value => { yes = value; },
    render: () => { cursor = 0; return exports.ManagerPricing({ user: { role: 'ADMIN' }, lines: current, names: { a: 'Product A', b: 'Product B' },
      onChange: next => { current = next; } }); }
  };
}

test('profit UI is manager-only; uniform preview does not mutate prices until applied and locks are respected', () => {
  const harness = panelHarness();
  assert.equal(harness.component({ user: { role: 'CASHIER' } }), null);
  let tree = harness.render();
  const labels = elements(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox');
  labels[0].props.onChange({ target: { checked: true } });
  tree = harness.render();
  elements(tree).find(node => node.type === 'button' && node.props.children === 'معاينة النسبة الموحدة').props.onClick();
  assert.equal(harness.lines()[1].unitPrice, '250');
  tree = harness.render();
  assert.ok(elements(tree).some(node => node.props?.['aria-label'] === 'معاينة تسعير العرض'));
  elements(tree).find(node => node.type === 'button' && node.props.children === 'تطبيق الأسعار المقترحة').props.onClick();
  assert.equal(harness.lines()[0].unitPrice, '120');
  assert.equal(harness.lines()[1].unitPrice, '260');
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes('غير المثبتة') && html.includes('220.00'));
});

test('per-item unit profit and markup recalculate prices, reject invalid cost and confirm before applying a loss', () => {
  const harness = panelHarness();
  let tree = harness.render();
  elements(tree).find(node => node.props?.['aria-label'] === 'طريقة ربح Product A').props.onChange({ target: { value: 'unitProfit' } });
  tree = harness.render();
  elements(tree).find(node => node.props?.['aria-label'] === 'قيمة ربح Product A').props.onValueChange('-10');
  tree = harness.render();
  const apply = elements(tree).filter(node => node.type === 'button' && node.props.children === 'تطبيق')[0];
  harness.answer(false);
  apply.props.onClick();
  assert.equal(harness.lines()[0].unitPrice, '120');
  harness.answer(true);
  apply.props.onClick();
  assert.equal(harness.lines()[0].unitPrice, '90');
  tree = harness.render();
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes('أقل من التكلفة'));
  assert.ok(html.includes('-20.00'));
});

test('stale bulk previews disappear when a direct price edit changes the source inputs', () => {
  const harness = panelHarness();
  let tree = harness.render();
  elements(tree).find(node => node.type === 'button' && node.props.children === 'معاينة النسبة الموحدة').props.onClick();
  tree = harness.render();
  elements(tree).find(node => node.props?.['aria-label'] === 'سعر بيع Product A').props.onValueChange('140');
  tree = harness.render();
  assert.ok(!elements(tree).some(node => node.props?.['aria-label'] === 'معاينة تسعير العرض'));
  assert.equal(harness.lines()[0].unitPrice, '140');
});

test('unknown cost UI labels unavailable rather than zero, and refuses collective distribution', () => {
  const harness = panelHarness({ ...costs, costs: [{ productId: 'a', costPrice: null }, costs.costs[1]] });
  let tree = harness.render();
  assert.ok(renderToStaticMarkup(tree).includes('غير متاح'));
  elements(tree).find(node => node.type === 'button' && node.props.children === 'معاينة النسبة الموحدة').props.onClick();
  tree = harness.render();
  assert.ok(elements(tree).some(node => node.props?.role === 'alert'));
  assert.deepEqual(plain(harness.lines()), lines);
});

test('draft profit pricing submits quotation-only prices and cancellation does not mutate cart; print never includes cost or profit', async () => {
  const exports = {};
  vm.runInNewContext(compile(read('src', 'components', 'QuotationPricingDraft.tsx')), {
    exports, require: id => {
      if (id === './QuotationPricing') return { default: 'pricing-panel' };
      if (id === '../lib/money-format') return require('./money-format');
      if (id === 'react') return { ...React, useState: initial => [initial, () => {}] };
      return require(id);
    }
  });
  let submitted;
  let closed = false;
  const original = structuredClone(lines);
  const tree = exports.default({ user: { role: 'ADMIN' }, initialLines: original, names: {}, taxRates: { a: 0.14, b: 0 },
    busy: false, onClose: () => { closed = true; }, onSave: async next => { submitted = next; } });
  elements(tree).find(node => node.type === 'button' && node.props.children === 'إلغاء').props.onClick();
  assert.equal(closed, true);
  assert.deepEqual(original, lines);
  await elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(submitted, original);
  assert.ok(renderToStaticMarkup(tree).includes('1,023.60'));
  const print = {};
  vm.runInNewContext(compile(read('src', 'components', 'PrintDocuments.tsx')), { exports: print, require });
  const html = renderToStaticMarkup(React.createElement(print.InvoicePrint, { invoice: {
    isQuotation: true, invoiceNumber: 'QT-TEST', createdAt: '2026-10-25', totalAmount: 260, taxAmount: 0, netAmount: 260,
    items: [{ quantity: 2, unitPrice: 130, taxAmount: 0, total: 260, product: { name: 'Product', costPrice: 100 } }]
  }, onClose() {} }));
  for (const secret of ['تكلفة', 'ربح', '100.00', 'costPrice', 'تحليل أرباح']) assert.ok(!html.includes(secret), secret);
  assert.ok(html.includes('260.00'));
});

test('checkout uses quotation-only proposed prices, rechecks current profit and leaves cart untouched on cancellation or failure', async () => {
  const source = read('src', 'app', 'page.tsx');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleCheckout') declaration = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const desktop of [false, true]) for (const mode of ['success', 'cancel', 'fail', 'invoice', 'cashier']) {
    const calls = [];
    const checks = [];
    const errors = [];
    let cleared = false;
    const cart = [{ id: 'a', qty: 2, price: 120, originalPrice: 120 }, { id: 'b', qty: 3, price: 250, originalPrice: 250 }];
    const before = structuredClone(cart);
    const send = async data => {
      calls.push(data);
      if (mode === 'fail') throw new Error('Unable to save');
      return { id: 'saved', items: data.items };
    };
    const exports = {};
    vm.runInNewContext(compile(`const ${declaration}; exports.checkout = handleCheckout;`), {
      exports, Error, cart, submitting: false, currentUser: { role: mode === 'cashier' ? 'CASHIER' : 'ADMIN' },
      selectedCustomer: { id: 'customer', name: 'Customer' }, siteReceiptNumber: '', receiverName: '', invoiceType: 'فاتورة ضريبية', linkedQuotationId: null,
      setSubmitting() {}, setInvoice() {}, setQrCodeUrl() {}, setShowModal() {}, setShowQuotationPricing() {}, clearCart: () => { cleared = true; },
      fetchProducts() {}, fetchInvoices() {}, fetchCustomers() {}, alert: message => errors.push(message),
      confirmQuotationProfit: async (_, items) => { checks.push(items); return mode !== 'cancel'; },
      window: desktop ? { electronAPI: { createOrder: send } } : {},
      fetch: async (_, options) => Response.json(await send(JSON.parse(options.body)))
    });
    const proposed = priceQuotation(lines, costs, new Set(), '30', 'markup');
    await exports.checkout(mode !== 'invoice', mode === 'invoice' ? undefined : proposed);
    assert.deepEqual(cart, before);
    if (mode === 'cancel') {
      assert.equal(calls.length, 0);
      assert.equal(cleared, false);
    } else {
      assert.equal(calls.length, 1);
      assert.deepEqual(plain(calls[0].items.map(line => line.unitPrice)), mode === 'invoice' ? [120, 250] : [130, 260]);
      assert.equal(cleared, mode !== 'fail');
      if (mode === 'fail') assert.ok(errors.some(message => message.includes('Unable to save')));
    }
    assert.equal(checks.length, mode === 'invoice' || mode === 'cashier' ? 0 : 1);
  }
});

test('current-cost lookup persists no snapshot and immediately reflects cost edits after Access reconnect',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-quotation-profit-'));
    const databasePath = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = databasePath;
    const db = createAccessClient();
    try {
      const suffix = Date.now();
      const user = await db.user.create({ data: { username: `pricing-${suffix}`, name: 'مدير التسعير', password: 'test-only', role: 'ADMIN' } });
      const product = await db.product.create({ data: { code: `pricing-${suffix}`, name: 'صنف اختبار الربح', type: 'اختبار', size: '20', price: 130, costPrice: 100, stockQty: 10 } });
      const first = await getQuotationCosts(db, user.id, { productIds: [product.id] });
      assert.equal(first.costs[0].costPrice, 100);
      await db.product.update({ where: { id: product.id }, data: { costPrice: 120 } });
      await db.$disconnect();
      const current = await getQuotationCosts(db, user.id, { productIds: [product.id] });
      assert.equal(current.costs[0].costPrice, 120);
      const analysis = quotationAnalysis([{ productId: product.id, quantity: '10', unitPrice: '130' }], current);
      assert.equal(analysis.profit, 100);
      assert.equal((await db.order.findMany()).length, 0);
      const stored = await db.product.findUnique({ where: { id: product.id } });
      assert.equal(stored.stockQty, 10);
      assert.equal(stored.price, 130);
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previous;
      fs.unlinkSync(databasePath);
      const lock = path.join(directory, 'test.laccdb');
      if (fs.existsSync(lock)) fs.unlinkSync(lock);
      fs.rmdirSync(directory);
    }
  });
