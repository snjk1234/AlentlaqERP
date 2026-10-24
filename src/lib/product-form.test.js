/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
const start = page.indexOf('  const handleSaveProduct =');
const end = page.indexOf('  // Quick stock adjuster', start);
const compiled = ts.transpileModule(page.slice(start, end) + '\nexports.save = handleSaveProduct;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

test('new product form keeps all values and create mode for repeated variant saves in desktop and browser', async () => {
  for (const desktop of [true, false]) {
    const calls = [];
    const alerts = [];
    const state = { open: true, refreshes: 0, saving: [], notices: [] };
    const form = { code: 'P-1', name: 'Product', color: 'Blue', price: '13', costPrice: '10', stockQty: '50' };
    const original = { ...form };
    const exports = {};
    const context = {
      exports, productForm: form, currentUser: { role: 'ADMIN' }, isEditingProduct: false, savingProduct: false,
      setSavingProduct: value => state.saving.push(value),
      setProductSaveNotice: value => { if (value) state.notices.push(value); },
      setShowProductFormModal: value => { state.open = value; },
      fetchProducts: silent => { assert.equal(silent, true); state.refreshes++; },
      alert: message => alerts.push(message),
      window: desktop ? { electronAPI: {
        createProduct: async data => calls.push({ method: 'POST', color: data.color }),
        updateProduct: async () => { throw new Error('Unexpected edit'); }
      } } : {},
      fetch: async (_url, options) => {
        calls.push({ method: options.method, color: JSON.parse(options.body).color });
        return Response.json({ id: 'new-product' });
      }
    };
    vm.runInNewContext(compiled, context);
    await exports.save({ preventDefault() {} });
    assert.deepEqual(form, original);
    assert.equal(state.open, true);
    assert.equal(context.isEditingProduct, false);
    form.color = 'Red';
    await exports.save({ preventDefault() {} });
    assert.deepEqual(calls, [{ method: 'POST', color: 'Blue' }, { method: 'POST', color: 'Red' }]);
    assert.equal(state.open, true);
    assert.equal(state.refreshes, 2);
    assert.deepEqual(state.saving, [true, false, true, false]);
    assert.equal(alerts.length, 0, 'saving must never open a blocking native dialog');
    assert.equal(state.notices.length, 2);
    assert.ok(state.notices.every(notice => notice.kind === 'success' && notice.message.includes('بنجاح')));
  }
});

test('existing product edits close on success while failures keep the form and release saving state', async () => {
  for (const failure of [true, false]) {
    const exports = {};
    const state = { open: true, saving: [], notices: [] };
    vm.runInNewContext(compiled, {
      exports, productForm: { id: 'product', code: 'P-1', name: 'Product', price: '13' },
      currentUser: { role: 'ADMIN' }, isEditingProduct: true, savingProduct: false,
      setSavingProduct: value => state.saving.push(value),
      setProductSaveNotice: value => { if (value) state.notices.push(value); },
      setShowProductFormModal: value => { state.open = value; }, fetchProducts() {},
      console: { ...console, error() {} },
      alert: () => assert.fail('Saving products must not use native alerts'),
      window: { electronAPI: { updateProduct: async () => { if (failure) throw new Error('Duplicate variant'); } } }
    });
    await exports.save({ preventDefault() {} });
    assert.equal(state.open, failure);
    assert.deepEqual(state.saving, [true, false]);
    assert.equal(state.notices.length, failure ? 1 : 0);
    if (failure) {
      assert.equal(state.notices[0].kind, 'error');
      assert.ok(state.notices[0].message.includes('Duplicate variant'));
    }
  }
});

test('saving indicator and inline notices belong to the product form only', () => {
  const tree = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let form;
  const visit = node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'form'
      && node.openingElement.getText(tree).includes('onSubmit={handleSaveProduct}')) form = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(form.includes('disabled={savingProduct}'));
  assert.ok(form.includes("savingProduct ? 'جارٍ الحفظ...'"));
  assert.ok(form.includes('productSaveNotice.message') && form.includes('aria-live="polite"'));
  assert.equal((page.match(/disabled=\{savingProduct\}/g) || []).length, 1);
  assert.ok(!page.slice(start, end).includes('alert('));
});
