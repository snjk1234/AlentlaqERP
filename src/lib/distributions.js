/* eslint @typescript-eslint/no-require-imports: "off" */
const crypto = require('node:crypto');
const { invoiceQrText } = require('./invoice-qr');

const MAX_QUANTITY = 2147483647;
const INVOICE_TYPES = new Set(['فاتورة ضريبية', 'فاتورة']);

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function text(value, label, limit, required = false) {
  if (value === null || value === undefined) {
    if (required) fail(`${label} مطلوب.`);
    return null;
  }
  if (typeof value !== 'string' || value.length > limit || value.includes('\0')) fail(`${label} غير صالح.`);
  const result = value.trim();
  if (required && !result) fail(`${label} مطلوب.`);
  return result || null;
}

function quantity(value, label = 'الكمية') {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') fail(`${label} غير صالحة.`);
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0 || result > MAX_QUANTITY) fail(`${label} يجب أن تكون عددًا صحيحًا أكبر من صفر.`);
  return result;
}

function price(value, label) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') fail(`${label} غير صالح.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1e12) fail(`${label} غير صالح.`);
  return Math.round(result * 100) / 100;
}

function snapshot(document) {
  return JSON.stringify({
    documentNumber: document.documentNumber,
    customerId: document.customerId,
    customerName: document.customerName,
    status: document.status,
    notes: document.notes || '',
    revision: document.revision,
    items: (document.items || []).map(item => ({
      id: item.id,
      productId: item.productId,
      productLabel: item.productLabel,
      quantity: item.quantity,
      shippedQuantity: item.shippedQuantity,
      invoicedQuantity: item.invoicedQuantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      isCancelled: !!item.isCancelled
    }))
  });
}

function reservationFor(distribution, item) {
  if (distribution.status === 'DRAFT') return 0;
  const deliveredButUnbilled = Math.max(0, Number(item.shippedQuantity) - Number(item.invoicedQuantity));
  if (distribution.status === 'CANCELLED' || item.isCancelled) return deliveredButUnbilled;
  return Math.max(0, Math.max(Number(item.quantity), Number(item.shippedQuantity)) - Number(item.invoicedQuantity));
}

function statusAfterActivity(distribution, items) {
  if (distribution.status === 'CANCELLED') return 'CANCELLED';
  const active = items.filter(item => !item.isCancelled);
  if (!active.length) return 'CANCELLED';
  const planned = active.reduce((sum, item) => sum + Number(item.quantity), 0);
  const shipped = active.reduce((sum, item) => sum + Number(item.shippedQuantity), 0);
  const invoiced = items.reduce((sum, item) => sum + Number(item.invoicedQuantity), 0);
  if (planned > 0 && shipped >= planned && shipped === invoiced) return 'INVOICED';
  if (invoiced > 0) return 'PARTIALLY_INVOICED';
  if (shipped > 0 && shipped >= planned) return 'SHIPPED';
  if (shipped > 0) return 'PARTIALLY_SHIPPED';
  return distribution.status === 'DRAFT' ? 'DRAFT' : 'APPROVED';
}

function sortItems(items) {
  return [...items].sort((a, b) => Number(a.position) - Number(b.position));
}

function detailsFromLabel(label) {
  if (typeof label !== 'string' || !label.startsWith('الكود: ')) return null;
  const fields = {
    'الكود': 'code', 'الباركود': 'barcode', 'الصنف': 'name', 'النوع': 'type',
    'المقاس': 'size', 'الدرجة': 'gauge', 'اللون': 'color', 'الطول': 'length',
    'الوزن': 'weight', 'المورد': 'supplierName'
  };
  const details = {};
  for (const part of label.split(' | ')) {
    const separator = part.indexOf(': ');
    if (separator < 0) continue;
    const key = fields[part.slice(0, separator)];
    if (key) details[key] = part.slice(separator + 2);
  }
  return details;
}

async function loadDistribution(tx, id) {
  return tx.distribution.findUnique({ where: { id }, include: { items: true, revisions: true, dispatches: { include: { items: true } } } });
}

