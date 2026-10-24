function editError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function requiredId(value) {
  if (typeof value !== 'string' || !value.trim()) throw editError('بيانات المستند غير مكتملة.');
  return value.trim();
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
        data: { billNumber, supplierId, invoiceType: input.invoiceType, date, totalAmount, taxAmount, netAmount },
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

module.exports = { editDocument, purchaseTaxRate };
