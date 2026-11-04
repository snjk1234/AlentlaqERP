/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const quietConsole = { ...console, error() {} };

function bankStore() {
  const bank = { id: 'existing-bank', name: 'Bank', accountNumber: null, balance: 100 };
  const calls = [];
  return {
    bank,
    calls,
    prisma: {
      bank: {
        create: async ({ data }) => {
          calls.push('create');
          return { id: 'new-bank', ...data };
        },
        update: async ({ where, data }) => {
          calls.push('update');
          assert.equal(where.id, bank.id);
          if (data.name === 'Other bank') {
            throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
          }
          Object.assign(bank, data);
          return bank;
        }
      }
    }
  };
}

test('bank API updates the existing ID and still supports creating a new bank', async () => {
  const store = bankStore();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'banks', 'route.ts')), {
    exports, Error, console: quietConsole,
    require: (id) => {
      if (id === '@/lib/prisma') return { prisma: store.prisma };
      if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      throw new Error(`Unexpected import: ${id}`);
    }
  });
  const request = (body) => new Request('http://localhost/api/banks', {
    method: 'PUT', body: JSON.stringify(body)
  });
  let response = await exports.PUT(request({ ...store.bank, balance: 1000 }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 'existing-bank');
  assert.equal(store.bank.balance, 1000);
  assert.deepEqual(store.calls, ['update']);
  response = await exports.PUT(request({ name: 'Bank', balance: 1000 }));
  assert.equal(response.status, 400);
  response = await exports.PUT(request({ ...store.bank, name: 'Other bank' }));
  assert.equal(response.status, 409);
  response = await exports.POST(request({ name: 'New bank', balance: 0 }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 'new-bank');
});

test('Electron exposes and executes update-bank without creating a bank', async () => {
  const store = bankStore();
  const handlers = new Map();
  const electron = {
    app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (id, callback) => handlers.set(id, callback), on() {} },
    protocol: { registerSchemesAsPrivileged() {} }
  };
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase();', {
    require: (id) => {
      if (id === 'electron') return electron;
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => store.prisma };
      if (id === '../src/lib/customer-prices') return require('./customer-prices');
      if (id.startsWith('../src/lib/')) return require(id.replace('../src/lib/', './'));
      return require(id);
    },
    process, Error, Buffer, console: quietConsole, __dirname: path.join(root, 'electron')
  });
  let bridge;
  vm.runInNewContext(read('electron', 'preload.js'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } },
      ipcRenderer: { invoke: (channel, data) => handlers.get(channel)(null, data) }
    })
  });
  const result = await bridge.updateBank({ ...store.bank, balance: 1000 });
  assert.equal(result.id, 'existing-bank');
  assert.equal(store.bank.balance, 1000);
  assert.deepEqual(store.calls, ['update']);
  await assert.rejects(bridge.updateBank({ name: 'Bank' }), /Bank ID is required/);
  await assert.rejects(
    bridge.updateBank({ ...store.bank, name: 'Other bank' }),
    /\u0645\u0633\u062c\u0644/
  );
});

test('bank form routes edits to update and additions to create in desktop and browser', async () => {
  const page = read('src', 'app', 'page.tsx');
  const start = page.indexOf('  const handleSaveBank =');
  const end = page.indexOf('  const handleSavePayment =', start);
  assert.ok(start >= 0 && end > start);
  const source = compile(page.slice(start, end) + '\nexports.save = handleSaveBank;');
  for (const desktop of [true, false]) {
    for (const editing of [true, false]) {
      const calls = [];
      const alerts = [];
      const exports = {};
      const context = {
        exports, bankForm: { ...(editing ? { id: 'existing-bank' } : {}), name: 'Bank', balance: '1000' },
        setSubmitting() {}, setIsBankModalOpen() {}, fetchBanks() {},
        alert: (message) => alerts.push(message),
        fetch: async (_url, options) => {
          calls.push(options.method);
          assert.equal(JSON.parse(options.body).balance, 1000);
          return Response.json({ id: editing ? 'existing-bank' : 'new-bank' });
        },
        window: desktop ? { electronAPI: {
          createBank: async () => { calls.push('create'); },
          updateBank: async (data) => {
            assert.equal(data.id, 'existing-bank');
            assert.equal(data.balance, 1000);
            calls.push('update');
          }
        } } : {}
      };
      vm.runInNewContext(source, context);
      await exports.save({ preventDefault() {} });
      assert.deepEqual(alerts, []);
      assert.deepEqual(calls, [desktop ? (editing ? 'update' : 'create') : (editing ? 'PUT' : 'POST')]);
    }
  }
});
