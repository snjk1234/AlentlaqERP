function editError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function requiredId(value) {
  if (typeof value !== 'string' || !value.trim()) throw editError('بيانات المستند غير مكتملة.');
  return value.trim();
}

function normalizeWarehouseReceiptNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 255 || value.includes('\0')) {
    throw editError('رقم استلام المخزن غير صالح (الحد الأقصى 255 حرفًا).');
  }
  return value.trim() || null;
}

function inputNumber(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    throw editError('أدخل قيمة رقمية صالحة.');
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw editError('أدخل قيمة رقمية صالحة.');
  return result;
}

async function requireRecord(tx, model, id, label) {
  const record = await tx[model].findUnique({ where: { id } });
  if (!record) throw editError(`${label} غير موجود.`, 404);
  return record;
}

async function applyBalanceChanges(tx, model, changes) {
  for (const [id, difference] of changes) {
    if (difference !== 0) {
      await tx[model].update({ where: { id }, data: { balance: { increment: difference } } });
    }
  }
}

function balanceChanges(oldId, oldEffect, newId, newEffect) {
  const changes = new Map([[oldId, -oldEffect]]);
  changes.set(newId, (changes.get(newId) || 0) + newEffect);
  return changes;
}

function purchaseTaxRate(invoiceType, productTaxRate, originalItem, originalInvoiceType) {
  if (invoiceType === 'فاتورة') return 0;
  const originalSubtotal = originalItem ? Number(originalItem.quantity) * Number(originalItem.unitCost) : 0;
  return originalItem && originalSubtotal > 0 && originalInvoiceType === invoiceType
    ? Number(originalItem.taxAmount) / originalSubtotal
    : Number(productTaxRate ?? 0.14);
}

