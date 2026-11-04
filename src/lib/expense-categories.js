/* eslint @typescript-eslint/no-require-imports: "off" */
const MAX_LENGTH = 100;

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function normalizeName(value) {
  if (typeof value !== 'string') fail('أدخل اسم التصنيف.');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) fail('أدخل اسم التصنيف.');
  if (normalized.length > MAX_LENGTH) fail(`اسم التصنيف يجب ألا يتجاوز ${MAX_LENGTH} حرفًا.`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) fail('اسم التصنيف يحتوي على رموز غير صالحة.');
  return normalized;
}

const key = value => value.toLocaleLowerCase('ar');
const sorted = rows => [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

async function expenseCategoryOperation(database, userId, input) {
  if (!input || typeof input !== 'object') fail('بيانات التصنيف غير صالحة.');
  const action = input.action;
  if (!['list', 'add', 'rename', 'delete'].includes(action)) fail('إجراء التصنيفات غير صالح.');
  return database.$transaction(async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!user) fail('انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    if (action !== 'list' && user.role !== 'ADMIN') fail('إدارة تصنيفات المصروفات متاحة للمدير فقط.', 403);
    const rows = await tx.expenseCategory.findMany();
    const result = async extra => ({ ...extra, options: sorted(await tx.expenseCategory.findMany()) });
    if (action === 'list') return { options: sorted(rows) };

    if (action === 'add') {
      const name = normalizeName(input.value);
      if (rows.some(row => key(row.name) === key(name))) fail('هذا التصنيف موجود بالفعل.', 409);
      const created = await tx.expenseCategory.create({ data: { name } });
      return result({ created: { id: created.id, value: created.name } });
    }

    if (typeof input.id !== 'string' || !input.id.trim()) fail('التصنيف المطلوب غير صالح.');
    const category = rows.find(row => row.id === input.id);
    if (!category) fail('التصنيف غير موجود. حدّث القائمة وحاول مرة أخرى.', 404);

    if (action === 'rename') {
      const name = normalizeName(input.value);
      if (rows.some(row => row.id !== category.id && key(row.name) === key(name))) fail('هذا التصنيف موجود بالفعل.', 409);
      if (name !== category.name) await tx.expenseCategory.update({ where: { id: category.id }, data: { name } });
      return result({});
    }

    const used = await tx.generalExpense.count({ where: { categoryId: category.id } });
    if (used) fail(`لا يمكن حذف «${category.name}» لأنه مستخدم في ${used} مصروف.`, 409);
    await tx.expenseCategory.delete({ where: { id: category.id } });
    return result({});
  });
}

module.exports = { expenseCategoryOperation };
