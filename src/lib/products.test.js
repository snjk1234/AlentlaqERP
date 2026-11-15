/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..', '..');

function loadCreateProduct(existing) {
  const source = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const handlers = new Map();
  const created = [];
  const client = {
    product: {
      findMany: async () => existing,
      create: async ({ data }) => { created.push(data); return { id: 'new-product', ...data }; }
    }
  };
  vm.runInNewContext(source + '\ninitializeDatabase();', {
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
      if (id.startsWith('../src/lib/')) return require(id.replace('../src/lib/', './'));
      return require(id);
    },
    process, Buffer, console: { ...console, error() {} }, __dirname: path.join(root, 'electron')
  });
  return { create: data => handlers.get('create-product')(null, data), created };
}

test('changing only the size registers a new product while matching specs stay rejected', async () => {
  const existing = [{ code: 'P-1', size: '20', color: 'Blue', gauge: null, weight: null, supplierId: null }];
  const { create, created } = loadCreateProduct(existing);
  const saved = await create({ code: 'P-1', name: 'Prod', type: 'T', size: '25', color: 'Blue', price: 10 });
  assert.equal(saved.size, '25');
  assert.equal(created.length, 1);
  await assert.rejects(
    create({ code: 'P-1', name: 'Prod', type: 'T', size: '20', color: 'Blue', price: 10 }),
    /بنفس المواصفات/
  );
  assert.equal(created.length, 1);
});