async function editDocument(database, kind, input) {
  if (!['purchase', 'generalExpense', 'expense'].includes(kind)) throw editError('نوع المستند غير صالح.');
  if (!input || typeof input !== 'object') throw editError('بيانات المستند غير مكتملة.');
  const id = requiredId(input.id);
  const userId = requiredId(input.userId);
  const date = new Date(input.date);
  const version = new Date(input.updatedAt);
  if (!input.date || !input.updatedAt || !Number.isFinite(date.getTime()) || !Number.isFinite(version.getTime())) {
    throw editError('تاريخ المستند أو نسخة التعديل غير صالحة. حدّث القائمة وأعد المحاولة.');
  }
  const model = kind === 'purchase' ? 'purchaseOrder' : kind === 'expense' ? 'expensePayment' : 'generalExpense';
  return database.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw editError('تعديل المستندات متاح لمدير النظام فقط.', 403);
    const existing = await tx[model].findUnique({
      where: { id }, ...(kind === 'purchase' ? { include: { items: true } } : {})
    });
    if (!existing) throw editError('المستند المطلوب غير موجود.', 404);
    if (new Date(existing.updatedAt).getTime() !== version.getTime()) {
      throw editError('تم تعديل المستند من مستخدم آخر. أغلق النموذج وحدّث القائمة قبل المحاولة مجددًا.', 409);
    }

    if (kind === 'purchase') {
      const supplierId = requiredId(input.supplierId);
      const billNumber = requiredId(input.billNumber);
      const warehouseReceiptNumber = input.warehouseReceiptNumber === undefined
        ? existing.warehouseReceiptNumber : normalizeWarehouseReceiptNumber(input.warehouseReceiptNumber);
      if (!['فاتورة', 'فاتورة ضريبية'].includes(input.invoiceType)) throw editError('نوع الفاتورة غير صالح.');
      if (!Array.isArray(input.items) || !input.items.length) throw editError('أضف صنفًا واحدًا على الأقل.');
      await requireRecord(tx, 'supplier', supplierId, 'المورد');
      const duplicate = await tx.purchaseOrder.findUnique({ where: { billNumber } });
      if (duplicate && duplicate.id !== id) throw editError('رقم فاتورة الشراء/التوريد مسجل بالفعل.');

      const quantities = new Map();
      for (const item of existing.items) {
        quantities.set(item.productId, (quantities.get(item.productId) || 0) - Number(item.quantity));
      }
      const items = [];
      let totalAmount = 0;
      let taxAmount = 0;
      for (const item of input.items) {
        if (!item || typeof item !== 'object') throw editError('بيانات الصنف غير صالحة.');
        const productId = requiredId(item.productId);
        const quantity = inputNumber(item.quantity);
        const unitCost = inputNumber(item.unitCost);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || unitCost < 0) {
          throw editError('يجب أن تكون الكمية عددًا صحيحًا موجبًا والتكلفة مبلغًا غير سالب.');
        }
        const product = await requireRecord(tx, 'product', productId, 'الصنف');
        const originalItem = existing.items.find(previous => previous.id === item.id && previous.productId === productId);
        const taxRate = purchaseTaxRate(input.invoiceType, product.taxRate, originalItem, existing.invoiceType);
        if (!Number.isFinite(taxRate) || taxRate < 0) throw editError('نسبة ضريبة الصنف غير صالحة.');
        const amount = unitCost * quantity;
        const tax = amount * taxRate;
        totalAmount += amount;
        taxAmount += tax;
        quantities.set(productId, (quantities.get(productId) || 0) + quantity);
        items.push({ purchaseOrderId: id, productId, quantity, unitCost, taxAmount: tax, total: amount + tax });
      }
      const netAmount = totalAmount + taxAmount;
      if (!Number.isFinite(netAmount)) throw editError('إجمالي الفاتورة أكبر من الحد المسموح.');
      for (const [productId, difference] of quantities) {
        const product = await requireRecord(tx, 'product', productId, 'الصنف');
        if (difference < 0 && Number(product.stockQty) + difference < 0) {
          throw editError(`لا يمكن تخفيض كمية الصنف ${product.name || productId} لأن المخزون المتاح لا يكفي.`, 409);
        }
      }
      for (const [productId, difference] of quantities) {
        if (difference !== 0) {
          await tx.product.update({ where: { id: productId }, data: { stockQty: { increment: difference } } });
        }
      }
      await applyBalanceChanges(tx, 'supplier', balanceChanges(existing.supplierId, existing.netAmount, supplierId, netAmount));
      for (const item of existing.items) await tx.purchaseOrderItem.delete({ where: { id: item.id } });
      for (const item of items) await tx.purchaseOrderItem.create({ data: item });
      return tx.purchaseOrder.update({
        where: { id },
        data: { billNumber, warehouseReceiptNumber, supplierId, invoiceType: input.invoiceType, date, totalAmount, taxAmount, netAmount },
        include: { supplier: true, items: { include: { product: true } } }
      });
    }

    const bankId = requiredId(input.bankId);
    const amount = inputNumber(input.amount);
    if (amount <= 0) throw editError('أدخل مبلغًا موجبًا صالحًا.');
    await requireRecord(tx, 'bank', bankId, 'البنك/الخزينة');
    const partyField = kind === 'expense' ? 'supplierId' : 'categoryId';
    const partyId = requiredId(input[partyField]);
    await requireRecord(tx, kind === 'expense' ? 'supplier' : 'expenseCategory', partyId,
      kind === 'expense' ? 'المورد' : 'التصنيف');
    await applyBalanceChanges(tx, 'bank', balanceChanges(existing.bankId, -existing.amount, bankId, -amount));
    if (kind === 'expense') {
      await applyBalanceChanges(tx, 'supplier', balanceChanges(existing.supplierId, -existing.amount, partyId, -amount));
    }
    return tx[model].update({
      where: { id },
      data: {
        bankId, [partyField]: partyId, amount, date,
        reference: typeof input.reference === 'string' ? input.reference.trim() || null : null,
        notes: typeof input.notes === 'string' ? input.notes.trim() || null : null
      },
      include: { bank: true, [kind === 'expense' ? 'supplier' : 'category']: true }
    });
  }, { timeout: 20000, maxWait: 20000 });
}

