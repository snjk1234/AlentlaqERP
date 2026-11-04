/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const compile = (source, jsx = false) => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {})
  }
}).outputText;
const period = {};
vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname, 'account-period.ts'), 'utf8')), { exports: period });
const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'DiscountsPanel.tsx'), 'utf8');
const components = {};
vm.runInNewContext(compile(source, true), {
  exports: components,
  require: name => name === '@/lib/account-period' ? period : require(name)
});
const customerDiscount = {
  id: 'c-discount', discountNumber: 'DSC-C', kind: 'ALLOWED', customerId: 'c', supplierId: null,
  amount: 15, date: '2026-10-01', notes: 'Customer note'
};
const supplierDiscount = {
  id: 's-discount', discountNumber: 'DSC-S', kind: 'EARNED', customerId: null, supplierId: 's',
  amount: 25, date: '2026-10-02', notes: 'Supplier note'
};
const props = {
  customers: [{ id: 'c', name: 'Customer', discounts: [customerDiscount] }],
  suppliers: [{ id: 's', name: 'Supplier', balance: 75, discounts: [supplierDiscount] }],
  canAllow: true, canEarn: true, showSupplierBalance: true, customersReady: true, suppliersReady: true,
  onSaved: async () => true, onPrint() {}, onPrintTable() {}
};
const render = overrides => renderToStaticMarkup(React.createElement(components.default, { ...props, ...overrides }));

test('discount panel displays separate types, parties, amounts and print actions', () => {
  const html = render({});
  for (const value of ['DSC-C', 'DSC-S', 'Customer', 'Supplier', '15.00', '25.00',
    'خصم مسموح به', 'خصم مكتسب', 'Customer note', 'Supplier note', 'سند خصم جديد']) {
    assert.ok(html.includes(value), value);
  }
  assert.ok(html.includes('طباعة سند الخصم DSC-C') && html.includes('طباعة سند الخصم DSC-S'));
  assert.ok(html.includes('دون حركة نقدية'));
});

test('discount panel respects account-tab permissions and disables entry until accounts load', () => {
  const cashier = render({ canEarn: false });
  assert.ok(cashier.includes('DSC-C') && !cashier.includes('DSC-S'));
  const storekeeper = render({ canAllow: false });
  assert.ok(storekeeper.includes('DSC-S') && !storekeeper.includes('DSC-C'));
  const loading = render({ customersReady: false, suppliersReady: false });
  const newButton = loading.slice(loading.indexOf('<button'), loading.indexOf('</button>'));
  assert.ok(newButton.includes('disabled'));
});

test('discount form warns that saved vouchers are permanent and customer returns do not reverse them', () => {
  const renderForm = kind => {
    const formComponents = {};
    const formReact = {
      ...React,
      useState: initial => [
        initial === null ? { kind, accountId: '', amount: '', notes: '', requestId: 'request' } : initial,
        () => {}
      ]
    };
    vm.runInNewContext(compile(source, true), {
      exports: formComponents,
      require: name => name === '@/lib/account-period' ? period : name === 'react' ? formReact : require(name)
    });
    return renderToStaticMarkup(React.createElement(formComponents.default, props));
  };
  const customerForm = renderForm('ALLOWED');
  const supplierForm = renderForm('EARNED');
  for (const html of [customerForm, supplierForm]) {
    assert.ok(html.includes('لا يمكن تعديل السند أو حذفه بعد الحفظ'));
  }
  assert.ok(customerForm.includes('لا يُعكس سند الخصم تلقائيًا عند المرتجع'));
  assert.ok(customerForm.includes('قد يزيد مبلغ الرد للعميل'));
  assert.ok(!supplierForm.includes('قد يزيد مبلغ الرد للعميل'));
});

test('discount request IDs use secure random bytes without requiring randomUUID', () => {
  const tree = ts.createSourceFile('DiscountsPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(tree) === 'createDiscountRequestId') {
      declaration = node.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(declaration);
  const result = {};
  vm.runInNewContext(compile(`${declaration}; result.id = createDiscountRequestId();`), {
    result,
    crypto: { getRandomValues: bytes => { bytes.fill(255); return bytes; } }
  });
  assert.equal(result.id, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('return dialog warns when the customer has independent discounts', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  const visit = node => {
    if (ts.isJsxExpression(node) && node.expression
      && node.expression.getText(tree).startsWith('returnBalanceKnown && (returnCustomer?.discounts?.length')) {
      expression = node.expression.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(expression);
  const renderWarning = (returnBalanceKnown, returnCustomer) => {
    const result = {};
    vm.runInNewContext(compile(`result.warning = (${expression});`, true), {
      exports: {}, result, require, returnBalanceKnown, returnCustomer
    });
    return renderToStaticMarkup(result.warning);
  };
  assert.ok(renderWarning(true, { discounts: [{ amount: 20 }] }).includes('لا تُعكس تلقائيًا عند المرتجع'));
  assert.equal(renderWarning(true, { discounts: [] }), '');
  assert.equal(renderWarning(false, { discounts: [{ amount: 20 }] }), '');
});

test('discount table printing preserves visible entries and reports each type separately', () => {
  const tree = ts.createSourceFile('DiscountsPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'printTable') declaration = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(declaration);
  let report;
  vm.runInNewContext(compile(`const ${declaration}; printTable();`), {
    entries: [{ discount: customerDiscount, partyName: 'Customer' }, { discount: supplierDiscount, partyName: 'Supplier' }],
    allowedTotal: 15, earnedTotal: 25, from: '2026-10-01', to: '2026-10-31',
    kindLabel: kind => kind === 'ALLOWED' ? 'مسموح' : 'مكتسب',
    onPrintTable: value => { report = value; }
  });
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0][0], 'DSC-C');
  assert.equal(report.rows[1][0], 'DSC-S');
  assert.ok(report.footer[4].includes('15.00') && report.footer[4].includes('25.00'));
  assert.equal(report.period.from, '2026-10-01');
  assert.equal(report.period.to, '2026-10-31');
});
