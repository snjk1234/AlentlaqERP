/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..', '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const period = {};
vm.runInNewContext(compile(read('src\\lib\\account-period.ts')), { exports: period });
function loadLogic(extra = {}) {
  const exports = {};
  vm.runInNewContext(compile(read('src\\lib\\item-movements.ts')), {
    exports, Error, window: {}, ...extra, require: name => {
      assert.equal(name, './account-period'); return period;
    }
  });
  return exports;
}
const logic = loadLogic();
const { buildItemMovements, filterItemMovements, summarizeItemMovements, itemMovementTotals, CASH_PARTY } = logic;
const product = { id: 'p1', code: 'P-20', name: 'Pipe', type: 'PVC', size: '20', color: 'Blue', gauge: 'Heavy', price: 900, costPrice: 800, taxRate: 0.25 };
const item = (id, quantity = 2, price = 100) => ({
  id, productId: product.id, product, quantity, unitPrice: price, unitCost: price,
  taxAmount: quantity * price * 0.14, total: quantity * price * 1.14
});
const invoice = {
  id: 'o1', invoiceNumber: 'INV-1', billNumber: 'PUR-1', status: 'COMPLETED', isQuotation: false,
  customerId: 'c1', customer: { name: 'Customer 1' }, customerName: 'Snapshot', supplierId: 's1', supplier: { name: 'Supplier 1' },
  createdAt: '2026-09-01T12:00:00', date: '2026-09-01T12:00:00',
  totalAmount: 300, taxAmount: 42, netAmount: 342, items: [item('i1'), item('i2', 1)],
  orderReturns: [{ id: 'r1', customerId: 'c1', returnNumber: 'RET-1', createdAt: '2026-10-10T12:00:00',
    totalAmount: 100, taxAmount: 14, netAmount: 114, refundAmount: 0, refundMethod: 'NONE', items: [item('ri1', 1)] }]
};
const filters = { partyId: '', from: '', to: '', productId: '', search: '', includeReturns: true };
const plain = value => JSON.parse(JSON.stringify(value));

test('uses saved line prices and taxes, excludes quotations and nonfinal sales, and preserves source data', () => {
  const input = plain([invoice, { ...invoice, id: 'quote', isQuotation: true }, { ...invoice, id: 'draft', status: 'DRAFT' }]);
  const before = plain(input);
  const rows = buildItemMovements(input, 'sales');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].unitPrice, 100);
  assert.equal(rows[0].tax, 28);
  assert.equal(rows[0].beforeTax, 200);
  assert.equal(rows[0].total, 228);
  assert.equal(rows[0].description, 'Pipe · PVC · 20 · Heavy · Blue');
  assert.equal(rows[2].quantity, -1);
  assert.equal(rows[2].tax, -14);
  assert.equal(rows[2].total, -114);
  assert.deepEqual(input, before);
});

