/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const componentPath = path.join(__dirname, '..', 'components', 'PrintDocuments.tsx');
const exportsPrint = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(componentPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exportsPrint, require });
const { InvoicePrint, ReceiptPrint, TablePrint, StocktakePrint } = exportsPrint;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, { onClose() {}, ...props }));
const invoice = {
  createdAt: '2026-10-01T14:35:00', invoiceNumber: 'INV-123', billNumber: 'PUR-123',
  invoiceType: 'فاتورة ضريبية', totalAmount: 100, taxAmount: 14, netAmount: 114,
  siteReceiptNumber: 'SITE-123', receiverName: 'Receiver',
  customer: { name: 'Customer', location: 'Address', phone: '012345', trn: 'CUSTOMER-TAX' },
  supplier: { name: 'Supplier', address: 'Supplier address', cr: 'SUPPLIER-CR', trn: 'SUPPLIER-TAX' },
  items: [{ id: 'item', product: { name: 'Product', code: 'P-123', size: '20', color: 'Blue' },
    quantity: 2, unitCost: 50, unitPrice: 50, taxAmount: 14, total: 114 }]
};

test('draft and approved stocktake printouts retain saved notes, status, item order, blank counts and cost-valued totals', () => {
  const document = {
    documentNumber: 'STK-00000025', status: 'DRAFT', createdAt: '2026-10-24T12:00:00Z', createdBy: 'Keeper',
    notes: 'ملاحظات بعد الحفظ\nسطر آخر', approvedBy: null, approvedAt: null,
    items: [
      { productLabel: 'Z-PIPE', bookQty: 100, countedQty: 90, unitCost: 150 },
      { productLabel: 'A-HOSE', bookQty: 10, countedQty: 20, unitCost: 200 },
      { productLabel: 'Uncounted', bookQty: 1000, countedQty: null, unitCost: 300 },
      { productLabel: 'Zero', bookQty: 2, countedQty: 0, unitCost: 0 }
    ]
  };
  const html = render(StocktakePrint, { document });
  assert.ok(html.includes('<colgroup><col style="width:40%"/><col style="width:11%"/><col style="width:12%"/><col style="width:10%"/><col style="width:13%"/><col style="width:14%"/></colgroup>'));
  for (const text of ['printable-stocktake', 'STK-00000025', 'مسودة جرد مخزون', 'غير معتمدة', 'Keeper',
    'ملاحظات بعد الحفظ', 'سطر آخر', 'لم يُعدّ بعد', '1,500.00', '2,000.00', '500.00', 'قيمة النقص', 'قيمة الزيادة', 'الصافي']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.indexOf('Z-PIPE') < html.indexOf('A-HOSE'));
  const totalsRow = html.match(/<div class="document-totals stocktake-print-totals">([\s\S]*?)<\/div>/);
  assert.ok(totalsRow);
  assert.equal((totalsRow[1].match(/<p>/g) || []).length, 3);
  for (const label of ['قيمة النقص', 'قيمة الزيادة', 'الصافي']) assert.ok(totalsRow[1].includes(label));
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');
  assert.match(css, /\.stocktake-print-totals\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.equal((html.match(/scope="col"/g) || []).length, 6);
  const approved = render(StocktakePrint, { document: {
    ...document, status: 'APPROVED', approvedBy: 'Manager', approvedAt: '2026-10-24T13:00:00Z'
  } });
  assert.ok(approved.includes('جرد مخزون معتمد') && approved.includes('Manager'));
  assert.ok(!approved.includes('غير معتمدة'));
  const legacy = render(StocktakePrint, { document: {
    ...document, items: [{ productLabel: 'Legacy', bookQty: 10, countedQty: 9, unitCost: null }]
  } });
  assert.ok(legacy.includes('غير محفوظة') && legacy.includes('غير متاحة'));
});

test('sales invoices and quotations preserve items, tax, totals, parties, QR and conversion actions', () => {
  const html = render(InvoicePrint, {
    invoice, qrCodeUrl: 'data:image/png;base64,QR',
    actions: React.createElement('button', { type: 'button' }, 'Convert')
  });
  for (const value of ['printable-invoice', 'INV-123', 'P-123', 'Product', 'Customer',
    'SITE-123', 'Receiver', '100.00', '14.00', '114.00', 'data:image/png;base64,QR', 'Convert',
    'https://www.alentlaq.online/']) {
    assert.ok(html.includes(value), value);
  }
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.equal((html.match(/scope="col"/g) || []).length, 7);
  assert.ok(html.includes('document-totals'));
  assert.ok(html.includes(new Date(invoice.createdAt).toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })));
  const quotation = render(InvoicePrint, { invoice: { ...invoice, isQuotation: true } });
  assert.ok(quotation.includes('عرض سعر') && quotation.includes('لا يحتاج رمز QR'));
  const converted = render(InvoicePrint, { invoice: { ...invoice, isQuotation: true, status: 'CONVERTED' } });
  assert.ok(converted.includes('تم التحويل'));
});