async function writeRevision(tx, previous, action, actor, document) {
  const revision = Number(previous.revision) + 1;
  await tx.distributionRevision.create({
    data: {
      distributionId: previous.id, revision, action,
      performedBy: actor, beforeSnapshot: snapshot(previous),
      afterSnapshot: snapshot({ ...document, revision })
    }
  });
  return revision;
}

async function reservationTotals(itemsByState) {
  const totals = new Map();
  for (const { distribution, items } of itemsByState) {
    for (const item of items) {
      const amount = reservationFor(distribution, item);
      if (amount) totals.set(item.productId, (totals.get(item.productId) || 0) + amount);
    }
  }
  return totals;
}

async function applyReservationDelta(tx, before, after) {
  const oldTotals = await reservationTotals(before);
  const newTotals = await reservationTotals(after);
  const ids = new Set([...oldTotals.keys(), ...newTotals.keys()]);
  const products = new Map();
  for (const productId of ids) {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) fail('أحد أصناف التوزيعة لم يعد موجودًا. حدّث المستند.', 409);
    products.set(productId, product);
    const increase = (newTotals.get(productId) || 0) - (oldTotals.get(productId) || 0);
    const available = Number(product.stockQty) - Number(product.reservedQty || 0);
    if (increase > available) {
      fail(`المخزون المتاح من ${product.name} لا يكفي لحجز ${increase} وحدة. المتاح ${Math.max(0, available)}.`, 409);
    }
  }
  for (const productId of ids) {
    const delta = (newTotals.get(productId) || 0) - (oldTotals.get(productId) || 0);
    if (delta) {
      await tx.product.update({
        where: { id: productId },
        data: { reservedQty: { increment: delta } }
      });
    }
  }
}

async function listOperation(tx, user) {
  const documents = await tx.distribution.findMany({
    include: { items: true, revisions: user.role === 'STOREKEEPER' ? false : true, dispatches: { include: { items: true } } },
    orderBy: { createdAt: 'desc' }
  });
  const customers = user.role === 'STOREKEEPER' ? [] : await tx.customer.findMany({ orderBy: { name: 'asc' } });
  const products = await tx.product.findMany({ include: { supplier: true }, orderBy: { code: 'asc' } });
  const productDetails = new Map(products.map(product => [product.id, {
    code: product.code, barcode: product.barcode, name: product.name, type: product.type,
    size: product.size, gauge: product.gauge, color: product.color, length: product.length,
    weight: product.weight, supplierName: product.supplier?.name || ''
  }]));
  const cleanDocuments = documents.map(document => ({
    ...document,
    revisions: user.role === 'STOREKEEPER' ? [] : document.revisions,
    items: sortItems(document.items).map(item => {
      const { unitPrice, taxRate, ...safeItem } = item;
      return {
        ...(user.role === 'STOREKEEPER' ? safeItem : item),
        productDetails: detailsFromLabel(item.productLabel) || productDetails.get(item.productId) || null
      };
    })
  }));
  return {
    documents: cleanDocuments,
    customers: customers.map(({ id, name, discount }) => ({ id, name, discount })),
    products: products.map(product => ({
      id: product.id, code: product.code, barcode: product.barcode, name: product.name,
      size: product.size, color: product.color, type: product.type, gauge: product.gauge,
      length: product.length, weight: product.weight, supplierName: product.supplier?.name || '',
      stockQty: product.stockQty, reservedQty: product.reservedQty,
      availableQty: Math.max(0, Number(product.stockQty) - Number(product.reservedQty || 0)),
      ...(['ADMIN', 'CASHIER'].includes(user.role) ? { price: product.price, taxRate: product.taxRate } : {})
    }))
  };
}

function normalizedLines(inputItems) {
  if (!Array.isArray(inputItems) || !inputItems.length || inputItems.length > 500) fail('أضف صنفًا واحدًا على الأقل للتوزيعة.');
  const seen = new Set();
  return inputItems.map((item, position) => {
    if (!item || typeof item.productId !== 'string' || !item.productId.trim() || seen.has(item.productId)) {
      fail('أصناف التوزيعة غير صالحة أو مكررة.');
    }
    seen.add(item.productId);
    return {
      productId: item.productId.trim(),
      position,
      quantity: quantity(item.quantity),
      unitPrice: price(item.unitPrice, 'سعر الصنف'),
      taxRate: price(item.taxRate, 'نسبة الضريبة')
    };
  });
}

