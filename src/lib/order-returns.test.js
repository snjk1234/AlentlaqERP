/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calculateRefundAmount, createOrderReturn, customerAccountBalance } = require('./order-returns');

function createStore({ openingBalance = 0, payments = [], customerId = 'customer' } = {}) {
  const state = {
    order: {
      id: 'order-1', invoiceNumber: 'INV-2026-00001', isQuotation: false, status: 'COMPLETED',
      customerId, netAmount: 57,
      items: [{
        id: 'order-item-1', productId: 'product-1', quantity: 5, unitPrice: 10,
        taxAmount: 7, total: 57, product: { id: 'product-1', name: 'صنف' }
      }]
    },
    customer: { id: customerId, openingBalance, orders: [{ isQuotation: false, netAmount: 57 }], payments, orderReturns: [] },
    stock: 10,
    delivered: 5,
    bankBalance: 500,
    returns: []
  };
  const client = {
    order: { findUnique: async () => state.order },
    orderReturn: {
      findMany: async () => state.returns,
      count: async () => state.returns.length,
      create: async ({ data }) => {
        const created = {
          id: `return-${state.returns.length + 1}`,
          ...data,
          items: data.items.create.map((item, index) => ({
            id: `return-item-${state.returns.length + 1}-${index + 1}`,
            ...item,
            product: { id: item.productId, name: 'صنف' },
            orderItem: state.order.items[0]
          })),
          order: state.order,
          customer: state.customer,
          bank: data.bankId ? { id: data.bankId, name: 'بنك' } : null
        };
        state.returns.push(created);
        state.customer.orderReturns = state.returns;
        return created;
      }
    },
    customer: { findUnique: async () => state.customer },
    bank: {
      findUnique: async ({ where }) => where.id === 'bank-1' ? { id: 'bank-1', balance: state.bankBalance } : null,
      update: async ({ data }) => { state.bankBalance -= data.balance.decrement; }
    },
    product: { update: async ({ data }) => { state.stock += data.stockQty.increment; } },
    customerCeilingQuota: {
      findUnique: async () => ({ id: 'quota-1', deliveredQuantity: state.delivered }),
      update: async ({ data }) => { state.delivered -= data.deliveredQuantity.decrement; }
    },
    $transaction: async callback => {
      const snapshot = structuredClone(state);
      try {
        return await callback(client);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    }
  };
  return { client, state };
}

test('refund calculation first clears customer debt and only refunds excess', () => {
  assert.equal(calculateRefundAmount(300, 100), 200);
  assert.equal(calculateRefundAmount(100, 300), 0);
  assert.equal(calculateRefundAmount(100, -50), 100);
  assert.equal(customerAccountBalance({
    openingBalance: 20,
    orders: [{ netAmount: 100 }, { netAmount: 500, isQuotation: true }],
    payments: [{ amount: 30 }],
    orderReturns: [{ netAmount: 14, refundAmount: 2 }]
  }), 78);
});

test('allows separate partial returns up to the original quantity and updates stock once per return', async () => {
  const { client, state } = createStore();
  const first = await createOrderReturn(client, {
    orderId: 'order-1', items: [{ orderItemId: 'order-item-1', quantity: 2 }]
  });
  const second = await createOrderReturn(client, {
    orderId: 'order-1', items: [{ orderItemId: 'order-item-1', quantity: 3 }]
  });
  assert.equal(first.returnNumber, 'RET-2026-00001');
  assert.equal(second.returnNumber, 'RET-2026-00002');
  assert.equal(first.netAmount, 22.8);
  assert.equal(second.netAmount, 34.2);
  assert.equal(state.stock, 15);
  assert.equal(state.delivered, 0);
});

test('separate partial returns preserve the original line value and tax despite cent rounding', async () => {
  const { client, state } = createStore();
  state.order.netAmount = 1.01;
  state.order.items[0] = {
    id: 'order-item-1', productId: 'product-1', quantity: 3, unitPrice: 0.333,
    taxAmount: 0.01, total: 1.01, product: { id: 'product-1', name: 'صنف' }
  };
  state.customer.orders[0].netAmount = 1.01;
  const returns = [];
  for (let index = 0; index < 3; index += 1) {
    returns.push(await createOrderReturn(client, {
      orderId: 'order-1', items: [{ orderItemId: 'order-item-1', quantity: 1 }]
    }));
  }
  assert.equal(returns.reduce((sum, item) => sum + item.totalAmount, 0), 1);
  assert.equal(returns.reduce((sum, item) => sum + item.taxAmount, 0), 0.01);
  assert.equal(returns.reduce((sum, item) => sum + item.netAmount, 0), 1.01);
});

test('rejects cumulative returned quantity above the invoice quantity without changing stock', async () => {
  const { client, state } = createStore();
  await createOrderReturn(client, { orderId: 'order-1', items: [{ orderItemId: 'order-item-1', quantity: 4 }] });
  await assert.rejects(
    createOrderReturn(client, { orderId: 'order-1', items: [{ orderItemId: 'order-item-1', quantity: 2 }] }),
    /تتجاوز الكمية المتبقية/
  );
  assert.equal(state.returns.length, 1);
  assert.equal(state.stock, 14);
});

test('refunds only the amount above customer debt and reduces the selected bank', async () => {
  const { client, state } = createStore({ payments: [{ amount: 50 }] });
  const orderReturn = await createOrderReturn(client, {
    orderId: 'order-1',
    items: [{ orderItemId: 'order-item-1', quantity: 2 }],
    refundMethod: 'BANK',
    bankId: 'bank-1'
  });
  assert.equal(orderReturn.refundAmount, 15.8);
  assert.equal(orderReturn.refundMethod, 'BANK');
  assert.equal(state.bankBalance, 484.2);
  assert.equal(customerAccountBalance(state.customer), 0);
});

test('requires a refund method only when a cash or bank refund is due', async () => {
  const { client } = createStore({ payments: [{ amount: 50 }] });
  await assert.rejects(
    createOrderReturn(client, { orderId: 'order-1', items: [{ orderItemId: 'order-item-1', quantity: 2 }] }),
    /اختر طريقة رد المبلغ/
  );
});

test('rolls back the return and inventory when the bank refund update fails', async () => {
  const { client, state } = createStore({ payments: [{ amount: 50 }] });
  client.bank.update = async () => { throw new Error('Bank update failed'); };
  await assert.rejects(
    createOrderReturn(client, {
      orderId: 'order-1',
      items: [{ orderItemId: 'order-item-1', quantity: 2 }],
      refundMethod: 'BANK',
      bankId: 'bank-1'
    }),
    /Bank update failed/
  );
  assert.equal(state.returns.length, 0);
  assert.equal(state.stock, 10);
  assert.equal(state.delivered, 5);
});