test('return from an older invoice belongs to its own date and yields negative period net quantity and amounts', () => {
  const rows = filterItemMovements(buildItemMovements([invoice], 'sales'), {
    ...filters, partyId: 'c1', from: '2026-10-01', to: '2026-10-31'
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, 'RET-1');
  assert.equal(rows[0].originalNumber, 'INV-1');
  assert.equal(rows[0].orderReturn.id, 'r1');
  const [summary] = summarizeItemMovements(rows);
  assert.equal(summary.quantity, 0);
  assert.equal(summary.returned, 1);
  assert.equal(summary.netQuantity, -1);
  assert.equal(summary.invoiceCount, 0);
  assert.equal(summary.returnCount, 1);
  assert.equal(summary.total, -114);
  assert.equal(filterItemMovements(rows, { ...filters, includeReturns: false }).length, 0);
});

test('filters combine party, product, code/spec search and inclusive whole-day or one-sided dates', () => {
  const rows = buildItemMovements([invoice, {
    ...invoice, id: 'o2', customerId: 'c2', createdAt: '2026-10-31T23:59:59.999', date: '2026-10-31T23:59:59.999',
    items: [item('i3')], orderReturns: []
  }], 'sales');
  assert.equal(filterItemMovements(rows, { ...filters, partyId: 'c2', productId: 'p1', search: 'PVC', from: '2026-10-31', to: '2026-10-31' }).length, 1);
  for (const search of ['P-20', 'pipe', '20', 'blue', 'Heavy']) assert.equal(filterItemMovements(rows, { ...filters, search }).length, 4);
  assert.equal(filterItemMovements(rows, { ...filters, partyId: 'c2', productId: 'other' }).length, 0);
  assert.equal(filterItemMovements(rows, { ...filters, from: '2026-10-31' }).length, 1);
  assert.equal(filterItemMovements(rows, { ...filters, to: '2026-09-01' }).length, 2);
  assert.throws(() => filterItemMovements(rows, { ...filters, from: '2026-11-01', to: '2026-10-01' }), /البداية/);
});

test('summary groups by product ID, counts each document once and never sums unrelated product quantities globally', () => {
  const other = { ...invoice, id: 'o2', invoiceNumber: 'INV-2', orderReturns: [], items: [
    { ...item('i3', 5, 40), productId: 'p2', product: { ...product, id: 'p2', size: '30' } },
    item('i4', 4)
  ] };
  const rows = buildItemMovements([invoice, other], 'sales');
  const summary = summarizeItemMovements(rows);
  const p1 = summary.find(group => group.product.id === 'p1');
  assert.equal(p1.quantity, 7); assert.equal(p1.returned, 1); assert.equal(p1.netQuantity, 6);
  assert.equal(p1.invoiceCount, 2); assert.equal(p1.returnCount, 1); assert.equal(p1.total, 684);
  assert.equal(summary.length, 2);
  const totals = itemMovementTotals(rows);
  assert.deepEqual(plain(totals), { beforeTax: 800, tax: 112, total: 912, invoiceCount: 2, returnCount: 1, productCount: 2 });
  assert.ok(!('quantity' in totals));
});

test('purchase movement uses supplier and historical unit cost, has no sales returns, and respects the purchase date', () => {
  const rows = buildItemMovements([{ ...invoice, date: '2026-10-20', items: [{ ...item('i1'), unitCost: 60, taxAmount: 0, total: 120 }] }], 'purchases');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partyId, 's1');
  assert.equal(rows[0].partyName, 'Supplier 1');
  assert.equal(rows[0].unitPrice, 60);
  assert.equal(rows[0].beforeTax, 120);
  assert.equal(rows[0].tax, 0);
  assert.equal(filterItemMovements(rows, { ...filters, from: '2026-10-20', to: '2026-10-20' }).length, 1);
});

test('cash customers remain identifiable, fractional money is rounded and corrupt data raises an explicit error', () => {
  const rows = buildItemMovements([{ ...invoice, customerId: null, customer: null, items: [item('i', 3, 0.1)], orderReturns: [] }], 'sales');
  assert.equal(rows[0].partyId, CASH_PARTY); assert.equal(rows[0].partyName, 'Snapshot');
  assert.equal(itemMovementTotals(rows).beforeTax, 0.3);
  for (const patch of [{ items: undefined }, { createdAt: 'bad', date: 'bad' },
    { items: [{ ...item('i'), product: null }] }, { items: [{ ...item('i'), quantity: 0 }] },
    { items: [{ ...item('i'), unitPrice: NaN }] }, { items: [{ ...item('i'), taxAmount: Infinity }] }]) {
    assert.throws(() => buildItemMovements([{ ...invoice, ...patch }], 'sales'), /غير|مكتملة/);
  }
});

test('web and Electron loaders use existing full-document transports and never mask failures as empty reports', async () => {
  for (const kind of ['sales', 'purchases']) {
    const web = loadLogic({ fetch: async (url, options) => {
      assert.equal(url, kind === 'sales' ? '/api/orders' : '/api/purchases');
      assert.equal(options.cache, 'no-store');
      return Response.json([invoice]);
    } });
    assert.equal((await web.loadItemMovementDocuments(kind))[0].id, 'o1');
    const desktop = loadLogic({ window: { electronAPI: {
      getOrders: async () => [invoice], getPurchases: async () => [invoice]
    } }, fetch: () => { throw Error('Unexpected browser transport'); } });
    assert.equal((await desktop.loadItemMovementDocuments(kind))[0].id, 'o1');
    const failed = loadLogic({ fetch: async () => Response.json({ error: 'Server unavailable' }, { status: 503 }) });
    await assert.rejects(failed.loadItemMovementDocuments(kind), /Server unavailable/);
    const invalid = loadLogic({ fetch: async () => Response.json({ data: [] }) });
    await assert.rejects(invalid.loadItemMovementDocuments(kind), /غير صالحة/);
  }
});

const printExports = {};
vm.runInNewContext(compile(read('src\\components\\PrintDocuments.tsx')), { exports: printExports, require });
const elements = tree => tree && typeof tree === 'object'
  ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)] : [];
