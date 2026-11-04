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
const MoneyInput = () => null;
const load = (react = React, context = {}) => {
  const exports = {};
  vm.runInNewContext(compile(source, true), {
    exports, ...context, require: name => {
      if (name === 'react') return react;
      if (name === '@/lib/account-period') return period;
      if (name === '@/lib/money-format') return require('./money-format');
      if (name === '@/components/MoneyInput') return { __esModule: true, default: MoneyInput };
      return require(name);
    }
  });
  return exports.default;
};
const customerDiscount = {
  id: 'c-discount', discountNumber: 'DSC-C', kind: 'ALLOWED', customerId: 'c', supplierId: null,
  amount: 15, date: '2026-10-01', notes: 'Customer note'
};
const supplierDiscount = {
  id: 's-discount', discountNumber: 'DSC-S', kind: 'EARNED', customerId: null, supplierId: 's',
  amount: 25, date: '2026-10-02', notes: 'Supplier note'
};
const props = {
  customers: [{ id: 'c', name: 'Customer', openingBalance: 100, discounts: [customerDiscount] }],
  suppliers: [{ id: 's', name: 'Supplier', balance: 75, discounts: [supplierDiscount] }],
  canAllow: true, canEarn: true, showSupplierBalance: true, customersReady: true, suppliersReady: true,
  sessionToken: 'signed-session', onSaved: async () => true, onPrint() {}, onPrintTable() {}
};
const render = overrides => renderToStaticMarkup(React.createElement(load(), { ...props, ...overrides }));
const elements = tree => tree && typeof tree === 'object'
  ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)] : [];
const text = tree => {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return React.Children.toArray(tree.props?.children).map(text).join('');
};

function harness(overrides = {}, transport = {}) {
  const hooks = [];
  let cursor = 0;
  const react = {
    ...React,
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    }
  };
  const component = load(react, {
    window: transport.window || {},
    fetch: transport.fetch,
    crypto: { getRandomValues: bytes => { bytes.fill(255); return bytes; } },
    console: { error() {} },
    Error
  });
  const allProps = { ...props, ...overrides };
  return {
    render() { cursor = 0; return component(allProps); },
    open(kind = 'ALLOWED') {
      let tree = this.render();
      elements(tree).find(element => element.type === 'button' && text(element).includes('سند خصم جديد')).props.onClick();
      tree = this.render();
      const kindSelect = elements(tree).find(element => element.type === 'select' && element.props.value === 'ALLOWED');
      if (kind === 'EARNED') kindSelect.props.onChange({ target: { value: kind } });
      tree = this.render();
      elements(tree).find(element => element.type === 'select' && element.props.required)
        .props.onChange({ target: { value: kind === 'ALLOWED' ? 'c' : 's' } });
      tree = this.render();
      elements(tree).find(element => element.type === MoneyInput).props.onValueChange('20');
      return this.render();
    }
  };
}

test('panel displays separate vouchers and respects role and account readiness', () => {
  const html = render({});
  for (const value of ['DSC-C', 'DSC-S', 'Customer', 'Supplier', '15.00', '25.00',
    'خصم مسموح به', 'خصم مكتسب', 'Customer note', 'Supplier note', 'سند خصم جديد']) {
    assert.ok(html.includes(value), value);
  }
  assert.ok(html.includes('طباعة سند الخصم DSC-C') && html.includes('طباعة سند الخصم DSC-S'));
  const cashier = render({ canEarn: false });
  assert.ok(cashier.includes('DSC-C') && !cashier.includes('DSC-S'));
  const keeper = render({ canAllow: false });
  assert.ok(keeper.includes('DSC-S') && !keeper.includes('DSC-C'));
  const loading = render({ customersReady: false, suppliersReady: false });
  assert.ok(loading.slice(loading.indexOf('<button'), loading.indexOf('</button>')).includes('disabled'));
});

test('production reset warns that discount vouchers will be deleted', () => {
  const resetSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'ProductionResetPanel.tsx'), 'utf8');
  const exports = {};
  vm.runInNewContext(compile(resetSource, true), { exports, require });
  const html = renderToStaticMarkup(React.createElement(exports.default, { onCompleted() {} }));
  assert.match(html, /يحذف الفواتير والدفعات وسندات الخصم/);
});

test('browser form sends the signed session, preserves the request ID for retry and refreshes after saving', async () => {
  const requests = [];
  const refreshed = [];
  const context = harness({ onSaved: async kind => { refreshed.push(kind); return true; } }, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? Response.json({ error: 'الرصيد غير كافٍ' }, { status: 400 })
        : Response.json({ data: { discountNumber: 'DSC-NEW' } }, { status: 201 });
    }
  });
  let tree = context.open();
  assert.ok(text(tree).includes('لا يمكن تعديل السند أو حذفه بعد الحفظ'));
  assert.ok(text(tree).includes('لا يُعكس سند الخصم تلقائيًا عند المرتجع'));
  await elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = context.render();
  assert.ok(text(tree).includes('الرصيد غير كافٍ'));
  await elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = context.render();
  assert.ok(text(tree).includes('تم تسجيل سند الخصم DSC-NEW بنجاح'));
  assert.deepEqual(refreshed, ['ALLOWED']);
  assert.equal(requests[0].url, '/api/discounts');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer signed-session');
  assert.equal(JSON.parse(requests[0].options.body).requestId, JSON.parse(requests[1].options.body).requestId);
  assert.match(JSON.parse(requests[0].options.body).requestId, /^ffffffff-ffff-4fff-bfff-ffffffffffff$/);
});

test('desktop form submits through its bridge and warns if the saved account cannot refresh', async () => {
  const calls = [];
  const context = harness({ onSaved: async () => false, showSupplierBalance: false }, {
    window: { electronAPI: { createAccountDiscount: async input => {
      calls.push(input);
      return { discountNumber: 'DSC-SAVED' };
    } } }
  });
  const tree = context.open('EARNED');
  assert.ok(!text(tree).includes('أقصى خصم متاح حاليًا'));
  assert.ok(!text(tree).includes('قد يزيد مبلغ الرد للعميل'));
  await elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'EARNED');
  assert.ok(text(context.render()).includes('لا تعِد تسجيله'));
});

test('printing the discount table preserves visible rows and totals per type', () => {
  let report;
  const context = harness({ onPrintTable: value => { report = value; } });
  const tree = context.render();
  elements(tree).find(element => element.type === 'button' && text(element).includes('طباعة الجدول')).props.onClick();
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0][0], 'DSC-S');
  assert.equal(report.rows[1][0], 'DSC-C');
  assert.ok(report.footer[4].includes('15.00') && report.footer[4].includes('25.00'));
});