async function makeLine(tx, distributionId, input, previous) {
  const product = await tx.product.findUnique({ where: { id: input.productId }, include: { supplier: true } });
  if (!product) fail('أحد أصناف التوزيعة غير موجود.', 409);
  const productLabel = [
    ['الكود', product.code], ['الباركود', product.barcode], ['الصنف', product.name],
    ['النوع', product.type], ['المقاس', product.size], ['الدرجة', product.gauge],
    ['اللون', product.color], ['الطول', product.length], ['الوزن', product.weight],
    ['المورد', product.supplier?.name]
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(' | ');
  return {
    ...(previous ? { id: previous.id } : {}),
    distributionId,
    productId: product.id,
    position: input.position,
    productLabel,
    quantity: input.quantity,
    shippedQuantity: previous?.shippedQuantity || 0,
    invoicedQuantity: previous?.invoicedQuantity || 0,
    unitPrice: input.unitPrice,
    taxRate: input.taxRate,
    isCancelled: false
  };
}

async function syncLines(tx, documentId, currentItems, desiredLines) {
  const byProduct = new Map(currentItems.map(item => [item.productId, item]));
  const keptIds = new Set();
  const nextItems = [];
  for (const input of desiredLines) {
    const previous = byProduct.get(input.productId);
    if (previous) {
      const completedQuantity = Math.max(Number(previous.shippedQuantity), Number(previous.invoicedQuantity));
      if (input.quantity < completedQuantity) {
        fail(`لا يمكن خفض كمية ${previous.productLabel} عن الكمية التي تم شحنها أو فوترتها.`, 409);
      }
    }
    const line = await makeLine(tx, documentId, input, previous);
    if (previous) {
      keptIds.add(previous.id);
      await tx.distributionItem.update({ where: { id: previous.id }, data: line });
      nextItems.push(line);
    } else {
      const created = await tx.distributionItem.create({ data: line });
      nextItems.push(created);
    }
  }
  for (const previous of currentItems) {
    if (keptIds.has(previous.id)) continue;
    if (Number(previous.shippedQuantity) || Number(previous.invoicedQuantity)) {
      const retained = {
        ...previous, isCancelled: true,
        quantity: Math.max(Number(previous.quantity), Number(previous.shippedQuantity), Number(previous.invoicedQuantity))
      };
      await tx.distributionItem.update({
        where: { id: previous.id }, data: { isCancelled: true, quantity: retained.quantity }
      });
      nextItems.push(retained);
    } else {
      await tx.distributionItem.delete({ where: { id: previous.id } });
    }
  }
  return sortItems(nextItems);
}

async function createDistribution(tx, user, input) {
  const customerId = text(input.customerId, 'العميل', 50, true);
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) fail('العميل غير موجود. حدّث قائمة العملاء.', 404);
  const notes = text(input.notes, 'الملاحظات', 2000) || '';
  const lines = normalizedLines(input.items);
  const preparedLines = [];
  for (const line of lines) preparedLines.push(await makeLine(tx, '', line));
  const last = await tx.distribution.findFirst({ orderBy: { documentNumber: 'desc' } });
  const next = last ? Number(last.documentNumber.slice(4)) + 1 : 1;
  if (!Number.isSafeInteger(next) || next > 99999999) fail('تعذر تخصيص رقم توزيعة جديد.', 409);
  const documentNumber = `DST-${String(next).padStart(8, '0')}`;
  const document = await tx.distribution.create({
    data: {
      documentNumber, customerId, customerName: customer.name, status: 'DRAFT', notes,
      revision: 1, createdBy: user.name, updatedBy: user.name
    }
  });
  for (const line of preparedLines) {
    const { id: ignored, ...data } = line;
    await tx.distributionItem.create({ data: { ...data, distributionId: document.id } });
  }
  const saved = await loadDistribution(tx, document.id);
  await tx.distributionRevision.create({
    data: {
      distributionId: saved.id, revision: 1, action: 'CREATED', performedBy: user.name,
      beforeSnapshot: null, afterSnapshot: snapshot(saved)
    }
  });
  return loadDistribution(tx, document.id);
}

