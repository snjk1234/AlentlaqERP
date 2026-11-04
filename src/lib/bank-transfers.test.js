/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { bankTransferOperation } = require('./bank-transfers');
const { buildBankStatement } = require('./bank-statement');
const { createUserSessionToken } = require('./user-session-token');
const { createRemoteClient } = require('./remote-client');
const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const create = (extra = {}) => ({
  action: 'create', requestId: crypto.randomUUID(), fromBankId: 'a', toBankId: 'b',
  amount: '125.55', date: '2026-01-02', reference: 'REF-123', notes: 'تحويل اختبار', ...extra
});
const reverse = (id, extra = {}) => ({ action: 'reverse', requestId: crypto.randomUUID(), id, reason: 'تصحيح حساب المستلم', ...extra });
function signingEnvironment(t) {
  const previous = process.env.POS_API_TOKEN;
  process.env.POS_API_TOKEN = 'bank-transfer-test-signing';
  t.after(() => {
    if (previous === undefined) delete process.env.POS_API_TOKEN;
    else process.env.POS_API_TOKEN = previous;
  });
}

function store() {
  const state = {
    user: [{ id: 'admin', role: 'ADMIN', name: 'Manager', username: 'admin' }, { id: 'keeper', role: 'STOREKEEPER' }, { id: 'cashier', role: 'CASHIER' }],
    bank: [{ id: 'a', name: 'المصدر', accountNumber: '111', balance: 1000 }, { id: 'b', name: 'المستلم', accountNumber: '222', balance: 100 }],
    bankTransfer: []
  };
  let tail = Promise.resolve();
  let sequence = 0;
  let writes = 0;
  let failAt = 0;
  const client = {};
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  for (const model of Object.keys(state)) {
    const delegate = client[model] = {
      findUnique: async ({ where }) => structuredClone(state[model].find(row => matches(row, where)) || null),
      findMany: async (args = {}) => {
        const rows = state[model].filter(row => matches(row, args.where));
        if (args.orderBy) {
          const [field, direction] = Object.entries(args.orderBy)[0];
          rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
        }
        return structuredClone(rows);
      },
      update: async ({ where, data }) => {
        const row = state[model].find(row => matches(row, where));
        assert.ok(row);
        Object.assign(row, data);
        if (++writes === failAt) throw new Error('Simulated write failure');
        return structuredClone(row);
      },
      create: async ({ data }) => {
        const row = { id: `transfer-${++sequence}`, status: 'POSTED', createdAt: new Date(), updatedAt: new Date(), ...data };
        state[model].push(row);
        if (++writes === failAt) throw new Error('Simulated write failure');
        return structuredClone(row);
      }
    };
    delegate.findFirst = async args => (await delegate.findMany(args))[0] || null;
  }
  client.$transaction = callback => {
    const result = tail.then(async () => {
      const before = structuredClone(state);
      try { return await callback(client); }
      catch (error) { Object.assign(state, before); throw error; }
    });
    tail = result.catch(() => {});
    return result;
  };
  return { client, state, failWrite: number => { writes = 0; failAt = number; } };
}

test('checks the current database role for every transfer action, ignoring forged user identity', async () => {
  const { client, state } = store();
  for (const user of ['keeper', 'cashier', 'missing', undefined]) {
    for (const input of [{ action: 'list', userId: 'admin' }, create({ userId: 'admin', role: 'ADMIN' }), reverse('missing')]) {
      await assert.rejects(bankTransferOperation(client, user, input), { statusCode: 403 });
    }
  }
  state.user[0].role = 'CASHIER';
  await assert.rejects(bankTransferOperation(client, 'admin', create()), { statusCode: 403 });
  assert.equal(state.bankTransfer.length, 0);
});

