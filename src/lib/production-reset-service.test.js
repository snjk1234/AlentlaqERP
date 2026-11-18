/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { productionResetOperation } = require('./production-reset-service');
const { TRANSACTION_MODELS } = require('./production-reset');

test('production reset preview lists product attributes as values without field names', async () => {
  const product = {
    id: 'p1', code: 'P-1', name: 'Pipe', size: '20', color: 'Blue', type: 'PVC',
    gauge: 'Heavy', supplier: { name: 'Vendor' }, length: '3m', weight: '5kg', stockQty: 10
  };
  const tx = {
    user: { findUnique: async () => ({ id: 'admin', role: 'ADMIN' }) },
    bank: { findMany: async () => [] },
    supplier: { findMany: async () => [] },
    customer: { findMany: async () => [] },
    product: { findMany: async () => [product] }
  };
  for (const model of TRANSACTION_MODELS) {
    tx[model] = { ...(tx[model] || {}), count: async () => 0 };
  }
  const database = { $transaction: callback => callback(tx) };

  const preview = await productionResetOperation(database, 'admin', { action: 'preview' });
  assert.equal(preview.entities.product[0].details, 'PVC · Heavy · Vendor · 3m · 5kg');
  for (const label of ['النوع:', 'الدرجة:', 'المورد:', 'الطول:', 'الوزن:']) {
    assert.ok(!preview.entities.product[0].details.includes(label), label);
  }
});

test('production reset service enforces admin, validation and applies values',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-reset-svc-'));
    const file = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, file);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = file;
    const db = createAccessClient();
    try {
      const admin = await db.user.create({ data: { username: 'svc-admin', name: 'A', password: 'secret', role: 'ADMIN' } });
      const cashier = await db.user.create({ data: { username: 'svc-cashier', name: 'C', password: 'pw', role: 'CASHIER' } });
      const bank = await db.bank.create({ data: { name: 'Bank', balance: 999 } });
      const supplier = await db.supplier.create({ data: { name: 'Sup', balance: 500, openingBalance: 100 } });
      const customer = await db.customer.create({ data: { name: 'Cust', openingBalance: 5 } });
      const product = await db.product.create({ data: { code: 'S1', name: 'Prod', type: 'Test', size: '20', price: 10, stockQty: 42 } });
      const { createAccountDiscount } = require('./account-discounts');
      await createAccountDiscount(db, admin.id, { kind: 'ALLOWED', accountId: customer.id, amount: 2, requestId: '00000000-0000-4000-8000-000000000001' });
      await createAccountDiscount(db, admin.id, { kind: 'EARNED', accountId: supplier.id, amount: 10, requestId: '00000000-0000-4000-8000-000000000002' });
      await db.payment.create({ data: { customerId: customer.id, bankId: bank.id, amount: 10, date: new Date() } });

      await assert.rejects(productionResetOperation(db, cashier.id, { action: 'preview' }), /للمدير فقط/);
      const preview = await productionResetOperation(db, admin.id, { action: 'preview' });
      assert.equal(preview.counts.payment, 1);
      assert.equal(preview.counts.accountDiscount, 2);

      const values = [
        { type: 'bank', id: bank.id, value: '1500.5' }, { type: 'supplier', id: supplier.id, value: '250' },
        { type: 'customer', id: customer.id, value: '8' }, { type: 'product', id: product.id, value: '17' }
      ].filter(row => preview.entities[row.type].some(entity => entity.id === row.id));
      const all = ['bank', 'supplier', 'customer', 'product'].flatMap(type => preview.entities[type].map(entity => {
        const edit = values.find(row => row.type === type && row.id === entity.id);
        return { type, id: entity.id, value: edit ? edit.value : String(entity.value) };
      }));
      let backups = 0;
      const options = { backup: () => { backups += 1; return 'backup.accdb'; } };
      const base = { action: 'execute', values: all, password: 'secret', confirm: 'تفريغ' };

      await assert.rejects(productionResetOperation(db, admin.id, { ...base, password: 'bad' }, options), /كلمة مرور/);
      await assert.rejects(productionResetOperation(db, admin.id, { ...base, confirm: 'x' }, options), /للتأكيد/);
      await assert.rejects(productionResetOperation(db, admin.id, { ...base, values: all.slice(1) }, options), /قديمة أو ناقصة/);
      await assert.rejects(productionResetOperation(db, admin.id, { ...base, values: all.map((r, i) => i === 0 ? { ...r, value: 'abc' } : r) }, options), /غير صالحة/);
      assert.equal(backups, 0);
      assert.equal(await db.payment.count({}), 1);
      assert.equal(await db.accountDiscount.count({}), 2);

      const result = await productionResetOperation(db, admin.id, base, options);
      assert.equal(result.backupPath, 'backup.accdb');
      assert.equal(result.deleted.payment, 1);
      assert.equal(result.deleted.accountDiscount, 2);
      assert.equal(await db.payment.count({}), 0);
      assert.equal(await db.accountDiscount.count({}), 0);
      assert.equal((await db.bank.findUnique({ where: { id: bank.id } })).balance, 1500.5);
      const sup = await db.supplier.findUnique({ where: { id: supplier.id } });
      assert.equal(sup.openingBalance, 250);
      assert.equal(sup.balance, 250);
      assert.equal((await db.customer.findUnique({ where: { id: customer.id } })).openingBalance, 8);
      assert.equal((await db.product.findUnique({ where: { id: product.id } })).stockQty, 17);
      assert.ok(await db.user.findUnique({ where: { id: admin.id } }));
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH; else process.env.ACCESS_DB_PATH = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
