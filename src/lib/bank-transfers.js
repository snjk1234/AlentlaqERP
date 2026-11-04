function invalid(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function requiredText(value, label, limit = 50) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) invalid(`${label} غير صالح.`);
  return value.trim();
}

function optionalText(value, label, limit) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > limit || value.includes('\0')) invalid(`${label} غير صالح.`);
  return value.trim() || null;
}

function moneyCents(value, label, isBalance = false) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') invalid(`${label} غير صالح.`);
  if (typeof value === 'string' && !/^-?\d+(?:\.\d{1,2})?$/.test(value.trim())) invalid(`${label} يجب أن يكون مبلغًا صالحًا بمنزلتين عشريتين كحد أقصى.`);
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  // Existing bank balances use DOUBLE and can accumulate sub-cent floating-point noise.
  const tolerance = Math.max(isBalance ? 0.0001 : 0, Number.EPSILON * Math.max(1, Math.abs(cents)) * 2);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || Math.abs(cents) > 1e14
    || Math.abs(amount * 100 - cents) > tolerance) invalid(`${label} يجب أن يكون مبلغًا صالحًا بمنزلتين عشريتين كحد أقصى.`);
  return cents;
}

function transferDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('تاريخ التحويل غير صالح.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid('تاريخ التحويل غير صالح.');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (value > today) invalid('لا يمكن تنفيذ تحويل بتاريخ مستقبلي.');
  return new Date(`${value}T00:00:00`);
}

async function bankTransferOperation(database, userId, input) {
  if (!input || typeof input !== 'object' || !['list', 'create', 'reverse'].includes(input.action)) invalid('إجراء التحويل غير صالح.');
  const action = input.action;
  return database.$transaction(async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (user?.role !== 'ADMIN') invalid('التحويلات بين الحسابات متاحة للمدير فقط.', 403);
    const snapshot = async () => ({
      banks: await tx.bank.findMany({ orderBy: { name: 'asc' } }),
      transfers: await tx.bankTransfer.findMany({ orderBy: { transferNumber: 'desc' } })
    });
    if (action === 'list') return snapshot();
    const requestId = requiredText(input.requestId, 'معرّف العملية');
    if (!/^[a-zA-Z0-9-]{16,50}$/.test(requestId)) invalid('معرّف العملية غير صالح.');
    let fromBankId;
    let toBankId;
    let amount;
    let date;
    let reference;
    let notes;
    let original = null;
    if (action === 'reverse') {
      original = await tx.bankTransfer.findUnique({ where: { id: requiredText(input.id, 'رقم التحويل') } });
      if (!original) invalid('سند التحويل غير موجود.', 404);
      if (original.reversalOf) invalid('لا يمكن عكس سند عكسي. أنشئ تحويلًا جديدًا عند الحاجة.', 409);
      fromBankId = original.toBankId;
      toBankId = original.fromBankId;
      amount = original.amount;
      notes = requiredText(input.reason, 'سبب عكس التحويل', 2000);
      if (notes.includes('\0')) invalid('سبب عكس التحويل غير صالح.');
      reference = original.transferNumber;
    } else {
      fromBankId = requiredText(input.fromBankId, 'حساب المصدر');
      toBankId = requiredText(input.toBankId, 'حساب المستلم');
      amount = input.amount;
      date = transferDate(input.date);
      reference = optionalText(input.reference, 'المرجع', 255);
      notes = optionalText(input.notes, 'الملاحظات', 2000);
    }
    if (fromBankId === toBankId) invalid('اختر حسابين مختلفين للتحويل.');
    const amountCents = moneyCents(amount, 'مبلغ التحويل');
    if (amountCents <= 0) invalid('مبلغ التحويل يجب أن يكون أكبر من صفر.');
    const replay = await tx.bankTransfer.findUnique({ where: { requestId } });
    if (replay) {
      if (replay.createdBy !== user.id || replay.fromBankId !== fromBankId || replay.toBankId !== toBankId
        || moneyCents(replay.amount, 'المبلغ') !== amountCents || replay.notes !== notes || replay.reference !== reference
        || (replay.reversalOf || null) !== (original?.id || null)
        || (date && new Date(replay.date).getTime() !== date.getTime())) {
        invalid('معرّف العملية مستخدم لبيانات أخرى. حدّث السجل وتحقق من العملية قبل إنشاء تحويل جديد.', 409);
      }
      return { transfer: replay, original, ...await snapshot() };
    }
    if (original) {
      if (original.status !== 'POSTED') invalid('تم عكس هذا التحويل من قبل.', 409);
      const previousReversal = await tx.bankTransfer.findFirst({ where: { reversalOf: original.id } });
      if (previousReversal) invalid('تم عكس هذا التحويل من قبل.', 409);
      date = new Date();
      if (date.getTime() < new Date(original.date).getTime()) invalid('تاريخ التحويل الأصلي لاحق للوقت الحالي. تحقق من ساعة الخادم.', 409);
    }
    const from = await tx.bank.findUnique({ where: { id: fromBankId } });
    const to = await tx.bank.findUnique({ where: { id: toBankId } });
    if (!from || !to) invalid('أحد الحسابين غير موجود. حدّث قائمة الحسابات.', 404);
    const fromCents = moneyCents(from.balance, 'رصيد حساب المصدر', true);
    const toCents = moneyCents(to.balance, 'رصيد حساب المستلم', true);
    if (fromCents < amountCents) invalid(`رصيد ${from.name} لا يكفي ${original ? 'لعكس التحويل' : 'للتحويل'}.`, 409);
    moneyCents((toCents + amountCents) / 100, 'الرصيد الناتج');
    const last = await tx.bankTransfer.findFirst({ orderBy: { transferNumber: 'desc' } });
    const next = last ? Number(last.transferNumber.slice(4)) + 1 : 1;
    if (!Number.isSafeInteger(next) || next > 99999999) invalid('تعذر تخصيص رقم سند التحويل.', 409);
    await tx.bank.update({ where: { id: from.id }, data: { balance: (fromCents - amountCents) / 100 } });
    await tx.bank.update({ where: { id: to.id }, data: { balance: (toCents + amountCents) / 100 } });
    const transfer = await tx.bankTransfer.create({
      data: {
        transferNumber: `TRF-${String(next).padStart(8, '0')}`, requestId,
        fromBankId, toBankId, fromBankName: from.name, toBankName: to.name,
        fromAccountNumber: from.accountNumber || null, toAccountNumber: to.accountNumber || null,
        amount: amountCents / 100, date, reference, notes, reversalOf: original?.id || null,
        createdBy: user.id, createdByName: `${user.name} (${user.username})`,
        fromBalanceBefore: fromCents / 100, fromBalanceAfter: (fromCents - amountCents) / 100,
        toBalanceBefore: toCents / 100, toBalanceAfter: (toCents + amountCents) / 100
      }
    });
    if (original) original = await tx.bankTransfer.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
    return { transfer, original, ...await snapshot() };
  });
}

module.exports = { bankTransferOperation };