function harness(role = 'ADMIN', load = async () => [invoice]) {
  const hooks = [], effects = [], dependencies = [];
  let cursor = 0;
  const exports = {};
  const react = { ...React,
    useState: initial => {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useEffect: (callback, deps) => {
      const i = cursor++;
      if (!dependencies[i] || deps.some((dep, index) => dep !== dependencies[i][index])) {
        dependencies[i] = deps; effects.push(callback);
      }
    }
  };
  vm.runInNewContext(compile(read('src\\components\\ItemMovementsReport.tsx')), {
    exports, Error, console: { error() {} }, require: name => {
      if (name === 'react') return react;
      if (name === '../lib/item-movements') return { ...logic, loadItemMovementDocuments: load };
      if (name === './PrintDocuments') return printExports;
      if (name === 'qrcode') return { default: { toDataURL: async () => 'data:image/png;base64,fixture' } };
      return require(name);
    }
  });
  const props = { role, customers: [{ id: 'c1', name: 'Customer 1' }], suppliers: [{ id: 's1', name: 'Supplier 1' }] };
  return {
    render: () => { cursor = 0; return exports.default(props); },
    flush: async () => { for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve)); }
  };
}
const control = (tree, label) => elements(tree).find(node => node.props?.['aria-label'] === label);
const button = (tree, text) => elements(tree).find(node => node.type === 'button'
  && (node.props.children === text || elements(node).some(child => child.type === 'span' && child.props.children === text)));
const html = tree => renderToStaticMarkup(tree);

test('report detailed and summary views, party/date/product filters and print snapshot share exact values and totals', async () => {
  const ui = harness('ADMIN');
  ui.render(); await ui.flush();
  control(ui.render(), 'طرف الكشف').props.onChange({ target: { value: 'c1' } });
  control(ui.render(), 'من تاريخ').props.onChange({ target: { value: '2026-10-01' } });
  control(ui.render(), 'إلى تاريخ').props.onChange({ target: { value: '2026-10-31' } });
  let tree = ui.render();
  assert.ok(html(tree).includes('RET-1')); assert.ok(!html(tree).includes('342.00'));
  control(tree, 'طريقة العرض').props.onChange({ target: { value: 'summary' } });
  tree = ui.render();
  assert.ok(html(tree).includes('-114.00'));
  assert.equal(control(tree, 'طرف الكشف').props.value, 'c1');
  button(tree, 'طباعة الكشف').props.onClick();
  tree = ui.render();
  assert.equal(tree.type, printExports.TablePrint);
  assert.equal(tree.props.report.period.from, '2026-10-01');
  assert.ok(tree.props.report.title.includes('Customer 1'));
  assert.ok(tree.props.report.title.includes('يشمل المرتجعات'));
  assert.equal(tree.props.report.rows[0].at(-1), '-114.00');
  assert.equal(tree.props.report.footer.at(-1), '-114.00');
  assert.ok(html(tree).includes('P-20'));
  tree.props.onClose();
  tree = ui.render();
  control(tree, 'بحث الأصناف').props.onChange({ target: { value: 'missing' } });
  tree = ui.render();
  assert.ok(html(tree).includes('لا توجد حركات'));
  assert.equal(button(tree, 'طباعة الكشف').props.disabled, true);
});

test('opening original invoice and return preserves full items and original QR and allows returning to filtered report', async () => {
  const ui = harness('ADMIN', async () => [{ ...invoice, qrCode: 'original-qr' }]);
  ui.render(); await ui.flush();
  let tree = ui.render();
  await button(tree, 'INV-1').props.onClick();
  tree = ui.render();
  assert.equal(tree.type, printExports.InvoicePrint);
  assert.equal(tree.props.invoice.items.length, 2);
  assert.equal(tree.props.qrCodeUrl, 'data:image/png;base64,fixture');
  tree.props.onClose();
  await button(ui.render(), 'RET-1').props.onClick();
  tree = ui.render();
  assert.equal(tree.type, printExports.ReturnPrint);
  assert.equal(tree.props.orderReturn.order.invoiceNumber, 'INV-1');
  assert.equal(tree.props.orderReturn.items.length, 1);
});

test('cashier has sales only; storekeeper has quantities-only purchases including print and original invoice; unknown role does not load', async () => {
  let loads = 0;
  const unknown = harness('UNKNOWN', async () => { loads++; return []; });
  assert.equal(unknown.render(), null); await unknown.flush(); assert.equal(loads, 0);
  for (const role of ['CASHIER', 'STOREKEEPER']) {
    const ui = harness(role);
    ui.render(); await ui.flush();
    let tree = ui.render();
    const kind = control(tree, 'نوع الكشف');
    const options = elements(kind).filter(node => node.type === 'option');
    assert.equal(options.length, 1);
    assert.equal(options[0].props.value, role === 'CASHIER' ? 'sales' : 'purchases');
    if (role === 'STOREKEEPER') {
      assert.ok(!html(tree).includes('228.00'));
      assert.ok(!html(tree).includes('سعر الوحدة'));
      button(tree, 'طباعة الكشف').props.onClick();
      tree = ui.render();
      assert.ok(!tree.props.report.headers.includes('الإجمالي'));
      assert.ok(!html(tree).includes('228.00'));
      tree.props.onClose();
      await button(ui.render(), 'PUR-1').props.onClick();
      tree = ui.render();
      assert.equal(tree.props.purchase, true);
      assert.equal(tree.props.showAmounts, false);
      assert.ok(!html(tree).includes('228.00'));
    }
  }
});

