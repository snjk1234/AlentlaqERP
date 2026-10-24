/* eslint @typescript-eslint/no-require-imports: "off" */
const { randomBytes, scrypt: deriveKey, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(deriveKey);
const PASSWORD_ID = 'stocktake-approval';
const MAX_QTY = 2147483647;

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

async function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hex] = encoded.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function quantity(value, nullable = false) {
  if (nullable && (value === '' || value === null || value === undefined)) return null;
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') fail('أدخل كمية صحيحة غير سالبة.');
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > MAX_QTY) fail('أدخل كمية صحيحة غير سالبة ضمن الحد المسموح.');
  return number;
}

function bookQuantity(value) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') fail('رصيد الصنف في الدفتر غير صالح.');
  const number = Number(value);
  if (!Number.isInteger(number) || number < -2147483648 || number > MAX_QTY) fail('رصيد الصنف في الدفتر غير صالح.');
  return number;
}

function productLabel(product) {
  return [product.code, product.name, product.size, product.color].filter(Boolean).join(' - ');
}

async function rejectDraftOverlap(tx, items, documentId) {
  const drafts = await tx.stocktake.findMany({ where: { status: 'DRAFT' }, include: { items: true } });
  const selected = new Set(items.map(item => item?.productId));
  for (const draft of drafts) {
    if (draft.id === documentId) continue;
    const conflict = draft.items.find(item => selected.has(item.productId));
    if (conflict) fail(`الصنف ${conflict.productLabel} موجود في المسودة ${draft.documentNumber}. احذفه منها أو اعتمدها أو احذف المسودة أولًا.`, 409);
  }
}

