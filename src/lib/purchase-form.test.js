/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function extractDeclaration(name, context = {}) {
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      declaration = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(declaration, `Expected ${name} declaration`);
  vm.runInNewContext(ts.transpileModule(`const ${declaration.getText(tree)};\nexposed = ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
  return context.exposed;
}

test('changing any field in the final purchase row appends one blank row', () => {
  let form = { items: [{ productId: '', productDisplay: '', quantity: '', unitCost: '' }] };
  const updateForm = updater => { form = updater(form); };
  const updatePurchaseLine = extractDeclaration('updatePurchaseLine', {
    editingPurchase: null,
    setPurchaseForm: updateForm
  });

  updatePurchaseLine(0, { productDisplay: 'P1 - Pipe' });
  assert.equal(form.items.length, 2);
  assert.equal(form.items[1].productId, '');

  updatePurchaseLine(0, { productId: 'p1', quantity: '3', unitCost: '25' });
  assert.equal(form.items.length, 2);
  updatePurchaseLine(1, { quantity: '2' });
  assert.equal(form.items.length, 3);
  assert.equal(form.items[1].quantity, '2');
  assert.equal(form.items[2].productDisplay, '');
});

test('only rows with a selected product are included when saving a purchase', () => {
  const purchaseItems = extractDeclaration('purchaseItems', {
    purchaseForm: { items: [
      { productId: 'p1', quantity: '3', unitCost: '25' },
      { productId: '', productDisplay: '', quantity: '', unitCost: '' }
    ] }
  });
  assert.equal(purchaseItems.length, 1);
  assert.equal(purchaseItems[0].productId, 'p1');
});

test('editing an existing purchase does not append an empty row', () => {
  let form = { items: [{ id: 'line-1', productId: 'p1', productDisplay: 'P1 - Pipe', quantity: '3', unitCost: '25' }] };
  const updatePurchaseLine = extractDeclaration('updatePurchaseLine', {
    editingPurchase: { id: 'purchase-1' },
    setPurchaseForm: updater => { form = updater(form); }
  });

  updatePurchaseLine(0, { quantity: '4' });
  assert.equal(form.items.length, 1);
  assert.equal(form.items[0].quantity, '4');
});

test('purchase form has a current-balance column and creates a starter row without the add button', () => {
  const itemsSectionStart = source.indexOf('{/* Items section */}');
  const summaryStart = source.indexOf('{/* Summary */}', itemsSectionStart);
  assert.notEqual(itemsSectionStart, -1);
  assert.notEqual(summaryStart, -1);
  const itemsSection = source.slice(itemsSectionStart, summaryStart);
  assert.match(source, /الرصيد الحالي/);
  assert.match(source, /products\.find\(\(product: any\) => product\.id === item\.productId\)\?\.stockQty/);
  assert.match(source, /items: \[\{ productId: '', productDisplay: '', quantity: '', unitCost: '' \}\]/);
  assert.doesNotMatch(itemsSection, /إضافة صنف/);
});
