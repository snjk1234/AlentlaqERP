/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const { models } = require('./access-client');

// Children first so foreign keys never block a delete.
const TRANSACTION_MODELS = [
  'stocktakeItem', 'stocktake', 'orderReturnItem', 'orderReturn', 'orderItem', 'order',
  'payment', 'expensePayment', 'generalExpense', 'purchaseOrderItem', 'purchaseOrder', 'bankTransfer', 'accountDiscount'
];
const ENTITY_TYPES = {
  bank: { model: 'bank', column: 'balance', label: 'رصيد البنك', integer: false },
  supplier: { model: 'supplier', column: 'openingBalance', label: 'الرصيد الافتتاحي للمورد', integer: false },
  customer: { model: 'customer', column: 'openingBalance', label: 'الرصيد الافتتاحي للعميل', integer: false },
  product: { model: 'product', column: 'stockQty', label: 'كمية المخزون', integer: true }
};

const quote = name => `[${name}]`;
const table = model => quote(models[model].table);
const text = value => `'${String(value).replace(/'/g, "''")}'`;
const csvCell = value => {
  const cell = String(value ?? '');
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(content).replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

async function count(connection, model) {
  const result = await connection.query(`SELECT COUNT(*) AS [n] FROM ${table(model)}`);
  return Number(result[0].n);
}

async function loadEntities(connection) {
  const entities = {};
  for (const [type, config] of Object.entries(ENTITY_TYPES)) {
    const label = type === 'product' ? '[code] AS [name]' : '[name]';
    const rows = await connection.query(`SELECT [id], ${label}, ${quote(config.column)} AS [value] FROM ${table(config.model)}`);
    entities[type] = rows.map(row => ({ id: String(row.id), name: String(row.name ?? ''), value: Number(row.value ?? 0) }));
  }
  return entities;
}

async function exportTemplate(connection) {
  const entities = await loadEntities(connection);
  const lines = ['type,id,name,current,value'];
  for (const type of Object.keys(ENTITY_TYPES)) {
    for (const row of entities[type]) lines.push([type, row.id, row.name, row.value, row.value].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function parseOpening(content, entities) {
  const rows = parseCsv(content);
  const header = (rows.shift() || []).map(value => value.trim().toLowerCase());
  const column = name => header.indexOf(name);
  const [typeIndex, idIndex, valueIndex] = [column('type'), column('id'), column('value')];
  if (typeIndex < 0 || idIndex < 0 || valueIndex < 0) throw new Error('ملف الأرصدة يجب أن يحتوي الأعمدة type وid وvalue.');
  const known = Object.fromEntries(Object.entries(entities).map(([type, list]) => [type, new Set(list.map(row => row.id))]));
  const seen = new Set();
  const result = [];
  for (const [offset, row] of rows.entries()) {
    const line = offset + 2;
    const type = (row[typeIndex] || '').trim();
    const id = (row[idIndex] || '').trim();
    const raw = (row[valueIndex] || '').trim();
    if (!ENTITY_TYPES[type]) throw new Error(`السطر ${line}: نوع غير معروف «${type}».`);
    if (!known[type].has(id)) throw new Error(`السطر ${line}: المعرّف غير موجود في قاعدة البيانات.`);
    if (seen.has(`${type}:${id}`)) throw new Error(`السطر ${line}: السجل مكرر.`);
    seen.add(`${type}:${id}`);
    const value = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error(`السطر ${line}: القيمة «${raw}» غير صالحة.`);
    if (ENTITY_TYPES[type].integer && !Number.isInteger(value)) throw new Error(`السطر ${line}: كمية المخزون يجب أن تكون عددًا صحيحًا.`);
    result.push({ type, id, value });
  }
  return result;
}

async function buildPlan(connection, openingContent) {
  const entities = await loadEntities(connection);
  const deletions = {};
  for (const model of TRANSACTION_MODELS) deletions[model] = await count(connection, model);
  const opening = openingContent === undefined ? [] : parseOpening(openingContent, entities);
  const provided = new Set(opening.map(row => `${row.type}:${row.id}`));
  const missing = [];
  for (const [type, list] of Object.entries(entities)) {
    for (const row of list) if (!provided.has(`${type}:${row.id}`)) missing.push({ type, id: row.id, name: row.name });
  }
  return { deletions, entities, opening, missing };
}

async function execute(connection, plan, { allowMissing = false } = {}) {
  if (plan.missing.length && !allowMissing) {
    throw new Error(`ملف الأرصدة لا يغطي ${plan.missing.length} سجلًا. أكمله أو استخدم allowMissing للإبقاء على القيم الحالية لها.`);
  }
  await connection.beginTransaction();
  try {
    for (const model of TRANSACTION_MODELS) await connection.query(`DELETE FROM ${table(model)}`);
    for (const row of plan.opening) {
      const config = ENTITY_TYPES[row.type];
      const sets = [`${quote(config.column)} = ${row.value}`];
      if (row.type === 'supplier') sets.push(`[balance] = ${row.value}`);
      await connection.query(`UPDATE ${table(config.model)} SET ${sets.join(', ')}, [updatedAt] = Now() WHERE [id] = ${text(row.id)}`);
    }
    // Supplier balance is stored, so any supplier left out of the file falls back to its opening balance.
    const provided = new Set(plan.opening.filter(row => row.type === 'supplier').map(row => row.id));
    for (const row of plan.missing.filter(item => item.type === 'supplier' && !provided.has(item.id))) {
      await connection.query(`UPDATE ${table('supplier')} SET [balance] = [openingBalance], [updatedAt] = Now() WHERE [id] = ${text(row.id)}`);
    }
    await connection.query(`UPDATE ${table('customerCeilingQuota')} SET [deliveredQuantity] = 0, [updatedAt] = Now()`);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Rollback failed:', rollbackError); }
    throw error;
  }
}

function backupDatabase(dbPath, now = new Date(), { allowOpen = false } = {}) {
  const lock = dbPath.replace(/\.(accdb|mdb)$/i, m => `.l${m.slice(1)}`);
  if (!allowOpen && fs.existsSync(lock)) throw new Error('قاعدة البيانات مفتوحة حاليًا. أوقف الخادم وكل المحطات ثم أعد المحاولة.');
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const target = path.join(path.dirname(dbPath), `${path.basename(dbPath, path.extname(dbPath))}.before-reset-${stamp}${path.extname(dbPath)}`);
  if (fs.existsSync(target)) throw new Error(`النسخة الاحتياطية موجودة مسبقًا: ${target}`);
  fs.copyFileSync(dbPath, target, fs.constants.COPYFILE_EXCL);
  if (fs.statSync(target).size !== fs.statSync(dbPath).size) throw new Error('فشل التحقق من النسخة الاحتياطية.');
  return target;
}

module.exports = { TRANSACTION_MODELS, ENTITY_TYPES, parseCsv, exportTemplate, parseOpening, buildPlan, execute, backupDatabase, count };
