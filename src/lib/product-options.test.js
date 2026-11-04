/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { productOptionOperation, DEFAULT_PRODUCT_OPTIONS } = require('./product-options');
const root = path.join(__dirname, '..', '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('product option form wiring is admin-only, shared and available to web and Electron', () => {
  const page = read('src\\app\\page.tsx');
  for (const kind of ['type', 'gauge', 'color']) assert.match(page, new RegExp(`<ProductOptionField\\s+kind="${kind}"`));
  assert.equal((page.match(/canManage=\{currentUser\?\.role === 'ADMIN'\}/g) || []).length, 4);
  assert.doesNotMatch(page, /\['مواسير', 'خراطيم'/);
  assert.match(read('src\\proxy.ts'), /\/api\/product-options/);
  assert.match(read('src\\app\\api\\db\\route.ts'), /modelName === 'productOption'/);
  assert.match(read('electron\\preload.js'), /product-option-operation/);
  const main = read('electron\\main.js');
  assert.match(main, /product-option-operation[\s\S]*data\?\.action !== 'list' && user\.role !== 'ADMIN'/);
  assert.match(read('src\\lib\\remote-client.js'), /\/api\/product-options/);
});

test('Access product options seed, add, rename, protect and delete with admin-only writes',
  { skip: !process.env.ACCESS_TEST_SOURCE_DB }, async () => {
    const { createAccessClient } = require('./access-client');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-product-options-'));
    const file = path.join(directory, 'test.accdb');
    fs.copyFileSync(process.env.ACCESS_TEST_SOURCE_DB, file);
    const previous = process.env.ACCESS_DB_PATH;
    process.env.ACCESS_DB_PATH = file;
    const db = createAccessClient();
    try {
      const admin = await db.user.create({ data: { username: 'opt-admin', name: 'Admin', password: 'x', role: 'ADMIN' } });
      const cashier = await db.user.create({ data: { username: 'opt-cashier', name: 'Cashier', password: 'x', role: 'CASHIER' } });
      const product = await db.product.create({ data: { code: 'O1', name: 'Legacy', type: 'نوع قديم', color: ' لون   قديم ', gauge: 'بيور', size: '20', price: 10 } });
      const op = (user, input) => productOptionOperation(db, user.id, input);

      const listed = (await op(cashier, { action: 'list' })).options;
      assert.deepEqual(listed.type.slice(0, 10).map(o => o.value), DEFAULT_PRODUCT_OPTIONS.type);
      assert.ok(listed.type.some(o => o.value === 'نوع قديم'), 'existing product values are seeded');
      assert.ok(listed.color.some(o => o.value === 'لون قديم'));
      assert.equal(listed.gauge.filter(o => o.value === 'بيور').length, 1);
      assert.equal((await op(admin, { action: 'list' })).options.type.length, listed.type.length, 'seeding runs once');

      await assert.rejects(op(cashier, { action: 'add', kind: 'color', value: 'بنفسجي' }), /للمدير فقط/);
      await assert.rejects(op(admin, { action: 'add', kind: 'size', value: 'x' }), /نوع القائمة/);
      await assert.rejects(op(admin, { action: 'add', kind: 'color', value: '   ' }), /أدخل اسم/);
      await assert.rejects(op(admin, { action: 'add', kind: 'color', value: 'x'.repeat(101) }), /يتجاوز/);
      await assert.rejects(op(admin, { action: 'add', kind: 'color', value: 'a\u0000b' }), /غير صالحة/);
      await assert.rejects(op(admin, { action: 'add', kind: 'color', value: 'أبيض' }), /موجود/);
      await assert.rejects(op({ id: 'missing' }, { action: 'list' }), /انتهت الجلسة/);

      const added = await op(admin, { action: 'add', kind: 'color', value: '  بنفسجي   فاتح ' });
      assert.equal(added.created.value, 'بنفسجي فاتح');
      assert.equal(added.options.color.at(-1).value, 'بنفسجي فاتح');
      await assert.rejects(op(admin, { action: 'add', kind: 'color', value: 'بنفسجي  فاتح' }), /موجود/);

      const legacy = added.options.type.find(o => o.value === 'نوع قديم');
      await assert.rejects(op(admin, { action: 'delete', kind: 'type', id: legacy.id }), /مستخدم في 1 صنف/);
      const protectedType = added.options.type.find(o => o.value === 'مواسير');
      await assert.rejects(op(admin, { action: 'rename', kind: 'type', id: protectedType.id, value: 'x' }), /أساسي/);
      await assert.rejects(op(admin, { action: 'delete', kind: 'type', id: protectedType.id }), /أساسي/);
      await assert.rejects(op(admin, { action: 'rename', kind: 'type', id: legacy.id, value: 'مواسير' }), /موجود|محجوز/);

      await op(admin, { action: 'rename', kind: 'type', id: legacy.id, value: 'نوع جديد' });
      assert.equal((await db.product.findUnique({ where: { id: product.id } })).type, 'نوع جديد');
      const after = await op(admin, { action: 'delete', kind: 'color', id: added.created.id });
      assert.ok(!after.options.color.some(o => o.value === 'بنفسجي فاتح'));
      await assert.rejects(op(admin, { action: 'delete', kind: 'color', id: added.created.id }), /غير موجود/);
    } finally {
      await db.$disconnect();
      if (previous === undefined) delete process.env.ACCESS_DB_PATH; else process.env.ACCESS_DB_PATH = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
