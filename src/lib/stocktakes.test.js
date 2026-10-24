/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { stocktakeOperation } = require('./stocktakes');
const { stocktakeTotals } = require('./stocktake-totals');
const { createUserSessionToken } = require('./user-session-token');
const { createRemoteClient } = require('./remote-client');
const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;

function store() {
  const state = {
    user: [
      { id: 'admin', username: 'admin', name: 'Manager', role: 'ADMIN', password: 'admin-secret' },
      { id: 'keeper', username: 'keeper', name: 'Keeper', role: 'STOREKEEPER', password: 'keeper-secret' },
      { id: 'cashier', role: 'CASHIER' }
    ],
    product: [
      { id: 'p1', code: 'Z', name: 'Pipe', size: '20', color: 'red', stockQty: 10, price: 55, costPrice: 40 },
      { id: 'p2', code: 'A', name: 'Hose', size: '30', color: null, stockQty: 20, price: 75, costPrice: 50 }
    ],
    stocktake: [], stocktakeItem: [], stocktakeSetting: []
  };
  let sequence = 0;
  let productWrites = 0;
  let failOnWrite = 0;
  let tail = Promise.resolve();
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  const project = (model, row, args = {}) => {
    if (!row) return null;
    const result = structuredClone(row);
    if (model === 'stocktake' && args.include?.items) {
      result.items = structuredClone(state.stocktakeItem.filter(item => item.stocktakeId === row.id).sort((a, b) => a.position - b.position));
    }
    return args.select ? Object.fromEntries(Object.keys(args.select).map(key => [key, result[key]])) : result;
  };
  const client = {};
  for (const model of Object.keys(state)) {
    const delegate = {
      findUnique: async args => project(model, state[model].find(row => matches(row, args.where)), args),
      findMany: async (args = {}) => {
        const rows = state[model].filter(row => matches(row, args.where));
        if (args.orderBy) {
          const [field, direction] = Object.entries(args.orderBy)[0];
          rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
        }
        return rows.map(row => project(model, row, args));
      },
      create: async ({ data, ...args }) => {
        const { items, ...fields } = structuredClone(data);
        const row = { id: `record-${++sequence}`, createdAt: new Date().toISOString(),
          ...(model === 'stocktake' ? { status: 'DRAFT', revision: 1 } : {}), ...fields };
        state[model].push(row);
        if (items) {
          for (const item of items.create) await client.stocktakeItem.create({ data: { ...item, stocktakeId: row.id } });
        }
        return project(model, row, args);
      },
      update: async ({ where, data, ...args }) => {
        const row = state[model].find(row => matches(row, where));
        assert.ok(row, `Missing ${model} row`);
        Object.assign(row, structuredClone(data));
        if (model === 'product' && ++productWrites === failOnWrite) throw new Error('Simulated database write failure');
        return project(model, row, args);
      },
      delete: async ({ where }) => {
        const index = state[model].findIndex(row => matches(row, where));
        assert.ok(index >= 0);
        return state[model].splice(index, 1)[0];
      }
    };
    delegate.findFirst = async args => (await delegate.findMany(args))[0] || null;
    delegate.upsert = async ({ where, create, update }) => await delegate.findUnique({ where })
      ? delegate.update({ where, data: update }) : delegate.create({ data: create });
    client[model] = delegate;
  }
  client.$transaction = callback => {
    const queued = tail.then(async () => {
      const before = structuredClone(state);
      try { return await callback(client); }
      catch (error) { Object.assign(state, before); throw error; }
    });
    tail = queued.catch(() => {});
    return queued;
  };
  return { state, client, failProductWrite: index => { productWrites = 0; failOnWrite = index; } };
}
const save = (items = [{ productId: 'p1', bookQty: 10, countedQty: 7 }], extra = {}) => ({ action: 'save', notes: '', items, ...extra });
const password = { action: 'password', accountPassword: 'admin-secret', newPassword: 'independent-secret' };
const approve = document => ({ action: 'approve', id: document.id, revision: document.revision, password: password.newPassword });
async function prepared() {
  const context = store();
  await stocktakeOperation(context.client, 'admin', password);
  return context;
}

test('only administrators and storekeepers access stocktakes; only administrators configure or approve', async () => {
  const { client } = store();
  for (const user of ['cashier', 'missing', undefined]) {
    await assert.rejects(stocktakeOperation(client, user, { action: 'list' }), { statusCode: 403 });
    await assert.rejects(stocktakeOperation(client, user, save()), { statusCode: 403 });
  }
  for (const action of ['approve', 'password']) {
    await assert.rejects(stocktakeOperation(client, 'keeper', { action }), { statusCode: 403 });
  }
  assert.ok(await stocktakeOperation(client, 'keeper', { action: 'list' }));
});

