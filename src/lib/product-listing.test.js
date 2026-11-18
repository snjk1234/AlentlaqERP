/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'product-listing.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });
const controlsExports = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'ProductListingControls.tsx'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
).outputText, {
  exports: controlsExports,
  require: name => name === '@/lib/product-listing' ? moduleExports : require(name)
});
const elements = value => Array.isArray(value) ? value.flatMap(elements)
  : value && typeof value === 'object' && value.props ? [value, ...elements(value.props.children)] : [];

test('product sorting supports numeric, text, related supplier and descending values without mutating input', () => {
  const products = [
    { id: 'ten', code: 'P10', stockQty: 10, supplier: { name: 'Beta' } },
    { id: 'two', code: 'P2', stockQty: 2, supplier: { name: 'Alpha' } },
    { id: 'missing', code: null, stockQty: 0, supplier: null }
  ];

  assert.deepEqual(Array.from(moduleExports.sortProducts(products, 'code', 'asc'), product => product.id), ['two', 'ten', 'missing']);
  assert.deepEqual(Array.from(moduleExports.sortProducts(products, 'stockQty', 'desc'), product => product.id), ['ten', 'two', 'missing']);
  assert.deepEqual(Array.from(moduleExports.sortProducts(products, 'supplier', 'asc'), product => product.id), ['two', 'ten', 'missing']);
  assert.deepEqual(products.map(product => product.id), ['ten', 'two', 'missing']);
});

test('best-selling and least-selling sorts use opposite sales directions', () => {
  const products = [
    { id: 'low', bestSellingQuantity: 2 },
    { id: 'high', bestSellingQuantity: 20 },
    { id: 'none', bestSellingQuantity: 0 }
  ];
  assert.deepEqual(
    Array.from(moduleExports.sortProducts(products, 'bestSelling', 'asc'), product => product.id),
    ['none', 'low', 'high']
  );
  assert.deepEqual(
    Array.from(moduleExports.sortProducts(products, 'bestSelling', 'desc'), product => product.id),
    ['high', 'low', 'none']
  );
});

test('sales ranking uses the selected rolling window, completed invoices and net quantities after returns', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  const day = offset => new Date(now.getTime() + offset * 24 * 60 * 60 * 1000).toISOString();
  const documents = [
    { status: 'COMPLETED', date: day(-20), items: [{ productId: 'A', quantity: 10 }], orderReturns: [
      { createdAt: day(-2), items: [{ productId: 'A', quantity: 3 }] }
    ] },
    { status: 'COMPLETED', date: day(-50), items: [{ productId: 'B', quantity: 6 }], orderReturns: [
      { createdAt: day(-1), items: [{ productId: 'B', quantity: 5 }] }
    ] },
    { status: 'COMPLETED', date: day(-120), items: [{ productId: 'A', quantity: 4 }], orderReturns: [] },
    { status: 'COMPLETED', isQuotation: true, date: day(-1), items: [{ productId: 'C', quantity: 100 }], orderReturns: [] },
    { status: 'DRAFT', date: day(-1), items: [{ productId: 'D', quantity: 100 }], orderReturns: [] }
  ];
  const ranking = period => JSON.parse(JSON.stringify(moduleExports.productSalesQuantities(documents, period, now)));
  assert.deepEqual(ranking('30'), { A: 7, B: -5 });
  assert.deepEqual(ranking('90'), { A: 7, B: 1 });
  assert.deepEqual(ranking('all'), { A: 11, B: 1 });
});

test('product controls expose sales periods and a dedicated most/least toggle beside sort direction', () => {
  let selectedPeriod;
  let toggled = 0;
  const tree = controlsExports.default({
    layout: 'cards', onLayoutChange() {}, sortBy: 'code', onSortByChange() {},
    sortDirection: 'desc', onSortDirectionChange() {}, salesSortOrder: 'most', onSalesSortToggle: () => { toggled++; },
    bestSellingPeriod: '90',
    onBestSellingPeriodChange: value => { selectedPeriod = value; },
    salesDataStatus: 'ready', isAdmin: false
  });
  const controls = elements(tree);
  const period = controls.find(element => element.props['aria-label'] === 'فترة ترتيب المبيعات');
  assert.ok(period);
  assert.deepEqual(elements(period).filter(element => element.type === 'option').map(element => element.props.value),
    ['30', '90', 'all']);
  const sortBy = controls.find(element => element.type === 'select' && element.props.id === 'product-sort-field');
  assert.ok(!elements(sortBy).some(element => element.type === 'option' && element.props.value === 'bestSelling'));
  const salesButton = controls.find(element => element.type === 'button' && element.props['aria-label'] === 'الترتيب حسب الأكثر مبيعًا');
  assert.ok(salesButton);
  assert.match(salesButton.props.children, /الأكثر مبيعًا/);
  salesButton.props.onClick();
  assert.equal(toggled, 1);
  const directionButton = controls.find(element => element.type === 'button' && element.props['aria-label'] === 'ترتيب تصاعدي');
  assert.equal(controls.indexOf(salesButton), controls.indexOf(directionButton) + 1);
  const leastTree = controlsExports.default({
    layout: 'cards', onLayoutChange() {}, sortBy: 'code', onSortByChange() {},
    sortDirection: 'desc', onSortDirectionChange() {}, salesSortOrder: 'least', onSalesSortToggle() {},
    bestSellingPeriod: '90', onBestSellingPeriodChange: () => {}, salesDataStatus: 'ready', isAdmin: false
  });
  assert.ok(elements(leastTree).some(element => element.type === 'button'
    && element.props['aria-label'] === 'الترتيب حسب الأقل مبيعًا' && /الأقل مبيعًا/.test(element.props.children)));
  period.props.onChange({ target: { value: '30' } });
  assert.equal(selectedPeriod, '30');
});

test('product columns can be reordered without mutating the current order', () => {
  const columns = ['code', 'name', 'price', 'stockQty'];
  assert.deepEqual(
    Array.from(moduleExports.reorderProductColumns(columns, 0, 2)),
    ['name', 'price', 'code', 'stockQty']
  );
  assert.deepEqual(
    Array.from(moduleExports.reorderProductColumns(columns, 2, 0)),
    ['price', 'code', 'name', 'stockQty']
  );
  assert.deepEqual(Array.from(moduleExports.reorderProductColumns(columns, 0, 4)), columns);
  assert.deepEqual(columns, ['code', 'name', 'price', 'stockQty']);
});
