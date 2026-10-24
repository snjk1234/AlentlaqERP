type Dated = { date?: string | Date | null; createdAt?: string | Date | null };
type Invoice = Dated & { netAmount: number; isQuotation?: boolean };
type Payment = Dated & { amount: number };
type OrderReturn = Dated & {
  id: string;
  returnNumber: string;
  netAmount: number;
  refundAmount: number;
  refundMethod: string;
  order?: { invoiceNumber?: string } | null;
  bank?: { name?: string } | null;
};
type Customer = { orders?: Invoice[]; payments?: Payment[]; orderReturns?: OrderReturn[]; openingBalance?: number };
type Supplier = { purchaseOrders?: Invoice[]; expenses?: Payment[]; balance: number };

export function statementEntries<I extends Invoice, P extends Payment>(
  invoices: I[], payments: P[], openingBalance: number, orderReturns: OrderReturn[] = []
) {
  const entries = [
    ...invoices.filter(invoice => !invoice.isQuotation)
      .map(document => ({ kind: 'invoice' as const, document, debit: document.netAmount, credit: 0 })),
    ...payments.map(document => ({ kind: 'payment' as const, document, debit: 0, credit: document.amount })),
    ...orderReturns.map(document => ({
      kind: 'return' as const, document, debit: document.refundAmount, credit: document.netAmount
    }))
  ];
  const time = (document: Dated) => {
    const value = document.date || document.createdAt;
    const timestamp = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(timestamp)) throw new Error('Statement movement has an invalid date.');
    return timestamp;
  };
  entries.forEach(entry => time(entry.document));
  entries.sort((a, b) => time(a.document) - time(b.document));
  let balance = openingBalance;
  return entries.map(entry => {
    balance += entry.debit - entry.credit;
    return { ...entry, balance };
  });
}

export function statementTotals(
  invoices: Invoice[], payments: Payment[], openingBalance: number, orderReturns: OrderReturn[] = []
) {
  const totalInvoices = openingBalance + invoices
    .filter(invoice => !invoice.isQuotation)
    .reduce((sum, invoice) => sum + invoice.netAmount, 0);
  const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalReturns = orderReturns.reduce((sum, orderReturn) => sum + orderReturn.netAmount, 0);
  const totalRefunds = orderReturns.reduce((sum, orderReturn) => sum + (orderReturn.refundAmount || 0), 0);
  return {
    totalInvoices, totalPayments, totalReturns, totalRefunds,
    totalDue: totalInvoices - totalPayments - totalReturns + totalRefunds
  };
}

export function inAccountPeriod(value: Dated, from: string, to: string) {
  if (!from && !to) return true;
  const date = value.date || value.createdAt;
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= (from ? new Date(`${from}T00:00:00`).getTime() : -Infinity)
    && time <= (to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity);
}

export function customerInPeriod<T extends Customer>(customer: T, from: string, to: string) {
  return {
    ...customer,
    orders: (customer.orders || []).filter(order => !order.isQuotation && inAccountPeriod(order, from, to)),
    payments: (customer.payments || []).filter(payment => inAccountPeriod(payment, from, to)),
    orderReturns: (customer.orderReturns || []).filter(orderReturn => inAccountPeriod(orderReturn, from, to)),
    openingBalance: from || to ? 0 : customer.openingBalance || 0
  };
}

export function supplierInPeriod<T extends Supplier>(supplier: T, from: string, to: string) {
  const purchaseOrders = (supplier.purchaseOrders || []).filter(order => inAccountPeriod(order, from, to));
  const expenses = (supplier.expenses || []).filter(expense => inAccountPeriod(expense, from, to));
  return {
    ...supplier,
    purchaseOrders,
    expenses,
    balance: from || to
      ? purchaseOrders.reduce((sum, order) => sum + order.netAmount, 0) - expenses.reduce((sum, expense) => sum + expense.amount, 0)
      : supplier.balance
  };
}