test('atomically transfers precise cents, keeps total funds and snapshots, and numbers both directions in one sequence', async () => {
  const { client, state } = store();
  const first = await bankTransferOperation(client, 'admin', create({ fromBankName: 'forged', fromBalanceBefore: -1, createdBy: 'cashier' }));
  assert.equal(first.transfer.transferNumber, 'TRF-00000001');
  assert.deepEqual(state.bank.map(bank => bank.balance), [874.45, 225.55]);
  assert.equal(state.bank.reduce((sum, bank) => sum + bank.balance, 0), 1100);
  assert.equal(first.transfer.fromBankName, 'المصدر');
  assert.equal(first.transfer.fromAccountNumber, '111');
  assert.equal(first.transfer.createdBy, 'admin');
  assert.equal(first.transfer.createdByName, 'Manager (admin)');
  assert.deepEqual([first.transfer.fromBalanceBefore, first.transfer.fromBalanceAfter, first.transfer.toBalanceBefore, first.transfer.toBalanceAfter], [1000, 874.45, 100, 225.55]);
  const second = await bankTransferOperation(client, 'admin', create({ fromBankId: 'b', toBankId: 'a', amount: 0.1 + 0.2 }));
  assert.equal(second.transfer.amount, 0.3);
  assert.equal(second.transfer.transferNumber, 'TRF-00000002');
  assert.deepEqual(state.bank.map(bank => bank.balance), [874.75, 225.25]);
  state.bank[0].name = 'اسم جديد';
  assert.equal((await bankTransferOperation(client, 'admin', { action: 'list' })).transfers[1].fromBankName, 'المصدر');
});

test('rejects invalid amounts, missing/same accounts, invalid dates and invalid text without writing', async () => {
  const { client, state } = store();
  for (const amount of ['', null, true, [], {}, NaN, Infinity, -1, 0, '1.001', '1.0000001', 1.0000001, 1e20, '1,000']) {
    await assert.rejects(bankTransferOperation(client, 'admin', create({ amount })), { statusCode: 400 });
  }
  for (const extra of [
    { toBankId: 'a' }, { date: '2026-02-30' }, { date: '2099-01-01' }, { date: 'bad' },
    { requestId: 'bad' }, { reference: 'x'.repeat(256) }, { notes: 'bad\0note' }, { notes: 123 }
  ]) await assert.rejects(bankTransferOperation(client, 'admin', create(extra)), { statusCode: 400 });
  await assert.rejects(bankTransferOperation(client, 'admin', create({ toBankId: 'missing' })), { statusCode: 404 });
  await assert.rejects(bankTransferOperation(client, 'admin', create({ amount: '1000.01' })), { statusCode: 409 });
  assert.equal(state.bankTransfer.length, 0);
  assert.deepEqual(state.bank.map(bank => bank.balance), [1000, 100]);
});

test('legacy floating-point balance noise is normalized without accepting real fractional-cent balances', async () => {
  const { client, state } = store();
  state.bank[0].balance = 999.9999999999;
  state.bank[1].balance = 100.00000000001;
  await bankTransferOperation(client, 'admin', create());
  assert.deepEqual(state.bank.map(bank => bank.balance), [874.45, 225.55]);
  state.bank[0].balance = 874.455;
  await assert.rejects(bankTransferOperation(client, 'admin', create()), { statusCode: 400 });
});

test('concurrent identical retries debit once, conflicting retries fail, and concurrent requests cannot overspend', async () => {
  const { client, state } = store();
  const input = create({ amount: 700 });
  const results = await Promise.all(Array.from({ length: 5 }, () => bankTransferOperation(client, 'admin', input)));
  assert.ok(results.every(result => result.transfer.id === results[0].transfer.id));
  assert.equal(state.bankTransfer.length, 1);
  assert.deepEqual(state.bank.map(bank => bank.balance), [300, 800]);
  for (const extra of [{ amount: 701 }, { date: '2026-01-03' }, { notes: 'different' }, { reference: 'different' }, { toBankId: 'other' }]) {
    await assert.rejects(bankTransferOperation(client, 'admin', { ...input, ...extra }), { statusCode: 409 });
  }
  const more = await Promise.allSettled([create({ amount: 250 }), create({ amount: 250 })].map(data => bankTransferOperation(client, 'admin', data)));
  assert.equal(more.filter(result => result.status === 'fulfilled').length, 1);
  assert.deepEqual(state.bank.map(bank => bank.balance), [50, 1050]);
  assert.equal(state.bankTransfer.length, 2);
});