test('load errors and reversed dates are explicit and block printing; refresh retries and kind switches load matching source only', async () => {
  let fail = true;
  const loadedKinds = [];
  const ui = harness('ADMIN', async kind => {
    loadedKinds.push(kind);
    if (fail) throw Error('Connection failed');
    return [invoice];
  });
  ui.render(); await ui.flush();
  let tree = ui.render();
  assert.ok(html(tree).includes('Connection failed'));
  assert.equal(button(tree, 'طباعة الكشف').props.disabled, true);
  fail = false;
  button(tree, 'تحديث الكشف').props.onClick();
  ui.render(); await ui.flush();
  tree = ui.render();
  control(tree, 'من تاريخ').props.onChange({ target: { value: '2026-11-01' } });
  control(ui.render(), 'إلى تاريخ').props.onChange({ target: { value: '2026-10-01' } });
  tree = ui.render();
  assert.ok(html(tree).includes('تاريخ البداية'));
  assert.equal(button(tree, 'طباعة الكشف').props.disabled, true);
  control(tree, 'نوع الكشف').props.onChange({ target: { value: 'purchases' } });
  ui.render(); await ui.flush();
  assert.deepEqual(loadedKinds, ['sales', 'sales', 'purchases']);
});

test('page exposes reports only through navigation and preserves existing statement buttons', () => {
  const page = read('src\\app\\page.tsx');
  assert.ok(page.includes("<span>تقارير الأصناف</span>"));
  assert.ok(!page.includes('setItemReportSelection'));
  assert.ok(!page.includes('كشف الأصناف'));
  assert.ok(page.includes('setShowCustomerHistoryModal(true)'));
  assert.ok(page.includes('setShowSupplierHistoryModal(true)'));
});

test('all report dropdowns and options match the existing supplier filter styling', async () => {
  const ui = harness();
  ui.render(); await ui.flush();
  const tree = ui.render();
  const selects = elements(tree).filter(node => node.type === 'select');
  assert.equal(selects.length, 4);
  for (const select of selects) {
    for (const token of ['bg-slate-900', 'border-white/10', 'py-1.5', 'px-3', 'text-slate-200', 'focus:ring-red-500/50']) {
      assert.ok(select.props.className.split(' ').includes(token), token);
    }
    for (const option of elements(select).filter(node => node.type === 'option')) {
      assert.equal(option.props.className, 'bg-slate-900 text-slate-200');
    }
  }
});

test('detailed screen and print follow requested column order with totals under the correct monetary columns', async () => {
  for (const role of ['ADMIN', 'STOREKEEPER']) {
    const ui = harness(role);
    ui.render(); await ui.flush();
    let tree = ui.render();
    const headers = elements(tree).filter(node => node.type === 'th').map(node => node.props.children);
    assert.deepEqual(headers, ['الكود', 'الصنف والمواصفات', 'التاريخ', role === 'ADMIN' ? 'العميل' : 'المورد', 'الحركة', 'الكمية',
      ...(role === 'ADMIN' ? ['سعر الوحدة', 'قبل الضريبة', 'الضريبة', 'الإجمالي'] : []), 'المستند']);
    assert.ok(tree.props.className.includes('p-2 space-y-4'));
    assert.ok(!tree.props.className.includes('bg-slate-950'));
    assert.ok(control(tree, 'طرف الكشف').props.className.includes('text-xs'));
    button(tree, 'طباعة الكشف').props.onClick();
    tree = ui.render();
    assert.deepEqual(plain(tree.props.report.headers), headers);
    assert.equal(tree.props.report.rows[0][0], 'P-20');
    assert.equal(tree.props.report.rows[0].at(-1), role === 'ADMIN' ? 'INV-1' : 'PUR-1');
    assert.equal(tree.props.report.footer.at(-1), '');
    if (role === 'ADMIN') {
      for (const [header, value] of [['قبل الضريبة', '200.00'], ['الضريبة', '28.00'], ['الإجمالي', '228.00']]) {
        assert.equal(tree.props.report.footer[headers.indexOf(header)], value);
      }
    } else assert.ok(tree.props.report.footer.slice(1).every(value => value === ''));
  }
});
