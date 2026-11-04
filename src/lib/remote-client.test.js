/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRemoteClient } = require('./remote-client');

const config = () => ({ serverUrl: 'http://localhost:3000', apiToken: 'test-token' });

test('remote database errors preserve constraint codes', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: 'The record conflicts with a unique or relationship constraint.',
    code: 'P2002'
  }, { status: 500 }));

  await assert.rejects(
    createRemoteClient(config).bank.create({ data: { name: 'Existing bank' } }),
    { code: 'P2002', message: 'The record conflicts with a unique or relationship constraint.' }
  );
});

test('remote database errors without codes still report the server message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: 'Access database operation failed.'
  }, { status: 500 }));

  await assert.rejects(
    createRemoteClient(config).bank.create({ data: { name: 'New bank' } }),
    { message: 'Access database operation failed.' }
  );
});

test('successful bank creation returns the server data unchanged', async (t) => {
  const bank = { id: 'bank-id', name: 'New bank', balance: 1000 };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: bank }));

  assert.deepEqual(
    await createRemoteClient(config).bank.create({ data: { name: bank.name, balance: bank.balance } }),
    bank
  );
});

test('creating an invoice return calls the dedicated authenticated server endpoint', async (t) => {
  const orderReturn = { id: 'return-id', returnNumber: 'RET-2026-00001' };
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ data: orderReturn }, { status: 201 });
  });

  assert.deepEqual(
    await createRemoteClient(config).createOrderReturn({ orderId: 'order-id' }),
    orderReturn
  );
  assert.equal(request.url, 'http://localhost:3000/api/order-returns');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer test-token');
});

test('creating an account discount calls the dedicated server endpoint', async (t) => {
  const discount = { id: 'discount-id', discountNumber: 'DSC-2026-00001' };
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ data: discount }, { status: 201 });
  });

  assert.deepEqual(
    await createRemoteClient(config).createAccountDiscount({ kind: 'ALLOWED', accountId: 'customer-id' }),
    discount
  );
  assert.equal(request.url, 'http://localhost:3000/api/discounts');
  assert.equal(request.options.method, 'POST');
  assert.equal(JSON.parse(request.options.body).accountId, 'customer-id');
});