async function updateDistribution(tx, user, input, existing) {
  if (!Number.isInteger(Number(input.revision)) || Number(input.revision) !== Number(existing.revision)) {
    fail('عُدلت التوزيعة من مستخدم آخر. أعد فتحها قبل الحفظ.', 409);
  }
  const customerId = text(input.customerId, 'العميل', 50, true);
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) fail('العميل غير موجود. حدّث قائمة العملاء.', 404);
  const before = await loadDistribution(tx, existing.id);
  const lines = await syncLines(tx, existing.id, before.items, normalizedLines(input.items));
  const next = {
    ...before, customerId, customerName: customer.name,
    notes: text(input.notes, 'الملاحظات', 2000) || '',
    updatedBy: user.name,
    revision: Number(before.revision) + 1,
    items: lines
  };
  next.status = statusAfterActivity(next, lines);
  await applyReservationDelta(tx,
    [{ distribution: before, items: before.items }],
    [{ distribution: next, items: lines }]);
  await tx.distribution.update({
    where: { id: existing.id },
    data: {
      customerId, customerName: customer.name, notes: next.notes,
      updatedBy: user.name, revision: next.revision,
      status: next.status
    }
  });
  await tx.distributionRevision.create({
    data: {
      distributionId: existing.id, revision: next.revision, action: 'UPDATED', performedBy: user.name,
      beforeSnapshot: snapshot(before), afterSnapshot: snapshot(next)
    }
  });
  return loadDistribution(tx, existing.id);
}

async function approveDistribution(tx, user, existing) {
  if (existing.status !== 'DRAFT') fail('لا يمكن اعتماد هذه التوزيعة مرة أخرى.', 409);
  if (!existing.items.length) fail('التوزيعة لا تحتوي على أصناف.');
  const before = await loadDistribution(tx, existing.id);
  const next = { ...before, status: 'APPROVED' };
  await applyReservationDelta(tx,
    [{ distribution: before, items: before.items }],
    [{ distribution: next, items: before.items }]);
  const revision = await writeRevision(tx, before, 'APPROVED', user.name, next);
  await tx.distribution.update({
    where: { id: existing.id },
    data: { status: 'APPROVED', approvedBy: user.name, approvedAt: new Date(), updatedBy: user.name, revision }
  });
  return loadDistribution(tx, existing.id);
}

async function cancelDistribution(tx, user, existing) {
  if (existing.status === 'DELETED') return { distribution: existing, deleted: true };
  const before = await loadDistribution(tx, existing.id);
  const next = { ...before, status: 'CANCELLED' };
  await applyReservationDelta(tx,
    [{ distribution: before, items: before.items }],
    [{ distribution: next, items: before.items }]);
  const revision = await writeRevision(tx, before, 'CANCELLED', user.name, next);
  await tx.distribution.update({
    where: { id: existing.id }, data: { status: 'CANCELLED', updatedBy: user.name, revision }
  });
  return { distribution: await loadDistribution(tx, existing.id), deleted: true };
}

