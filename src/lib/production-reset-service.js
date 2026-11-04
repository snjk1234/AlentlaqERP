/* eslint @typescript-eslint/no-require-imports: "off" */
const { TRANSACTION_MODELS, backupDatabase } = require('./production-reset');

const CONFIRM_WORD = 'تفريغ';
const MAX_VALUE = 1e12;
const MAX_QTY = 2147483647;
const TYPES = {
  bank: { column: 'balance', integer: false },
  supplier: { column: 'openingBalance', integer: false },
  customer: { column: 'openingBalance', integer: false },
  product: { column: 'stockQty', integer: true }
};

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

async function loadEntities(tx) {
  const [banks, suppliers, customers, products] = await Promise.all([
    tx.bank.findMany({ orderBy: { name: 'asc' } }),
    tx.supplier.findMany({ orderBy: { name: 'asc' } }),
    tx.customer.findMany({ orderBy: { name: 'asc' } }),
    tx.product.findMany({ orderBy: { code: 'asc' } })
  ]);
  return {
    bank: banks.map(row => ({ id: row.id, name: row.name, value: Number(row.balance) })),
    supplier: suppliers.map(row => ({ id: row.id, name: row.name, value: Number(row.openingBalance), current: Number(row.balance) })),
    customer: customers.filter(row => row.id !== 'CASH').map(row => ({ id: row.id, name: row.name, value: Number(row.openingBalance) })),
    product: products.map(row => ({ id: row.id, name: [row.code, row.name, row.size, row.color].filter(Boolean).join(' - '), value: Number(row.stockQty) }))
  };
}

async function countTransactions(tx) {
  const counts = {};
  for (const model of TRANSACTION_MODELS) counts[model] = await tx[model].count({});
  return counts;
}

function validateValues(input, entities) {
  if (!Array.isArray(input) || input.length > 200000) fail('بيانات الأرصدة غير صالحة.');
  const submitted = new Map();
  for (const row of input) {
    if (!row || typeof row !== 'object' || !TYPES[row.type] || typeof row.id !== 'string') fail('بيانات الأرصدة غير صالحة.');
    const key = `${row.type}:${row.id}`;
    if (submitted.has(key)) fail('بيانات الأرصدة تحتوي سجلًا مكررًا.');
    const raw = typeof row.value === 'string' ? row.value.trim() : row.value;
    const value = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) fail('توجد قيمة رصيد أو كمية غير صالحة.');
    if (TYPES[row.type].integer && (!Number.isInteger(value) || value < 0 || value > MAX_QTY)) fail('كمية المخزون يجب أن تكون عددًا صحيحًا غير سالب.');
    submitted.set(key, value);
  }
  const rows = [];
  for (const [type, list] of Object.entries(entities)) {
    for (const entity of list) {
      const key = `${type}:${entity.id}`;
      if (!submitted.has(key)) fail('قائمة الأرصدة قديمة أو ناقصة. أعد فتح الصفحة وحاول مرة أخرى.', 409);
      rows.push({ type, id: entity.id, value: submitted.get(key) });
      submitted.delete(key);
    }
  }
  if (submitted.size) fail('قائمة الأرصدة قديمة أو ناقصة. أعد فتح الصفحة وحاول مرة أخرى.', 409);
  return rows;
}

async function productionResetOperation(database, userId, input, options = {}) {
  if (!input || typeof input !== 'object') fail('بيانات التفريغ غير صالحة.');
  const action = input.action;
  if (!['preview', 'execute'].includes(action)) fail('إجراء التفريغ غير صالح.');
  const backup = options.backup || (() => {
    if (!process.env.ACCESS_DB_PATH) fail('تعذر تحديد ملف قاعدة البيانات لإنشاء النسخة الاحتياطية.', 500);
    return backupDatabase(require('node:path').resolve(process.env.ACCESS_DB_PATH), new Date(), { allowOpen: true });
  });

  const authorize = async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!user) fail('انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    if (user.role !== 'ADMIN') fail('تفريغ البيانات متاح للمدير فقط.', 403);
    return user;
  };

  if (action === 'preview') {
    return database.$transaction(async tx => {
      await authorize(tx);
      return { counts: await countTransactions(tx), entities: await loadEntities(tx), confirmWord: CONFIRM_WORD };
    });
  }

  // Validate and take the backup before the destructive transaction starts.
  const { user, rows } = await database.$transaction(async tx => {
    const admin = await authorize(tx);
    return { user: admin, rows: validateValues(input.values, await loadEntities(tx)) };
  });
  if (typeof input.password !== 'string' || input.password !== user.password) fail('كلمة مرور حساب المدير غير صحيحة.', 403);
  if (input.confirm !== CONFIRM_WORD) fail(`اكتب كلمة «${CONFIRM_WORD}» للتأكيد.`);
  const backupPath = backup();

  const deleted = await database.$transaction(async tx => {
    await authorize(tx);
    const counts = await countTransactions(tx);
    for (const model of TRANSACTION_MODELS) {
      for (const record of await tx[model].findMany({})) await tx[model].delete({ where: { id: record.id } });
    }
    for (const row of rows) {
      if (row.type === 'supplier') {
        await tx.supplier.update({ where: { id: row.id }, data: { openingBalance: row.value } });
        await tx.supplier.update({ where: { id: row.id }, data: { balance: row.value } });
      } else {
        await tx[row.type].update({ where: { id: row.id }, data: { [TYPES[row.type].column]: row.value } });
      }
    }
    for (const quota of await tx.customerCeilingQuota.findMany({})) {
      if (quota.deliveredQuantity) await tx.customerCeilingQuota.update({ where: { id: quota.id }, data: { deliveredQuantity: 0 } });
    }
    for (const model of TRANSACTION_MODELS) {
      if (await tx[model].count({})) fail(`فشل التحقق بعد التفريغ: الجدول ${model} غير فارغ.`, 500);
    }
    return counts;
  });
  console.warn(`Production reset executed by ${user.username}; backup: ${backupPath}`);
  return { deleted, backupPath };
}

module.exports = { productionResetOperation, CONFIRM_WORD };