test('a failure after either balance write or record write rolls everything back', async () => {
  for (const index of [1, 2, 3]) {
    const { client, state, failWrite } = store();
    failWrite(index);
    await assert.rejects(bankTransferOperation(client, 'admin', create()), /Simulated/);
    assert.deepEqual(state.bank.map(bank => bank.balance), [1000, 100]);
    assert.equal(state.bankTransfer.length, 0);
  }
});

test('mutation and retry responses include every concurrent workstation document together with matching balances', async () => {
  const { client, state } = store();
  const input = create({ amount: 100 });
  const first = await bankTransferOperation(client, 'admin', input);
  await bankTransferOperation(client, 'admin', create({ amount: 200 }));
  const replay = await bankTransferOperation(client, 'admin', input);
  assert.equal(replay.transfer.id, first.transfer.id);
  assert.equal(replay.transfers.length, 2);
  const next = await bankTransferOperation(client, 'admin', create({ amount: 50 }));
  assert.equal(next.transfers.length, 3);
  for (const bank of state.bank) {
    const statement = buildBankStatement({ bankId: bank.id, bankBalance: bank.balance, transfers: next.transfers });
    assert.equal(statement.openingBalance, bank.id === 'a' ? 1000 : 100);
    assert.equal(statement.closingBalance, bank.balance);
  }
});