test('purchase invoices preserve supplier details and hide cost/tax/totals for non-admins', () => {
  const html = render(InvoicePrint, { invoice, purchase: true });
  for (const value of ['printable-purchase', 'PUR-123', 'Supplier', '114.00']) {
    assert.ok(html.includes(value), value);
  }
  const restricted = render(InvoicePrint, { invoice, purchase: true, showAmounts: false });
  for (const value of ['50.00', '14.00', '114.00', 'document-totals']) assert.ok(!restricted.includes(value), value);
  assert.equal((restricted.match(/scope="col"/g) || []).length, 4);
  assert.ok(restricted.includes('colSpan="4"'));
});

test('warehouse receipt number prints only on purchase invoices, including quantity-only copies', () => {
  for (const showAmounts of [true, false]) {
    const printed = render(InvoicePrint, { invoice: { ...invoice, warehouseReceiptNumber: 'WR-0007' }, purchase: true, showAmounts });
    assert.ok(printed.includes('رقم استلام المخزن'));
    assert.ok(printed.includes('WR-0007'));
  }
  assert.ok(!render(InvoicePrint, { invoice: { ...invoice, warehouseReceiptNumber: 'WR-0007' } }).includes('WR-0007'));
  assert.ok(!render(InvoicePrint, { invoice, purchase: true }).includes('رقم استلام المخزن'));
});

test('supplier statement loads purchase items and products through both API and Electron for printing', async () => {
  const root = path.join(__dirname, '..', '..');
  const queries = [];
  const prisma = { supplier: { findMany: async args => {
    queries.push(args);
    assert.equal(args.include.purchaseOrders.include.items.include.product, true);
    assert.equal(args.include.expenses.include.bank, true);
    return [{ ...invoice.supplier, purchaseOrders: [invoice], expenses: [] }];
  } } };
  const routeExports = {};
  const source = fs.readFileSync(path.join(root, 'src', 'app', 'api', 'suppliers', 'route.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports: routeExports, console,
    require: name => {
      if (name === '@/lib/prisma') return { prisma };
      if (name === 'next/server') return { NextResponse: { json: data => data } };
      throw new Error(`Unexpected import: ${name}`);
    }
  });
  const handlers = {};
  const main = ts.createSourceFile('main.js', fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8'), ts.ScriptTarget.Latest, true);
  const statement = main.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(main) === 'ipcMain.handle'
    && node.expression.arguments[0]?.text === 'get-suppliers');
  assert.ok(statement);
  vm.runInNewContext(statement.getText(main), {
    prisma, console, ipcMain: { handle: (name, callback) => { handlers[name] = callback; } }
  });
  for (const suppliers of [await routeExports.GET(), await handlers['get-suppliers']()]) {
    const supplier = suppliers[0];
    const html = render(InvoicePrint, {
      invoice: { ...supplier.purchaseOrders[0], supplier }, purchase: true
    });
    for (const value of ['Product', 'P-123', '20', 'Blue', 'PUR-123', '114.00']) {
      assert.ok(html.includes(value), value);
    }
    const restricted = render(InvoicePrint, {
      invoice: { ...supplier.purchaseOrders[0], supplier }, purchase: true, showAmounts: false
    });
    assert.ok(restricted.includes('Product'));
    assert.ok(!restricted.includes('114.00'));
  }
  assert.equal(queries.length, 2);
});

