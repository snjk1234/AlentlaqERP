/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { createAccountDiscount, discountLimit } = require('./account-discounts');
const { customerAccountBalance } = require('./order-returns');
const { createUserSessionToken } = require('./user-session-token');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const requestId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

function createStore() {
  const state = {
    users: [
      { id: 'admin', role: 'ADMIN' },
      { id: 'cashier', role: 'CASHIER' },
      { id: 'keeper', role: 'STOREKEEPER' }
    ],
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
    user: { findUnique: async ({ where }) => state.users.find(user => user.id === where.id) || null },
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
      try { return await callback(tx); }
      catch (error) { Object.assign(state, snapshot); throw error; }
    }
  };
  return { client, tx, state };
}

test('allowed and earned vouchers lower only their account and retries are idempotent', async () => {
  const { client, state } = createStore();
  const customerInput = { kind: 'ALLOWED', accountId: 'customer-1', amount: '25.00', requestId: requestId(1), notes: '  خصم تسوية  ' };
  const customerDiscount = await createAccountDiscount(client, 'cashier', customerInput);
  assert.equal(customerDiscount.customerId, 'customer-1');
  assert.equal(customerDiscount.supplierId, null);
  assert.equal(customerDiscount.amount, 25);
  assert.equal(customerDiscount.notes, 'خصم تسوية');
  assert.match(customerDiscount.discountNumber, /^DSC-\d{4}-00001$/);
  assert.equal(customerAccountBalance(state.customer), 100);
  assert.equal((await createAccountDiscount(client, 'cashier', customerInput)).id, customerDiscount.id);
  await assert.rejects(createAccountDiscount(client, 'cashier', { ...customerInput, amount: 26 }), /ببيانات مختلفة/);

  const supplierInput = { kind: 'EARNED', accountId: 'supplier-1', amount: 50, requestId: requestId(2) };
  const supplierDiscount = await createAccountDiscount(client, 'keeper', supplierInput);
  assert.equal(supplierDiscount.supplierId, 'supplier-1');
  assert.equal(supplierDiscount.customerId, null);
  assert.equal((await createAccountDiscount(client, 'keeper', supplierInput)).id, supplierDiscount.id);
  assert.equal(state.supplier.balance, 150);
  assert.equal(state.bankBalance, 500);
  assert.equal(state.discounts.length, 2);
});

test('current server-side roles authorize each type, including idempotent retries', async () => {
  for (const [userId, kind, allowed] of [
    ['admin', 'ALLOWED', true], ['admin', 'EARNED', true],
    ['cashier', 'ALLOWED', true], ['cashier', 'EARNED', false],
    ['keeper', 'ALLOWED', false], ['keeper', 'EARNED', true],
    ['missing', 'ALLOWED', false], ['missing', 'EARNED', false]
  ]) {
    const { client, state } = createStore();
    const input = {
      kind, accountId: kind === 'ALLOWED' ? 'customer-1' : 'supplier-1', amount: 1,
      requestId: requestId(3), userId: 'admin', role: 'ADMIN'
    };
    if (allowed) {
      await createAccountDiscount(client, userId, input);
      state.users.find(user => user.id === userId).role = 'DISABLED';
      await assert.rejects(createAccountDiscount(client, userId, input), { statusCode: 403 });
      assert.equal(state.discounts.length, 1);
    } else {
      await assert.rejects(createAccountDiscount(client, userId, input), { statusCode: 403 });
      assert.equal(state.discounts.length, 0);
    }
  }
});

test('enforces the actual remaining balance and validates amounts, parties, request IDs and notes', async () => {
  const { client, state } = createStore();
  assert.equal(customerAccountBalance(state.customer), 125);
  const valid = { kind: 'ALLOWED', accountId: 'customer-1', amount: 1, requestId: requestId(4) };
  for (const amount of [0, -1, NaN, Infinity, 0.001, 5.005, '', null, {}, true]) {
    await assert.rejects(createAccountDiscount(client, 'admin', { ...valid, amount }), { code: 'ACCOUNT_DISCOUNT_INVALID' });
  }
  for (const patch of [
    { kind: 'UNKNOWN' }, { accountId: '' }, { accountId: 'missing' }, { requestId: 'invalid' },
    { notes: 42 }, { notes: 'x'.repeat(501) }, { notes: 'bad\0notes' }
  ]) {
    await assert.rejects(createAccountDiscount(client, 'admin', { ...valid, ...patch }), { code: 'ACCOUNT_DISCOUNT_INVALID' });
  }
  await assert.rejects(createAccountDiscount(client, 'admin', { ...valid, amount: 125.01 }), /الحد الأقصى 125\.00/);
  await createAccountDiscount(client, 'admin', { ...valid, amount: 125 });
  await assert.rejects(createAccountDiscount(client, 'admin', { ...valid, amount: 0.01, requestId: requestId(5) }), /الحد الأقصى 0\.00/);
  state.supplier.balance = -10;
  await assert.rejects(createAccountDiscount(client, 'admin', {
    kind: 'EARNED', accountId: 'supplier-1', amount: 0.01, requestId: requestId(6)
  }), /الحد الأقصى 0\.00/);
  await assert.rejects(createAccountDiscount(client, 'keeper', {
    kind: 'EARNED', accountId: 'supplier-1', amount: 0.01, requestId: requestId(7)
  }), error => error.message.includes('يتجاوز') && !error.message.includes('0.00'));
  assert.equal(discountLimit(100.009), 100);
  assert.equal(discountLimit(100.01), 100.01);
  assert.equal(state.discounts.length, 1);
});

