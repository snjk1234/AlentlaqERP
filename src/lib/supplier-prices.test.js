/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'SupplierPricesModal.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;

test('supplier prices can be cleared and saved as an empty list', async () => {
  const states = [];
  let stateIndex = 0;
  const jsx = (_type, props) => ({ type: _type, props });
  const moneyInput = Symbol('MoneyInput');
  const exports = {};
  const alerts = [];
  let savedPrices;
  let submittedPrices;
  vm.runInNewContext(compiled, {
    exports,
    require: id => {
      if (id === 'react') return {
        useState: initial => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
          return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
        }
      };
      if (id === 'lucide-react') return { PercentIcon: 'PercentIcon', XIcon: 'XIcon' };
      if (id === './MoneyInput') return { __esModule: true, default: moneyInput };
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      throw new Error(`Unexpected import: ${id}`);
    },
    fetch: async (_url, options) => {
      submittedPrices = JSON.parse(options.body).prices;
      return { ok: true, json: async () => ({ prices: [] }) };
    },
    window: {},
    alert: message => alerts.push(message),
    console
  });

  const props = {
    supplier: { id: 'supplier', name: 'Supplier', supplierPrices: [{ productId: 'product', price: 10 }] },
    products: [{ id: 'product', supplierId: 'supplier', name: 'Product' }],
    onClose() {},
    onSaved: prices => { savedPrices = prices; }
  };
  const render = () => {
    stateIndex = 0;
    return exports.default(props);
  };
  const findElement = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    const children = node.props && node.props.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  };

  let tree = render();
  const input = findElement(tree, node => node.props && node.props['aria-label'] === 'سعر التوريد المخصص: Product');
  input.props.onValueChange('');
  tree = render();

  const saveButton = findElement(tree, node => node.type === 'button' && node.props.type === 'submit');
  assert.equal(saveButton.props.disabled, false);
  const form = findElement(tree, node => node.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });

  assert.deepEqual(submittedPrices, []);
  assert.deepEqual(savedPrices, []);
  assert.ok(alerts[0].includes('بنجاح'));
});