test('printed invoices omit registration numbers and tax classifications without changing amounts', () => {
  for (const purchase of [false, true]) {
    for (const invoiceType of ['فاتورة ضريبية', 'فاتورة', 'فاتورة مبسطة']) {
      const html = render(InvoicePrint, { invoice: { ...invoice, invoiceType }, purchase });
      assert.ok(html.includes('<h2>فاتورة</h2>'));
      for (const forbidden of ['الرقم الضريبي', 'السجل التجاري', 'CUSTOMER-TAX', 'SUPPLIER-TAX',
        'SUPPLIER-CR', '310122345600003', '442-563-120', '12056-أ', 'فاتورة ضريبية',
        'فاتورة مبسطة', 'غير شامل للقيمة المضافة', 'غير شامل ضريبة']) {
        assert.ok(!html.includes(forbidden), forbidden);
      }
      for (const value of ['100.00', '14.00', '114.00']) assert.ok(html.includes(value));
    }
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const start = source.indexOf("const headers = ['م', 'اسم المورد'");
  const end = source.indexOf('setPrintTableData', start);
  assert.ok(start > 0 && end > start);
  const handlerEnd = source.indexOf('onClick', end);
  const supplierPrint = source.slice(start, handlerEnd);
  for (const forbidden of ['الرقم الضريبي', 'السجل التجاري', 's.trn', 's.cr']) {
    assert.ok(!supplierPrint.includes(forbidden), forbidden);
  }
});

test('receipts retain payment details, references, signatures and detachable stubs', () => {
  const receipt = {
    id: 'receipt', createdAt: '2026-10-01', date: '2026-10-02', receiptNumber: '123',
    expenseNumber: 'EXP-123', amount: 1000, notes: 'Payment description', reference: 'CHEQUE-123',
    customer: { name: 'Customer' }, supplier: { name: 'Supplier' }, bank: { name: 'Bank' }
  };
  for (const expense of [false, true]) {
    const html = render(ReceiptPrint, { receipt, expense });
    for (const value of ['1,000.00', 'Payment description', 'CHEQUE-123', 'Bank', 'document-stub', 'document-signatures']) {
      assert.ok(html.includes(value), value);
    }
    assert.ok(html.includes(expense ? 'EXP-123' : 'REC-123'));
    assert.ok(html.includes(expense ? 'Supplier' : 'Customer'));
    assert.ok(!html.includes('border-black') && !html.includes('font-black'));
  }
});

test('table reports preserve period, all columns, rows and a non-repeating footer', () => {
  const report = {
    title: 'Report', headers: ['Name', 'Amount'], rows: [['Account', '100.00']],
    footer: ['Totals', '100.00'], period: { from: '2026-10-01', to: '2026-10-31' }
  };
  const html = render(TablePrint, { report });
  for (const value of ['Account', '100.00', '2026-10-01', '2026-10-31', 'Totals']) assert.ok(html.includes(value));
  assert.ok(!html.includes('<tfoot'));
  assert.equal((html.match(/<table/g) || []).length, 1);
  const wide = render(TablePrint, { report: { ...report, headers: Array(14).fill('Column'), rows: [Array(14).fill('Data')] } });
  assert.ok(wide.includes('document-report-dense') && wide.includes('colSpan="14"'));
  assert.ok(!wide.includes('print-document-wide'));
  const empty = render(TablePrint, { report: { ...report, rows: [] } });
  assert.ok(empty.includes('لا توجد بيانات مطابقة'));
  const grouped = render(TablePrint, {
    report: {
      title: 'Large amounts', headers: ['Invoice', 'Amount'],
      rows: [['INV-1234567', '1234567.89 ج.م'], ['Customer code', '1234567']],
      footer: ['', '9876543.21']
    }
  });
  assert.ok(grouped.includes('1,234,567.89 ج.م'));
  assert.ok(grouped.includes('9,876,543.21'));
  assert.ok(grouped.includes('INV-1234567') && grouped.includes('1234567'));
});

test('all print formats reuse the statement layout, headings, totals and portrait A4 rules', () => {
  const receipt = { id: 'receipt', createdAt: '2026-10-01', amount: 10 };
  const reports = [
    render(InvoicePrint, { invoice }),
    render(InvoicePrint, { invoice, purchase: true }),
    render(ReceiptPrint, { receipt }),
    render(ReceiptPrint, { receipt, expense: true }),
    render(TablePrint, { report: { title: 'Report', headers: ['Name'], rows: [['Account']], footer: ['Totals'] } })
  ];
  for (const html of reports) {
    for (const footerDetail of ['https://www.alentlaq.online/', '01030099400 / 01021683030', 'admin@alentlaq.online']) {
      assert.ok(html.includes(footerDetail), footerDetail);
    }
    for (const className of ['account-statement print-document statement-compact', 'statement-ledger',
      'statement-document-heading', 'statement-column-heading', 'statement-account-row', 'statement-closing']) {
      assert.ok(html.includes(className), className);
    }
    assert.ok(!html.includes('document-columns') && !html.includes('document-closing'));
  }
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');
  assert.ok(css.includes('@page account-statement') && css.includes('size: A4;'));
  assert.ok(css.includes('.account-statement .statement-closing .statement-number { font-size: 16px; }'));
  assert.ok(css.includes('margin: 2mm 2mm 14mm 20mm;'), 'keep a wide left margin for hole punching while reserving footer space');
  assert.ok(css.includes('padding: 0 !important;'), 'remove extra paper padding inside printed documents');
  assert.ok(css.includes('position: fixed !important;') && css.includes('bottom: 0 !important;'),
    'anchor the footer inside the current printed page');
  assert.ok(!css.includes('A4 landscape') && !css.includes('business-document-wide'));
  assert.ok(css.includes('width: 190mm;') && css.includes('page: account-statement;'));
  assert.ok(!css.includes('#printable-statement'), 'print typography must be shared, not statement-ID-only');
});

test('all original print surfaces use the shared components and retain their data/actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'page.tsx'), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tags = [];
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && ['InvoicePrint', 'ReceiptPrint', 'TablePrint'].includes(node.tagName.getText(tree))) {
      tags.push(node.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(tags.length, 5);
  assert.ok(tags.some(tag => tag.includes('invoice={invoice}') && tag.includes('convertQuotationToInvoice') && tag.includes('qrCodeUrl')));
  assert.ok(tags.some(tag => tag.includes('selectedPurchase') && tag.includes("currentUser?.role === 'ADMIN'")));
  assert.ok(tags.some(tag => tag.includes('selectedReceipt')));
  assert.ok(tags.some(tag => tag.includes('selectedExpense') && tag.includes('expense')));
  assert.ok(tags.some(tag => tag.includes('report={printTableData}')));
  assert.ok(!source.includes('window.print()'));
});
