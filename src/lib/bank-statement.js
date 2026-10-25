const dateValue = (document) => {
  const value = document.date || document.createdAt;
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) throw new Error('Bank statement movement has an invalid date.');
  return timestamp;
};
const roundMoney = value => Math.round(value * 100) / 100;

function buildBankStatement({ bankId, bankBalance, payments = [], supplierPayments = [], generalExpenses = [], returns = [], transfers = [], from = '', to = '' }) {
  const movements = [
    ...payments.filter(payment => payment.bankId === bankId).map(payment => ({
      id: payment.id,
      date: payment.date || payment.createdAt,
      type: 'دفعات العملاء',
      number: payment.receiptNumber
        ? (/^REC-/i.test(payment.receiptNumber) ? payment.receiptNumber : `REC-${payment.receiptNumber}`)
        : `REC-${payment.id.substring(0, 6).toUpperCase()}`,
      party: payment.customer?.name || 'عميل',
      reference: payment.reference,
      notes: payment.notes,
      incoming: Number(payment.amount) || 0,
      outgoing: 0
    })),
    ...supplierPayments.filter(payment => payment.bankId === bankId).map(payment => ({
      id: payment.id,
      date: payment.date || payment.createdAt,
      type: 'سداد مورد',
      number: payment.expenseNumber || payment.id,
      party: payment.supplier?.name || 'مورد',
      reference: payment.reference,
      notes: payment.notes,
      incoming: 0,
      outgoing: Number(payment.amount) || 0
    })),
    ...generalExpenses.filter(expense => expense.bankId === bankId).map(expense => ({
      id: expense.id,
      date: expense.date || expense.createdAt,
      type: 'مصروف عام',
      number: expense.expenseNumber || expense.id,
      party: expense.category?.name || 'مصروف',
      reference: expense.reference,
      notes: expense.notes,
      incoming: 0,
      outgoing: Number(expense.amount) || 0
    })),
    ...transfers.filter(transfer => transfer.fromBankId === bankId || transfer.toBankId === bankId).map(transfer => {
      const outgoing = transfer.fromBankId === bankId;
      return {
        id: transfer.id,
        date: transfer.date,
        type: `${transfer.reversalOf ? 'عكس تحويل' : 'تحويل'} ${outgoing ? 'صادر' : 'وارد'}`,
        number: transfer.transferNumber,
        party: outgoing ? transfer.toBankName : transfer.fromBankName,
        reference: transfer.reference,
        notes: transfer.notes,
        incoming: outgoing ? 0 : Number(transfer.amount),
        outgoing: outgoing ? Number(transfer.amount) : 0
      };
    }),
    ...returns.filter(orderReturn =>
      orderReturn.bankId === bankId
      && orderReturn.refundMethod === 'BANK'
      && Number(orderReturn.refundAmount) > 0
    ).map(orderReturn => ({
      id: orderReturn.id,
      date: orderReturn.createdAt,
      type: 'رد مبلغ مرتجع',
      number: orderReturn.returnNumber || orderReturn.id,
      party: orderReturn.customer?.name || orderReturn.order?.customerName || 'عميل',
      reference: orderReturn.order?.invoiceNumber,
      notes: orderReturn.notes,
      incoming: Number(orderReturn.refundAmount) || 0,
      outgoing: 0
    }))
  ].map(movement => ({ ...movement, timestamp: dateValue(movement) }))
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));

  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  const periodMovements = movements.filter(movement =>
    movement.timestamp >= fromTime && movement.timestamp <= toTime
  );
  const futureNet = movements
    .filter(movement => movement.timestamp >= fromTime)
    .reduce((sum, movement) => sum + movement.incoming - movement.outgoing, 0);
  const openingBalance = roundMoney(Number(bankBalance) - futureNet);
  let runningBalance = openingBalance;
  const rows = periodMovements.map(movement => {
    runningBalance = roundMoney(runningBalance + movement.incoming - movement.outgoing);
    return { ...movement, balance: runningBalance };
  });

  return {
    openingBalance,
    closingBalance: runningBalance,
    totalIncoming: roundMoney(periodMovements.reduce((sum, movement) => sum + movement.incoming, 0)),
    totalOutgoing: roundMoney(periodMovements.reduce((sum, movement) => sum + movement.outgoing, 0)),
    rows
  };
}

module.exports = { buildBankStatement };