async function recordDispatch(tx, user, input, existing) {
  if (existing.status === 'DRAFT' || existing.status === 'CANCELLED') fail('اعتمد التوزيعة قبل تسجيل الشحن.', 409);
  if (!Array.isArray(input.items) || !input.items.length) fail('أدخل كميات الشحن.');
  const current = new Map(existing.items.map(item => [item.id, item]));
  const seen = new Set();
  const dispatchLines = [];
  for (const inputLine of input.items) {
    if (!inputLine || typeof inputLine.distributionItemId !== 'string' || seen.has(inputLine.distributionItemId)) {
      fail('أصناف الشحنة غير صالحة أو مكررة.');
    }
    seen.add(inputLine.distributionItemId);
    const item = current.get(inputLine.distributionItemId);
    if (!item || item.isCancelled) fail('أحد الأصناف لم يعد ضمن التوزيعة.', 409);
    const amount = quantity(inputLine.quantity, 'كمية الشحن');
    const remaining = Math.max(0, Number(item.quantity) - Number(item.shippedQuantity));
    if (amount > remaining) fail(`كمية الشحن من ${item.productLabel} تتجاوز المتبقي (${remaining}).`, 409);
    dispatchLines.push({ item, quantity: amount });
  }
  const last = await tx.distributionDispatch.findFirst({ orderBy: { dispatchNumber: 'desc' } });
  const nextNumber = last ? Number(last.dispatchNumber.slice(4)) + 1 : 1;
  if (!Number.isSafeInteger(nextNumber) || nextNumber > 99999999) fail('تعذر تخصيص رقم شحنة جديد.', 409);
  const dispatch = await tx.distributionDispatch.create({
    data: {
      dispatchNumber: `SHP-${String(nextNumber).padStart(8, '0')}`,
      distributionId: existing.id, notes: text(input.notes, 'ملاحظات الشحن', 2000) || '',
      createdBy: user.name, dispatchedAt: new Date()
    }
  });
  for (const line of dispatchLines) {
    await tx.distributionDispatchItem.create({
      data: { dispatchId: dispatch.id, distributionItemId: line.item.id, quantity: line.quantity }
    });
    await tx.distributionItem.update({
      where: { id: line.item.id },
      data: { shippedQuantity: Number(line.item.shippedQuantity) + line.quantity }
    });
  }
  const afterItems = existing.items.map(item => {
    const change = dispatchLines.find(line => line.item.id === item.id);
    return change ? { ...item, shippedQuantity: Number(item.shippedQuantity) + change.quantity } : item;
  });
  const status = statusAfterActivity(existing, afterItems);
  const revision = await writeRevision(tx, existing, 'DISPATCHED', user.name, {
    ...existing, status, items: afterItems
  });
  await tx.distribution.update({
    where: { id: existing.id }, data: { status, updatedBy: user.name, revision }
  });
  return loadDistribution(tx, existing.id);
}

