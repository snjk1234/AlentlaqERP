function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function customerAccountBalance(customer) {
  const invoices = (customer.orders || [])
    .filter(order => !order.isQuotation)
    .reduce((sum, order) => sum + Number(order.netAmount || 0), 0);
  const payments = (customer.payments || [])
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const returns = (customer.orderReturns || [])
    .reduce((sum, orderReturn) => sum + Number(orderReturn.netAmount || 0) - Number(orderReturn.refundAmount || 0), 0);
  return money(Number(customer.openingBalance || 0) + invoices - payments - returns);
}

function calculateRefundAmount(returnAmount, customerBalance) {
  return money(Math.max(0, Number(returnAmount) - Math.max(Number(customerBalance || 0), 0)));
}

function invalid(message) {
  const error = new Error(message);
  error.code = 'ORDER_RETURN_INVALID';
  throw error;
}

async function createOrderReturn(prisma, input) {
  const { orderId, items, refundMethod, bankId, userId, notes } = input || {};
  if (typeof orderId !== 'string' || !orderId.trim()) invalid('اختر الفاتورة المراد إرجاع أصنافها.');
  if (!Array.isArray(items) || items.length === 0) invalid('حدد صنفًا واحدًا على الأقل للإرجاع.');

  return prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } }
    });
    if (!order) invalid('الفاتورة غير موجودة.');
    if (order.isQuotation || order.status !== 'COMPLETED') {
      invalid('لا يمكن إنشاء مرتجع إلا لفاتورة مبيعات معتمدة.');
    }

    const previousReturns = await tx.orderReturn.findMany({
      where: { orderId },
      include: { items: true }
    });
    const returnedQuantity = new Map();
    for (const orderReturn of previousReturns) {
      for (const item of orderReturn.items || []) {
        returnedQuantity.set(item.orderItemId,
          (returnedQuantity.get(item.orderItemId) || 0) + Number(item.quantity));
      }
    }

    const orderItems = new Map((order.items || []).map(item => [item.id, item]));
    const seen = new Set();
    const returnItems = [];
    let totalAmount = 0;
    let taxAmount = 0;

    for (const requested of items) {
      const orderItemId = requested?.orderItemId;
      const quantity = Number(requested?.quantity);
      if (typeof orderItemId !== 'string' || seen.has(orderItemId)) {
        invalid('بيانات الأصناف المرتجعة غير صالحة أو مكررة.');
      }
      seen.add(orderItemId);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        invalid('يجب أن تكون كمية كل صنف مرتجع عددًا صحيحًا موجبًا.');
      }
      const orderItem = orderItems.get(orderItemId);
      if (!orderItem) invalid('الصنف المحدد لا يتبع الفاتورة المختارة.');
      const alreadyReturned = returnedQuantity.get(orderItemId) || 0;
      if (alreadyReturned + quantity > Number(orderItem.quantity)) {
        invalid(`الكمية المرتجعة تتجاوز الكمية المتبقية للصنف ${orderItem.product?.name || ''}.`);
      }

      const taxBefore = money(Number(orderItem.taxAmount) * alreadyReturned / Number(orderItem.quantity));
      const returnedTax = money(Number(orderItem.taxAmount) * (alreadyReturned + quantity) / Number(orderItem.quantity)) - taxBefore;
      const amountBefore = money(Number(orderItem.unitPrice) * alreadyReturned);
      const itemAmount = money(Number(orderItem.unitPrice) * (alreadyReturned + quantity)) - amountBefore;
      const itemTotal = money(itemAmount + returnedTax);
      totalAmount = money(totalAmount + itemAmount);
      taxAmount = money(taxAmount + returnedTax);
      returnItems.push({
        orderItemId,
        productId: orderItem.productId,
        quantity,
        unitPrice: Number(orderItem.unitPrice),
        taxAmount: returnedTax,
        total: itemTotal
      });
    }

    const netAmount = money(totalAmount + taxAmount);
    let customerBalance = 0;
    if (order.customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: order.customerId },
        include: { orders: true, payments: true, orderReturns: true }
      });
      if (!customer) invalid('العميل المرتبط بالفاتورة غير موجود.');
      customerBalance = customerAccountBalance(customer);
    }

    const refundAmount = calculateRefundAmount(netAmount, customerBalance);
    let finalRefundMethod = 'NONE';
    let finalBankId = null;
    if (refundAmount > 0) {
      if (refundMethod !== 'CASH' && refundMethod !== 'BANK') {
        invalid('اختر طريقة رد المبلغ نقدًا أو إلى بنك.');
      }
      finalRefundMethod = refundMethod;
      if (refundMethod === 'BANK') {
        if (typeof bankId !== 'string' || !bankId.trim()) invalid('اختر البنك الذي سيُرد منه المبلغ.');
        const bank = await tx.bank.findUnique({ where: { id: bankId } });
        if (!bank) invalid('البنك المحدد غير موجود.');
        finalBankId = bank.id;
      }
    }

    const returnCount = await tx.orderReturn.count();
    const returnNumber = `RET-${new Date().getFullYear()}-${String(returnCount + 1).padStart(5, '0')}`;
    const orderReturn = await tx.orderReturn.create({
      data: {
        returnNumber,
        orderId,
        customerId: order.customerId || null,
        userId: userId || null,
        totalAmount,
        taxAmount,
        netAmount,
        refundAmount,
        refundMethod: finalRefundMethod,
        bankId: finalBankId,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        items: { create: returnItems }
      },
      include: {
        order: true,
        customer: true,
        bank: true,
        items: { include: { product: true, orderItem: true } }
      }
    });

    for (const item of returnItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.quantity } }
      });
      if (order.customerId) {
        const quota = await tx.customerCeilingQuota.findUnique({
          where: { customerId_productId: { customerId: order.customerId, productId: item.productId } }
        });
        if (quota && Number(quota.deliveredQuantity) > 0) {
          await tx.customerCeilingQuota.update({
            where: { id: quota.id },
            data: { deliveredQuantity: { decrement: Math.min(item.quantity, Number(quota.deliveredQuantity)) } }
          });
        }
      }
    }

    if (refundAmount > 0 && finalRefundMethod === 'BANK') {
      await tx.bank.update({
        where: { id: finalBankId },
        data: { balance: { decrement: refundAmount } }
      });
    }

    return orderReturn;
  }, { timeout: 20000, maxWait: 20000 });
}

module.exports = { calculateRefundAmount, createOrderReturn, customerAccountBalance };
