/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { formatMoney, normalizeMoneyInput, groupMoneyInput } = require('./money-format');

function loadComponent(name) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', name), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require });
  return exports;
}

test('money displays group thousands, millions, negatives and zero without mutating values', () => {
  for (const [value, expected] of [
    [0, '0.00'], [999.5, '999.50'], [1000, '1,000.00'],
    [1234567.89, '1,234,567.89'], [-9876543.21, '-9,876,543.21'],
    [0.123456, '0.12'], ['1234567.89', '1,234,567.89']
  ]) assert.equal(formatMoney(value), expected);
  assert.equal(formatMoney(1234567.75, 0), '1,234,568');
  assert.equal(formatMoney(0, 0), '0');
});

test('editable amounts preserve blanks, decimal drafts, precision and signs', () => {
  for (const [raw, expected] of [
    ['', ''], ['-', '-'], ['.', '.'], ['1234567.', '1,234,567.'],
    ['1234567.00', '1,234,567.00'], ['-1234567.890123', '-1,234,567.890123'],
    ['0.000123456', '0.000123456'], ['1000.0', '1,000.0'], ['0001234', '0,001,234']
  ]) {
    assert.equal(groupMoneyInput(raw), expected);
    assert.equal(normalizeMoneyInput(expected), raw);
  }
});

test('pasted western and Arabic amounts normalize to the same ungrouped numeric value', () => {
  for (const text of ['1,234,567.89', '١٬٢٣٤٬٥٦٧٫٨٩', '۱٬۲۳۴٬۵۶۷٫۸۹', '1 234 567.89']) {
    assert.equal(normalizeMoneyInput(text), '1234567.89');
    assert.equal(groupMoneyInput(text), '1,234,567.89');
    assert.equal(Number(normalizeMoneyInput(text)), 1234567.89);
  }
});

test('money inputs render grouped values but retain decimal input and required/disabled attributes', () => {
  const MoneyInput = loadComponent('MoneyInput.tsx').default;
  const render = props => renderToStaticMarkup(React.createElement(MoneyInput, props));
  const html = render({ value: '1234567.890123', required: true, min: 0, step: 'any', 'aria-label': 'Amount' });
  assert.ok(html.includes('value="1,234,567.890123"'));
  assert.ok(html.includes('type="text"') && html.includes('inputMode="decimal"'));
  assert.ok(html.includes('required=""') && html.includes('aria-label="Amount"'));
  assert.ok(render({ defaultValue: -1234567.89 }).includes('value="-1,234,567.89"'));
  assert.ok(render({ value: '', disabled: true }).includes('disabled=""'));
  assert.ok(render({ value: '' }).includes('value=""'));
});

test('product prices and every financial print format group million-sized amounts', () => {
  const details = loadComponent('ProductCardDetails.tsx').default;
  const { InvoicePrint, ReceiptPrint, ReturnPrint, TablePrint } = loadComponent('PrintDocuments.tsx');
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, { onClose() {}, ...props }));
  const amount = 1234567.89;
  const invoice = {
    createdAt: '2026-10-01', invoiceNumber: '1234567', billNumber: '1234567',
    totalAmount: amount, taxAmount: 1234.56, netAmount: amount,
    items: [{ id: 'item', quantity: 1234, unitPrice: amount, unitCost: amount, taxAmount: 1234.56, total: amount }]
  };
  const reports = [
    render(details, { product: { name: 'Product', code: '1234567', type: 'Pipe', size: '20',
      price: amount, stockQty: 1234, minStockQty: 0 } }),
    render(InvoicePrint, { invoice }),
    render(InvoicePrint, { invoice, purchase: true }),
    render(ReceiptPrint, { receipt: { id: '1234567', createdAt: '2026-10-01', amount } }),
    render(ReceiptPrint, { receipt: { id: '1234567', createdAt: '2026-10-01', amount }, expense: true }),
    render(ReturnPrint, { orderReturn: { ...invoice, returnNumber: '1234567', refundAmount: amount, refundMethod: 'CASH' } }),
    render(TablePrint, { report: {
      title: 'Report', headers: ['Code', 'Amount'], rows: [['1234567', formatMoney(amount)]],
      footer: ['', formatMoney(-amount)]
    } })
  ];
  for (const html of reports) assert.ok(html.includes('1,234,567.89'));
  for (const html of reports.slice(1, 3)) {
    assert.ok(html.includes('1,234.56'));
    assert.ok(html.includes('<bdi>1234567</bdi>'));
    assert.ok(html.includes('>1234</td>'), 'quantities must not be formatted as money');
  }
  assert.ok(reports.at(-1).includes('-1,234,567.89'));
});

test('all monetary page inputs use MoneyInput and no monetary JSX retains ungrouped toFixed', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fields = [];
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      if (tag === 'input' || tag === 'MoneyInput') {
        const attrs = node.attributes.properties;
        const value = attrs.find(attr => ts.isJsxAttribute(attr) && ['value', 'defaultValue'].includes(attr.name.getText(tree)));
        const expression = value?.initializer?.expression?.getText(tree) || '';
        if (/amount|balance|price|cost/i.test(expression) && !/discount|markup/i.test(expression)) {
          assert.equal(tag, 'MoneyInput', expression);
          fields.push(expression);
        }
      }
    }
    if (ts.isJsxExpression(node) && node.expression) {
      const text = node.expression.getText(tree);
      if (!/=>/.test(text) && !/markup/.test(text)) assert.ok(!text.includes('.toFixed('), text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(fields.length, 13);
  assert.ok(source.includes('normalizeMoneyInput(e.target.value)'));
  assert.ok(source.includes('normalizeMoneyInput(e.currentTarget.value)'));
});