test('concurrent distinct reversal requests create only one reversing document', async () => {
  const { client, state } = store();
  const first = await bankTransferOperation(client, 'admin', create());
  const results = await Promise.allSettled([reverse(first.transfer.id), reverse(first.transfer.id)]
    .map(input => bankTransferOperation(client, 'admin', input)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
  assert.equal(state.bankTransfer.length, 2);
  assert.deepEqual(state.bank.map(bank => bank.balance), [1000, 100]);
});

test('today after local midnight is not treated as future UTC and permits immediate reversal', async t => {
  const previous = process.env.TZ;
  process.env.TZ = 'Africa/Cairo';
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-02T22:30:00Z') });
  const { client } = store();
  const input = create({ date: '2026-01-03' });
  const first = await bankTransferOperation(client, 'admin', input);
  assert.equal(first.transfer.date.getDate(), 3);
  assert.ok(first.transfer.date.getTime() <= Date.now());
  assert.equal((await bankTransferOperation(client, 'admin', input)).transfer.id, first.transfer.id);
  await bankTransferOperation(client, 'admin', reverse(first.transfer.id));
});

test('reversal requires reason and recipient funds, creates an immutable opposite document, and retries/reversals never duplicate it', async () => {
  const { client, state, failWrite } = store();
  const input = create();
  const first = (await bankTransferOperation(client, 'admin', input)).transfer;
  await assert.rejects(bankTransferOperation(client, 'admin', reverse(first.id, { reason: '  ' })), { statusCode: 400 });
  state.bank[1].balance = 100;
  await assert.rejects(bankTransferOperation(client, 'admin', reverse(first.id)), { statusCode: 409 });
  state.bank[1].balance = 225.55;
  failWrite(4);
  await assert.rejects(bankTransferOperation(client, 'admin', reverse(first.id)), /Simulated/);
  assert.equal(state.bankTransfer.length, 1);
  assert.equal(state.bankTransfer[0].status, 'POSTED');
  assert.deepEqual(state.bank.map(bank => bank.balance), [874.45, 225.55]);
  failWrite(0);
  const reversalInput = reverse(first.id);
  const results = await Promise.all([reversalInput, reversalInput].map(data => bankTransferOperation(client, 'admin', data)));
  const reversed = results[0].transfer;
  assert.equal(reversed.id, results[1].transfer.id);
  assert.equal(reversed.reversalOf, first.id);
  assert.equal(reversed.reference, first.transferNumber);
  assert.equal(reversed.notes, reversalInput.reason);
  assert.equal(reversed.fromBankId, first.toBankId);
  assert.equal(reversed.toBankId, first.fromBankId);
  assert.ok(new Date(reversed.date).getTime() >= new Date(first.date).getTime());
  assert.equal(state.bankTransfer[0].status, 'REVERSED');
  assert.deepEqual(state.bank.map(bank => bank.balance), [1000, 100]);
  assert.equal(state.bankTransfer.length, 2);
  await assert.rejects(bankTransferOperation(client, 'admin', reverse(first.id)), { statusCode: 409 });
  await assert.rejects(bankTransferOperation(client, 'admin', reverse(reversed.id)), { statusCode: 409 });
  await assert.rejects(bankTransferOperation(client, 'admin', { ...reversalInput, reason: 'different' }), { statusCode: 409 });
  assert.equal((await bankTransferOperation(client, 'admin', input)).transfer.id, first.id);
  assert.equal(state.bankTransfer.length, 2);
});

test('transfer and reversal remain in both ledgers with same document numbers and correct historical period balances', () => {
  const transfers = [
    { id: 't1', fromBankId: 'a', toBankId: 'b', fromBankName: 'Source', toBankName: 'Target', amount: 250.5,
      date: '2026-01-02T12:00:00', transferNumber: 'TRF-00000001', status: 'REVERSED', notes: 'Original' },
    { id: 't2', fromBankId: 'b', toBankId: 'a', fromBankName: 'Target', toBankName: 'Source', amount: 250.5,
      date: '2026-01-05T12:00:00', transferNumber: 'TRF-00000002', reversalOf: 't1', reference: 'TRF-00000001', notes: 'Reason' }
  ];
  for (const [bankId, balance, sign] of [['a', 1000, -1], ['b', 100, 1]]) {
    const all = buildBankStatement({ bankId, bankBalance: balance, transfers });
    assert.equal(all.openingBalance, balance);
    assert.equal(all.closingBalance, balance);
    assert.equal(all.totalIncoming, 250.5);
    assert.equal(all.totalOutgoing, 250.5);
    assert.deepEqual(all.rows.map(row => row.number), transfers.map(row => row.transferNumber));
    assert.equal(all.rows[0].party, bankId === 'a' ? 'Target' : 'Source');
    assert.match(all.rows[1].type, /عكس تحويل/);
    const period = buildBankStatement({ bankId, bankBalance: balance, transfers, from: '2026-01-02', to: '2026-01-03' });
    assert.equal(period.openingBalance, balance);
    assert.equal(period.closingBalance, balance + sign * 250.5);
    const reversal = buildBankStatement({ bankId, bankBalance: balance, transfers, from: '2026-01-04' });
    assert.equal(reversal.openingBalance, balance + sign * 250.5);
    assert.equal(reversal.closingBalance, balance);
  }
});

function route(client) {
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'bank-transfers', 'route.ts')), {
    exports, process, Error, console: { ...console, error() {} },
    require: id => {
      if (id === '@/lib/prisma') return { prisma: client };
      if (id === '@/lib/bank-transfers') return { bankTransferOperation };
      if (id === '@/lib/user-session-token') return require('./user-session-token');
      if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } };
      throw new Error(id);
    }
  });
  return exports.POST;
}

