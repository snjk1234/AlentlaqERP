function invalidPrices(message) {
  return Object.assign(new Error(message), { code: 'INVALID_CUSTOMER_PRICES' });
}

async function saveCustomerPrices(client, customerId, prices) {
  if (typeof customerId !== 'string' || !customerId.trim() || !Array.isArray(prices)) {
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
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw invalidPrices('العميل غير موجود، يرجى تحديث قائمة العملاء');
    if (productIds.size) {
      const products = await tx.product.findMany({ where: { id: { in: [...productIds] } } });
      if (products.length !== productIds.size) {
        throw invalidPrices('أحد الأصناف لم يعد موجودًا، يرجى تحديث قائمة الأصناف');
      }
    }
    const existing = await tx.customerPrice.findMany({ where: { customerId } });
    for (const entry of existing) {
      if (!productIds.has(entry.productId)) {
        await tx.customerPrice.delete({ where: { id: entry.id } });
      }
    }
    for (const { productId, price } of prices) {
      await tx.customerPrice.upsert({
        where: { customerId_productId: { customerId, productId } },
        update: { price },
        create: { customerId, productId, price }
      });
    }
    return tx.customerPrice.findMany({ where: { customerId } });
  });
}

module.exports = { saveCustomerPrices };
