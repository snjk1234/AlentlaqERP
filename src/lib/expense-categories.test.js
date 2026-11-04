/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { expenseCategoryOperation } = require('./expense-categories');
const root = path.join(__dirname, '..', '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('expense form manages categories inline and the external manager and unauthenticated creation are gone', () => {
  const page = read('src\\app\\page.tsx');
  assert.match(page, /<ProductOptionField\s+label="التصنيف \*"[\s\S]*?valueBy="id"[\s\S]*?canManage=\{currentUser\?\.role === 'ADMIN'\}/);
  assert.doesNotMatch(page, /إدارة التصنيفات|showExpenseCategoryModal|createExpenseCategory/);
  assert.doesNotMatch(read('electron\\main.js'), /create-expense-category/);
  assert.doesNotMatch(read('electron\\preload.js'), /createExpenseCategory/);
  assert.match(read('electron\\main.js'), /expense-category-operation[\s\S]*data\?\.action !== 'list' && user\.role !== 'ADMIN'/);
  assert.match(read('src\\proxy.ts'), /request\.method === 'POST' && request\.nextUrl\.pathname === '\/api\/expense-categories'/);
  assert.match(read('src\\lib\\remote-client.js'), /expenseCategoryOperation[\s\S]*\/api\/expense-categories/);
});

test('Access expense categories add, rename, delete with admin-only writes and in-use protection',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-expense-categories-'));
    const file = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, file);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = file;
    const db = createAccessClient();
    try {
      const admin = await db.user.create({ data: { username: 'cat-admin', name: 'Admin', password: 'x', role: 'ADMIN' } });
      const cashier = await db.user.create({ data: { username: 'cat-cashier', name: 'Cashier', password: 'x', role: 'CASHIER' } });
      const op = (user, input) => expenseCategoryOperation(db, user.id, input);

      assert.deepEqual((await op(cashier, { action: 'list' })).options, []);
      await assert.rejects(op(cashier, { action: 'add', value: 'رواتب' }), /للمدير فقط/);
      await assert.rejects(op({ id: 'missing' }, { action: 'list' }), /انتهت الجلسة/);
      await assert.rejects(op(admin, { action: 'add', value: '  ' }), /أدخل اسم/);
      await assert.rejects(op(admin, { action: 'add', value: 'x'.repeat(101) }), /يتجاوز/);
      await assert.rejects(op(admin, { action: 'add', value: 'a\u0000b' }), /غير صالحة/);
      await assert.rejects(op(admin, { action: 'bogus' }), /غير صالح/);

      const rent = await op(admin, { action: 'add', value: '  إيجار   المخزن ' });
      assert.equal(rent.created.value, 'إيجار المخزن');
      await assert.rejects(op(admin, { action: 'add', value: 'إيجار  المخزن' }), /موجود/);
      const salaries = await op(admin, { action: 'add', value: 'رواتب' });
      assert.deepEqual(salaries.options.map(row => row.name), ['إيجار المخزن', 'رواتب']);

      await assert.rejects(op(admin, { action: 'rename', id: salaries.created.id, value: 'إيجار المخزن' }), /موجود/);
      const renamed = await op(admin, { action: 'rename', id: salaries.created.id, value: 'مرتبات' });
      assert.ok(renamed.options.some(row => row.id === salaries.created.id && row.name === 'مرتبات'));

      const bank = await db.bank.create({ data: { name: 'Cat bank' } });
      await db.generalExpense.create({ data: { expenseNumber: 'GE-1', bankId: bank.id, categoryId: rent.created.id, amount: 5 } });
      await assert.rejects(op(admin, { action: 'delete', id: rent.created.id }), /مستخدم في 1 مصروف/);
      const after = await op(admin, { action: 'delete', id: salaries.created.id });
      assert.deepEqual(after.options.map(row => row.name), ['إيجار المخزن']);
      await assert.rejects(op(admin, { action: 'delete', id: salaries.created.id }), /غير موجود/);
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH; else process.env.ACCESS_DB_PATH = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