test('signed API derives identity from session, rejects machine tokens and stale roles, and preserves validation errors', async t => {
  signingEnvironment(t);
  const { client, state } = store();
  const post = route(client);
  const send = (token, data) => post(new Request('http://localhost/api/bank-transfers', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: typeof data === 'string' ? data : JSON.stringify(data)
  }));
  assert.equal((await send(process.env.POS_API_TOKEN, create())).status, 401);
  const admin = createUserSessionToken({ id: 'admin', role: 'ADMIN' });
  assert.equal((await send(admin, '{')).status, 400);
  assert.equal((await send(createUserSessionToken({ id: 'keeper', role: 'STOREKEEPER' }), create({ userId: 'admin' }))).status, 403);
  const ok = await send(admin, create({ userId: 'cashier' }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.transfer.createdBy, 'admin');
  assert.equal((await send(admin, create({ amount: 2000 }))).status, 409);
  state.user[0].role = 'CASHIER';
  assert.equal((await send(admin, { action: 'list' })).status, 403);
});

test('remote transport sends signed user token, preserves status, and exposes no generic transfer delegate', async t => {
  let call;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    call = { url: String(url), options };
    return Response.json({ error: 'Insufficient funds' }, { status: 409 });
  });
  const client = createRemoteClient(() => ({ serverUrl: 'http://localhost:3000', apiToken: 'machine-token' }));
  assert.throws(() => client.bankTransferOperation({ action: 'list' }), /جلسة/);
  await assert.rejects(client.bankTransferOperation(create(), 'signed-token'), { statusCode: 409 });
  assert.equal(call.url, 'http://localhost:3000/api/bank-transfers');
  assert.equal(call.options.headers.authorization, 'Bearer signed-token');
  assert.equal(client.bankTransfer, undefined);
});

test('Electron authenticates the sender rather than the body and transports error status without losing it across contextBridge', async () => {
  const handlers = new Map();
  const calls = [];
  let role = 'ADMIN';
  const client = {
    login: async () => ({ id: 'admin', role, sessionToken: 'real-signed-session' }),
    bankTransferOperation: async (data, token) => { calls.push({ data, token }); throw Object.assign(new Error('No funds'), { statusCode: 409 }); }
  };
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase();', {
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
      if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
      return require(id);
    }, process, Buffer, console: { ...console, error() {} }, __dirname: path.join(root, 'electron')
  });
  const event = { sender: { id: 8123 } };
  assert.equal((await handlers.get('bank-transfer-operation')(event, create())).statusCode, 403);
  await handlers.get('login')(event, { username: 'admin', password: 'test' });
  const data = create({ userId: 'forged', sessionToken: 'forged' });
  const result = await handlers.get('bank-transfer-operation')(event, data);
  assert.equal(result.error, 'No funds');
  assert.equal(result.statusCode, 409);
  assert.equal(calls[0].token, 'real-signed-session');
  role = 'STOREKEEPER';
  await handlers.get('login')(event, { username: 'admin', password: 'test' });
  assert.equal((await handlers.get('bank-transfer-operation')(event, create())).statusCode, 403);
  await handlers.get('logout')(event);
  assert.equal((await handlers.get('bank-transfer-operation')(event, create())).statusCode, 403);
  let bridge;
  vm.runInNewContext(read('electron', 'preload.js'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_, api) => { bridge = api; } },
      ipcRenderer: { invoke: async (name, input) => { assert.equal(name, 'bank-transfer-operation'); assert.equal(input, data); return result; } } })
  });
  assert.equal((await bridge.bankTransferOperation(data)).statusCode, 409);
});

