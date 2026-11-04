/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const exportsPeriod = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(__dirname, 'account-period.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText, { exports: exportsPeriod });
const { inAccountPeriod, customerInPeriod, supplierInPeriod, statementTotals, statementEntries } = exportsPeriod;

test('statement total includes opening once, deducts payments and excludes quotations', () => {
  for (const opening of [500, 0, -200]) {
    const totals = statementTotals([
      { netAmount: 100 }, { netAmount: 900, isQuotation: true }
    ], [{ amount: 30 }], opening);
    assert.equal(totals.totalInvoices, opening + 100);
    assert.equal(totals.totalPayments, 30);
    assert.equal(totals.totalDue, opening + 70);
    assert.equal(statementTotals([], [], opening).totalDue, opening);
  }
  assert.equal(statementTotals([{ netAmount: 100 }], [{ amount: 900 }], 500).totalDue, -300);
});

test('customer returns credit the account and cash or bank refunds reduce that credit', () => {
  const invoices = [{ id: 'invoice', netAmount: 100, createdAt: '2026-10-01' }];
  const payments = [{ id: 'payment', amount: 20, date: '2026-10-02' }];
  const returns = [{ id: 'return', returnNumber: 'RET-1', netAmount: 50, refundAmount: 10, createdAt: '2026-10-03' }];
  const totals = statementTotals(invoices, payments, 5, returns);
  assert.equal(totals.totalInvoices, 105);
  assert.equal(totals.totalPayments, 20);
  assert.equal(totals.totalReturns, 50);
  assert.equal(totals.totalRefunds, 10);
  assert.equal(totals.totalDue, 45);
  const entries = statementEntries(invoices, payments, 5, returns);
  assert.deepEqual(JSON.parse(JSON.stringify(entries.map(entry => [entry.kind, entry.balance]))), [
    ['invoice', 105], ['payment', 85], ['return', 45]
  ]);
});

test('discounts are separate credit movements in both account totals and the running ledger', () => {
  const invoices = [{ id: 'invoice', netAmount: 100, createdAt: '2026-10-01' }];
  const payments = [{ id: 'payment', amount: 20, date: '2026-10-02' }];
  const discounts = [{ id: 'discount', discountNumber: 'DSC-1', amount: 15, date: '2026-10-03' }];
  const totals = statementTotals(invoices, payments, 5, [], discounts);
  assert.equal(totals.totalPayments, 20);
  assert.equal(totals.totalDiscounts, 15);
  assert.equal(totals.totalDue, 70);
  const entries = statementEntries(invoices, payments, 5, [], discounts);
  assert.deepEqual(JSON.parse(JSON.stringify(entries.map(entry => [entry.kind, entry.credit, entry.balance]))), [
    ['invoice', 0, 105], ['payment', 20, 85], ['discount', 15, 70]
  ]);
});

test('customer and supplier reports use original opening and filtered movements', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reports = [];
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'AccountStatement') {
      reports.push(node.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(reports.length, 2);
  const raw = {
    openingBalance: 500, balance: 9999,
    orders: [{ createdAt: '2026-09-01', netAmount: 800 }, { createdAt: '2026-10-10', netAmount: 100 }],
    payments: [{ date: '2026-09-01', amount: 200 }, { date: '2026-10-10', amount: 30 }],
    purchaseOrders: [{ date: '2026-09-01', netAmount: 800 }, { date: '2026-10-10', netAmount: 100 }],
    expenses: [{ date: '2026-09-01', amount: 200 }, { date: '2026-10-10', amount: 30 }]
  };
  for (const report of reports) {
    const context = {
      exports: {}, AccountStatement: 'report', currentUser: { role: 'ADMIN' },
      stmtFrom: '2026-10-01', stmtTo: '2026-10-31', renderStatementPeriod: () => null,
      selectedHistoryCustomerRaw: raw, selectedHistorySupplierRaw: raw,
      selectedHistoryCustomer: customerInPeriod(raw, '2026-10-01', '2026-10-31'),
      selectedHistorySupplier: supplierInPeriod(raw, '2026-10-01', '2026-10-31'),
      React: { createElement: (_type, props) => props }
    };
    vm.runInNewContext(ts.transpileModule(`exports.props = (${report});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
    }).outputText, context);
    const props = context.exports.props;
    assert.equal(props.openingBalance, 500);
    assert.equal(props.from, '2026-10-01');
    assert.equal(props.to, '2026-10-31');
    const totals = statementTotals(props.invoices, props.payments, props.openingBalance);
    assert.equal(totals.totalInvoices, 600);
    assert.equal(totals.totalPayments, 30);
    assert.equal(totals.totalDue, 570);
  }
});

test('period includes both whole boundary days, supports open ends and rejects missing dates', () => {
  for (const date of ['2026-10-01T00:00:00', '2026-10-31T23:59:59.999']) {
    assert.equal(inAccountPeriod({ date }, '2026-10-01', '2026-10-31'), true);
  }
  for (const date of ['2026-09-30T23:59:59.999', '2026-11-01T00:00:00', 'invalid']) {
    assert.equal(inAccountPeriod({ date }, '2026-10-01', '2026-10-31'), false);
  }
  assert.equal(inAccountPeriod({}, '2026-10-01', ''), false);
  assert.equal(inAccountPeriod({}, '', ''), true);
  assert.equal(inAccountPeriod({ createdAt: '2026-10-10' }, '2026-10-01', ''), true);
  assert.equal(inAccountPeriod({ date: '2026-09-10' }, '', '2026-10-31'), true);
  assert.equal(inAccountPeriod({ date: '2026-09-10', createdAt: '2026-10-10' }, '2026-10-01', ''), false);
});

test('customer period contains only invoices and payments in range without opening balances', () => {
  const customer = {
    openingBalance: 500,
    orders: [
      { createdAt: '2026-09-01', netAmount: 200 },
      { createdAt: '2026-10-10', netAmount: 100 },
      { createdAt: '2026-10-10', netAmount: 900, isQuotation: true }
    ],
    payments: [{ date: '2026-09-01', amount: 20 }, { date: '2026-10-20', amount: 30 }]
  };
  const view = customerInPeriod(customer, '2026-10-01', '2026-10-31');
  assert.equal(view.orders.length, 1);
  assert.equal(view.payments.length, 1);
  assert.equal(view.openingBalance, 0);
  assert.equal(view.orders[0].netAmount - view.payments[0].amount + view.openingBalance, 70);
  assert.equal(customer.orders.length, 3);
  assert.equal(customer.openingBalance, 500);
  const all = customerInPeriod(customer, '', '');
  assert.equal(all.orders.length, 2);
  assert.equal(all.payments.length, 2);
  assert.equal(all.openingBalance, 500);
});

test('customer return movements are filtered to the selected account period', () => {
  const customer = {
    openingBalance: 50,
    orders: [{ createdAt: '2026-10-10', netAmount: 100 }],
    payments: [],
    orderReturns: [
      { createdAt: '2026-09-30', netAmount: 20, refundAmount: 0 },
      { createdAt: '2026-10-15', netAmount: 30, refundAmount: 5 }
    ]
  };
  const view = customerInPeriod(customer, '2026-10-01', '2026-10-31');
  assert.equal(view.orderReturns.length, 1);
  assert.equal(statementTotals(view.orders, view.payments, view.openingBalance, view.orderReturns).totalDue, 75);
  assert.equal(customer.orderReturns.length, 2);
});

test('customer and supplier period views include and filter discount-only movements', () => {
  const discounts = [
    { id: 'before', discountNumber: 'DSC-1', date: '2026-09-30', amount: 5 },
    { id: 'inside', discountNumber: 'DSC-2', date: '2026-10-15', amount: 20 }
  ];
  const customer = customerInPeriod({ openingBalance: 100, orders: [], payments: [], discounts }, '2026-10-01', '2026-10-31');
  const supplier = supplierInPeriod({ balance: 75, purchaseOrders: [], expenses: [], discounts }, '2026-10-01', '2026-10-31');
  assert.equal(customer.discounts.length, 1);
  assert.equal(supplier.discounts.length, 1);
  assert.equal(statementTotals(customer.orders, customer.payments, customer.openingBalance, [], customer.discounts).totalDue, -20);
  assert.equal(supplier.balance, -20);
  assert.equal(discounts.length, 2);
});

test('supplier period computes movement balance and does not mutate stored balance', () => {
  const supplier = {
    balance: 950,
    purchaseOrders: [{ date: '2026-09-01', netAmount: 1000 }, { createdAt: '2026-10-31T23:59:59.999', netAmount: 150 }],
    expenses: [{ date: '2026-09-10', amount: 250 }, { date: '2026-10-01T00:00:00', amount: 200 }]
  };
  const view = supplierInPeriod(supplier, '2026-10-01', '2026-10-31');
  assert.equal(view.purchaseOrders.length, 1);
  assert.equal(view.expenses.length, 1);
  assert.equal(view.balance, -50);
  assert.equal(supplier.balance, 950);
  assert.equal(supplierInPeriod(supplier, '', '').balance, 950);
  const empty = supplierInPeriod(supplier, '2027-01-01', '2027-01-31');
  assert.equal(empty.purchaseOrders.length + empty.expenses.length, 0);
  assert.equal(empty.balance, 0);
});

test('customer and supplier print handlers use period rows and print the selected dates', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onClick'
      && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isArrowFunction(node.initializer.expression)) {
      const text = node.initializer.expression.getText(tree);
      if (text.includes('setPrintTableData') && (text.includes('filteredCustomers') || text.includes('filteredSuppliers'))) {
        handlers.push(text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(handlers.length, 2);
  const customer = customerInPeriod({
    name: 'Customer', openingBalance: 500,
    orders: [{ createdAt: '2026-09-01', netAmount: 999 }, { createdAt: '2026-10-10', netAmount: 100 }],
    payments: [{ date: '2026-10-20', amount: 30 }],
    discounts: [{ id: 'customer-discount', discountNumber: 'DSC-1', date: '2026-10-21', amount: 10 }]
  }, '2026-10-01', '2026-10-31');
  const supplier = supplierInPeriod({
    name: 'Supplier', balance: 950,
    purchaseOrders: [{ date: '2026-09-01', netAmount: 999 }, { date: '2026-10-10', netAmount: 150 }],
    expenses: [{ date: '2026-10-20', amount: 200 }],
    discounts: [{ id: 'supplier-discount', discountNumber: 'DSC-2', date: '2026-10-21', amount: 20 }]
  }, '2026-10-01', '2026-10-31');
  const reports = [];
  for (const handler of handlers) {
    const compiled = ts.transpileModule(`const printReport = ${handler}; printReport();`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(compiled, {
      filteredCustomers: [customer], filteredSuppliers: [supplier],
      currentUser: { role: 'ADMIN' }, totalsFrom: '2026-10-01', totalsTo: '2026-10-31',
      setPrintTableData: (report) => reports.push(report)
    });
  }
  assert.equal(reports[0].rows[0][4], '100.00');
  assert.equal(reports[0].rows[0][5], '30.00');
  assert.equal(reports[0].rows[0][8], '10.00');
  assert.equal(reports[0].rows[0][9], '60.00');
  assert.equal(reports[0].footer[9], '60.00');
  assert.ok(reports[1].rows[0][4].startsWith('-70.00'));
  assert.ok(reports[1].rows[0][5].startsWith('20.00'));
  assert.equal(reports[1].headers.length, 6);
  for (const report of reports) {
    assert.equal(report.rows.length, 1);
    assert.equal(report.period.from, '2026-10-01');
    assert.equal(report.period.to, '2026-10-31');
  }
});

test('all dated tabs use the same filtered records for rows, totals and printing', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['filteredPurchases', 'filteredGeneralExpenses', 'filteredExpenses', 'filteredPayments', 'filteredInvoices'];
  const declarations = [];
  const printCalls = [];
  const totalFunctions = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
      declarations.push(`const ${node.getText(tree)};`);
    }
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'renderPeriodTablePrint') {
      printCalls.push(node.getText(tree));
    }
    if (ts.isArrowFunction(node) && ts.isBlock(node.body)
      && names.some(name => node.body.statements[0]?.getText(tree) === `const list = ${name};`)
      && node.body.getText(tree).includes('renderTotalsBar')) {
      totalFunctions.push(node.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(declarations.length, 5);
  assert.equal(printCalls.length, 5);
  assert.equal(totalFunctions.length, 5);
  const transpile = text => ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const record = (id, date, name = 'Match') => ({
    id, date, createdAt: date, billNumber: id, expenseNumber: id, receiptNumber: id, invoiceNumber: id,
    supplier: { name }, customer: { name }, category: { name }, bank: { name: 'Bank' },
    netAmount: 100, totalAmount: 80, taxAmount: 20, amount: 30, isQuotation: id === 'end'
  });
  const records = [
    record('before', '2026-09-30T23:59:59.999'),
    record('start', '2026-10-01T00:00:00'),
    record('end', '2026-10-31T23:59:59.999'),
    record('after', '2026-11-01T00:00:00'),
    record('other', '2026-10-10T12:00:00', 'Other')
  ];
  for (const [from, to, search, expected] of [
    ['2026-10-01', '2026-10-31', 'Match', ['start', 'end']],
    ['2026-10-01', '', 'Match', ['start', 'end', 'after']],
    ['', '2026-10-31', 'Match', ['before', 'start', 'end']],
    ['', '', 'Match', ['before', 'start', 'end', 'after']],
    ['2027-01-01', '2027-01-31', 'Match', []],
    ['2026-10-01', '2026-10-31', '', ['start', 'end', 'other']]
  ]) {
    const context = {
      exports: {}, inAccountPeriod, totalsFrom: from, totalsTo: to,
      purchases: records, generalExpenses: records, expenses: records, payments: records, invoices: records,
      purchaseSearch: search, generalExpenseSearch: search, expenseSearch: search, paymentSearch: search, invoiceSearch: search
    };
    vm.runInNewContext(transpile(declarations.join('\n') + `\nexports.lists = {${names.join(',')}};`), context);
    for (const list of Object.values(context.exports.lists)) {
      assert.deepEqual(Array.from(list, row => row.id), expected);
    }
    Object.assign(context, context.exports.lists, {
      formatTotal: n => Number(n).toFixed(2),
      formatReportDate: row => row.date || row.createdAt,
      renderPeriodTablePrint: (_title, headers, rows) => ({ headers, rows }),
      renderTotalsBar: cards => cards
    });
    printCalls.forEach((print, index) => {
      vm.runInNewContext(transpile(`exports.report = ${print};`), context);
      const { headers, rows } = context.exports.report;
      assert.equal(rows.length, expected.length);
      for (const row of rows) assert.equal(row.length, headers.length);
      assert.deepEqual(
        Array.from(rows, row => row[0]),
        expected.map(id => index === 3 ? `REC-${id}` : id)
      );
      rows.forEach((row, rowIndex) => {
        assert.equal(row[1], records.find(record => record.id === expected[rowIndex]).date);
      });
    });
    totalFunctions.forEach((fn, index) => {
      vm.runInNewContext(transpile(`exports.cards = (${fn})();`), context);
      const cards = context.exports.cards;
      const count = expected.length;
      const salesCount = expected.filter(id => id !== 'end').length;
      assert.equal(cards[0].value, String(index === 4 ? salesCount : count));
      assert.equal(cards[1].value, ((index === 0 ? 80 : index === 4 ? 100 : 30)
        * (index === 4 ? salesCount : count)).toFixed(2));
    });
  }
  for (const name of names) {
    assert.ok(source.includes(`${name}.map(`), `${name} must render the visible rows`);
    assert.ok(source.includes(`${name}.length === 0`), `${name} must control the empty state`);
  }
});

test('shared print button snapshots the selected period including one-sided periods', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'renderPeriodTablePrint') {
      declaration = node.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(declaration);
  const code = ts.transpileModule(`const ${declaration}; exports.button = renderPeriodTablePrint('Report', ['Amount'], [['100.00']]);`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  for (const [from, to] of [['2026-10-01', '2026-10-31'], ['2026-10-01', ''], ['', '2026-10-31'], ['', '']]) {
    let report;
    const exports = {};
    vm.runInNewContext(code, {
      exports, totalsFrom: from, totalsTo: to, PrinterIcon: 'icon',
      React: { createElement: (type, props, ...children) => ({ type, props, children }) },
      setPrintTableData: value => { report = value; }
    });
    exports.button.props.onClick();
    assert.equal(report.period.from, from);
    assert.equal(report.period.to, to);
    assert.equal(report.rows[0][0], '100.00');
  }
});

test('unified ledger sorts movements, excludes quotations, preserves documents and carries balances', () => {
  const invoice = { id: 'invoice', createdAt: '2026-10-02', netAmount: 100 };
  const payment = { id: 'payment', date: '2026-10-01', amount: 30 };
  const invoices = [invoice, { createdAt: '2026-10-03', netAmount: 900, isQuotation: true }];
  const rows = statementEntries(invoices, [payment], 500);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'payment');
  assert.equal(rows[0].document, payment);
  assert.equal(rows[0].balance, 470);
  assert.equal(rows[1].document, invoice);
  assert.equal(rows[1].balance, 570);
  assert.equal(rows[1].balance, statementTotals(invoices, [payment], 500).totalDue);
  assert.equal(invoices[0], invoice);
  assert.equal(statementEntries([], [], 0).length, 0);
  const tiedRows = statementEntries([{ ...invoice, createdAt: payment.date }], [payment], -100);
  assert.equal(tiedRows[0].kind, 'invoice');
  assert.equal(tiedRows[1].kind, 'payment');
  assert.equal(tiedRows[1].balance, -30);
  assert.throws(() => statementEntries([{ netAmount: 10, createdAt: 'invalid' }], [], 0), /invalid date/);
});

test('printed statement keeps the unified ledger while the screen restores separate history tables', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const exports = {};
  const compiled = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'components', 'AccountStatement.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  vm.runInNewContext(compiled, {
    exports, require: name => name === '@/lib/account-period' ? exportsPeriod : require(name)
  });

  const Component = exports.default;
  for (const kind of ['customer', 'supplier']) {
    for (const opening of [500, 0, -125.5]) {
      const html = renderToStaticMarkup(React.createElement(Component, {
        kind, name: 'Account', openingBalance: opening,
        invoices: [{ id: 'INV-1', invoiceNumber: 'INV-1', billNumber: 'INV-1', createdAt: '2026-10-02', netAmount: 100 }],
        payments: [{ id: 'REC-1', receiptNumber: '1', expenseNumber: 'REC-1', date: '2026-10-01', amount: 30 }],
        from: '2026-10-01', to: '2026-10-31', periodControls: null,
        onClose() {}, onInvoice() {}, onPayment() {}
      }));
      const print = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
      const screen = html.slice(html.indexOf('class="account-history-screen'), html.indexOf('<article'));
      assert.equal((print.match(/<table/g) || []).length, 1);
      assert.equal((screen.match(/<table/g) || []).length, 2);
      assert.ok(screen.includes(kind === 'supplier' ? 'سجل فواتير الشراء والتوريد' : 'سجل الفواتير'));
      assert.ok(screen.includes(kind === 'supplier' ? 'سجل سندات الصرف والمدفوعات للمورد' : 'سجل سندات القبض والمدفوعات'));
      assert.ok(screen.includes('رصيد أول المدة'));
      const openingIndex = html.indexOf('class="statement-opening"');
      const paymentIndex = html.indexOf('class="statement-payment"');
      const invoiceIndex = html.indexOf('class="statement-invoice"');
      const closingIndex = html.indexOf('class="statement-closing"');
      assert.ok(openingIndex < paymentIndex && paymentIndex < invoiceIndex && invoiceIndex < closingIndex);
      assert.ok(html.includes((opening + 70).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
      assert.ok(html.includes('2026-10-01') && html.includes('2026-10-31'));
      assert.ok(html.includes('statement-print-reference'));
      for (const footerDetail of ['https://www.alentlaq.online/', '01030099400 / 01021683030', 'admin@alentlaq.online']) {
        assert.ok(print.includes(footerDetail), footerDetail);
      }
      assert.ok(fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8').includes('bottom: 0 !important;'));
    }
    const html = renderToStaticMarkup(React.createElement(Component, {
      kind, name: 'Account', openingBalance: 500, invoices: [], payments: [],
      from: '', to: '', periodControls: null, onClose() {}, onInvoice() {}, onPayment() {}
    }));
    assert.equal((html.slice(html.indexOf('<article')).match(/<table/g) || []).length, 1);
    assert.ok(html.includes('statement-opening') && html.includes('statement-empty') && html.includes('statement-closing'));
  }
  const simplified = renderToStaticMarkup(React.createElement(Component, {
    kind: 'customer', name: 'Account', openingBalance: 30,
    invoices: [{ id: 'invoice', createdAt: '2026-10-01', netAmount: 100,
      invoiceType: 'فاتورة ضريبية', siteReceiptNumber: 'SITE-234', receiverName: 'Receiver' }],
    payments: [{ id: 'payment', date: '2026-10-02', amount: 10, notes: 'Payment note', bank: { name: 'Bank' } }],
    from: '', to: '', periodControls: null, onClose() {}, onInvoice() {}, onPayment() {}
  }));
  const simplifiedPrint = simplified.slice(simplified.indexOf('<article'));
  assert.ok(simplified.includes('فاتورة ضريبية'));
  assert.ok(!simplifiedPrint.includes('>العملية<'));
  assert.ok(!simplifiedPrint.includes('فاتورة ضريبية') && !simplifiedPrint.includes('قبل الضريبة') && !simplifiedPrint.includes('الضريبة:'));
  assert.ok(simplified.includes('SITE-234') && simplified.includes('Receiver') && simplified.includes('Payment note'));
  assert.equal((simplifiedPrint.match(/scope="col"/g) || []).length, 6);
  assert.ok(simplified.includes('colSpan="5"'));
  const document = { id: 'restricted-invoice', createdAt: '2026-10-01', netAmount: 123456.78, totalAmount: 100000, taxAmount: 23456.78 };
  const restricted = renderToStaticMarkup(React.createElement(Component, {
    kind: 'supplier', name: 'Account', openingBalance: 0, invoices: [document], payments: [],
    from: '', to: '', periodControls: null, showInvoiceAmounts: false,
    onClose() {}, onInvoice() {}, onPayment() {}
  }));
  assert.ok(!restricted.includes('123,456.78') && !restricted.includes('100,000.00') && !restricted.includes('23,456.78'));
  const payment = { id: 'payment', date: '2026-10-02', amount: 10 };
  const opened = [];
  const element = Component({
    kind: 'customer', name: 'Account', openingBalance: 0, invoices: [document], payments: [payment],
    from: '', to: '', periodControls: null,
    onClose: () => opened.push('close'),
    onInvoice: value => opened.push(value),
    onPayment: value => opened.push(value)
  });
  const buttons = [];
  const collect = node => {
    if (Array.isArray(node)) node.forEach(collect);
    else if (React.isValidElement(node)) {
      if (node.type === 'button') buttons.push(node);
      collect(node.props.children);
    }
  };
  collect(element);
  buttons.find(button => button.props['aria-label'] === 'فتح restricted-invoice').props.onClick();
  buttons.find(button => button.props['aria-label'] === 'فتح REC-PAYMEN').props.onClick();
  buttons.find(button => button.props['aria-label'] === 'طباعة الفاتورة restricted-invoice').props.onClick();
  buttons.find(button => button.props['aria-label'] === 'طباعة السند REC-PAYMEN').props.onClick();
  buttons.find(button => button.props['aria-label'] === 'إغلاق كشف الحساب').props.onClick();
  assert.deepEqual(opened, [document, payment, document, payment, 'close']);
});

test('both account statements show and print discount vouchers separately from payments', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const exports = {};
  const compiled = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', 'components', 'AccountStatement.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  vm.runInNewContext(compiled, {
    exports, require: name => name === '@/lib/account-period' ? exportsPeriod : require(name)
  });
  const discount = { id: 'discount', discountNumber: 'DSC-00001', date: '2026-10-03', amount: 15, notes: 'Settlement' };
  for (const kind of ['customer', 'supplier']) {
    const html = renderToStaticMarkup(React.createElement(exports.default, {
      kind, name: 'Account', openingBalance: 0,
      invoices: [{ id: 'invoice', netAmount: 100, createdAt: '2026-10-01' }],
      payments: [{ id: 'payment', amount: 20, date: '2026-10-02' }],
      discounts: [discount], from: '', to: '', periodControls: null,
      onClose() {}, onInvoice() {}, onPayment() {}, onDiscount() {}
    }));
    const screen = html.slice(html.indexOf('class="account-history-screen'), html.indexOf('<article'));
    const print = html.slice(html.indexOf('<article'));
    assert.ok(screen.includes(kind === 'customer' ? 'سجل الخصم المسموح به' : 'سجل الخصم المكتسب'));
    assert.ok(screen.includes('DSC-00001') && screen.includes('Settlement'));
    assert.ok(print.includes('statement-discount') && print.includes('DSC-00001'));
    assert.ok(print.includes(kind === 'customer' ? 'خصم مسموح به للعميل' : 'خصم مكتسب من المورد'));
    assert.ok(print.includes('65.00'));
    assert.ok(print.includes('إجمالي السدادات') && print.includes('20.00'));
  }
});
