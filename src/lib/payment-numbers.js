function nextPaymentNumber(payments) {
  let highest = 0;
  for (const payment of payments) {
    const match = String(payment.receiptNumber || '').trim().match(/^(?:REC-)?(\d+)$/i);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) throw new Error('رقم سند القبض يتجاوز الحد المسموح.');
    highest = Math.max(highest, value);
  }
  if (!Number.isSafeInteger(highest + 1)) throw new Error('تعذر إنشاء رقم سند قبض جديد.');
  return String(highest + 1).padStart(5, '0');
}

async function assignMissingPaymentNumbers(payments, save) {
  const numbered = [...payments];
  for (const payment of payments) {
    if (String(payment.receiptNumber || '').trim()) continue;
    const receiptNumber = nextPaymentNumber(numbered);
    await save(payment.id, receiptNumber);
    numbered.push({ receiptNumber });
  }
}

module.exports = { nextPaymentNumber, assignMissingPaymentNumbers };