test('proxy accepts only signed sessions and generic database API blocks every transfer operation', async t => {
  signingEnvironment(t);
  const next = { NextResponse: { json: (data, init) => Response.json(data, init), next: () => 'allowed' } };
  const exports = {};
  vm.runInNewContext(compile(read('src', 'proxy.ts')), { exports, process, require: id => id === 'next/server' ? next : require('./user-session-token') });
  const request = token => ({ method: 'POST', nextUrl: { pathname: '/api/bank-transfers' }, headers: new Headers({ authorization: `Bearer ${token}` }) });
  assert.equal(exports.proxy(request(process.env.POS_API_TOKEN)).status, 401);
  assert.equal(exports.proxy(request(createUserSessionToken({ id: 'admin', role: 'ADMIN' }))), 'allowed');
  const dbExports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'db', 'route.ts')), {
    exports: dbExports, process, Buffer, console, require: id => {
      if (id === 'node:crypto') return crypto;
      if (id === 'next/server') return next;
      if (id === '@/lib/access-client') return { modelNames: ['bankTransfer'], runRemoteOperation: () => assert.fail('Protected model was accessed') };
      throw new Error(id);
    }
  });
  for (const operation of ['findMany', 'create', 'update', 'delete', 'upsert']) {
    assert.equal((await dbExports.POST(new Request('http://localhost/api/db', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.POS_API_TOKEN}` },
      body: JSON.stringify({ action: 'operation', modelName: 'bankTransfer', operation })
    }))).status, 403);
  }
});

test('print voucher includes saved accounts, balances, reference, status, reversal linkage, reason and signatures with escaped text', () => {
  const exports = {};
  vm.runInNewContext(compile(read('src', 'components', 'PrintDocuments.tsx')), { exports, require });
  const transfer = {
    ...create(), id: 't1', transferNumber: 'TRF-00000001', fromBankName: 'Source', toBankName: 'Target',
    fromAccountNumber: '111', toAccountNumber: '222', amount: 125.55, status: 'REVERSED', reversedByNumber: 'TRF-00000002',
    createdByName: 'Manager', createdAt: '2026-01-02', fromBalanceBefore: 1000, fromBalanceAfter: 874.45, toBalanceBefore: 100, toBalanceAfter: 225.55,
    notes: '<script>not executable</script>'
  };
  const render = transfer => renderToStaticMarkup(React.createElement(exports.BankTransferPrint, { transfer, onClose() {} }));
  const html = render(transfer);
  for (const text of ['printable-bank-transfer', 'TRF-00000001', 'TRF-00000002', 'Source', 'Target', '111', '222', '125.55', '1,000.00', '874.45', '225.55', 'Manager', 'REF-123', 'توقيع المستلم', 'اعتماد المدير', 'تم عكس']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes('<script>'));
  const reversed = render({ ...transfer, reversalOf: 't1', reference: 'TRF-00000001', status: 'POSTED', notes: 'Wrong bank' });
  for (const text of ['سند عكس تحويل داخلي', 'رقم السند الأصلي', 'سبب العكس', 'Wrong bank']) assert.ok(reversed.includes(text), text);
});

function formHarness(request, original = null) {
  const hooks = [];
  let cursor = 0;
  const fakeReact = { ...React,
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef: value => { const index = cursor++; return hooks[index] || (hooks[index] = { current: value }); }
  };
  const exports = {};
  let completed;
  vm.runInNewContext(compile(read('src', 'components', 'BankTransfersPanel.tsx') + '\nexport { TransferForm };'), {
    exports, Error, crypto, AbortSignal, window: { confirm: () => true },
    require: id => {
      if (id === 'react') return fakeReact;
      if (id === './MoneyInput') return { default: 'money-input' };
      if (id === '../lib/money-format') return require('./money-format');
      return require(id);
    }
  });
  const render = () => { cursor = 0; return exports.TransferForm({
    banks: store().state.bank, sourceId: 'a', original, request, onCompleted: result => { completed = result; }, onClose() {}
  }); };
  return { render, completed: () => completed };
}
const elements = tree => tree && typeof tree === 'object' ? [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)] : [];

test('UI preserves and locks an uncertain payload and retries with the same id, blocking double-click execution', async () => {
  const calls = [];
  let finish;
  const harness = formHarness(async input => {
    calls.push(structuredClone(input));
    if (calls.length === 1) throw new Error('Network disconnected after commit');
    return new Promise(resolve => { finish = resolve; });
  });
  let tree = harness.render();
  elements(tree).filter(node => node.type === 'select')[1].props.onChange({ target: { value: 'b' } });
  elements(tree).find(node => node.props?.onValueChange).props.onValueChange('100');
  tree = harness.render();
  const submit = () => elements(harness.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await submit();
  tree = harness.render();
  assert.ok(elements(tree).filter(node => node.type === 'select').every(node => node.props.disabled));
  assert.ok(elements(tree).find(node => node.type === 'button' && node.props.children === 'إلغاء').props.disabled);
  const retry = submit();
  await submit();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  finish({ transfer: { id: 'persisted' } });
  await retry;
  assert.equal(harness.completed().transfer.id, 'persisted');
});

test('UI exposes definite rejection and retains editable form and generates a fresh key only for a rejected request', async () => {
  const calls = [];
  const harness = formHarness(async input => {
    calls.push(input);
    throw Object.assign(new Error('رصيد غير كاف'), { statusCode: 409 });
  });
  let tree = harness.render();
  elements(tree).filter(node => node.type === 'select')[1].props.onChange({ target: { value: 'b' } });
  elements(tree).find(node => node.props?.onValueChange).props.onValueChange('100');
  await elements(harness.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = harness.render();
  assert.ok(!elements(tree).filter(node => node.type === 'select')[0].props.disabled);
  assert.ok(elements(tree).some(node => node.props?.role === 'alert' && String(node.props.children).includes('رصيد غير كاف')));
  await elements(harness.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.notEqual(calls[0].requestId, calls[1].requestId);
});

test('UI reversal is notes-required, locks amount/accounts, sends the original id and retains reason after rejection', async () => {
  const { client } = store();
  const original = (await bankTransferOperation(client, 'admin', create())).transfer;
  const calls = [];
  const harness = formHarness(async input => {
    calls.push(input);
    throw Object.assign(new Error('Insufficient recipient funds'), { statusCode: 409 });
  }, original);
  let tree = harness.render();
  assert.ok(elements(tree).filter(node => node.type === 'select').every(node => node.props.disabled));
  assert.ok(elements(tree).find(node => node.props?.onValueChange).props.disabled);
  const reason = elements(tree).find(node => node.props?.['aria-label'] === 'سبب عكس التحويل');
  assert.equal(reason.props.required, true);
  reason.props.onChange({ target: { value: 'Correct wrong recipient' } });
  await elements(harness.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0].action, 'reverse');
  assert.equal(calls[0].id, original.id);
  assert.equal(calls[0].reason, 'Correct wrong recipient');
  assert.equal(calls[0].amount, undefined);
  tree = harness.render();
  assert.equal(elements(tree).find(node => node.props?.['aria-label'] === 'سبب عكس التحويل').props.value, 'Correct wrong recipient');
  assert.equal(harness.completed(), undefined);
});

test('panel replaces stale history with server snapshot after a mutation and uses newly added account props', () => {
  const banks = [...store().state.bank, { id: 'new-bank', name: 'New account', balance: 0 }];
  const oldSnapshot = { banks: banks.slice(0, 2), transfers: [] };
  const result = { banks, transfers: [{ id: 'other-station' }, { id: 'saved' }], transfer: { id: 'saved' } };
  let index = 0;
  let snapshot;
  let printing;
  const exports = {};
  vm.runInNewContext(compile(read('src', 'components', 'BankTransfersPanel.tsx')), {
    exports, require: id => {
      if (id === 'react') return { ...React, useEffect() {}, useCallback: fn => fn,
        useState: initial => [index++ === 0 ? oldSnapshot : initial, () => {}] };
      if (id === './MoneyInput') return { default: 'money-input' };
      if (id === '../lib/money-format') return require('./money-format');
      return require(id);
    }
  });
  const tree = exports.default({ user: { role: 'ADMIN' }, banks, onSnapshot: value => { snapshot = value; },
    onLoading() {}, onPrint: value => { printing = value; }, launch: '', onCloseLaunch() {} });
  const form = elements(tree).find(node => typeof node.type === 'function' && node.type.name === 'TransferForm');
  assert.equal(form.props.banks.length, 3);
  form.props.onCompleted(result);
  assert.equal(snapshot.transfers, result.transfers);
  assert.equal(snapshot.banks, banks);
  assert.equal(printing.id, 'saved');
});

test('Access persists transfers/reversals, unique idempotency, foreign keys and rollback in an isolated database',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-bank-transfer-test-'));
    const databasePath = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = databasePath;
    const database = createAccessClient();
    try {
      const suffix = Date.now();
      const user = await database.user.create({ data: { username: `transfer-admin-${suffix}`, name: 'مدير التحويلات', password: 'test-password', role: 'ADMIN' } });
      const a = await database.bank.create({ data: { name: `المصدر ${suffix}`, balance: 1000, accountNumber: '111' } });
      const b = await database.bank.create({ data: { name: `المستلم ${suffix}`, balance: 100, accountNumber: '222' } });
      const input = create({ fromBankId: a.id, toBankId: b.id, reference: '', notes: 'ملاحظات تحويل\nسطر ثان' });
      const first = await bankTransferOperation(database, user.id, input);
      assert.equal(first.transfer.reference, null);
      assert.equal(first.transfer.reversalOf, null);
      assert.equal(first.transfer.fromBalanceAfter, 874.45);
      await database.$disconnect();
      const reloaded = await database.bankTransfer.findUnique({ where: { id: first.transfer.id } });
      assert.equal(reloaded.notes, input.notes);
      assert.equal(reloaded.createdAt.toISOString(), first.transfer.createdAt.toISOString());
      assert.equal((await bankTransferOperation(database, user.id, input)).transfer.id, reloaded.id);
      await assert.rejects(database.bankTransfer.create({ data: { ...reloaded, id: crypto.randomUUID(), transferNumber: 'TRF-99999999' } }), { code: 'P2002' });
      await assert.rejects(database.bank.delete({ where: { id: a.id } }));
      const failing = { ...database, $transaction: callback => database.$transaction(tx => callback({
        ...tx, bankTransfer: { ...tx.bankTransfer, create: async () => { throw new Error('Simulated final insert failure'); } }
      })) };
      await assert.rejects(bankTransferOperation(failing, user.id, { ...input, requestId: crypto.randomUUID() }), /Simulated/);
      assert.equal((await database.bank.findUnique({ where: { id: a.id } })).balance, 874.45);
      assert.equal((await database.bank.findUnique({ where: { id: b.id } })).balance, 225.55);
      const reverseInput = reverse(reloaded.id);
      const reversed = await bankTransferOperation(database, user.id, reverseInput);
      await database.$disconnect();
      assert.equal((await bankTransferOperation(database, user.id, reverseInput)).transfer.id, reversed.transfer.id);
      assert.equal((await database.bank.findUnique({ where: { id: a.id } })).balance, 1000);
      assert.equal((await database.bank.findUnique({ where: { id: b.id } })).balance, 100);
      assert.equal((await database.bankTransfer.findUnique({ where: { id: reloaded.id } })).status, 'REVERSED');
      const listing = await bankTransferOperation(database, user.id, { action: 'list' });
      for (const bank of [a, b]) {
        const statement = buildBankStatement({ bankId: bank.id, bankBalance: bank.balance, transfers: listing.transfers });
        assert.equal(statement.openingBalance, bank.balance);
        assert.equal(statement.closingBalance, bank.balance);
        assert.equal(statement.rows.length, 2);
      }
    } finally {
      await database.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previous;
      fs.unlinkSync(databasePath);
      const lock = path.join(directory, 'test.laccdb');
      if (fs.existsSync(lock)) fs.unlinkSync(lock);
      fs.rmdirSync(directory);
    }
  });
