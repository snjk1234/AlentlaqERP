/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAccountDiscount, discountLimit } = require('./account-discounts');
const { customerAccountBalance } = require('./order-returns');

const requestId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

function createStore() {
  const state = {
    customer: {
      id: 'customer-1', openingBalance: 100,
      orders: [{ netAmount: 50 }, { netAmount: 900, isQuotation: true }],
      payments: [{ amount: 20 }],
      orderReturns: [{ netAmount: 10, refundAmount: 5 }],
      discounts: []
    },
    supplier: { id: 'supplier-1', balance: 200 },
    bankBalance: 500,
    discounts: []
  };
  const tx = {
    customer: {
      findUnique: async ({ where, include }) => {
        assert.equal(include.discounts, true);
        return where.id === state.customer.id ? state.customer : null;
      }
    },
    supplier: {
      findUnique: async ({ where }) => where.id === state.supplier.id ? state.supplier : null,
      update: async ({ data }) => { state.supplier.balance -= data.balance.decrement; }
    },
    accountDiscount: {
      findUnique: async ({ where }) => state.discounts.find(entry => entry.requestId === where.requestId) || null,
      count: async () => state.discounts.length,
      create: async ({ data }) => {
        const discount = { id: `discount-${state.discounts.length + 1}`, ...data };
        state.discounts.push(discount);
        if (discount.customerId) state.customer.discounts.push(discount);
        return discount;
      }
    }
  };
  const client = {
    $transaction: async callback => {
      const snapshot = structuredClone(state);
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    }
  };
  return { client, tx, state };
}

test('allowed discounts reduce the customer account without changing cash and retries are idempotent', async () => {
  const { client, state } = createStore();
  const input = {
    kind: 'ALLOWED', accountId: 'customer-1', amount: '25.00',
    requestId: requestId(1), notes: '  خصم تسوية  '
  };
  const discount = await createAccountDiscount(client, input);
  assert.equal(discount.kind, 'ALLOWED');
  assert.equal(discount.customerId, 'customer-1');
  assert.equal(discount.supplierId, null);
  assert.equal(discount.amount, 25);
  assert.equal(discount.notes, 'خصم تسوية');
  assert.match(discount.discountNumber, /^DSC-\d{4}-00001$/);
  assert.equal(customerAccountBalance(state.customer), 100);
  assert.equal(state.bankBalance, 500);
  assert.equal((await createAccountDiscount(client, input)).id, discount.id);
  assert.equal(state.discounts.length, 1);
  await assert.rejects(
    createAccountDiscount(client, { ...input, amount: 26 }),
    /ببيانات مختلفة/
  );
  assert.equal(state.discounts.length, 1);
});

test('earned discounts reduce supplier debt once and do not change the bank', async () => {
  const { client, state } = createStore();
  const input = { kind: 'EARNED', accountId: 'supplier-1', amount: 50, requestId: requestId(2) };
  const discount = await createAccountDiscount(client, input);
  assert.equal(discount.supplierId, 'supplier-1');
  assert.equal(discount.customerId, null);
  assert.equal(state.supplier.balance, 150);
  assert.equal(state.bankBalance, 500);
  await createAccountDiscount(client, input);
  assert.equal(state.supplier.balance, 150);
  assert.equal(state.discounts.length, 1);
});

test('rejects discounts beyond current debt, including zero and credit balances', async () => {
  const { client, state } = createStore();
  assert.equal(customerAccountBalance(state.customer), 125);
  await assert.rejects(
    createAccountDiscount(client, { kind: 'ALLOWED', accountId: 'customer-1', amount: 125.01, requestId: requestId(3) }),
    /الحد الأقصى 125\.00/
  );
  await createAccountDiscount(client, { kind: 'ALLOWED', accountId: 'customer-1', amount: 125, requestId: requestId(4) });
  await assert.rejects(
    createAccountDiscount(client, { kind: 'ALLOWED', accountId: 'customer-1', amount: 0.01, requestId: requestId(5) }),
    /الحد الأقصى 0\.00/
  );
  state.supplier.balance = -10;
  await assert.rejects(
    createAccountDiscount(client, { kind: 'EARNED', accountId: 'supplier-1', amount: 0.01, requestId: requestId(6) }),
    /الحد الأقصى 0\.00/
  );
  assert.equal(state.discounts.length, 1);
});

test('validates amount precision, identifiers, parties and notes', async () => {
  const { client, state } = createStore();
  const valid = { kind: 'ALLOWED', accountId: 'customer-1', amount: 1, requestId: requestId(7) };
  for (const amount of [0, -1, NaN, Infinity, 0.001, 5.005, '', null, {}, true]) {
    await assert.rejects(createAccountDiscount(client, { ...valid, amount }), { code: 'ACCOUNT_DISCOUNT_INVALID' });
  }
  for (const patch of [
    { kind: 'UNKNOWN' }, { accountId: '' }, { accountId: 'missing' },
    { requestId: 'not-a-uuid' }, { notes: 42 }, { notes: 'x'.repeat(501) }
  ]) {
    await assert.rejects(createAccountDiscount(client, { ...valid, ...patch }), { code: 'ACCOUNT_DISCOUNT_INVALID' });
  }
  assert.equal(discountLimit(100.009), 100);
  assert.equal(discountLimit(100.01), 100.01);
  assert.equal(state.discounts.length, 0);
});

test('rolls back the discount if updating supplier debt fails', async () => {
  const { client, tx, state } = createStore();
  tx.supplier.update = async () => { throw new Error('Supplier update failed'); };
  await assert.rejects(
    createAccountDiscount(client, { kind: 'EARNED', accountId: 'supplier-1', amount: 50, requestId: requestId(8) }),
    /Supplier update failed/
  );
  assert.equal(state.discounts.length, 0);
  assert.equal(state.supplier.balance, 200);
  assert.equal(state.bankBalance, 500);
});
