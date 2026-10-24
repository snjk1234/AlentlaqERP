/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextPaymentNumber, assignMissingPaymentNumbers } = require('./payment-numbers');

test('payment numbering starts at one and continues beyond the highest existing receipt, not the row count', () => {
  assert.equal(nextPaymentNumber([]), '00001');
  assert.equal(nextPaymentNumber([
    { receiptNumber: '00001' }, { receiptNumber: '10' }, { receiptNumber: 'REC-00100' },
    { receiptNumber: null }, { receiptNumber: 'CUSTOM-500' }
  ]), '00101');
  assert.equal(nextPaymentNumber([{ receiptNumber: '99999' }]), '100000');
});

test('backfills missing receipt numbers in supplied chronological order, preserving existing receipts and financial data', async () => {
  const payments = [
    { id: 'old', receiptNumber: null, amount: 50, bankId: 'bank1' },
    { id: 'existing', receiptNumber: '00007', amount: 200, bankId: 'bank2' },
    { id: 'later', receiptNumber: '', amount: 100, bankId: 'bank1' },
    { id: 'spaces', receiptNumber: ' ', amount: 30, bankId: 'bank2' }
  ];
  const original = structuredClone(payments);
  const saved = [];
  await assignMissingPaymentNumbers(payments, async (id, receiptNumber) => saved.push({ id, receiptNumber }));
  assert.deepEqual(saved, [
    { id: 'old', receiptNumber: '00008' }, { id: 'later', receiptNumber: '00009' },
    { id: 'spaces', receiptNumber: '00010' }
  ]);
  assert.deepEqual(payments, original);
  const migrated = payments.map(payment => ({ ...payment, ...saved.find(entry => entry.id === payment.id) }));
  await assignMissingPaymentNumbers(migrated, async () => assert.fail('Migration must be idempotent'));
  assert.equal(nextPaymentNumber(migrated), '00011');
});

test('number allocation fails explicitly on overflow or a failed migration write', async () => {
  assert.throws(() => nextPaymentNumber([{ receiptNumber: String(Number.MAX_SAFE_INTEGER) }]), /رقم/);
  await assert.rejects(assignMissingPaymentNumbers([{ id: 'old' }], async () => {
    throw new Error('Database offline');
  }), /Database offline/);
});
