/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBankStatement } = require('./bank-statement');

const bankId = 'bank-1';

test('builds a dated bank ledger with opening, running, and closing balances', () => {
  const statement = buildBankStatement({
    bankId,
    bankBalance: 140,
    payments: [
      { id: 'p1', bankId, amount: 100, date: '2026-01-02', customer: { name: 'عميل' } },
      { id: 'p2', bankId: 'bank-2', amount: 900, date: '2026-01-03' }
    ],
    supplierPayments: [{ id: 's1', bankId, amount: 30, date: '2026-01-04', supplier: { name: 'مورد' } }],
    generalExpenses: [{ id: 'g1', bankId, amount: 10, date: '2026-01-05', category: { name: 'مصروف' } }],
    returns: [{ id: 'r1', bankId, refundMethod: 'BANK', refundAmount: 20, createdAt: '2026-01-06' }]
  });

  assert.equal(statement.openingBalance, 60);
  assert.deepEqual(statement.rows.map(row => row.balance), [160, 130, 120, 140]);
  assert.equal(statement.totalIncoming, 120);
  assert.equal(statement.totalOutgoing, 40);
  assert.equal(statement.closingBalance, 140);
});

test('filters rows by date but includes later movements when calculating the period opening balance', () => {
  const statement = buildBankStatement({
    bankId,
    bankBalance: 125,
    payments: [
      { id: 'p1', bankId, amount: 50, date: '2026-01-01' },
      { id: 'p2', bankId, amount: 100, date: '2026-01-10' }
    ],
    supplierPayments: [{ id: 's1', bankId, amount: 25, date: '2026-01-20' }],
    from: '2026-01-10',
    to: '2026-01-15'
  });

  assert.equal(statement.openingBalance, 50);
  assert.equal(statement.rows.length, 1);
  assert.equal(statement.rows[0].balance, 150);
  assert.equal(statement.closingBalance, 150);
});

test('excludes non-bank refunds and non-bank movements', () => {
  const statement = buildBankStatement({
    bankId,
    bankBalance: 500,
    returns: [
      { id: 'r1', bankId, refundMethod: 'CASH', refundAmount: 100, createdAt: '2026-01-02' },
      { id: 'r2', bankId: 'bank-2', refundMethod: 'BANK', refundAmount: 200, createdAt: '2026-01-03' }
    ]
  });

  assert.equal(statement.openingBalance, 500);
  assert.equal(statement.rows.length, 0);
});

test('fails explicitly when a bank movement has no valid date', () => {
  assert.throws(() => buildBankStatement({
    bankId,
    bankBalance: 100,
    payments: [{ id: 'p1', bankId, amount: 50 }]
  }), /invalid date/i);
});

test('customer payments show the receipt number and new label in both ledger and print data', () => {
  const payments = [
    { id: 'long-database-id-1', receiptNumber: '00001', bankId, amount: 100, date: '2026-01-02' },
    { id: 'long-database-id-2', receiptNumber: 'REC-00002', bankId, amount: 50, date: '2026-01-03' }
  ];
  const statement = buildBankStatement({ bankId, bankBalance: 150, payments });
  assert.deepEqual(statement.rows.map(row => row.type), ['دفعات العملاء', 'دفعات العملاء']);
  assert.deepEqual(statement.rows.map(row => row.number), ['REC-00001', 'REC-00002']);
  const filtered = buildBankStatement({ bankId, bankBalance: 150, payments, from: '2026-01-03' });
  assert.equal(filtered.rows[0].number, 'REC-00002');
  assert.equal(filtered.openingBalance, 100);
});

test('a client connected to an older server uses the same short receipt reference as the payment list', () => {
  const statement = buildBankStatement({
    bankId, bankBalance: 100,
    payments: [{ id: 'abcdef-long-database-identifier', bankId, amount: 100, date: '2026-01-02' }]
  });
  assert.equal(statement.rows[0].number, 'REC-ABCDEF');
});
