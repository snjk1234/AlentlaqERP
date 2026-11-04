/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const imageUrl = 'data:image/png;base64,aGVsbG8=';
const quietConsole = { ...console, error() {} };

test('image-only product updates preserve every other field in browser and Electron', async () => {
  const product = { id: 'product', imageUrl: null, price: 13, costPrice: 10, stockQty: 99, supplierId: 'supplier', color: 'Blue', gauge: 'Heavy' };
  const original = { ...product };
  const prisma = { product: { update: async ({ where, data }) => {
    assert.equal(where.id, product.id);
    assert.deepEqual(Object.keys(data), ['imageUrl']);
    Object.assign(product, data);
    return { ...product };
  } } };
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'products', 'route.ts')), {
    exports, console: quietConsole,
    require: id => id === '@/lib/prisma' ? { prisma } : { NextResponse: { json: (body, init) => Response.json(body, init) } }
  });
  const request = body => new Request('http://localhost/api/products', { method: 'PUT', body: JSON.stringify(body) });
  assert.equal((await exports.PUT(request({ id: 'product', imageUrl }))).status, 200);
  assert.deepEqual(product, { ...original, imageUrl });
  for (const invalid of ['file:///secret.png', 'data:image/svg+xml;base64,AAAA', 'invalid']) {
    assert.equal((await exports.PUT(request({ id: 'product', imageUrl: invalid }))).status, 400);
  }
  const source = read('electron', 'main.js');
  const tree = ts.createSourceFile('main.js', source, ts.ScriptTarget.Latest, true);
  let handler;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'ipcMain.handle'
      && node.arguments[0]?.text === 'update-product') handler = node.arguments[1].getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const native = {};
  vm.runInNewContext(`exports.update = ${handler}`, { exports: native, prisma, console: quietConsole });
  product.imageUrl = null;
  await native.update(null, { id: 'product', imageUrl });
  assert.deepEqual(product, { ...original, imageUrl });
  await assert.rejects(native.update(null, { id: 'product', imageUrl: 'file:///invalid' }), /غير صالح/);
});

test('image upload is ADMIN-only, validates files, reports reader failures and uses image-only payloads', async () => {
  const source = read('src', 'app', 'page.tsx');
  const start = source.indexOf('  const handleImageUpload =');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleImageUpload') handler = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(start >= 0 && handler);
  for (const desktop of [false, true]) {
    const exports = {};
    const alerts = [];
    const writes = [];
    const states = [];
    const product = { id: 'product', price: 13, imageUrl: null };
    const context = {
      exports, Error, console: quietConsole, currentUser: { role: 'ADMIN' }, uploadingProductImage: null,
      alert: message => alerts.push(message),
      setUploadingProductImage: value => states.push(value),
      setProducts: update => { assert.equal(update([product])[0].imageUrl, imageUrl); },
      setSelectedProduct: update => { assert.equal(update(product).imageUrl, imageUrl); },
      FileReader: class {
        readAsDataURL() { this.result = imageUrl; this.onload(); }
      },
      window: desktop ? { electronAPI: { updateProduct: async data => writes.push(data) } } : {},
      fetch: async (_url, options) => { writes.push(JSON.parse(options.body)); return Response.json(product); }
    };
    vm.runInNewContext(compile(`exports.upload = ${handler};`), context);
    const event = file => ({ currentTarget: { files: [file], value: 'local-file' } });
    await exports.upload(event({ type: 'image/png', size: 1024 }), product);
    assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{ id: 'product', imageUrl }]);
    assert.deepEqual(states, ['product', null]);
    assert.deepEqual(alerts, []);
    for (const file of [{ type: 'image/svg+xml', size: 10 }, { type: 'image/png', size: 3 * 1024 * 1024 }]) {
      await exports.upload(event(file), product);
    }
    assert.equal(writes.length, 1);
    assert.equal(alerts.length, 2);
    context.currentUser.role = 'CASHIER';
    await exports.upload(event({ type: 'image/png', size: 10 }), product);
    assert.equal(writes.length, 1);
    assert.ok(alerts.at(-1).includes('الرئيسي'));
    context.currentUser.role = 'ADMIN';
    context.FileReader = class { readAsDataURL() { this.onerror(); } };
    await exports.upload(event({ type: 'image/png', size: 10 }), product);
    assert.ok(alerts.at(-1).includes('تعذر قراءة'));
    assert.equal(states.at(-1), null);
  }
});

