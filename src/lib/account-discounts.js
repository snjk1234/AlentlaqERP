/* eslint @typescript-eslint/no-require-imports: "off" */
const { customerAccountBalance } = require('./order-returns');

function invalid(message) {
  const error = new Error(message);
  error.code = 'ACCOUNT_DISCOUNT_INVALID';
  throw error;
}

function discountLimit(balance) {
  return Math.max(0, Math.floor((Number(balance) + 1e-8) * 100) / 100);
}

async function createAccountDiscount(prisma, userId, input) {
  const { kind, accountId, requestId } = input || {};
  if (kind !== 'ALLOWED' && kind !== 'EARNED') invalid('اختر نوع الخصم الصحيح.');
  if (typeof accountId !== 'string' || !accountId.trim()) invalid('اختر العميل أو المورد.');
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    invalid('تعذر تحديد طلب الخصم. أغلق النافذة وحاول مجددًا.');
  }
  if (typeof input.amount !== 'number' && typeof input.amount !== 'string') {
    invalid('أدخل مبلغ خصم صحيحًا أكبر من صفر.');
  }
  const amount = Number(input.amount);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || cents <= 0
    || Math.abs(amount * 100 - cents) > 1e-7) {
    invalid('أدخل مبلغًا موجبًا بمنزلتين عشريتين كحد أقصى.');
  }
  if (input.notes != null && typeof input.notes !== 'string') invalid('الملاحظات غير صالحة.');
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null;
  if (notes && notes.includes('\0')) invalid('الملاحظات غير صالحة.');
  if (notes && notes.length > 500) invalid('يجب ألا تتجاوز الملاحظات 500 حرف.');
  const normalizedAmount = cents / 100;

  return prisma.$transaction(async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    const allowedRoles = kind === 'ALLOWED' ? ['ADMIN', 'CASHIER'] : ['ADMIN', 'STOREKEEPER'];
    if (!user || !allowedRoles.includes(user.role)) {
      throw Object.assign(new Error('لا تملك صلاحية تسجيل هذا النوع من الخصم. سجّل الدخول مجددًا.'), { statusCode: 403 });
    }

    const existing = await tx.accountDiscount.findUnique({ where: { requestId } });
    if (existing) {
      const existingAccountId = existing.kind === 'ALLOWED' ? existing.customerId : existing.supplierId;
      if (existing.kind !== kind || existingAccountId !== accountId
        || existing.amount !== normalizedAmount || (existing.notes || null) !== notes) {
        invalid('تم استخدام طلب الخصم سابقًا ببيانات مختلفة. أغلق النافذة وابدأ سندًا جديدًا.');
      }
      return existing;
    }

    let balance;
    if (kind === 'ALLOWED') {
      const customer = await tx.customer.findUnique({
        where: { id: accountId },
        include: { orders: true, payments: true, orderReturns: true, discounts: true }
      });
      if (!customer) invalid('العميل المحدد غير موجود.');
      balance = customerAccountBalance(customer);
    } else {
      const supplier = await tx.supplier.findUnique({ where: { id: accountId } });
      if (!supplier) invalid('المورد المحدد غير موجود.');
      balance = Number(supplier.balance);
    }
    if (!Number.isFinite(balance)) throw new Error('تعذر حساب الرصيد المستحق للطرف المحدد.');
    const limit = discountLimit(balance);
    if (normalizedAmount > limit) {
      if (kind === 'EARNED' && user.role === 'STOREKEEPER') invalid('مبلغ الخصم يتجاوز الرصيد المستحق للمورد.');
      invalid(`مبلغ الخصم يتجاوز الرصيد المستحق. الحد الأقصى ${limit.toFixed(2)} ج.م.`);
    }

    const count = await tx.accountDiscount.count();
    const discountNumber = `DSC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const discount = await tx.accountDiscount.create({
      data: {
        discountNumber,
        requestId,
        kind,
        customerId: kind === 'ALLOWED' ? accountId : null,
        supplierId: kind === 'EARNED' ? accountId : null,
        amount: normalizedAmount,
        notes
      }
    });
    if (kind === 'EARNED') {
      await tx.supplier.update({
        where: { id: accountId },
        data: { balance: { decrement: normalizedAmount } }
      });
    }
    return discount;
  }, { timeout: 20000, maxWait: 20000 });
}

module.exports = { createAccountDiscount, discountLimit };