async function editQuotation(database, input) {
  if (!input || typeof input !== 'object') throw editError('بيانات عرض السعر غير صالحة.');
  const id = requiredId(input.id);
  const userId = requiredId(input.userId);
  const version = new Date(input.updatedAt);
  if (!input.updatedAt || !Number.isFinite(version.getTime())) throw editError('نسخة عرض السعر غير صالحة. حدّث القائمة.');
  if (!Array.isArray(input.items) || !input.items.length) throw editError('أضف صنفًا واحدًا على الأقل.');
  return database.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw editError('تعديل عرض السعر متاح للمدير فقط.', 403);
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw editError('عرض السعر غير موجود.', 404);
    if (!existing.isQuotation || existing.status === 'CONVERTED') {
      throw editError('يمكن تعديل عروض الأسعار غير المحوّلة فقط، وليس الفواتير.', 409);
    }
    if (new Date(existing.updatedAt).getTime() !== version.getTime()) {
      throw editError('تم تعديل عرض السعر من مستخدم آخر. أغلق النموذج وحدّث القائمة.', 409);
    }
    const seen = new Set();
    const items = [];
    let totalAmount = 0;
    let taxAmount = 0;
    for (const [position, item] of input.items.entries()) {
      if (!item || typeof item !== 'object') throw editError('بيانات الصنف غير صالحة.');
      const productId = requiredId(item.productId);
      if (seen.has(productId)) throw editError('لا يمكن تكرار الصنف في عرض السعر.');
      seen.add(productId);
      const quantity = inputNumber(item.quantity);
      const unitPrice = inputNumber(item.unitPrice);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647 || unitPrice < 0) {
        throw editError('الكمية يجب أن تكون عددًا صحيحًا موجبًا والسعر غير سالب.');
      }
      const product = await requireRecord(tx, 'product', productId, 'الصنف');
      const previous = existing.items.find(line => line.productId === productId);
      const oldSubtotal = previous ? previous.quantity * previous.unitPrice : 0;
      const taxRate = ['فاتورة', 'فاتورة مبسطة'].includes(existing.invoiceType) ? 0
        : oldSubtotal > 0 ? previous.taxAmount / oldSubtotal : Number(product.taxRate);
      if (!Number.isFinite(taxRate) || taxRate < 0) throw editError('نسبة ضريبة الصنف غير صالحة.');
      const subtotal = Number((quantity * unitPrice).toFixed(2));
      const tax = Number((subtotal * taxRate).toFixed(2));
      const total = Number((subtotal + tax).toFixed(2));
      if (![subtotal, tax, total].every(Number.isFinite)) throw editError('قيمة الصنف تتجاوز الحد المسموح.');
      totalAmount += subtotal;
      taxAmount += tax;
      items.push({ orderId: id, productId, position, quantity, unitPrice, taxAmount: tax, total });
    }
    totalAmount = Number(totalAmount.toFixed(2));
    taxAmount = Number(taxAmount.toFixed(2));
    const netAmount = Number((totalAmount + taxAmount).toFixed(2));
    if (![totalAmount, taxAmount, netAmount].every(Number.isFinite)) throw editError('إجمالي عرض السعر يتجاوز الحد المسموح.');
    for (const line of existing.items) await tx.orderItem.delete({ where: { id: line.id } });
    for (const item of items) await tx.orderItem.create({ data: item });
    return tx.order.update({
      where: { id }, data: { totalAmount, taxAmount, netAmount },
      include: { customer: true, items: { include: { product: true } } }
    });
  }, { timeout: 20000, maxWait: 20000 });
}

const ZATCA_SELLER_NAME = 'شركة الإنطلاق لتصنيع وتوريد الخراطيم والمواسير والأسلاك';
const ZATCA_TRN = '310122345600003';

