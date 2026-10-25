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

test('login rejects an older server that authenticates without issuing a user session', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    id: 'admin', username: 'admin', role: 'ADMIN'
  }));
  await assert.rejects(
    createRemoteClient(config).login({ username: 'admin', password: 'test-password' }),
    /حدّث خادم البيانات وأعد تشغيله/
  );
});

test('login rejects empty session responses instead of creating a sessionless authenticated client', async (t) => {
  for (const result of [null, {}, { sessionToken: null }, { sessionToken: '' }, { sessionToken: '   ' }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(result));
    await assert.rejects(
      createRemoteClient(config).login({ username: 'admin', password: 'test-password' }),
      /تثبيت المحطة وحده لا يحدّث الخادم/
    );
  }
});

test('login preserves a compatible server session and surfaces real authentication failures', async (t) => {
  const user = { id: 'admin', role: 'ADMIN', sessionToken: 'signed-session' };
  t.mock.method(globalThis, 'fetch', async () => Response.json(user));
  assert.deepEqual(await createRemoteClient(config).login({ username: 'admin', password: 'test-password' }), user);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Incorrect password' }, { status: 401 }));
  await assert.rejects(
    createRemoteClient(config).login({ username: 'admin', password: 'incorrect' }),
    /Incorrect password/
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