test('password setup verifies manager account password, validates length, stores a salted hash and never returns it', async () => {
  const { client, state } = store();
  await assert.rejects(stocktakeOperation(client, 'admin', { ...password, accountPassword: 'wrong' }), { statusCode: 403 });
  await assert.rejects(stocktakeOperation(client, 'admin', { ...password, newPassword: 'short' }), /8/);
  await assert.rejects(stocktakeOperation(client, 'admin', { ...password, newPassword: '        ' }), /8/);
  await stocktakeOperation(client, 'admin', password);
  const first = state.stocktakeSetting[0].passwordHash;
  assert.ok(!first.includes(password.newPassword));
  assert.match(first, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  await stocktakeOperation(client, 'admin', password);
  assert.notEqual(first, state.stocktakeSetting[0].passwordHash);
  const listing = await stocktakeOperation(client, 'keeper', { action: 'list' });
  assert.equal(listing.passwordConfigured, true);
  assert.ok(!JSON.stringify(listing).includes('passwordHash'));
  assert.deepEqual(Object.keys(listing.products[0]).sort(), ['code', 'color', 'costPrice', 'id', 'name', 'size', 'stockQty']);
});

test('a partial draft persists without changing stock, preserves zero separately from uncounted and numbers documents sequentially', async () => {
  const { client, state } = store();
  const document = await stocktakeOperation(client, 'keeper', save([
    { productId: 'p2', bookQty: 20, countedQty: '' }, { productId: 'p1', bookQty: 10, countedQty: 0 }
  ]));
  assert.equal(document.documentNumber, 'STK-00000001');
  assert.equal(document.status, 'DRAFT');
  assert.equal(document.createdBy, 'Keeper (keeper)');
  assert.deepEqual(document.items.map(line => [line.productId, line.countedQty, line.position]), [['p2', null, 0], ['p1', 0, 1]]);
  assert.deepEqual(state.product.map(product => product.stockQty), [10, 20]);
  await stocktakeOperation(client, 'keeper', { action: 'delete', id: document.id, revision: document.revision });
  const next = await stocktakeOperation(client, 'admin', save());
  assert.equal(next.documentNumber, 'STK-00000002');
  assert.equal((await stocktakeOperation(client, 'admin', { action: 'list' })).documents.length, 1);
});

test('draft changes replace lines without changing stock, reject stale revisions and ignore forged snapshot fields', async () => {
  const { client, state } = store();
  const document = await stocktakeOperation(client, 'keeper', save());
  const updated = await stocktakeOperation(client, 'admin', save([
    { productId: 'p1', bookQty: 999, countedQty: 9, productLabel: 'forged' },
    { productId: 'p2', bookQty: 20, countedQty: 15 }
  ], { id: document.id, revision: document.revision, notes: 'Updated' }));
  assert.equal(updated.revision, 2);
  assert.equal(updated.notes, 'Updated');
  assert.equal(updated.items[0].bookQty, 10);
  assert.ok(updated.items[0].productLabel.includes('Pipe'));
  assert.equal(state.stocktakeItem.length, 2);
  assert.deepEqual(state.product.map(product => product.stockQty), [10, 20]);
  await assert.rejects(stocktakeOperation(client, 'keeper', save(undefined, { id: document.id, revision: 1 })), { statusCode: 409 });
});

test('invalid, duplicate, fractional, negative, overflowing and missing items never persist or change stock', async () => {
  const { client, state } = store();
  for (const items of [
    [], [{ productId: 'missing', bookQty: 0, countedQty: 1 }],
    [{ productId: 'p1', bookQty: 10, countedQty: 1 }, { productId: 'p1', bookQty: 10, countedQty: 2 }],
    ...[-1, 1.5, 2147483648, 'bad', {}, true].map(countedQty => [{ productId: 'p1', bookQty: 10, countedQty }])
  ]) {
    await assert.rejects(stocktakeOperation(client, 'keeper', save(items)));
  }
  assert.equal(state.stocktake.length, 0);
  assert.equal(state.stocktakeItem.length, 0);
  assert.deepEqual(state.product.map(product => product.stockQty), [10, 20]);
});

test('stocktake values use persisted cost, separate shortages and surpluses, skip uncounted and preserve zero', async () => {
  const { client, state } = await prepared();
  const draft = await stocktakeOperation(client, 'keeper', save([
    { productId: 'p1', bookQty: 10, countedQty: 7, unitCost: 999 },
    { productId: 'p2', bookQty: 20, countedQty: 25, unitCost: 999 }
  ]));
  assert.deepEqual(draft.items.map(item => item.unitCost), [40, 50]);
  assert.deepEqual(stocktakeTotals(draft.items), { shortage: 120, surplus: 250, net: 130, unvalued: 0 });
  state.product[0].costPrice = 500;
  const updated = await stocktakeOperation(client, 'keeper', save(draft.items, { id: draft.id, revision: draft.revision }));
  assert.equal(updated.items[0].unitCost, 40);
  const approved = await stocktakeOperation(client, 'admin', approve(updated));
  assert.deepEqual(stocktakeTotals(approved.items), { shortage: 120, surplus: 250, net: 130, unvalued: 0 });
  assert.deepEqual(stocktakeTotals([
    { bookQty: 10, countedQty: '', unitCost: 100 },
    { bookQty: 10, countedQty: null, unitCost: 100 },
    { bookQty: 2, countedQty: 0, unitCost: 1.25 },
    { bookQty: 1, countedQty: 4, unitCost: 0.1 },
    { bookQty: 5, countedQty: 4, unitCost: 0 }
  ]), { shortage: 2.5, surplus: 0.3, net: -2.2, unvalued: 0 });
  assert.equal(stocktakeTotals([{ bookQty: 10, countedQty: 9, unitCost: null }]).unvalued, 1);
});

test('drafts reserve products server-side, allow editing their own items, and release reservations on removal or approval', async () => {
  const { client, state } = await prepared();
  const first = await stocktakeOperation(client, 'keeper', save());
  await assert.rejects(stocktakeOperation(client, 'admin', save()), { statusCode: 409 });
  const second = await stocktakeOperation(client, 'admin', save([{ productId: 'p2', bookQty: 20, countedQty: 20 }]));
  await assert.rejects(stocktakeOperation(client, 'admin', save([
    { productId: 'p1', bookQty: 10, countedQty: 8 }
  ], { id: second.id, revision: second.revision })), { statusCode: 409 });
  assert.equal(state.stocktakeItem.length, 2);
  const edited = await stocktakeOperation(client, 'keeper', save(first.items, { id: first.id, revision: first.revision }));
  await stocktakeOperation(client, 'admin', approve(edited));
  await stocktakeOperation(client, 'admin', { action: 'delete', id: second.id, revision: second.revision });
  const third = await stocktakeOperation(client, 'keeper', save([
    { productId: 'p1', bookQty: 7, countedQty: 7 }, { productId: 'p2', bookQty: 20, countedQty: 20 }
  ]));
  const removed = await stocktakeOperation(client, 'keeper', save([
    { productId: 'p1', bookQty: 7, countedQty: 7 }
  ], { id: third.id, revision: third.revision }));
  assert.equal(removed.items.length, 1);
  await stocktakeOperation(client, 'admin', save([{ productId: 'p2', bookQty: 20, countedQty: 20 }]));
});

test('deleting a draft by either allowed role releases products, hides it from the list and preserves numbering and stock', async () => {
  for (const role of ['admin', 'keeper']) {
    const { client, state } = store();
    const draft = await stocktakeOperation(client, 'keeper', save());
    await assert.rejects(stocktakeOperation(client, 'cashier', { action: 'delete', id: draft.id, revision: 1 }), { statusCode: 403 });
    await assert.rejects(stocktakeOperation(client, role, { action: 'delete', id: draft.id, revision: 99 }), { statusCode: 409 });
    assert.deepEqual(await stocktakeOperation(client, role, { action: 'delete', id: draft.id, revision: 1 }), { deletedId: draft.id });
    assert.equal((await stocktakeOperation(client, role, { action: 'list' })).documents.length, 0);
    assert.deepEqual(state.product.map(product => product.stockQty), [10, 20]);
    await assert.rejects(stocktakeOperation(client, role, { action: 'delete', id: draft.id, revision: 2 }), { statusCode: 409 });
    const replacement = await stocktakeOperation(client, role, save());
    assert.equal(replacement.documentNumber, 'STK-00000002');
  }
});

test('concurrent saves cannot reserve the same product in two open drafts', async () => {
  const { client, state } = store();
  const results = await Promise.allSettled([
    stocktakeOperation(client, 'keeper', save()), stocktakeOperation(client, 'admin', save())
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
  assert.equal(state.stocktake.length, 1);
});

test('legacy drafts acquire current cost on save, while overlapping legacy drafts cannot be approved', async () => {
  const { client, state } = await prepared();
  const draft = await stocktakeOperation(client, 'keeper', save());
  state.stocktakeItem[0].unitCost = null;
  await assert.rejects(stocktakeOperation(client, 'admin', approve(draft)), { statusCode: 409 });
  const upgraded = await stocktakeOperation(client, 'keeper', save(draft.items, { id: draft.id, revision: draft.revision }));
  assert.equal(upgraded.items[0].unitCost, 40);
  state.stocktake.push({ ...state.stocktake[0], id: 'legacy-other', documentNumber: 'STK-00000002' });
  state.stocktakeItem.push({ ...state.stocktakeItem[0], id: 'legacy-line', stocktakeId: 'legacy-other' });
  await assert.rejects(stocktakeOperation(client, 'admin', approve(upgraded)), { statusCode: 409 });
  assert.equal(state.product[0].stockQty, 10);
});

test('approval requires a configured separate password and every item counted; wrong passwords leave stock untouched', async () => {
  const { client, state } = store();
  const document = await stocktakeOperation(client, 'keeper', save());
  await assert.rejects(stocktakeOperation(client, 'admin', approve(document)), /كلمة مرور اعتماد الجرد أولًا/);
  await stocktakeOperation(client, 'admin', password);
  await assert.rejects(stocktakeOperation(client, 'admin', { ...approve(document), password: 'admin-secret' }), { statusCode: 403 });
  const partial = await stocktakeOperation(client, 'keeper', save([{ productId: 'p2', bookQty: 20, countedQty: '' }]));
  await assert.rejects(stocktakeOperation(client, 'admin', approve(partial)), /أكمل الكميات/);
  assert.deepEqual(state.product.map(product => product.stockQty), [10, 20]);
  assert.ok(state.stocktake.every(document => document.status === 'DRAFT'));
});

test('approval atomically applies exact physical quantities including zero without changing prices or unselected products', async () => {
  const { client, state } = await prepared();
  const document = await stocktakeOperation(client, 'keeper', save([{ productId: 'p1', bookQty: 10, countedQty: 0 }]));
  const approved = await stocktakeOperation(client, 'admin', approve(document));
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedBy, 'Manager (admin)');
  assert.ok(approved.approvedAt);
  assert.equal(approved.items[0].bookQty, 10);
  assert.equal(approved.items[0].countedQty, 0);
  assert.deepEqual(state.product.map(product => [product.stockQty, product.price, product.costPrice]), [[0, 55, 40], [20, 75, 50]]);
  for (const input of [approve(approved), save(undefined, { id: approved.id, revision: approved.revision }),
    { action: 'delete', id: approved.id, revision: approved.revision },
    { action: 'refresh', id: approved.id, revision: approved.revision }]) {
    await assert.rejects(stocktakeOperation(client, 'admin', input), { statusCode: 409 });
  }
});

test('stock movements prevent approval until explicit refresh clears changed counts for recount', async () => {
  const { client, state } = await prepared();
  const document = await stocktakeOperation(client, 'keeper', save([
    { productId: 'p1', bookQty: 10, countedQty: 7 }, { productId: 'p2', bookQty: 20, countedQty: 18 }
  ]));
  state.product[0].stockQty = 9;
  await assert.rejects(stocktakeOperation(client, 'admin', approve(document)), { statusCode: 409 });
  assert.deepEqual(state.product.map(product => product.stockQty), [9, 20]);
  const refreshed = await stocktakeOperation(client, 'keeper', { action: 'refresh', id: document.id, revision: document.revision });
  assert.deepEqual(refreshed.items.map(line => [line.bookQty, line.countedQty]), [[9, null], [20, 18]]);
  await assert.rejects(stocktakeOperation(client, 'admin', approve(refreshed)), /أكمل الكميات/);
  const updated = await stocktakeOperation(client, 'keeper', save(refreshed.items.map(line => ({ ...line, countedQty: line.countedQty ?? 8 })), {
    id: refreshed.id, revision: refreshed.revision
  }));
  await stocktakeOperation(client, 'admin', approve(updated));
  assert.deepEqual(state.product.map(product => product.stockQty), [8, 18]);
});

test('a new draft rejects stock changed after selection and supports correcting pre-existing negative book quantities', async () => {
  const { client, state } = await prepared();
  state.product[0].stockQty = 8;
  await assert.rejects(stocktakeOperation(client, 'keeper', save()), { statusCode: 409 });
  state.product[0].stockQty = -2;
  const document = await stocktakeOperation(client, 'keeper', save([{ productId: 'p1', bookQty: -2, countedQty: 3 }]));
  await stocktakeOperation(client, 'admin', approve(document));
  assert.equal(state.product[0].stockQty, 3);
});

test('failure after a product update rolls back every quantity and leaves the draft unapproved', async () => {
  const { client, state, failProductWrite } = await prepared();
  const document = await stocktakeOperation(client, 'keeper', save([
    { productId: 'p1', bookQty: 10, countedQty: 7 }, { productId: 'p2', bookQty: 20, countedQty: 18 }
  ]));
  failProductWrite(2);
  await assert.rejects(stocktakeOperation(client, 'admin', approve(document)), /Simulated/);
  assert.deepEqual(state.product.map(product => product.stockQty), [10, 20]);
  assert.equal(state.stocktake[0].status, 'DRAFT');
  assert.equal(state.stocktake[0].revision, 1);
});

test('two concurrent approvals cannot apply the stocktake twice', async () => {
  const { client, state } = await prepared();
  const document = await stocktakeOperation(client, 'keeper', save());
  const results = await Promise.allSettled([
    stocktakeOperation(client, 'admin', approve(document)), stocktakeOperation(client, 'admin', approve(document))
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.statusCode, 409);
  assert.equal(state.product[0].stockQty, 7);
  assert.equal(state.stocktake[0].revision, 2);
});

test('changing the approval password invalidates the old password without affecting saved drafts', async () => {
  const { client, state } = await prepared();
  const document = await stocktakeOperation(client, 'keeper', save());
  await stocktakeOperation(client, 'admin', { ...password, newPassword: 'changed-independent-secret' });
  await assert.rejects(stocktakeOperation(client, 'admin', approve(document)), { statusCode: 403 });
  assert.equal(state.product[0].stockQty, 10);
  await stocktakeOperation(client, 'admin', { ...approve(document), password: 'changed-independent-secret' });
  assert.equal(state.product[0].stockQty, 7);
});

test('both stocktake roles may save notes after approval without changing lines, costs, quantities or approval metadata', async () => {
  for (const userId of ['admin', 'keeper']) {
    const { client, state } = await prepared();
    const draft = await stocktakeOperation(client, 'keeper', save());
    const approved = await stocktakeOperation(client, 'admin', approve(draft));
    const beforeProducts = structuredClone(state.product);
    const beforeItems = structuredClone(state.stocktakeItem);
    const updated = await stocktakeOperation(client, userId, {
      action: 'notes', id: approved.id, revision: approved.revision, notes: 'ملاحظة بعد الاعتماد\nسطر ثانٍ',
      items: [{ productId: 'p1', countedQty: 999 }], status: 'DRAFT', approvedBy: 'forged'
    });
    assert.equal(updated.notes, 'ملاحظة بعد الاعتماد\nسطر ثانٍ');
    assert.equal(updated.status, 'APPROVED');
    assert.equal(updated.approvedBy, approved.approvedBy);
    assert.deepEqual(updated.approvedAt, approved.approvedAt);
    assert.equal(updated.revision, approved.revision + 1);
    assert.deepEqual(state.product, beforeProducts);
    assert.deepEqual(state.stocktakeItem, beforeItems);
    assert.deepEqual(stocktakeTotals(updated.items), stocktakeTotals(approved.items));
    await assert.rejects(stocktakeOperation(client, userId, {
      action: 'notes', id: approved.id, revision: approved.revision, notes: 'stale'
    }), { statusCode: 409 });
    await assert.rejects(stocktakeOperation(client, 'cashier', {
      action: 'notes', id: updated.id, revision: updated.revision, notes: 'forged'
    }), { statusCode: 403 });
    for (const notes of [null, 'x'.repeat(2001)]) {
      await assert.rejects(stocktakeOperation(client, userId, {
        action: 'notes', id: updated.id, revision: updated.revision, notes
      }), { statusCode: 400 });
    }
    const cleared = await stocktakeOperation(client, userId, {
      action: 'notes', id: updated.id, revision: updated.revision, notes: ''
    });
    assert.equal(cleared.notes, '');
  }
});

test('notes-only edits work on saved drafts but not deleted or missing stocktakes', async () => {
  const { client, state } = store();
  const draft = await stocktakeOperation(client, 'keeper', save());
  const updated = await stocktakeOperation(client, 'keeper', {
    action: 'notes', id: draft.id, revision: draft.revision, notes: 'Draft note'
  });
  assert.equal(updated.notes, 'Draft note');
  assert.equal(state.product[0].stockQty, 10);
  await stocktakeOperation(client, 'keeper', { action: 'delete', id: updated.id, revision: updated.revision });
  await assert.rejects(stocktakeOperation(client, 'keeper', {
    action: 'notes', id: updated.id, revision: updated.revision + 1, notes: 'deleted'
  }), { statusCode: 409 });
  await assert.rejects(stocktakeOperation(client, 'keeper', {
    action: 'notes', id: 'missing', revision: 1, notes: 'missing'
  }), { statusCode: 404 });
});

test('API uses signed session identity, ignores forged userId, and returns explicit validation and permission errors', async () => {
  process.env.POS_API_TOKEN = 'stocktake-test-session';
  const { client } = store();
  const exports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'stocktakes', 'route.ts')), {
    exports, process, Error, console: { ...console, error() {} },
    require: id => {
      if (id === '@/lib/prisma') return { prisma: client };
      if (id === '@/lib/stocktakes') return { stocktakeOperation };
      if (id === '@/lib/user-session-token') return require('./user-session-token');
      if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } };
      throw new Error(id);
    }
  });
  const post = (role, userId, input, token) => exports.POST(new Request('http://localhost/api/stocktakes', {
    method: 'POST', headers: { authorization: `Bearer ${token ?? createUserSessionToken({ id: userId, role })}` },
    body: typeof input === 'string' ? input : JSON.stringify(input)
  }));
  assert.equal((await post('ADMIN', 'admin', { action: 'list' }, 'invalid')).status, 401);
  assert.equal((await post('ADMIN', 'admin', '{')).status, 400);
  assert.equal((await post('CASHIER', 'cashier', { action: 'list', userId: 'admin' })).status, 403);
  assert.equal((await post('STOREKEEPER', 'keeper', { ...password, userId: 'admin' })).status, 403);
  assert.equal((await post('ADMIN', 'keeper', { action: 'approve' })).status, 403);
  const result = await post('STOREKEEPER', 'keeper', { ...save(), userId: 'admin' });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).data.createdBy, 'Keeper (keeper)');
});

