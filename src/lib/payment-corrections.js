function escapeNonAsciiJson(value) {
  return JSON.stringify(value).replace(/[\u0080-\uFFFF]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

async function correctPayment(database, input) {
  const invalidInput = () => {
    const error = new Error('بيانات تصويب السند غير مكتملة أو غير صالحة.');
    error.statusCode = 400;
    return error;
  };
  if (!input || typeof input !== 'object') throw invalidInput();

  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
  const customerId = typeof input.customerId === 'string' ? input.customerId.trim() : '';
  const bankId = typeof input.bankId === 'string' ? input.bankId.trim() : '';
  const amount = Number(input.amount);
  const date = new Date(input.date);

  if (!id || !userId || !customerId || !bankId || !Number.isFinite(amount) || amount <= 0 || !input.date || Number.isNaN(date.getTime())) {
    throw invalidInput();
  }

  return database.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') {
      const error = new Error('تصويب الدفعات متاح لمدير النظام فقط.');
      error.statusCode = 403;
      throw error;
    }
    const existing = await tx.payment.findUnique({ where: { id } });
    if (!existing) return null;

    let history = [];
    if (existing.correctionHistory) {
      history = JSON.parse(existing.correctionHistory);
      if (!Array.isArray(history)) throw new Error('سجل تصويبات السند غير صالح.');
    }

    const before = {
      customerId: existing.customerId,
      bankId: existing.bankId,
      amount: existing.amount,
      reference: existing.reference,
      notes: existing.notes,
      date: existing.date,
    };
    const after = {
      customerId,
      bankId,
      amount,
      reference: typeof input.reference === 'string' ? input.reference.trim() || null : null,
      notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
      date,
    };

    if (existing.bankId === bankId) {
      const balanceDifference = amount - existing.amount;
      if (balanceDifference !== 0) {
        await tx.bank.update({
          where: { id: bankId },
          data: { balance: { increment: balanceDifference } },
        });
      }
    } else {
      await tx.bank.update({
        where: { id: existing.bankId },
        data: { balance: { decrement: existing.amount } },
      });
      await tx.bank.update({
        where: { id: bankId },
        data: { balance: { increment: amount } },
      });
    }

    return tx.payment.update({
      where: { id },
      data: {
        ...after,
        correctionHistory: escapeNonAsciiJson([
          ...history,
          { correctedAt: new Date().toISOString(), before, after },
        ]),
      },
      include: { customer: true, bank: true },
    });
  });
}

module.exports = { correctPayment };