test('both card surfaces have larger text and ADMIN-gated local image controls', () => {
  const source = read('src', 'app', 'page.tsx');
  assert.equal((source.match(/product-data-card glass-card/g) || []).length, 2);
  assert.equal((source.match(/<ProductCardDetails product=/g) || []).length, 2);
  assert.equal((source.match(/accept="image\/jpeg,image\/png,image\/webp,image\/gif"/g) || []).length, 2);
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let gated = 0;
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && node.left.getText(tree) === "currentUser?.role === 'ADMIN'" && node.right.getText(tree).includes('handleImageUpload')) gated++;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(gated, 2);
  const css = read('src', 'app', 'globals.css');
  assert.ok(css.includes('.product-data-card { font-size: 11px;'));
  assert.ok(css.includes('.product-data-card .product-card-name { font-size: 14px;'));
  assert.ok(css.includes('.product-data-card .product-card-price { font-size: 11px;'));
  assert.equal((source.match(/product-cards-grid grid/g) || []).length, 2);
  assert.ok(css.includes('minmax(min(100%, 320px), 1fr)'));
});

test('POS cards stay near their original width and never exceed four columns', () => {
  const source = read('src', 'app', 'page.tsx');
  assert.equal((source.match(/pos-product-cards-grid/g) || []).length, 1);
  assert.match(source, /className="product-cards-grid grid pos-product-cards-grid[^"]*"[\s\S]*?filteredProducts\.map/);
  const css = read('src', 'app', 'globals.css');
  assert.ok(css.includes('.pos-product-cards-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, max(220px, calc((100% - 36px) / 4))), 1fr)); }'));
  assert.ok(css.includes('.pos-product-cards-grid .product-card-bottom { gap: 4px; }'));
  assert.ok(css.includes('.pos-product-cards-grid .product-card-bottom > :is(span, p) { flex: 1; min-width: 0; white-space: normal; }'));
  assert.ok(css.includes('.product-cards-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }'));
});

test('card identity appears above images, with unlabelled details and a separate sale and stock row', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read('src', 'components', 'ProductCardDetails.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require });
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const product = {
    name: 'Product', code: 'P-123', type: 'PIPE', size: '20', color: 'Blue', gauge: 'Heavy',
    supplier: { name: 'Supplier' }, length: '3m', weight: '2kg', stockQty: 5, minStockQty: 10, price: 13
  };
  const html = renderToStaticMarkup(React.createElement('div', null,
    React.createElement(exports.ProductCardHeader, { product }),
    React.createElement('img', { src: 'data:image/png;base64,aGVsbG8=', alt: product.name }),
    React.createElement(exports.default, { product, actions: React.createElement('button', null, 'Add to cart') })
  ));
  for (const value of ['Product', 'P-123', 'PIPE', '20', 'Blue', 'Heavy', 'Supplier', '3m', '2kg', 'المخزون:', '(منخفض)']) {
    assert.ok(html.includes(value), value);
  }
  assert.ok(html.indexOf('product-card-inline-details') < html.indexOf('product-card-stock'));
  assert.ok(html.indexOf('P-123') < html.indexOf('<img'));
  assert.ok(html.indexOf('>Product</h3>') < html.indexOf('<img'));
  assert.ok(html.indexOf('>PIPE</span>') < html.indexOf('<img'));
  assert.ok(html.indexOf('<img') < html.indexOf('product-color-badge'));
  for (const [title, abbreviation, value] of [['المقاس', 'م', '20'], ['الطول', 'ط', '3m'], ['الوزن', 'ز', '2kg']]) {
    assert.ok(html.includes(`title="${title}">${abbreviation} <bdi>${value}</bdi></span>`));
  }
  for (const label of ['كود:', 'النوع:', 'المقاس:', 'الدرجة:', 'اللون:', 'المورد:', 'الطول:', 'الوزن:']) {
    assert.ok(!html.includes(label), label);
  }
  assert.equal((html.match(/>P-123</g) || []).length, 1);
  assert.equal((html.match(/>PIPE</g) || []).length, 1);
  assert.ok(html.indexOf('product-card-bottom') < html.indexOf('Add to cart'));
  const page = read('src', 'app', 'page.tsx');
  for (const variable of ['item', 'p']) {
    const header = page.indexOf(`<ProductCardHeader product={${variable}}`);
    const details = page.indexOf(`<ProductCardDetails product={${variable}}`);
    const image = page.indexOf(`src={${variable}.imageUrl`, header);
    assert.ok(header >= 0 && image > header && details > image, variable);
  }
  const css = read('src', 'app', 'globals.css');
  assert.ok(html.includes('product-card-bottom') && html.includes('13.00'));
  assert.ok(css.includes('.product-card-inline-details { display: flex;'));
  assert.ok(css.includes('overflow-x: auto; white-space: nowrap; text-align: right;'));
  assert.ok(css.includes('white-space: nowrap; text-align: left;'));
});