async function createInvoice(tx, user, input) {
  const requestId = text(input.requestId, 'معرّف الفاتورة', 50, true);
  if (!/^[a-zA-Z0-9-]{16,50}$/.test(requestId)) fail('معرّف الفاتورة غير صالح.');
  const invoiceType = text(input.invoiceType, 'نوع الفاتورة', 50, true);
  if (!INVOICE_TYPES.has(invoiceType)) fail('نوع الفاتورة غير مدعوم.');
  const metadata = {
    siteReceiptNumber: text(input.siteReceiptNumber, 'رقم إذن الاستلام بالموقع', 255),
    receiverName: text(input.receiverName, 'اسم المستلم', 255),
    purchaseOrderNumber: text(input.purchaseOrderNumber, 'رقم أمر التوريد', 255)
  };
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500) fail('اختر كميات مشحونة للفوترة.');
  const requestSnapshot = JSON.stringify({
    invoiceType,
    ...(Object.values(metadata).some(Boolean) ? metadata : {}),
    items: [...input.items].map(item => ({
      distributionItemId: item?.distributionItemId,
      quantity: item?.quantity
    })).sort((a, b) => String(a.distributionItemId).localeCompare(String(b.distributionItemId)))
  });
  const replay = await tx.distributionInvoice.findUnique({
    where: { requestId }, include: { order: { include: { items: { include: { product: true } } } } }
  });
  if (replay) {
    if (replay.requestSnapshot !== requestSnapshot) fail('معرّف الطلب مستخدم لفاتورة أخرى. حدّث التوزيعات قبل المتابعة.', 409);
    return { order: replay.order, replayed: true };
  }
  const allocations = [];
  const seen = new Set();
  let customerId = null;
  for (const inputLine of input.items) {
    if (!inputLine || typeof inputLine.distributionItemId !== 'string' || seen.has(inputLine.distributionItemId)) {
      fail('كميات الفوترة غير صالحة أو مكررة.');
    }
    seen.add(inputLine.distributionItemId);
    const item = await tx.distributionItem.findUnique({ where: { id: inputLine.distributionItemId } });
    if (!item) fail('أحد أصناف التوزيعة غير متاح للفوترة.', 409);
    const distribution = await tx.distribution.findUnique({ where: { id: item.distributionId } });
    if (!distribution || distribution.status === 'DRAFT') fail('لا يمكن فوترة توزيعة غير معتمدة.', 409);
    if (input.documents !== undefined) {
      if (!Array.isArray(input.documents)) fail('بيانات التوزيعات غير صالحة.');
      const expected = input.documents.find(document => document?.id === distribution.id);
      if (!expected || expected.revision !== distribution.revision || input.customerId !== distribution.customerId) {
        fail('تغيرت التوزيعة بعد نقلها للسلة. أعد فتح التوزيعات وتجهيز الفاتورة مجددًا.', 409);
      }
    }
    if (customerId && customerId !== distribution.customerId) fail('اجمع توزيعات العميل نفسه فقط في الفاتورة.', 409);
    customerId = distribution.customerId;
    const amount = quantity(inputLine.quantity, 'كمية الفوترة');
    const available = Number(item.shippedQuantity) - Number(item.invoicedQuantity);
    if (amount > available) fail(`الكمية المشحونة غير المفوترة من ${item.productLabel} هي ${Math.max(0, available)}.`, 409);
    allocations.push({ item, distribution, quantity: amount });
  }
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) fail('العميل المرتبط بالتوزيعة غير موجود.', 409);
  const userRecord = await tx.user.findUnique({ where: { id: user.id } });
  if (!userRecord) fail('مستخدم الفوترة غير موجود. سجّل الدخول مجددًا.', 401);
  const distributionIds = [...new Set(allocations.map(allocation => allocation.distribution.id))];
  const beforeDistributions = [];
  for (const id of distributionIds) beforeDistributions.push(await loadDistribution(tx, id));

  const count = await tx.order.count();
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  const issuedAt = new Date();
  const orderItems = allocations.map(({ item, quantity: amount }, position) => {
    const itemTotal = Number((Number(item.unitPrice) * amount).toFixed(2));
    const itemTax = invoiceType === 'فاتورة' ? 0 : Number((itemTotal * Number(item.taxRate)).toFixed(2));
    return {
      position, productId: item.productId, quantity: amount, unitPrice: Number(item.unitPrice),
      taxAmount: itemTax, total: Number((itemTotal + itemTax).toFixed(2))
    };
  });
  const totalAmount = Number(orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2));
  const taxAmount = Number(orderItems.reduce((sum, item) => sum + item.taxAmount, 0).toFixed(2));
  const netAmount = Number((totalAmount + taxAmount).toFixed(2));
  const qrCode = invoiceQrText({
    invoiceNumber, issuedAt: issuedAt.toISOString(), totalAmount: netAmount.toFixed(2), taxAmount: taxAmount.toFixed(2)
  });
  const order = await tx.order.create({
    data: {
      invoiceNumber, isQuotation: false, customerName: customer.name, customerId,
      ...metadata,
      totalAmount, taxAmount, netAmount, qrCode,
      invoiceType, status: 'COMPLETED', userId: userRecord.id,
      items: { create: orderItems }
    },
    include: { items: { include: { product: true } } }
  });
  const invoice = await tx.distributionInvoice.create({
    data: {
      requestId, requestSnapshot, orderId: order.id, customerId, customerName: customer.name,
      createdBy: user.name
    }
  });
  for (let index = 0; index < allocations.length; index += 1) {
    const allocation = allocations[index];
    const product = await tx.product.findUnique({ where: { id: allocation.item.productId } });
    if (!product || Number(product.stockQty) < allocation.quantity
      || Number(product.reservedQty || 0) < allocation.quantity) {
      fail(`المخزون المحجوز من ${allocation.item.productLabel} لم يعد كافيًا للفوترة.`, 409);
    }
    await tx.product.update({
      where: { id: product.id },
      data: {
        stockQty: { decrement: allocation.quantity },
        reservedQty: { decrement: allocation.quantity }
      }
    });
    await tx.distributionItem.update({
      where: { id: allocation.item.id },
      data: { invoicedQuantity: Number(allocation.item.invoicedQuantity) + allocation.quantity }
    });
    await tx.distributionInvoiceItem.create({
      data: {
        distributionInvoiceId: invoice.id, distributionId: allocation.distribution.id,
        distributionItemId: allocation.item.id, orderItemId: order.items[index].id,
        quantity: allocation.quantity
      }
    });
    if (customerId) {
      const quota = await tx.customerCeilingQuota.findUnique({
        where: { customerId_productId: { customerId, productId: allocation.item.productId } }
      });
      if (quota) {
        await tx.customerCeilingQuota.update({
          where: { id: quota.id },
          data: { deliveredQuantity: { increment: allocation.quantity } }
        });
      }
    }
  }
  for (const before of beforeDistributions) {
    const afterItems = before.items.map(item => {
      const allocation = allocations.filter(line => line.item.id === item.id)
        .reduce((sum, line) => sum + line.quantity, 0);
      return allocation ? { ...item, invoicedQuantity: Number(item.invoicedQuantity) + allocation } : item;
    });
    const status = statusAfterActivity(before, afterItems);
    const revision = await writeRevision(tx, before, 'INVOICED', user.name, {
      ...before, status, items: afterItems
    });
    await tx.distribution.update({
      where: { id: before.id }, data: { status, updatedBy: user.name, revision }
    });
  }
  return { order, replayed: false };
}

