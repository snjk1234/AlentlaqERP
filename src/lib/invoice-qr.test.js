/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { invoiceQrText, invoiceQrTextFromDocument } = require('./invoice-qr');

test('invoice QR content is readable text with invoice number, issue time, total and tax', () => {
  const content = invoiceQrText({
    invoiceNumber: 'INV-2026-00001',
    issuedAt: '2026-11-17T12:00:00.000Z',
    totalAmount: '114.00',
    taxAmount: '14.00'
  });
  assert.equal(content, [
    'بيانات الفاتورة',
    'رقم الفاتورة: INV-2026-00001',
    'تاريخ الإصدار: 2026-11-17T12:00:00.000Z',
    'الإجمالي شامل الضريبة: 114.00 جنيه مصري',
    'ضريبة القيمة المضافة: 14.00 جنيه مصري'
  ].join('\n'));
});

test('previously stored QR payloads are rebuilt from invoice details for display', () => {
  const content = invoiceQrTextFromDocument({
    invoiceNumber: 'INV-2025-00009',
    createdAt: '2025-05-10T10:00:00.000Z',
    netAmount: 228,
    taxAmount: 28,
    qrCode: 'old-base64-payload'
  });
  assert.ok(content.includes('رقم الفاتورة: INV-2025-00009'));
  assert.ok(content.includes('الإجمالي شامل الضريبة: 228.00 جنيه مصري'));
  assert.ok(content.includes('ضريبة القيمة المضافة: 28.00 جنيه مصري'));
  assert.ok(!content.includes('old-base64-payload'));
});

test('invalid saved invoice details cannot produce a plausible QR payload', () => {
  assert.throws(() => invoiceQrTextFromDocument({
    invoiceNumber: 'INV-1', netAmount: 100, taxAmount: 14
  }), /بيانات الفاتورة غير صالحة/);
  assert.throws(() => invoiceQrTextFromDocument({
    invoiceNumber: 'INV-1', createdAt: '2025-05-10T10:00:00.000Z', netAmount: 100, taxAmount: null
  }), /بيانات الفاتورة غير صالحة/);
});

test('Access creates and updates invoices with readable Unicode QR text', {
  skip: !process.env.ACCESS_TEST_SOURCE_DB
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-qr-access-'));
  const databasePath = path.join(directory, 'test.accdb');
  fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
  const previousPath = process.env.ACCESS_DB_PATH;
  process.env.ACCESS_DB_PATH = databasePath;
  const database = require('./access-client').createAccessClient();
  try {
    const user = await database.user.create({ data: {
      username: 'qr-test', name: 'Test', password: 'test', role: 'ADMIN'
    } });
    const product = await database.product.create({ data: {
      code: 'QR-TEST', name: 'Test', type: 'Test', size: 'test', price: 100, stockQty: 5
    } });
    const qrCode = invoiceQrText({
      invoiceNumber: 'INV-2026-00001', issuedAt: '2026-11-17T12:00:00.000Z',
      totalAmount: '114.00', taxAmount: '14.00'
    });
    const invoice = await database.order.create({ data: {
      invoiceNumber: 'INV-2026-00001', customerName: 'عميل نقدي', totalAmount: 100,
      taxAmount: 14, netAmount: 114, qrCode, invoiceType: 'فاتورة ضريبية',
      userId: user.id, status: 'COMPLETED', purchaseOrderNumber: 'PO-123',
      items: { create: [{ productId: product.id, quantity: 1, unitPrice: 100, taxAmount: 14, total: 114 }] }
    }, include: { items: true } });
    assert.equal(invoice.qrCode, qrCode);
    assert.equal(invoice.purchaseOrderNumber, 'PO-123');
    assert.equal(invoice.items.length, 1);
    const longerQr = `${qrCode}\n${'عربي'.repeat(100)} 'quote' 😀`;
    const updated = await database.order.update({ where: { id: invoice.id }, data: { qrCode: longerQr } });
    assert.equal(updated.qrCode, longerQr);
    assert.equal((await database.order.findUnique({ where: { id: invoice.id } })).qrCode, longerQr);
    assert.equal((await database.order.update({ where: { id: invoice.id }, data: { qrCode: null } })).qrCode, null);
    await assert.rejects(database.$transaction(async tx => {
      await tx.order.update({ where: { id: invoice.id }, data: { qrCode } });
      throw new Error('test rollback');
    }), /test rollback/);
    assert.equal((await database.order.findUnique({ where: { id: invoice.id } })).qrCode, null);
  } finally {
    await database.$disconnect();
    if (previousPath === undefined) delete process.env.ACCESS_DB_PATH;
    else process.env.ACCESS_DB_PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
