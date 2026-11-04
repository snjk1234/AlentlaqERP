/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const odbc = require('odbc');
const { createAccountDiscount } = require('./account-discounts');
const { customerAccountBalance } = require('./order-returns');

test('Access persists, serializes and migrates independent account discounts',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-discounts-test-'));
    const databasePath = path.join(directory, 'discounts.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previousPath = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = databasePath;
    const modulePath = require.resolve('./access-client');
    const first = require(modulePath).createAccessClient();
    delete require.cache[modulePath];
    const second = require(modulePath).createAccessClient();
    const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
    try {
      await Promise.all([first.user.count(), second.user.count()]);
      const user = await first.user.create({ data: { username: 'discount-admin', name: 'Admin', password: 'test', role: 'ADMIN' } });
      const customer = await first.customer.create({ data: { name: 'discount-customer', openingBalance: 100 } });
      const supplier = await first.supplier.create({ data: { name: 'discount-supplier', openingBalance: 100 } });
      const bank = await first.bank.create({ data: { name: 'discount-bank', balance: 500 } });
      await second.customer.count();

      const results = await Promise.allSettled([
        createAccountDiscount(first, user.id, { kind: 'ALLOWED', accountId: customer.id, amount: 80, requestId: id(1), notes: 'خصم عميل' }),
        createAccountDiscount(second, user.id, { kind: 'ALLOWED', accountId: customer.id, amount: 80, requestId: id(2), notes: 'خصم عميل' })
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'ACCOUNT_DISCOUNT_INVALID').length, 1);
      let loadedCustomer = await first.customer.findUnique({
        where: { id: customer.id },
        include: { orders: true, payments: true, orderReturns: true, discounts: true }
      });
      assert.equal(loadedCustomer.discounts.length, 1);
      assert.equal(loadedCustomer.discounts[0].notes, 'خصم عميل');
      assert.equal(customerAccountBalance(loadedCustomer), 20);

      const input = { kind: 'EARNED', accountId: supplier.id, amount: 25, requestId: id(3), notes: 'خصم مورد' };
      const saved = await createAccountDiscount(first, user.id, input);
      assert.equal((await createAccountDiscount(second, user.id, input)).id, saved.id);
      assert.equal((await second.accountDiscount.findMany()).length, 2);
      assert.equal((await first.supplier.findUnique({ where: { id: supplier.id } })).balance, 75);
      assert.equal((await first.bank.findUnique({ where: { id: bank.id } })).balance, 500);

      let releaseTransaction;
      let signalTransaction;
      const gate = new Promise(resolve => { releaseTransaction = resolve; });
      const started = new Promise(resolve => { signalTransaction = resolve; });
      const transaction = first.$transaction(async tx => {
        await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: 1 } } });
        signalTransaction();
        await gate;
        throw new Error('rollback probe');
      });
      const rollback = assert.rejects(transaction, /rollback probe/);
      await started;
      let readCompleted = false;
      const pendingRead = second.supplier.findUnique({ where: { id: supplier.id } }).then(row => {
        readCompleted = true;
        return row;
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      const completedBeforeRollback = readCompleted;
      releaseTransaction();
      await rollback;
      assert.equal((await pendingRead).balance, 75);
      assert.equal(completedBeforeRollback, false);

      await assert.rejects(first.customer.create({ data: {
        name: 'forged-customer', openingBalance: 100,
        discounts: { create: { discountNumber: 'FORGED', requestId: id(4), kind: 'ALLOWED', amount: 101 } }
      } }), /واجهتها المصرح بها/);
      assert.equal(await first.customer.count({ where: { name: 'forged-customer' } }), 0);
      assert.equal(await first.accountDiscount.count(), 2);

      await first.$disconnect();
      await second.$disconnect();
      const connection = await odbc.connect(`Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${databasePath};`);
      try {
        await connection.query('ALTER TABLE [Supplier] DROP COLUMN [openingBalance]');
      } finally {
        await connection.close();
      }
      const migrated = await first.supplier.findUnique({ where: { id: supplier.id }, include: { discounts: true } });
      assert.equal(migrated.openingBalance, 100);
      assert.equal(migrated.balance, 75);
      assert.equal(migrated.discounts.length, 1);
      loadedCustomer = await first.customer.findUnique({
        where: { id: customer.id },
        include: { orders: true, payments: true, orderReturns: true, discounts: true }
      });
      assert.equal(customerAccountBalance(loadedCustomer), 20);
      assert.equal((await first.bank.findUnique({ where: { id: bank.id } })).balance, 500);
    } finally {
      await first.$disconnect();
      await second.$disconnect();
      if (previousPath === undefined) delete process.env.ACCESS_DB_PATH;
      else process.env.ACCESS_DB_PATH = previousPath;
      fs.unlinkSync(databasePath);
      const lockPath = path.join(directory, 'discounts.laccdb');
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
      fs.rmdirSync(directory);
    }
  });