async function distributionOperation(database, userId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('بيانات التوزيعة غير صالحة.');
  const action = input.action;
  if (!['list', 'create', 'save', 'approve', 'dispatch', 'delete', 'invoice'].includes(action)) {
    fail('إجراء التوزيعة غير صالح.');
  }
  return database.$transaction(async tx => {
    const user = typeof userId === 'string' ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!user) fail('سجّل الدخول مجددًا.', 401);
    const existing = input.id ? await tx.distribution.findUnique({
      where: { id: input.id }, include: { items: true }
    }) : null;
    if (input.id && !existing) fail('التوزيعة غير موجودة.', 404);

    if (action === 'list') {
      if (!['ADMIN', 'CASHIER', 'STOREKEEPER'].includes(user.role)) fail('لا تملك صلاحية عرض التوزيعات.', 403);
      return listOperation(tx, user);
    }
    if (action === 'dispatch') {
      if (!['ADMIN', 'STOREKEEPER'].includes(user.role)) fail('تسجيل الشحن متاح لأمين المخزن والمدير فقط.', 403);
      if (!existing) fail('التوزيعة غير موجودة.', 404);
      return recordDispatch(tx, user, input, existing);
    }
    if (action === 'invoice') {
      if (!['ADMIN', 'CASHIER'].includes(user.role)) fail('فوترة التوزيعات متاحة للمدير والمحاسب فقط.', 403);
      return createInvoice(tx, user, input);
    }
    if (user.role !== 'ADMIN') fail('إدارة التوزيعات متاحة للمدير فقط.', 403);
    if (action === 'create') return createDistribution(tx, user, input);
    if (!existing) fail('احفظ التوزيعة أولًا.');
    if (action === 'save') return updateDistribution(tx, user, input, existing);
    if (action === 'approve') {
      if (Number(input.revision) !== Number(existing.revision)) fail('عُدلت التوزيعة من مستخدم آخر. أعد فتحها قبل الاعتماد.', 409);
      return approveDistribution(tx, user, existing);
    }
    if (action === 'delete') {
      if (Number(input.revision) !== Number(existing.revision)) fail('عُدلت التوزيعة من مستخدم آخر. أعد فتحها قبل الحذف.', 409);
      return cancelDistribution(tx, user, existing);
    }
    fail('إجراء التوزيعة غير مدعوم.');
  });
}

module.exports = { distributionOperation, reservationFor, statusAfterActivity };
