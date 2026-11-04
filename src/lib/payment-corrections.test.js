const test = require('node:test');
const assert = require('node:assert/strict');
const { correctPayment } = require('./payment-corrections');

function createDatabase(existingPayment) {
  const bankUpdates = [];
  let updatedPayment = null;
  const tx = {
    user: {
      findUnique: async () => ({ role: 'ADMIN' }),
    },
    payment: {
      findUnique: async () => existingPayment,
      update: async ({ data }) => {
        updatedPayment = { ...existingPayment, ...data };
        return updatedPayment;
      },
    },
    bank: {
      update: async (update) => bankUpdates.push(update),
    },
  };

  return {
    database: { $transaction: async (callback) => callback(tx) },
    bankUpdates,
    getUpdatedPayment: () => updatedPayment,
  };
}

const correction = {
  id: 'payment-1',
  userId: 'admin-1',
  customerId: 'customer-new',
  bankId: 'bank-new',
  amount: 75,
  reference: 'CHK-2',
  notes: 'corrected',
  date: '2026-10-24T00:00:00.000Z',
};

test('correcting an amount adjusts the same bank by the difference and appends audit history', async () => {
  const database = createDatabase({
    id: 'payment-1',
    customerId: 'customer-old',
    bankId: 'bank-old',
    amount: 100,
    reference: 'CHK-1',
    notes: null,
    date: new Date('2026-10-20T00:00:00.000Z'),
    correctionHistory: null,
  });

  test('stores Arabic correction history as ASCII-safe JSON for Access SQL', async () => {
    const database = createDatabase({
      id: 'payment-1',
      customerId: 'customer-old',
      bankId: 'bank-old',
      amount: 100,
      reference: null,
      notes: 'دفعة',
      date: new Date('2026-10-20T00:00:00.000Z'),
      correctionHistory: null,
    });

    await correctPayment(database.database, { ...correction, notes: 'تم التصويب' });

    const storedHistory = database.getUpdatedPayment().correctionHistory;
    assert.match(storedHistory, /^[\x00-\x7F]*$/);
    const history = JSON.parse(storedHistory);
    assert.equal(history[0].before.notes, 'دفعة');
    assert.equal(history[0].after.notes, 'تم التصويب');
  });

  await correctPayment(database.database, { ...correction, bankId: 'bank-old' });

  assert.deepEqual(database.bankUpdates, [{
    where: { id: 'bank-old' },
    data: { balance: { increment: -25 } },
  }]);
  const updated = database.getUpdatedPayment();
  const history = JSON.parse(updated.correctionHistory);
  assert.equal(history.length, 1);
  assert.equal(history[0].before.amount, 100);
  assert.equal(history[0].after.amount, 75);
  assert.equal(updated.customerId, 'customer-new');
});

test('moving a payment between banks reverses the old balance and adds the corrected amount to the new bank', async () => {
  const database = createDatabase({
    id: 'payment-1',
    customerId: 'customer-old',
    bankId: 'bank-old',
    amount: 100,
    reference: null,
    notes: null,
    date: new Date('2026-10-20T00:00:00.000Z'),
    correctionHistory: JSON.stringify([{ correctedAt: '2026-10-21T00:00:00.000Z' }]),
  });

  await correctPayment(database.database, correction);

  assert.deepEqual(database.bankUpdates, [
    { where: { id: 'bank-old' }, data: { balance: { decrement: 100 } } },
    { where: { id: 'bank-new' }, data: { balance: { increment: 75 } } },
  ]);
  assert.equal(JSON.parse(database.getUpdatedPayment().correctionHistory).length, 2);
});

test('rejects invalid correction data before opening a transaction', async () => {
  let transactionStarted = false;
  const database = {
    $transaction: async () => {
      transactionStarted = true;
    },
  };

  await assert.rejects(
    correctPayment(database, { ...correction, amount: 0 }),
    { statusCode: 400 }
  );
  assert.equal(transactionStarted, false);
});

test('rejects correction attempts by non-admin users', async () => {
  const database = createDatabase({
    id: 'payment-1',
    customerId: 'customer-old',
    bankId: 'bank-old',
    amount: 100,
    date: new Date('2026-10-20T00:00:00.000Z'),
    correctionHistory: null,
  });
  database.database.$transaction = async callback => callback({
    user: { findUnique: async () => ({ role: 'CASHIER' }) },
    payment: {
      findUnique: async () => {
        throw new Error('Payment read must not occur for non-admin users.');
      },
    },
    bank: { update: async () => {} },
  });

  await assert.rejects(correctPayment(database.database, correction), { statusCode: 403 });
});

test('returns null when the payment no longer exists', async () => {
  const database = createDatabase(null);
  assert.equal(await correctPayment(database.database, correction), null);
});