function zatcaQrCode(timestamp, totalAmount, vatAmount) {
  const tlv = (tag, value) => {
    const data = Buffer.from(value, 'utf-8');
    return Buffer.concat([Buffer.from([tag]), Buffer.from([data.length]), data]);
  };
  return Buffer.concat([
    tlv(1, ZATCA_SELLER_NAME), tlv(2, ZATCA_TRN), tlv(3, timestamp), tlv(4, totalAmount), tlv(5, vatAmount)
  ]).toString('base64');
}

async function editInvoiceItems(database, input) {
  if (!input || typeof input !== 'object') throw editError('بيانات الفاتورة غير صالحة.');
  const id = requiredId(input.id);
  const userId = requiredId(input.userId);
  const version = new Date(input.updatedAt);
  if (!input.updatedAt || !Number.isFinite(version.getTime())) throw editError('نسخة الفاتورة غير صالحة. حدّث القائمة.');
  if (!Array.isArray(input.items) || !input.items.length) throw editError('أضف صنفًا واحدًا على الأقل.');
  return database.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw editError('تعديل أصناف الفاتورة متاح للمدير فقط.', 403);
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw editError('الفاتورة غير موجودة.', 404);
    if (existing.isQuotation || existing.status !== 'COMPLETED') {
      throw editError('يمكن تعديل أصناف فاتورة مبيعات صادرة فقط. لعروض الأسعار استخدم تعديل عرض السعر.', 409);
    }
    if (new Date(existing.updatedAt).getTime() !== version.getTime()) {
      throw editError('تم تعديل الفاتورة من مستخدم آخر. أغلق النموذج وحدّث القائمة.', 409);
    }
    const returns = await tx.orderReturn.findMany({ where: { orderId: id } });
    if (returns.length) throw editError('لا يمكن تعديل أصناف فاتورة عليها مرتجعات. احذف المرتجعات أو أنشئ فاتورة جديدة.', 409);

    const seen = new Set();
    const items = [];
    let totalAmount = 0;
    let taxAmount = 0;
    for (const [position, item] of input.items.entries()) {
      if (!item || typeof item !== 'object') throw editError('بيانات الصنف غير صالحة.');
      const productId = requiredId(item.productId);
      if (seen.has(productId)) throw editError('لا يمكن تكرار الصنف في الفاتورة.');
      seen.add(productId);
      const quantity = inputNumber(item.quantity);
      const unitPrice = inputNumber(item.unitPrice);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647 || unitPrice < 0) {
        throw editError('الكمية يجب أن تكون عددًا صحيحًا موجبًا والسعر غير سالب.');
      }
      const product = await requireRecord(tx, 'product', productId, 'الصنف');
      const previous = existing.items.find(line => line.productId === productId);
      const oldSubtotal = previous ? previous.quantity * previous.unitPrice : 0;
      const taxRate = ['فاتورة', 'فاتورة مبسطة'].includes(existing.invoiceType) ? 0
        : oldSubtotal > 0 ? previous.taxAmount / oldSubtotal : Number(product.taxRate);
      if (!Number.isFinite(taxRate) || taxRate < 0) throw editError('نسبة ضريبة الصنف غير صالحة.');
      const subtotal = Number((quantity * unitPrice).toFixed(2));
      const tax = Number((subtotal * taxRate).toFixed(2));
      const total = Number((subtotal + tax).toFixed(2));
      if (![subtotal, tax, total].every(Number.isFinite)) throw editError('قيمة الصنف تتجاوز الحد المسموح.');
      totalAmount += subtotal;
      taxAmount += tax;
      items.push({ orderId: id, productId, position, quantity, unitPrice, taxAmount: tax, total });
    }
    totalAmount = Number(totalAmount.toFixed(2));
    taxAmount = Number(taxAmount.toFixed(2));
    const netAmount = Number((totalAmount + taxAmount).toFixed(2));
    if (![totalAmount, taxAmount, netAmount].every(Number.isFinite)) throw editError('إجمالي الفاتورة يتجاوز الحد المسموح.');

    // Stock differences: restore old quantities, consume the new ones.
    const stockDiffs = new Map();
    for (const line of existing.items) {
      stockDiffs.set(line.productId, (stockDiffs.get(line.productId) || 0) + Number(line.quantity));
    }
    for (const item of items) {
      stockDiffs.set(item.productId, (stockDiffs.get(item.productId) || 0) - item.quantity);
    }
    for (const [productId, difference] of stockDiffs) {
      const product = await requireRecord(tx, 'product', productId, 'الصنف');
      if (difference < 0 && Number(product.stockQty) + difference < 0) {
        throw editError(`المخزون المتاح من الصنف ${product.name || productId} لا يكفي لزيادة الكمية.`, 409);
      }
    }
    for (const [productId, difference] of stockDiffs) {
      if (difference !== 0) {
        await tx.product.update({ where: { id: productId }, data: { stockQty: { increment: difference } } });
      }
    }

    // Ceiling quota deliveries follow the quantity change for the invoice customer.
    if (existing.customerId) {
      for (const [productId, difference] of stockDiffs) {
        const delta = -difference;
        if (delta === 0) continue;
        const quota = await tx.customerCeilingQuota.findUnique({
          where: { customerId_productId: { customerId: existing.customerId, productId } }
        });
        if (!quota) continue;
        const delivered = Number(quota.deliveredQuantity);
        const next = delivered + delta;
        if (!Number.isInteger(delivered) || !Number.isSafeInteger(next) || next < 0 || next > 2147483647) {
          throw editError('أرصدة تسليمات أسقف العميل لا تسمح بهذا التعديل. راجع تسليمات العميل أولًا.', 409);
        }
        await tx.customerCeilingQuota.update({ where: { id: quota.id }, data: { deliveredQuantity: next } });
      }
    }

    for (const line of existing.items) await tx.orderItem.delete({ where: { id: line.id } });
    for (const item of items) await tx.orderItem.create({ data: item });
    const qrCode = zatcaQrCode(new Date(existing.createdAt).toISOString(), netAmount.toFixed(2), taxAmount.toFixed(2));
    return tx.order.update({
      where: { id }, data: { totalAmount, taxAmount, netAmount, qrCode },
      include: { customer: true, items: { include: { product: true } }, orderReturns: { include: { bank: true, items: { include: { product: true } } } } }
    });
  }, { timeout: 20000, maxWait: 20000 });
}

