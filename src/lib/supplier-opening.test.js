/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const odbc = require('odbc');
const { createAccessClient, encodeText } = require('./access-client');

test('Access migration preserves supplier balances and opening balance survives movements and reconnect',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-opening-test-'));
    const databasePath = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, databasePath);
    const previousPath = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = databasePath;
    const database = createAccessClient();
    try {
      const connection = await odbc.connect(`Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${databasePath};`);
      const expected = [];
      try {
        const columns = await connection.columns(null, null, 'Supplier', null);
        if (columns.some(column => column.COLUMN_NAME.toLowerCase() === 'openingbalance')) {
          await connection.query('ALTER TABLE [Supplier] DROP COLUMN [openingBalance]');
        }
        const suppliers = await connection.query('SELECT [id], [balance] FROM [Supplier]');
        for (const supplier of suppliers) {
          const purchases = await connection.query(`SELECT SUM([netAmount]) AS [total] FROM [PurchaseOrder] WHERE [supplierId] = ${encodeText(supplier.id)}`);
          const payments = await connection.query(`SELECT SUM([amount]) AS [total] FROM [ExpensePayment] WHERE [supplierId] = ${encodeText(supplier.id)}`);
          expected.push({
            id: supplier.id, balance: Number(supplier.balance),
            opening: Number(supplier.balance) - Number(purchases[0].total || 0) + Number(payments[0].total || 0)
          });
        }
      } finally {
        await connection.close();
      }
      for (const supplier of expected) {
        const migrated = await database.supplier.findUnique({ where: { id: supplier.id } });
        assert.equal(migrated.balance, supplier.balance);
        assert.equal(migrated.openingBalance, supplier.opening);
      }
      const supplier = await database.supplier.create({ data: { name: `opening-test-${Date.now()}`, openingBalance: 500 } });
      assert.equal(supplier.balance, 500);
      assert.equal(supplier.openingBalance, 500);
      await database.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: 200 } } });
      await database.supplier.update({ where: { id: supplier.id }, data: { balance: { decrement: 50 } } });
      let updated = await database.supplier.findUnique({ where: { id: supplier.id } });
      assert.equal(updated.balance, 650);
      assert.equal(updated.openingBalance, 500);
      updated = await database.supplier.update({ where: { id: supplier.id }, data: { openingBalance: 1000 } });
      assert.equal(updated.balance, 1150);
      assert.equal(updated.openingBalance, 1000);
      await database.$disconnect();
      updated = await database.supplier.findUnique({ where: { id: supplier.id } });
      assert.equal(updated.balance, 1150);
      assert.equal(updated.openingBalance, 1000);
      for (const original of expected) {
        const reloaded = await database.supplier.findUnique({ where: { id: original.id } });
        assert.equal(reloaded.balance, original.balance);
        assert.equal(reloaded.openingBalance, original.opening);
      }
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
