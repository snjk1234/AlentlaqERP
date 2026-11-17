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
