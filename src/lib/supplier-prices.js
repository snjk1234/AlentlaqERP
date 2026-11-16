function invalidPrices(message) {
  return Object.assign(new Error(message), { code: 'INVALID_SUPPLIER_PRICES' });
}

async function saveSupplierPrices(client, supplierId, prices) {
  if (typeof supplierId !== 'string' || !supplierId.trim() || !Array.isArray(prices)) {
    throw invalidPrices('بيانات قائمة الأسعار غير صحيحة');
  }
  const productIds = new Set();
  for (const entry of prices) {
    if (!entry || typeof entry.productId !== 'string' || !entry.productId.trim()
      || typeof entry.price !== 'number' || !Number.isFinite(entry.price) || entry.price < 0
      || productIds.has(entry.productId)) {
      throw invalidPrices('يجب إدخال سعر صالح لا يقل عن صفر لكل صنف دون تكرار');
    }
    productIds.add(entry.productId);
  }
  return client.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw invalidPrices('المورد غير موجود، يرجى تحديث قائمة الموردين');
    if (productIds.size) {
      const products = await tx.product.findMany({ where: { id: { in: [...productIds] } } });
      if (products.length !== productIds.size) {
        throw invalidPrices('أحد الأصناف لم يعد موجودًا، يرجى تحديث قائمة الأصناف');
      }
    }
    const existing = await tx.supplierPrice.findMany({ where: { supplierId } });
    for (const entry of existing) {
      if (!productIds.has(entry.productId)) {
        await tx.supplierPrice.delete({ where: { id: entry.id } });
      }
    }
    for (const { productId, price } of prices) {
      await tx.supplierPrice.upsert({
        where: { supplierId_productId: { supplierId, productId } },
        update: { price },
        create: { supplierId, productId, price }
      });
    }
    return tx.supplierPrice.findMany({ where: { supplierId } });
  });
}

module.exports = { saveSupplierPrices };