test('ADMIN purchase price and markup use initials and integer display without changing stored values', () => {
  const source = read('src', 'app', 'page.tsx');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const spans = [];
  const visit = node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'span'
      && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
        && attribute.name.getText(tree) === 'title' && ['سعر الشراء', 'النسبة'].includes(attribute.initializer?.text))) {
      spans.push(node.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(spans.length, 2);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`exports.render = p => <>${spans.join('')}</>;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require });
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const [costPrice, markup, expectedCost, expectedMarkup] of [
    [12.75, 25.6, '13', '26'], [0, 0, '0', '0'], [10, null, '10', '30'], [10, undefined, '10', '30']
  ]) {
    const product = { costPrice, markup };
    const html = renderToStaticMarkup(exports.render(product));
    assert.ok(html.includes(`title="سعر الشراء">ش <bdi>${expectedCost}</bdi>`));
    assert.ok(html.includes(`title="النسبة">ن <bdi>${expectedMarkup}%</bdi>`));
    assert.deepEqual(product, { costPrice, markup });
  }
  assert.match(source, /\{currentUser\?\.role === 'ADMIN' && <>\s*<span title="سعر الشراء">/);
});

test('color badges match saved colors with readable foregrounds and neutral unknown values', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read('src', 'components', 'ProductCardDetails.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require });
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const [color, background, foreground] of [
    ['أحمر', '#dc2626', '#ffffff'], ['اخضر', '#15803d', '#ffffff'],
    ['أزرق', '#2563eb', '#ffffff'], ['أبيض', '#ffffff', '#172033'],
    ['أصفر', '#facc15', '#172033'], ['أسود', '#111111', '#ffffff'],
    ['رمادي', '#94a3b8', '#172033'], ['مقاوم', null, null]
  ]) {
    const html = renderToStaticMarkup(React.createElement(exports.default, {
      product: { name: 'Product', code: 'P', type: 'PIPE', size: '20', color, price: 13, stockQty: 10, minStockQty: 5 },
      actions: React.createElement('button', null, 'Add to cart')
    }));
    assert.ok(html.includes(`>${color}</span>`));
    if (background) assert.ok(html.includes(`background-color:${background};color:${foreground}`));
    else assert.ok(!html.includes('background-color:'));
    assert.ok(html.indexOf('product-card-bottom') < html.indexOf('Add to cart'));
    assert.ok(html.includes('البيع: 13.00'));
  }
});

test('product image survives Access reconnect without altering product properties',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-image-test-'));
    const databasePath = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previousPath = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = databasePath;
    const database = createAccessClient();
    try {
      const product = await database.product.create({ data: {
        code: `image-test-${Date.now()}`, name: 'Image test', type: 'PIPE', size: '20',
        color: 'Blue', gauge: 'Heavy', price: 13, costPrice: 10, stockQty: 99
      } });
      await database.product.update({ where: { id: product.id }, data: { imageUrl } });
      await database.$disconnect();
      const reloaded = await database.product.findUnique({ where: { id: product.id } });
      for (const field of ['id', 'code', 'name', 'type', 'size', 'color', 'gauge', 'price', 'costPrice', 'stockQty']) {
        assert.equal(reloaded[field], product[field], field);
      }
      assert.equal(reloaded.imageUrl, imageUrl);
    } finally {
      await database.$disconnect();
      if (previousPath === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previousPath;
      fs.unlinkSync(databasePath);
      const lockPath = path.join(directory, 'test.laccdb');
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      fs.rmdirSync(directory);
    }
  });
