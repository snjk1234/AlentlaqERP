function invoiceQrText({ invoiceNumber, issuedAt, totalAmount, taxAmount }) {
  return [
    'بيانات الفاتورة',
    `رقم الفاتورة: ${invoiceNumber}`,
    `تاريخ الإصدار: ${issuedAt}`,
    `الإجمالي شامل الضريبة: ${totalAmount} جنيه مصري`,
    `ضريبة القيمة المضافة: ${taxAmount} جنيه مصري`
  ].join('\n');
}

function invoiceQrTextFromDocument(invoice) {
  if (typeof invoice?.invoiceNumber !== 'string' || !invoice.invoiceNumber.trim()) {
    throw new Error('رقم الفاتورة غير متاح لإنشاء رمز QR.');
  }
  const dateValue = invoice.date || invoice.createdAt;
  const issuedDate = dateValue ? new Date(dateValue) : new Date(NaN);
  const totalAmount = Number(invoice.netAmount);
  const taxAmount = Number(invoice.taxAmount);
  if (!Number.isFinite(issuedDate.getTime())
    || invoice.netAmount === null || invoice.netAmount === undefined || String(invoice.netAmount).trim() === ''
    || invoice.taxAmount === null || invoice.taxAmount === undefined || String(invoice.taxAmount).trim() === ''
    || !Number.isFinite(totalAmount) || !Number.isFinite(taxAmount)) {
    throw new Error('بيانات الفاتورة غير صالحة لإنشاء رمز QR.');
  }
  return invoiceQrText({
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: issuedDate.toISOString(),
    totalAmount: totalAmount.toFixed(2),
    taxAmount: taxAmount.toFixed(2)
  });
}

module.exports = { invoiceQrText, invoiceQrTextFromDocument };