async function stocktakeOperation(database, userId, input) {
  if (!input || typeof input !== 'object') fail('بيانات الجرد غير صالحة.');
  const action = input.action;
  if (!['list', 'save', 'refresh', 'approve', 'password', 'delete', 'notes'].includes(action)) fail('إجراء الجرد غير صالح.');
  if (input.id !== undefined && (typeof input.id !== 'string' || !input.id.trim())) fail('رقم مستند الجرد غير صالح.');
  return database.$transaction(async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!user || !['ADMIN', 'STOREKEEPER'].includes(user.role)) fail('الجرد متاح للمدير وأمين المخزن فقط.', 403);
    if (['approve', 'password'].includes(action) && user.role !== 'ADMIN') fail('اعتماد الجرد وإعداد كلمة مروره متاحان للمدير فقط.', 403);
    if (action === 'list') {
      const setting = await tx.stocktakeSetting.findUnique({ where: { id: PASSWORD_ID } });
      return {
        passwordConfigured: !!setting,
        documents: (await tx.stocktake.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } }))
          .filter(document => document.status !== 'DELETED'),
        products: await tx.product.findMany({
          select: { id: true, code: true, name: true, size: true, color: true, stockQty: true, costPrice: true },
          orderBy: { code: 'asc' }
        })
      };
    }
    if (action === 'password') {
      if (typeof input.accountPassword !== 'string' || input.accountPassword !== user.password) fail('كلمة مرور حساب المدير غير صحيحة.', 403);
      if (typeof input.newPassword !== 'string' || input.newPassword.length < 8 || input.newPassword.length > 256
        || input.newPassword.trim().length < 8) fail('كلمة مرور الجرد يجب أن تكون من 8 إلى 256 حرفًا.');
      const salt = randomBytes(16).toString('hex');
      const hash = await scrypt(input.newPassword, salt, 64);
      const passwordHash = `${salt}:${hash.toString('hex')}`;
      await tx.stocktakeSetting.upsert({
        where: { id: PASSWORD_ID },
        create: { id: PASSWORD_ID, passwordHash }, update: { passwordHash }
      });
      return { passwordConfigured: true };
    }

    const existing = input.id ? await tx.stocktake.findUnique({ where: { id: input.id }, include: { items: true } }) : null;
    if (input.id && !existing) fail('مستند الجرد غير موجود.', 404);
    if (!existing && action !== 'save') fail('احفظ مسودة الجرد أولًا.');
    if (existing) {
      if (existing.status !== 'DRAFT' && !(action === 'notes' && existing.status === 'APPROVED')) {
        fail('الجرد معتمد أو محذوف ولا يمكن تعديل كمياته أو اعتماده مرة أخرى.', 409);
      }
      if (existing.revision !== input.revision) fail('تم تعديل الجرد من مستخدم آخر. أعد فتحه من السجل.', 409);
    }
    if (action === 'notes') {
      if (typeof input.notes !== 'string' || input.notes.length > 2000) fail('ملاحظات الجرد يجب ألا تتجاوز 2000 حرف.');
      return tx.stocktake.update({
        where: { id: existing.id }, data: { notes: input.notes, revision: existing.revision + 1 }, include: { items: true }
      });
    }
    if (action === 'delete') {
      await tx.stocktake.update({
        where: { id: existing.id }, data: { status: 'DELETED', revision: existing.revision + 1 }
      });
      return { deletedId: existing.id };
    }
    if (action === 'save') {
      if (!Array.isArray(input.items) || !input.items.length) fail('اختر صنفًا واحدًا على الأقل للجرد.');
      if (typeof input.notes !== 'string' || input.notes.length > 2000) fail('ملاحظات الجرد يجب ألا تتجاوز 2000 حرف.');
      await rejectDraftOverlap(tx, input.items, existing?.id);
      const seen = new Set();
      const lines = [];
      for (const [position, item] of input.items.entries()) {
        if (!item || typeof item.productId !== 'string' || seen.has(item.productId)) fail('أصناف الجرد غير صالحة أو مكررة.');
        seen.add(item.productId);
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) fail('أحد أصناف الجرد لم يعد موجودًا. حدّث قائمة الأصناف.', 409);
        const old = existing?.items.find(line => line.productId === product.id);
        const unitCost = old?.unitCost ?? Number(product.costPrice);
        if (!Number.isFinite(unitCost) || unitCost < 0) fail('سعر تكلفة أحد أصناف الجرد غير صالح.');
        if (!old && bookQuantity(item.bookQty) !== Number(product.stockQty)) {
          fail(`تغيّر رصيد الصنف ${productLabel(product)}. حدّث قائمة الأصناف وأعد عدّه قبل الحفظ.`, 409);
        }
        lines.push({
          productId: product.id, position, productLabel: old?.productLabel || productLabel(product),
          bookQty: old ? old.bookQty : bookQuantity(product.stockQty), countedQty: quantity(item.countedQty, true), unitCost
        });
      }
      if (!existing) {
        const last = await tx.stocktake.findFirst({ orderBy: { documentNumber: 'desc' } });
        const next = last ? Number(last.documentNumber.slice(4)) + 1 : 1;
        if (!Number.isSafeInteger(next) || next > 99999999) fail('تعذر تخصيص رقم جرد جديد.', 409);
        return tx.stocktake.create({
          data: { documentNumber: `STK-${String(next).padStart(8, '0')}`, createdBy: `${user.name} (${user.username})`,
            notes: input.notes, items: { create: lines } },
          include: { items: true }
        });
      }
      for (const line of existing.items) await tx.stocktakeItem.delete({ where: { id: line.id } });
      for (const line of lines) await tx.stocktakeItem.create({ data: { ...line, stocktakeId: existing.id } });
      return tx.stocktake.update({
        where: { id: existing.id }, data: { notes: input.notes, revision: existing.revision + 1 }, include: { items: true }
      });
    }
    if (action === 'refresh') {
      for (const item of existing.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) fail('أحد أصناف الجرد لم يعد موجودًا.', 409);
        const bookQty = bookQuantity(product.stockQty);
        if (bookQty !== item.bookQty) {
          await tx.stocktakeItem.update({ where: { id: item.id }, data: { bookQty, countedQty: null } });
        }
      }
      return tx.stocktake.update({
        where: { id: existing.id }, data: { revision: existing.revision + 1 }, include: { items: true }
      });
    }
    const setting = await tx.stocktakeSetting.findUnique({ where: { id: PASSWORD_ID } });
    if (!setting) fail('عيّن كلمة مرور اعتماد الجرد أولًا.', 409);
    if (!await passwordMatches(input.password, setting.passwordHash)) fail('كلمة مرور اعتماد الجرد غير صحيحة.', 403);
    if (!existing.items.length) fail('الجرد لا يحتوي على أصناف.');
    await rejectDraftOverlap(tx, existing.items, existing.id);
    if (existing.items.some(item => typeof item.unitCost !== 'number' || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      fail('احفظ المسودة أولًا لتثبيت أسعار تكلفة الأصناف قبل الاعتماد.', 409);
    }
    for (const item of existing.items) {
      if (item.countedQty === null || item.countedQty === undefined) fail('أكمل الكميات الفعلية لجميع أصناف الجرد قبل الاعتماد.');
      quantity(item.countedQty);
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || Number(product.stockQty) !== item.bookQty) {
        fail(`تغيّر رصيد الصنف ${item.productLabel} منذ بدء الجرد. حدّث أرصدة الدفتر وأعد عدّ الأصناف المتغيرة قبل الاعتماد.`, 409);
      }
    }
    for (const item of existing.items) {
      await tx.product.update({ where: { id: item.productId }, data: { stockQty: item.countedQty } });
    }
    return tx.stocktake.update({
      where: { id: existing.id },
      data: { status: 'APPROVED', revision: existing.revision + 1, approvedBy: `${user.name} (${user.username})`, approvedAt: new Date() },
      include: { items: true }
    });
  });
}

module.exports = { stocktakeOperation };
