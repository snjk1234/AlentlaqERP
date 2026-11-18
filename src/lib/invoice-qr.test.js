/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
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
