/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const reset = require('./production-reset');

test('CSV parser handles quotes, commas, BOM and blank lines', () => {
  assert.deepEqual(reset.parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n\r\n3,\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['3', '']]);
});

test('opening balance file validation rejects unknown, duplicate and invalid rows', () => {
  const entities = { bank: [{ id: 'b1' }], supplier: [], customer: [], product: [{ id: 'p1' }] };
  const parse = rows => reset.parseOpening(`type,id,name,current,value\n${rows}`, entities);
  assert.deepEqual(parse('bank,b1,x,0,10.5\nproduct,p1,x,0,3'), [{ type: 'bank', id: 'b1', value: 10.5 }, { type: 'product', id: 'p1', value: 3 }]);
  assert.throws(() => parse('safe,b1,x,0,1'), /نوع غير معروف/);
  assert.throws(() => parse('bank,zzz,x,0,1'), /غير موجود/);
  assert.throws(() => parse('bank,b1,x,0,1\nbank,b1,x,0,2'), /مكرر/);
  assert.throws(() => parse('bank,b1,x,0,abc'), /غير صالحة/);
  assert.throws(() => parse('bank,b1,x,0,'), /غير صالحة/);
  assert.throws(() => parse('product,p1,x,0,1.5'), /عددًا صحيحًا/);
  assert.throws(() => reset.parseOpening('type,id\nbank,b1', entities), /الأعمدة/);
});

test('Access reset deletes only transactions, applies opening balances and leaves master data',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const odbc = require('odbc');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-reset-'));
    const file = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, file);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = file;
    const db = createAccessClient();
    try {
      const user = await db.user.create({ data: { username: 'reset-user', name: 'U', password: 'x', role: 'ADMIN' } });
      const bank = await db.bank.create({ data: { name: 'Main bank', balance: 999 } });
      const supplier = await db.supplier.create({ data: { name: 'Sup', balance: 500, openingBalance: 100 } });
      const other = await db.supplier.create({ data: { name: 'Sup2', balance: 70, openingBalance: 20 } });
      const customer = await db.customer.create({ data: { name: 'Cust', openingBalance: 5 } });
      const product = await db.product.create({ data: { code: 'R1', name: 'Prod', type: 'Test', size: '20', price: 10, stockQty: 42 } });
      await db.customerCeilingQuota.create({ data: { customerId: customer.id, productId: product.id, buildingsCount: 1, floorsCount: 1, quantityPerFloor: 5, totalQuantity: 5, deliveredQuantity: 4 } });
      const { createAccountDiscount } = require('./account-discounts');
      await createAccountDiscount(db, user.id, { kind: 'ALLOWED', accountId: customer.id, amount: 2, requestId: '00000000-0000-4000-8000-000000000001' });
      await createAccountDiscount(db, user.id, { kind: 'EARNED', accountId: supplier.id, amount: 10, requestId: '00000000-0000-4000-8000-000000000002' });
      await db.payment.create({ data: { customerId: customer.id, bankId: bank.id, amount: 10, date: new Date() } });
      await db.purchaseOrder.create({ data: { billNumber: 'P1', supplierId: supplier.id, totalAmount: 1, taxAmount: 0, netAmount: 1,
        items: { create: [{ productId: product.id, quantity: 1, unitCost: 1, taxAmount: 0, total: 1 }] } } });
      await db.generalExpense.create({ data: { expenseNumber: 'GE-1', bankId: bank.id, categoryId: (await db.expenseCategory.create({ data: { name: 'Cat' } })).id, amount: 3 } });
      await db.$disconnect();

      const connection = await odbc.connect(`Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${file};`);
      try {
        const template = await reset.exportTemplate(connection);
        assert.match(template, /^\uFEFFtype,id,name,current,value/);
        assert.match(template, new RegExp(`bank,${bank.id},Main bank,999,999`));
        const filled = template.replace(`Main bank,999,999`, 'Main bank,999,1500.5').replace('R1,42,42', 'R1,42,17')
          .replace(`Sup,100,100`, 'Sup,100,250').replace(',Cust,5,5', ',Cust,5,8')
          .split('\r\n').filter(line => !line.includes(other.id)).join('\r\n');
        const plan = await reset.buildPlan(connection, filled);
        assert.equal(plan.deletions.payment, 1);
        assert.equal(plan.deletions.accountDiscount, 2);
        assert.equal(plan.deletions.purchaseOrderItem, 1);
        assert.deepEqual(plan.missing.map(row => row.id), [other.id]);
        await assert.rejects(reset.execute(connection, plan), /لا يغطي 1/);
        assert.equal(await reset.count(connection, 'payment'), 1, 'refused run changes nothing');
        assert.equal(await reset.count(connection, 'accountDiscount'), 2, 'refused run preserves discounts');
        await reset.execute(connection, plan, { allowMissing: true });
        for (const model of reset.TRANSACTION_MODELS) assert.equal(await reset.count(connection, model), 0, model);
      } finally { await connection.close(); }

      const check = createAccessClient();
      try {
        assert.equal((await check.bank.findUnique({ where: { id: bank.id } })).balance, 1500.5);
        const s1 = await check.supplier.findUnique({ where: { id: supplier.id } });
        assert.equal(s1.openingBalance, 250); assert.equal(s1.balance, 250);
        const s2 = await check.supplier.findUnique({ where: { id: other.id } });
        assert.equal(s2.openingBalance, 20); assert.equal(s2.balance, 20, 'missing supplier balance falls back to opening');
        assert.equal((await check.customer.findUnique({ where: { id: customer.id } })).openingBalance, 8);
        assert.equal((await check.product.findUnique({ where: { id: product.id } })).stockQty, 17);
        assert.equal((await check.customerCeilingQuota.findMany({}))[0].deliveredQuantity, 0);
        assert.equal((await check.user.findUnique({ where: { id: user.id } })).username, 'reset-user', 'users kept');
        assert.equal((await check.expenseCategory.findMany({})).length, 1, 'categories kept');
      } finally { await check.$disconnect(); }
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH; else process.env.ACCESS_DB_PATH = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

test('backup refuses an open database and never overwrites an existing backup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-reset-backup-'));
  try {
    const file = path.join(directory, 'live.accdb');
    fs.writeFileSync(file, 'data');
    fs.writeFileSync(path.join(directory, 'live.laccdb'), 'lock');
    assert.throws(() => reset.backupDatabase(file), /مفتوحة/);
    fs.rmSync(path.join(directory, 'live.laccdb'));
    const now = new Date('2026-10-28T10:00:00Z');
    const backup = reset.backupDatabase(file, now);
    assert.equal(fs.readFileSync(backup, 'utf8'), 'data');
    assert.match(path.basename(backup), /^live\.before-reset-20261028100000\.accdb$/);
    assert.throws(() => reset.backupDatabase(file, now), /موجودة/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('CLI refuses execution without opening file and confirmation, and shows usage', () => {
  const script = path.join(__dirname, '..', '..', 'scripts', 'reset-for-production.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-reset-cli-'));
  try {
    const file = path.join(directory, 'live.accdb');
    fs.writeFileSync(file, 'data');
    const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.notEqual(run([]).status, 0);
    assert.match(run(['--db', file, '--execute']).stderr, /--confirm RESET/);
    assert.match(run(['--db', file, '--opening', 'x.csv', '--execute', '--confirm', 'yes']).stderr, /--confirm RESET/);
    assert.match(run(['--db', file, '--bogus']).stderr, /خيار غير معروف/);
    assert.deepEqual(fs.readdirSync(directory), ['live.accdb'], 'no backup is created when arguments are invalid');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