test('stocktake transport uses a signed user token instead of machine credentials, and login returns the full signed session', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).endsWith('/login')
      ? Response.json({ id: 'admin', role: 'ADMIN', sessionToken: 'signed-user-token' })
      : Response.json({ data: { documents: [] } });
  });
  const client = createRemoteClient(() => ({ serverUrl: 'http://localhost:3000', apiToken: 'machine-token' }));
  const user = await client.login({ username: 'admin', password: 'secret' });
  assert.equal(user.sessionToken, 'signed-user-token');
  await client.stocktakeOperation({ action: 'list' }, user.sessionToken);
  assert.equal(calls[1].url, 'http://localhost:3000/api/stocktakes');
  assert.equal(calls[1].options.headers.authorization, 'Bearer signed-user-token');
  assert.throws(() => client.stocktakeOperation({ action: 'list' }), /انتهت الجلسة/);
});

test('Electron stocktake bridge uses the authenticated sender session and rejects unauthenticated senders', async () => {
  const handlers = new Map();
  const calls = [];
  const client = {
    login: async () => ({ id: 'keeper', username: 'keeper', name: 'Keeper', role: 'STOREKEEPER', sessionToken: 'keeper-signed-token' }),
    stocktakeOperation: async (input, token) => { calls.push({ input, token }); return { documents: [] }; }
  };
  vm.runInNewContext(read('electron', 'main.js') + '\ninitializeDatabase();', {
    require: id => {
      if (id === 'electron') return {
        app: { isPackaged: true, whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
        protocol: { registerSchemesAsPrivileged() {} }
      };
      if (id === '../src/lib/remote-client') return { createRemoteClient: () => client };
      if (id.startsWith('../src/lib/')) return require(path.join(root, id.slice(3)));
      return require(id);
    },
    process, Buffer, console: { ...console, error() {} }, __dirname: path.join(root, 'electron')
  });
  const event = { sender: { id: 7 } };
  await assert.rejects(handlers.get('stocktake-operation')(event, { action: 'list' }), /سجّل الدخول/);
  await handlers.get('login')(event, { username: 'keeper', password: 'secret' });
  await handlers.get('stocktake-operation')(event, { action: 'list', userId: 'admin', sessionToken: 'forged' });
  assert.equal(calls[0].token, 'keeper-signed-token');
  await handlers.get('logout')(event);
  await assert.rejects(handlers.get('stocktake-operation')(event, { action: 'list' }), /سجّل الدخول/);
});

test('proxy requires a signed stocktake session and generic database API cannot expose or modify stocktake models', async () => {
  process.env.POS_API_TOKEN = 'stocktake-test-session';
  const exports = {};
  vm.runInNewContext(compile(read('src', 'proxy.ts')), {
    exports, process, require: id => {
      if (id === '@/lib/user-session-token') return require('./user-session-token');
      if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init), next: () => 'allowed' } };
      throw new Error(id);
    }
  });
  const request = token => ({ method: 'POST', nextUrl: { pathname: '/api/stocktakes' }, headers: new Headers({ authorization: `Bearer ${token}` }) });
  assert.equal(exports.proxy(request(process.env.POS_API_TOKEN)).status, 401);
  assert.equal(exports.proxy(request(createUserSessionToken({ id: 'keeper', role: 'STOREKEEPER' }))), 'allowed');
  const dbExports = {};
  vm.runInNewContext(compile(read('src', 'app', 'api', 'db', 'route.ts')), {
    exports: dbExports, process, Buffer, console,
    require: id => {
      if (id === 'node:crypto') return require(id);
      if (id === '@/lib/access-client') return { modelNames: ['stocktake', 'stocktakeItem', 'stocktakeSetting'], runRemoteOperation: () => assert.fail('Must not access protected models') };
      if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } };
      throw new Error(id);
    }
  });
  for (const modelName of ['stocktake', 'stocktakeItem', 'stocktakeSetting']) {
    const response = await dbExports.POST(new Request('http://localhost/api/db', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.POS_API_TOKEN}` },
      body: JSON.stringify({ action: 'operation', modelName, operation: 'findMany' })
    }));
    assert.equal(response.status, 403);
  }
});

test('Access preserves stocktake validation status across transaction rollback and defines persistent tables', () => {
  const source = read('src', 'lib', 'access-client.js');
  const tree = ts.createSourceFile('access-client.js', source, ts.ScriptTarget.Latest, true);
  const normalize = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'normalizeError');
  const exports = {};
  vm.runInNewContext(normalize.getText(tree) + '\nexports.normalize = normalizeError;', { exports });
  const error = exports.normalize(Object.assign(new Error('stale'), { statusCode: 409 }));
  assert.equal(error.statusCode, 409);
  const { models } = require('./access-client');
  assert.equal(models.stocktakeSetting.fields.passwordHash.type, 'text');
  assert.equal(models.stocktakeItem.fields.countedQty.type, 'integer');
  assert.equal(models.stocktake.relations.items.model, 'stocktakeItem');
});

test('Access projects nullable approval dates without CDbl(NULL) and preserves nulls and timestamp precision', async () => {
  const source = read('src', 'lib', 'access-client.js');
  const tree = ts.createSourceFile('access-client.js', source, ts.ScriptTarget.Latest, true);
  const declarations = tree.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['findMany', 'normalizeRow'].includes(node.name.text)).map(node => node.getText(tree));
  const { models } = require('./access-client');
  const exports = {};
  const timestamp = new Date('2026-10-24T12:30:11.895Z');
  let value = null;
  vm.runInNewContext(declarations.join('\n') + '\nexports.read = findMany; exports.normalize = normalizeRow;', {
    exports, Date, models, quoteIdentifier: name => `[${name}]`,
    whereSql: () => '', orderBySql: () => '', selectedRow: row => row,
    loadIncludes: async (_connection, _model, rows) => rows,
    executeRows: async (_connection, model, sql) => {
      assert.equal(model, 'stocktake');
      assert.ok(sql.includes('([approvedAt] - #12/30/1899#) AS [__access_date_approvedAt]'));
      assert.ok(!sql.includes('CDbl([approvedAt])'));
      assert.ok(sql.includes('CDbl([createdAt])'));
      return [exports.normalize('stocktake', { __access_date_approvedAt: value })];
    }
  });
  assert.equal((await exports.read({}, 'stocktake'))[0].approvedAt, null);
  value = (timestamp.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  assert.equal((await exports.read({}, 'stocktake'))[0].approvedAt.toISOString(), timestamp.toISOString());
  value = 0;
  assert.equal((await exports.read({}, 'stocktake'))[0].approvedAt.toISOString(), '1899-12-30T00:00:00.000Z');
});

test('Access ODBC saves, reloads, edits and approves stocktake drafts with NULL approval dates',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-stocktake-test-'));
    const databasePath = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previousPath = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = databasePath;
    const database = createAccessClient();
    try {
      const suffix = Date.now();
      const user = await database.user.create({ data: {
        username: `stocktake-admin-${suffix}`, name: 'مدير الجرد', password: 'integration-account', role: 'ADMIN'
      } });
      const products = [];
      for (const [index, name] of ['مواسير', 'خراطيم'].entries()) {
        products.push(await database.product.create({ data: {
          code: `stocktake-${suffix}-${index}`, name, type: 'جرد', size: '20', color: 'أحمر',
          price: 55, costPrice: 40, stockQty: index === 0 ? 10 : 20
        } }));
      }
      const draft = await stocktakeOperation(database, user.id, save(products.map((product, index) => ({
        productId: product.id, bookQty: product.stockQty, countedQty: index === 0 ? 7 : ''
      })), { notes: 'مسودة جرد تجريبية' }));
      assert.equal(draft.approvedAt, null);
      assert.equal(draft.status, 'DRAFT');
      assert.equal(draft.items[1].countedQty, null);
      assert.deepEqual(draft.items.map(item => item.unitCost), [40, 40]);
      assert.ok(draft.items[0].productLabel.includes('مواسير'));
      await assert.rejects(stocktakeOperation(database, user.id, save([
        { productId: products[0].id, bookQty: 10, countedQty: 9 }
      ])), { statusCode: 409 });
      await database.$disconnect();
      const listing = await stocktakeOperation(database, user.id, { action: 'list' });
      const reloaded = listing.documents.find(document => document.id === draft.id);
      assert.equal(reloaded.approvedAt, null);
      assert.equal(reloaded.notes, 'مسودة جرد تجريبية');
      assert.equal(reloaded.items[0].countedQty, 7);
      for (const product of products) {
        assert.equal((await database.product.findUnique({ where: { id: product.id } })).stockQty, product.stockQty);
      }
      const edited = await stocktakeOperation(database, user.id, save(reloaded.items.map(item => ({
        ...item, countedQty: item.countedQty ?? 18
      })), { id: reloaded.id, revision: reloaded.revision, notes: 'تم إكمال العد' }));
      assert.equal(edited.approvedAt, null);
      assert.equal(edited.revision, 2);
      await stocktakeOperation(database, user.id, {
        action: 'password', accountPassword: 'integration-account', newPassword: 'integration-approval'
      });
      const approved = await stocktakeOperation(database, user.id, {
        action: 'approve', id: edited.id, revision: edited.revision, password: 'integration-approval'
      });
      assert.equal(approved.status, 'APPROVED');
      assert.ok(approved.approvedAt instanceof Date);
      await database.$disconnect();
      const persisted = await database.stocktake.findUnique({ where: { id: approved.id }, include: { items: true } });
      assert.equal(persisted.approvedAt.toISOString(), approved.approvedAt.toISOString());
      assert.equal(persisted.createdAt.toISOString(), draft.createdAt.toISOString());
      assert.deepEqual(persisted.items.map(item => item.countedQty), [7, 18]);
      assert.deepEqual(stocktakeTotals(persisted.items), { shortage: 200, surplus: 0, net: -200, unvalued: 0 });
      const withNotes = await stocktakeOperation(database, user.id, {
        action: 'notes', id: persisted.id, revision: persisted.revision, notes: 'ملاحظة بعد اعتماد الجرد\nتمت المراجعة'
      });
      assert.equal(withNotes.status, 'APPROVED');
      assert.equal(withNotes.approvedAt.toISOString(), persisted.approvedAt.toISOString());
      assert.deepEqual(withNotes.items, persisted.items);
      await database.$disconnect();
      const notesReload = await database.stocktake.findUnique({ where: { id: withNotes.id } });
      assert.equal(notesReload.notes, 'ملاحظة بعد اعتماد الجرد\nتمت المراجعة');
      for (const [index, product] of products.entries()) {
        const updated = await database.product.findUnique({ where: { id: product.id } });
        assert.equal(updated.stockQty, index === 0 ? 7 : 18);
        assert.equal(updated.price, 55);
        assert.equal(updated.costPrice, 40);
      }
      await assert.rejects(stocktakeOperation(database, user.id, {
        action: 'delete', id: persisted.id, revision: persisted.revision
      }), { statusCode: 409 });
      const afterApproval = await stocktakeOperation(database, user.id, save([
        { productId: products[0].id, bookQty: 7, countedQty: 6 }
      ]));
      await stocktakeOperation(database, user.id, { action: 'delete', id: afterApproval.id, revision: afterApproval.revision });
      await database.$disconnect();
      const afterDelete = await stocktakeOperation(database, user.id, { action: 'list' });
      assert.ok(!afterDelete.documents.some(document => document.id === afterApproval.id));
      assert.equal((await database.product.findUnique({ where: { id: products[0].id } })).stockQty, 7);
      const replacement = await stocktakeOperation(database, user.id, save([
        { productId: products[0].id, bookQty: 7, countedQty: '' }
      ]));
      assert.ok(replacement.documentNumber > afterApproval.documentNumber);
    } finally {
      await database.$disconnect();
      if (previousPath === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previousPath;
      fs.unlinkSync(databasePath);
      const lockPath = path.join(directory, 'test.laccdb');
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      fs.rmdirSync(directory);
    }
  });

test('stocktake UI shows values, placeholders, role-appropriate controls and reservations and locks approved documents', () => {
  function render(role, document, listing = { documents: [], products: [], passwordConfigured: true }) {
    const values = [listing, document, [{ productId: 'p1', productLabel: 'Pipe', bookQty: 10, countedQty: '7', unitCost: 40 }], '', '', false, true, false, '', '', '', false,
      { accountPassword: '', newPassword: '', confirmPassword: '' }];
    let index = 0;
    const exports = {};
    vm.runInNewContext(compile(read('src', 'components', 'StocktakePanel.tsx')), {
      exports, require: id => {
        if (id.startsWith('@/lib/')) return require(`./${id.slice('@/lib/'.length)}`);
        if (id === 'react') return { ...React, useState: () => [values[index++], () => {}], useEffect() {}, useCallback: value => value };
        return require(id);
      }
    });
    return renderToStaticMarkup(React.createElement(exports.default, { user: { id: role, role }, onInventoryChanged() {} }));
  }
  const draft = { id: 'document', documentNumber: 'STK-00000001', status: 'DRAFT', createdAt: new Date().toISOString(), createdBy: 'Keeper', items: [] };
  const adminHtml = render('ADMIN', draft);
  assert.ok(adminHtml.includes('اعتماد الجرد وتسوية الأرصدة'));
  assert.ok(adminHtml.includes('تغيير كلمة مرور الاعتماد'));
  assert.ok(adminHtml.includes('placeholder="ملاحظات الجرد"'));
  assert.ok(adminHtml.includes('placeholder="كلمة مرور اعتماد الجرد"'));
  assert.ok(adminHtml.includes('قيمة النقص') && adminHtml.includes('120.00'));
  assert.ok(adminHtml.includes('قيمة الزيادة') && adminHtml.includes('الصافي'));
  const keeperHtml = render('STOREKEEPER', draft);
  assert.ok(!keeperHtml.includes('اعتماد الجرد وتسوية الأرصدة'));
  assert.ok(!keeperHtml.includes('تغيير كلمة مرور الاعتماد'));
  assert.ok(keeperHtml.includes('حفظ مسودة'));
  assert.ok(keeperHtml.includes('حذف المسودة'));
  assert.ok(keeperHtml.includes('طباعة الجرد'));
  const approvedHtml = render('ADMIN', { ...draft, status: 'APPROVED', approvedAt: new Date().toISOString(), approvedBy: 'Manager' });
  assert.ok(!approvedHtml.includes('حفظ مسودة'));
  assert.ok(!approvedHtml.includes('اعتماد الجرد وتسوية الأرصدة'));
  assert.ok(!approvedHtml.includes('حذف المسودة'));
  assert.ok(approvedHtml.includes('حفظ الملاحظات') && approvedHtml.includes('طباعة الجرد'));
  assert.ok(!approvedHtml.match(/<textarea[^>]*\sdisabled=""/));
  assert.ok(approvedHtml.includes('Manager'));
  const reservedHtml = render('STOREKEEPER', null, {
    passwordConfigured: true,
    documents: [{ ...draft, id: 'other-draft', items: [{ productId: 'p2' }] }],
    products: [{ id: 'p2', code: 'RESERVED', name: 'Hose', costPrice: 10, stockQty: 5 }]
  });
  assert.ok(reservedHtml.includes('في المسودة'));
  assert.match(reservedHtml, /type="checkbox" disabled=""/);
  const source = read('src', 'app', 'page.tsx');
  assert.ok(source.includes("['INVENTORY', 'STOCKTAKE', 'SUPPLIERS', 'PURCHASES']"));
  assert.ok(source.includes("activeTab === 'STOCKTAKE' && isRoleAllowed('STOCKTAKE')"));
});

test('draft deletion UI confirms first, clears the editor only on server success, and retains it on failure', async () => {
  const source = read('src', 'components', 'StocktakePanel.tsx');
  const tree = ts.createSourceFile('StocktakePanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'run') declaration = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const outcome of ['cancel', 'success', 'failure']) {
    const calls = [];
    const errors = [];
    const reset = [];
    const document = { id: 'draft', revision: 2 };
    let listing = { documents: [{ id: 'draft' }, { id: 'other' }] };
    const exports = {};
    vm.runInNewContext(compile(`const ${declaration}; exports.run = run;`), {
      exports, Error, busy: false, document,
      window: { confirm: () => outcome !== 'cancel' },
      setError: error => errors.push(error), setMessage() {}, setBusy() {},
      setListing: update => { listing = update(listing); },
      setDocument: value => reset.push(value), setLines() {}, setNotes() {}, setDirty() {}, setApprovalPassword() {},
      request: async input => {
        calls.push(input);
        if (outcome === 'failure') throw new Error('stale draft');
        return { deletedId: 'draft' };
      }
    });
    await exports.run('delete');
    assert.equal(calls.length, outcome === 'cancel' ? 0 : 1);
    assert.equal(reset.length, outcome === 'success' ? 1 : 0);
    if (outcome === 'success') {
      assert.deepEqual(listing.documents, [{ id: 'other' }]);
      assert.equal(reset[0], null);
      assert.equal(calls[0].revision, 2);
    }
    if (outcome === 'failure') assert.ok(errors.includes('stale draft'));
  }
});
