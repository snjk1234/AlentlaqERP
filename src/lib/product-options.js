/* eslint @typescript-eslint/no-require-imports: "off" */
const KINDS = ['type', 'color', 'gauge'];
const SEED_KIND = 'seed';
const MAX_LENGTH = 100;
const DEFAULTS = {
  type: ['مواسير', 'خراطيم', 'بواط', 'سسته', 'أكواع', 'علب', 'أفيز', 'جلب', 'اسلاك', 'خيط دبارة'],
  color: ['كل الالوان', 'أبيض', 'أحمر', 'أزرق', 'أخضر', 'أصفر', 'برتقالي', 'أسود', 'رصاصي', 'مقاوم'],
  gauge: ['بيور', 'درجة ثانية', 'درجة ثالثه', 'درجة رابعه']
};

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function normalizeValue(value) {
  if (typeof value !== 'string') fail('أدخل اسم الخيار.');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) fail('أدخل اسم الخيار.');
  if (normalized.length > MAX_LENGTH) fail(`اسم الخيار يجب ألا يتجاوز ${MAX_LENGTH} حرفًا.`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) fail('اسم الخيار يحتوي على رموز غير صالحة.');
  return normalized;
}

const key = value => value.toLocaleLowerCase('ar');

function requireKind(kind) {
  if (!KINDS.includes(kind)) fail('نوع القائمة غير صالح.');
  return kind;
}

function isProtected(kind, value) {
  return kind === 'type' && DEFAULTS.type.includes(value);
}

async function seed(tx) {
  if (await tx.productOption.findFirst({ where: { kind: SEED_KIND } })) return;
  const products = await tx.product.findMany();
  for (const kind of KINDS) {
    const values = [...DEFAULTS[kind]];
    const seen = new Set(values.map(key));
    for (const product of products) {
      const raw = typeof product[kind] === 'string' ? product[kind].replace(/\s+/g, ' ').trim() : '';
      if (!raw || raw.length > MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(raw) || seen.has(key(raw))) continue;
      seen.add(key(raw));
      values.push(raw);
    }
    for (const [position, value] of values.entries()) {
      await tx.productOption.create({ data: { kind, value, position } });
    }
  }
  await tx.productOption.create({ data: { kind: SEED_KIND, value: 'done', position: 0 } });
}

async function listOptions(tx) {
  const rows = await tx.productOption.findMany({ orderBy: { position: 'asc' } });
  const result = { type: [], color: [], gauge: [] };
  for (const row of rows) {
    if (result[row.kind]) result[row.kind].push({ id: row.id, value: row.value, protected: isProtected(row.kind, row.value) });
  }
  return result;
}

async function productsUsing(tx, kind, value) {
  const products = await tx.product.findMany({ where: { [kind]: value } });
  return products.filter(product => product[kind] === value);
}

async function productOptionOperation(database, userId, input) {
  if (!input || typeof input !== 'object') fail('بيانات الخيار غير صالحة.');
  const action = input.action;
  if (!['list', 'add', 'rename', 'delete'].includes(action)) fail('إجراء الخيارات غير صالح.');
  return database.$transaction(async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!user) fail('انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    if (action !== 'list' && user.role !== 'ADMIN') fail('إدارة خيارات الأصناف متاحة للمدير فقط.', 403);
    await seed(tx);
    if (action === 'list') return { options: await listOptions(tx) };

    const kind = requireKind(input.kind);
    const existing = await tx.productOption.findMany({ where: { kind }, orderBy: { position: 'asc' } });
    if (action === 'add') {
      const value = normalizeValue(input.value);
      if (existing.some(option => key(option.value) === key(value))) fail('هذا الخيار موجود بالفعل في القائمة.', 409);
      const position = existing.reduce((max, option) => Math.max(max, option.position), -1) + 1;
      const created = await tx.productOption.create({ data: { kind, value, position } });
      return { created: { id: created.id, value: created.value }, options: await listOptions(tx) };
    }

    if (typeof input.id !== 'string' || !input.id.trim()) fail('الخيار المطلوب غير صالح.');
    const option = existing.find(item => item.id === input.id);
    if (!option) fail('الخيار غير موجود. حدّث القائمة وحاول مرة أخرى.', 404);
    if (isProtected(kind, option.value)) fail('هذا النوع أساسي ومرتبط بصور وأوصاف النظام، ولا يمكن تعديله أو حذفه.', 403);

    if (action === 'rename') {
      const value = normalizeValue(input.value);
      if (existing.some(item => item.id !== option.id && key(item.value) === key(value))) fail('هذا الخيار موجود بالفعل في القائمة.', 409);
      if (isProtected(kind, value)) fail('هذا الاسم محجوز لنوع أساسي في النظام.', 409);
      if (value !== option.value) {
        for (const product of await productsUsing(tx, kind, option.value)) {
          await tx.product.update({ where: { id: product.id }, data: { [kind]: value } });
        }
        await tx.productOption.update({ where: { id: option.id }, data: { value } });
      }
      return { options: await listOptions(tx) };
    }

    const used = await productsUsing(tx, kind, option.value);
    if (used.length) fail(`لا يمكن حذف «${option.value}» لأنه مستخدم في ${used.length} صنف. غيّر الأصناف أولًا.`, 409);
    await tx.productOption.delete({ where: { id: option.id } });
    return { options: await listOptions(tx) };
  });
}

module.exports = { productOptionOperation, DEFAULT_PRODUCT_OPTIONS: DEFAULTS };