test('rolls back the voucher when updating supplier debt fails', async () => {
  const { client, tx, state } = createStore();
  tx.supplier.update = async () => { throw new Error('Supplier update failed'); };
  await assert.rejects(createAccountDiscount(client, 'admin', {
    kind: 'EARNED', accountId: 'supplier-1', amount: 50, requestId: requestId(8)
  }), /Supplier update failed/);
  assert.equal(state.discounts.length, 0);
  assert.equal(state.supplier.balance, 200);
  assert.equal(state.bankBalance, 500);
});

test('discount API and proxy require signed sessions and ignore a forged actor', async t => {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'discount-route-test';
  t.after(() => { if (previous === undefined) delete process.env.POS_API_TOKEN; else process.env.POS_API_TOKEN = previous; });
  const { client, state } = createStore();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'discounts', 'route.ts')), {
    exports, process, Error, console: { error() {} }, require: name => {
      if (name === '@/lib/prisma') return { prisma: client };
      if (name === '@/lib/account-discounts') return { createAccountDiscount };
      if (name === '@/lib/user-session-token') return require('./user-session-token');
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      throw new Error(name);
    }
  });
  const customerInput = { kind: 'ALLOWED', accountId: 'customer-1', amount: 5, requestId: requestId(9), userId: 'admin' };
  const supplierInput = { kind: 'EARNED', accountId: 'supplier-1', amount: 5, requestId: requestId(10), userId: 'admin' };
  const send = (token, input) => exports.POST(new Request('http://localhost/api/discounts', {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
    body: typeof input === 'string' ? input : JSON.stringify(input)
  }));
  const cashier = createUserSessionToken({ id: 'cashier', role: 'CASHIER' });
  const forgedRole = createUserSessionToken({ id: 'cashier', role: 'ADMIN' });
  assert.equal((await send(process.env.POS_API_TOKEN, customerInput)).status, 401);
  assert.equal((await send(cashier, '{')).status, 400);
  assert.equal((await send(forgedRole, supplierInput)).status, 403);
  assert.equal(state.discounts.length, 0);
  const saved = await send(cashier, customerInput);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).data.customerId, 'customer-1');
  assert.equal((await send(cashier, { ...customerInput, amount: 1000, requestId: requestId(11) })).status, 400);

  const proxy = {};
  vm.runInNewContext(compile(read('src', 'proxy.ts')), {
    exports: proxy, process, require: name => name === 'next/server'
      ? { NextResponse: { json: (body, options) => Response.json(body, options), next: () => 'allowed' } }
      : require('./user-session-token')
  });
  const request = token => ({ method: 'POST', nextUrl: { pathname: '/api/discounts' }, headers: new Headers({ authorization: `Bearer ${token}` }) });
  assert.equal(proxy.proxy(request(process.env.POS_API_TOKEN)).status, 401);
  assert.equal(proxy.proxy(request(cashier)), 'allowed');
});

test('generic database API blocks direct discount operations', async t => {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'discount-db-test';
  t.after(() => { if (previous === undefined) delete process.env.POS_API_TOKEN; else process.env.POS_API_TOKEN = previous; });
  const exports = {};
  let called = false;
  vm.runInNewContext(compile(read('src', 'app', 'api', 'db', 'route.ts')), {
    exports, process, Buffer, Error, console: { error() {} }, require: name => {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      if (name === '@/lib/access-client') return {
        modelNames: ['accountDiscount'], runRemoteOperation: () => { called = true; }
      };
      return require(name);
    }
  });
  for (const operation of ['findMany', 'create', 'update', 'delete', 'upsert']) {
    const response = await exports.POST(new Request('http://localhost/api/db', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.POS_API_TOKEN}` },
      body: JSON.stringify({ action: 'operation', modelName: 'accountDiscount', operation, args: {} })
    }));
    assert.equal(response.status, 403);
  }
  assert.equal(called, false);
});

test('Electron binds voucher operations to the logged-in sender and session', async () => {
  const handlers = new Map();
  const calls = [];
  vm.runInNewContext(read('electron', 'main.js') + `
    initializeDatabase();
    authenticatedUsers.set(1, { id: "cashier", role: "CASHIER", sessionToken: "cashier-session" });
    authenticatedUsers.set(2, { id: "keeper", role: "STOREKEEPER", sessionToken: "keeper-session" });
  `, {
    process, Buffer, console: { error() {} }, __dirname: path.join(root, 'electron'), require: name => {
      if (name === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (name === '../src/lib/remote-client') return {
        createRemoteClient: () => ({ createAccountDiscount: async (data, token) => { calls.push({ data, token }); return { id: 'saved' }; } })
      };
      if (name.startsWith('../src/lib/')) return require(path.join(root, name.slice(3)));
      return require(name);
    }
  });
  const invoke = (sender, kind) => handlers.get('create-account-discount')(
    { sender: { id: sender } }, { kind, userId: 'admin', role: 'ADMIN' }
  );
  await assert.rejects(invoke(99, 'ALLOWED'), /صلاحية/);
  await assert.rejects(invoke(1, 'EARNED'), /صلاحية/);
  await assert.rejects(invoke(2, 'ALLOWED'), /صلاحية/);
  await invoke(1, 'ALLOWED');
  await invoke(2, 'EARNED');
  assert.deepEqual(calls.map(call => call.token), ['cashier-session', 'keeper-session']);
  assert.ok(read('electron', 'preload.js').includes("ipcRenderer.invoke('create-account-discount', data)"));
});