async function getQuotationCosts(database, userId, input) {
  if (!input || !Array.isArray(input.productIds) || !input.productIds.length || input.productIds.length > 5000
    || input.productIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 50)) {
    throw editError('قائمة أصناف تحليل الربح غير صالحة.');
  }
  return database.$transaction(async tx => {
    const user = typeof userId === 'string' && userId.trim() ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (user?.role !== 'ADMIN') throw editError('تحليل أرباح عرض السعر متاح للمدير فقط.', 403);
    const costs = [];
    for (const id of new Set(input.productIds)) {
      const product = await requireRecord(tx, 'product', id, 'الصنف');
      costs.push({
        productId: product.id,
        costPrice: typeof product.costPrice === 'number' && Number.isFinite(product.costPrice) && product.costPrice > 0
          ? product.costPrice : null
      });
    }
    return { costs, checkedAt: new Date().toISOString() };
  });
}

async function editInvoiceDetails(database, input) {
  if (!input || typeof input !== 'object') throw editError('بيانات الفاتورة غير صالحة.');
  const id = requiredId(input.id);
  const userId = requiredId(input.userId);
  const version = new Date(input.updatedAt);
  if (!input.updatedAt || !Number.isFinite(version.getTime())) throw editError('نسخة الفاتورة غير صالحة. حدّث القائمة.');
  const text = (value, label, required = false) => {
    if ((value === null || value === undefined) && !required) return null;
    if (typeof value !== 'string' || value.length > 255 || value.includes('\0') || (required && !value.trim())) {
      throw editError(`${label} غير صالح (الحد الأقصى 255 حرفًا).`);
    }
    return value.trim() || null;
  };
  const receiverName = text(input.receiverName, 'اسم المستلم');
  const siteReceiptNumber = text(input.siteReceiptNumber, 'رقم إذن الاستلام');
  if (input.customerId !== null && (typeof input.customerId !== 'string' || !input.customerId.trim() || input.customerId.length > 50)) {
    throw editError('اختر عميلًا مسجلًا أو عميلًا نقديًا.');
  }
  const customerId = input.customerId === null ? null : input.customerId.trim();
  return database.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw editError('تعديل بيانات الفاتورة متاح للمدير فقط.', 403);
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw editError('الفاتورة غير موجودة.', 404);
    if (existing.isQuotation || existing.status !== 'COMPLETED') throw editError('يمكن تعديل بيانات فاتورة مبيعات صادرة فقط.', 409);
    if (new Date(existing.updatedAt).getTime() !== version.getTime()) {
      throw editError('تم تعديل الفاتورة من مستخدم آخر. أغلق النموذج وحدّث القائمة.', 409);
    }
    const customer = customerId ? await requireRecord(tx, 'customer', customerId, 'العميل') : null;
    const customerName = customer ? customer.name : text(input.customerName, 'اسم العميل النقدي', true);
    if (customerId !== (existing.customerId || null)) {
      const returns = await tx.orderReturn.findMany({ where: { orderId: id } });
      if (returns.length) throw editError('لا يمكن نقل الفاتورة إلى عميل آخر لوجود مرتجعات عليها. يمكنك تعديل المستلم وإذن الاستلام فقط.', 409);
      if (existing.customerId) {
        const payments = await tx.payment.findMany({ where: { customerId: existing.customerId } });
        if (payments.length) throw editError('لا يمكن نقل الفاتورة لأن للعميل الأصلي دفعات مسجلة، حتى لو كانت تخص فواتير أخرى. يمكنك تعديل المستلم وإذن الاستلام فقط.', 409);
        const discounts = await tx.accountDiscount.findMany({ where: { customerId: existing.customerId } });
        if (discounts.length) throw editError('لا يمكن نقل الفاتورة لأن للعميل الأصلي سندات خصم مسجلة. يمكنك تعديل المستلم وإذن الاستلام فقط.', 409);
      }
      const quantities = new Map();
      for (const item of existing.items) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) throw editError('كميات الفاتورة غير صالحة لنقل التسليمات.', 409);
        quantities.set(item.productId, (quantities.get(item.productId) || 0) + quantity);
      }
      for (const [productId, quantity] of quantities) {
        for (const [accountId, direction] of [[existing.customerId, -1], [customerId, 1]]) {
          if (!accountId) continue;
          const quota = await tx.customerCeilingQuota.findUnique({ where: { customerId_productId: { customerId: accountId, productId } } });
          if (!quota) continue;
          const delivered = Number(quota.deliveredQuantity);
          const next = delivered + direction * quantity;
          if (!Number.isInteger(delivered) || !Number.isSafeInteger(next) || next < 0 || next > 2147483647) {
            throw editError('أرصدة تسليمات الأسقف لا تسمح بنقل الفاتورة. راجع تسليمات العميلين أولًا.', 409);
          }
          await tx.customerCeilingQuota.update({ where: { id: quota.id }, data: { deliveredQuantity: next } });
        }
      }
    }
    return tx.order.update({
      where: { id }, data: { customerId, customerName, receiverName, siteReceiptNumber },
      include: { customer: true, items: { include: { product: true } }, orderReturns: { include: { bank: true, items: { include: { product: true } } } } }
    });
  }, { timeout: 20000, maxWait: 20000 });
}

module.exports = { editDocument, purchaseTaxRate, editQuotation, editInvoiceItems, getQuotationCosts, editInvoiceDetails, normalizeWarehouseReceiptNumber };
