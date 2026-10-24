"use client";

import type { ReactNode } from 'react';
import { FileTextIcon, PrinterIcon, XIcon } from 'lucide-react';
import { statementEntries, statementTotals } from '@/lib/account-period';
import { formatMoney as money } from '../lib/money-format';

type DatedDocument = { id: string; date?: string | Date | null; createdAt?: string | Date | null };
export type StatementInvoice = DatedDocument & {
  netAmount: number;
  totalAmount?: number;
  taxAmount?: number;
  isQuotation?: boolean;
  invoiceNumber?: string;
  billNumber?: string;
  invoiceType?: string;
  siteReceiptNumber?: string | null;
  receiverName?: string | null;
  qrCode?: string | null;
};
export type StatementPayment = DatedDocument & {
  amount: number;
  receiptNumber?: string | null;
  expenseNumber?: string;
  notes?: string | null;
  bank?: { name: string } | null;
};
export type StatementReturn = DatedDocument & {
  returnNumber: string;
  netAmount: number;
  refundAmount: number;
  refundMethod: string;
  order?: { invoiceNumber?: string } | null;
  bank?: { name: string } | null;
};

type Props = {
  kind: 'customer' | 'supplier';
  name: string;
  openingBalance: number;
  invoices: StatementInvoice[];
  payments: StatementPayment[];
  returns?: StatementReturn[];
  from: string;
  to: string;
  periodControls: ReactNode;
  showInvoiceAmounts?: boolean;
  onClose: () => void;
  onInvoice: (document: StatementInvoice) => void;
  onPayment: (document: StatementPayment) => void;
  onReturn?: (document: StatementReturn) => void;
};

const dateLabel = (value: string | Date) => new Date(value).toLocaleDateString('ar-EG', {
  year: 'numeric', month: '2-digit', day: '2-digit'
});

export default function AccountStatement({
  kind, name, openingBalance, invoices, payments, returns = [], from, to, periodControls,
  showInvoiceAmounts = true, onClose, onInvoice, onPayment, onReturn
}: Props) {
  const supplier = kind === 'supplier';
  const title = supplier ? 'كشف حساب مورد' : 'كشف حساب عميل';
  const entries = statementEntries(invoices, payments, openingBalance, returns);
  const totals = statementTotals(invoices, payments, openingBalance, returns);
  const period = from || to ? `${from || 'البداية'} — ${to || 'اليوم'}` : 'جميع الحركات';
  const screenInvoices = invoices.filter(invoice => !invoice.isQuotation);
  const paymentReference = (payment: StatementPayment) => supplier
    ? payment.expenseNumber || payment.id
    : payment.receiptNumber ? `REC-${payment.receiptNumber}` : `REC-${payment.id.substring(0, 6).toUpperCase()}`;

  return (
    <div className="account-statement-overlay" role="dialog" aria-modal="true" aria-labelledby="statement-dialog-title" dir="rtl">
      <div className="account-statement-shell account-history-shell">
        <div className="account-statement-toolbar no-print">
          <h3 id="statement-dialog-title" className="flex items-center gap-2">
            <FileTextIcon size={22} className={supplier ? 'text-purple-400' : 'text-entlaq-primary'} />
            {supplier ? 'كشف حساب تفصيلي للمورد' : 'كشف حساب تفصيلي'}: {name}
          </h3>
          {periodControls}
          <div className="account-statement-actions">
            <button type="button" onClick={() => window.print()} className="account-statement-print">
              <PrinterIcon size={16} /> طباعة الكشف
            </button>
            <button type="button" onClick={onClose} aria-label="إغلاق كشف الحساب">
              <XIcon size={18} />
            </button>
          </div>
        </div>
        <div className="account-statement-scroll account-history-scroll">
          <div className="account-history-screen no-print flex flex-col gap-1.5">
            {!supplier && (
              <div className="grid grid-cols-5 gap-2 mb-2">
                {([
                  ['إجمالي الفواتير والرصيد الافتتاحي', totals.totalInvoices, 'text-white'],
                  ['إجمالي السدادات', totals.totalPayments, 'text-emerald-400'],
                  ['إجمالي المرتجعات', totals.totalReturns, 'text-amber-400'],
                  ['المبالغ المردودة', totals.totalRefunds, 'text-rose-400'],
                  ['إجمالي المطلوب', totals.totalDue, totals.totalDue > 0 ? 'text-red-400' : 'text-emerald-400']
                ] as const).map(([label, value, color]) => (
                  <div key={label} className="bg-slate-800/50 border border-slate-700 p-2 rounded-sm text-center">
                    <p className="text-sm text-slate-400 mb-1 font-bold">{label}</p>
                    <p className={`text-xl font-black font-mono ${color}`}>{money(value)} ج.م</p>
                  </div>
                ))}
              </div>
            )}
            <section className="bg-slate-950 border border-slate-800 rounded p-2">
              <h4 className="text-md font-bold text-white mb-2 border-b border-white/5 pb-1">
                {supplier ? 'سجل فواتير الشراء والتوريد' : 'سجل الفواتير'}
              </h4>
              <div className="max-h-60 overflow-auto custom-scrollbar">
                <table className="w-full text-right text-sm whitespace-nowrap">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="p-3" scope="col">رقم الفاتورة</th>
                      {!supplier && <>
                        <th className="p-3" scope="col">ر.إذن استلام في الموقع</th>
                        <th className="p-3" scope="col">اسم المستلم</th>
                        <th className="p-3" scope="col">نوع الفاتورة</th>
                      </>}
                      <th className="p-3" scope="col">التاريخ</th>
                      {supplier && showInvoiceAmounts && <>
                        <th className="p-3" scope="col">الإجمالي قبل الضريبة</th>
                        <th className="p-3" scope="col">قيمة الضريبة</th>
                      </>}
                      {showInvoiceAmounts && <th className="p-3" scope="col">{supplier ? 'الإجمالي الصافي' : 'الإجمالي'}</th>}
                      <th className="p-3 text-center" scope="col">طباعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    <tr className="text-slate-300">
                      <td className="p-3" colSpan={supplier ? 2 : 5}>رصيد أول المدة</td>
                      {supplier && showInvoiceAmounts && <td colSpan={2} />}
                      {showInvoiceAmounts && <td className="p-3 font-mono">{money(openingBalance)} ج.م</td>}
                      <td />
                    </tr>
                    {screenInvoices.map(invoice => (
                      <tr key={invoice.id} className="hover:bg-white/5 text-white">
                        <td className="p-3 font-mono font-bold"><bdi>{invoice.invoiceNumber || invoice.billNumber || invoice.id}</bdi></td>
                        {!supplier && <>
                          <td className="p-3 font-mono text-xs text-emerald-400">{invoice.siteReceiptNumber || '—'}</td>
                          <td className="p-3 text-xs text-slate-300">{invoice.receiverName || '—'}</td>
                          <td className="p-3 text-xs text-slate-400">{invoice.invoiceType || 'فاتورة ضريبية'}</td>
                        </>}
                        <td className="p-3 font-mono text-xs text-slate-300">{dateLabel(invoice.date || invoice.createdAt || '')}</td>
                        {supplier && showInvoiceAmounts && <>
                          <td className="p-3 font-mono text-slate-300">{money(invoice.totalAmount ?? invoice.netAmount - (invoice.taxAmount ?? 0))} ج.م</td>
                          <td className="p-3 font-mono text-slate-400">{money(invoice.taxAmount ?? 0)} ج.م</td>
                        </>}
                        {showInvoiceAmounts && <td className={`p-3 font-mono font-bold ${supplier ? 'text-purple-400' : 'text-emerald-400'}`}>{money(invoice.netAmount)} ج.م</td>}
                        <td className="p-3 text-center">
                          <button type="button" onClick={() => onInvoice(invoice)}
                            aria-label={`طباعة الفاتورة ${invoice.invoiceNumber || invoice.billNumber || invoice.id}`}
                            className="text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-sm cursor-pointer">
                            <PrinterIcon size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {screenInvoices.length === 0 && <p className="text-center py-1.5 text-slate-500 font-bold text-sm">لا توجد فواتير خلال الفترة المختارة</p>}
            </section>
            {!supplier && returns.length > 0 && (
              <section className="bg-slate-950 border border-slate-800 rounded p-2">
                <h4 className="text-md font-bold text-white mb-2 border-b border-white/5 pb-1">سجل مرتجعات الفواتير</h4>
                <div className="max-h-44 overflow-auto custom-scrollbar">
                  <table className="w-full text-right text-sm whitespace-nowrap">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="p-3" scope="col">رقم المرتجع</th>
                        <th className="p-3" scope="col">الفاتورة</th>
                        <th className="p-3" scope="col">التاريخ</th>
                        <th className="p-3" scope="col">قيمة المرتجع</th>
                        <th className="p-3" scope="col">المبلغ المردود</th>
                        <th className="p-3" scope="col">طريقة الرد</th>
                        <th className="p-3 text-center" scope="col">طباعة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {returns.map(orderReturn => (
                        <tr key={orderReturn.id} className="text-white">
                          <td className="p-3 font-mono font-bold">{orderReturn.returnNumber}</td>
                          <td className="p-3 font-mono">{orderReturn.order?.invoiceNumber || '—'}</td>
                          <td className="p-3 font-mono text-xs text-slate-300">{dateLabel(orderReturn.date || orderReturn.createdAt || '')}</td>
                          <td className="p-3 font-mono text-amber-400">{money(orderReturn.netAmount)} ج.م</td>
                          <td className="p-3 font-mono text-rose-400">{money(orderReturn.refundAmount)} ج.م</td>
                          <td className="p-3">{orderReturn.refundMethod === 'BANK' ? orderReturn.bank?.name || 'بنك' : orderReturn.refundMethod === 'CASH' ? 'نقدًا' : 'تسوية رصيد'}</td>
                          <td className="p-3 text-center">
                            {onReturn && <button type="button" onClick={() => onReturn(orderReturn)}
                              aria-label={`طباعة المرتجع ${orderReturn.returnNumber}`}
                              className="rounded-sm bg-white/5 p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
                              <PrinterIcon size={14} />
                            </button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <section className="bg-slate-950 border border-slate-800 rounded p-2">
              <h4 className="text-md font-bold text-white mb-2 border-b border-white/5 pb-1">
                {supplier ? 'سجل سندات الصرف والمدفوعات للمورد' : 'سجل سندات القبض والمدفوعات'}
              </h4>
              {payments.length > 0 ? (
                <div className="max-h-60 overflow-auto custom-scrollbar">
                  <table className="w-full text-right text-sm whitespace-nowrap">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        {[supplier ? 'رقم سند الصرف' : 'رقم السند', 'التاريخ', 'البنك/الخزينة', 'ملاحظات', supplier ? 'المبلغ الصادر' : 'المبلغ', 'طباعة'].map(label => (
                          <th key={label} scope="col" className="p-3">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {payments.map(payment => (
                        <tr key={payment.id} className="hover:bg-white/5 text-white">
                          <td className="p-3 font-mono font-bold"><bdi>{paymentReference(payment)}</bdi></td>
                          <td className="p-3 font-mono text-xs text-slate-300">{dateLabel(payment.date || payment.createdAt || '')}</td>
                          <td className="p-3 text-slate-300 font-bold">{payment.bank?.name || '—'}</td>
                          <td className="p-3 text-slate-400 text-xs">{payment.notes || '—'}</td>
                          <td className={`p-3 font-mono font-bold ${supplier ? 'text-red-400' : 'text-emerald-400'}`}>{money(payment.amount)} ج.م</td>
                          <td className="p-3 text-center">
                            <button type="button" onClick={() => onPayment(payment)} aria-label={`طباعة السند ${paymentReference(payment)}`}
                              className="text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-sm cursor-pointer">
                              <PrinterIcon size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-center py-1.5 text-slate-500 font-bold text-sm">لا توجد سندات خلال الفترة المختارة</p>}
            </section>
          </div>
          <article id="printable-statement" className="account-statement account-history-print">
            <table className="statement-ledger">
              <caption className="sr-only">{title}: {name} — {period}</caption>
              <colgroup>
                <col style={{ width: '13%' }} /><col style={{ width: '19%' }} />
                <col style={{ width: '32%' }} />
                <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr className="statement-document-heading">
                  <th colSpan={6}>
                    <div className="statement-brand-row">
                      <div className="statement-brand">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/images/logo.png" alt="شعار الانطلاق" width={64} height={64} />
                        <div>
                          <span className="statement-eyebrow">AL-ENTLAQ / ACCOUNT STATEMENT</span>
                          <h1>الإنطلاق</h1>
                          <p>مصنع خراطيم ومواسير وأسلاك الكهرباء</p>
                        </div>
                      </div>
                      <div className="statement-document-label">
                        <span className="statement-eyebrow">كشف الحركات المالية</span>
                        <h2>{title}</h2>
                        <p>تاريخ الإصدار <bdi>{dateLabel(new Date())}</bdi></p>
                      </div>
                    </div>
                    <div className="statement-account-row">
                      <div><span>{supplier ? 'المورد' : 'العميل'}</span><strong>{name}</strong></div>
                      <div><span>الفترة</span><strong><bdi>{period}</bdi></strong></div>
                      <div><span>العملة</span><strong>جنيه مصري · EGP</strong></div>
                    </div>
                  </th>
                </tr>
                <tr className="statement-column-heading">
                  {['التاريخ', 'رقم المستند', 'البيان', supplier ? 'دائن' : 'مدين', supplier ? 'مدين' : 'دائن', 'الرصيد'].map(label => (
                    <th key={label} scope="col">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="statement-opening">
                  <td>—</td>
                  <td>—</td>
                  <td>الرصيد الافتتاحي</td>
                  <td className="statement-number">{money(Math.max(openingBalance, 0))}</td>
                  <td className="statement-number">{money(Math.max(-openingBalance, 0))}</td>
                  <td className="statement-number">{money(openingBalance)}</td>
                </tr>
                {entries.map(entry => {
                  const invoice = entry.kind === 'invoice' ? entry.document : null;
                  const payment = entry.kind === 'payment' ? entry.document : null;
                  const orderReturn = entry.kind === 'return' ? entry.document : null;
                  const reference = invoice
                    ? invoice.invoiceNumber || invoice.billNumber || invoice.id
                    : orderReturn
                      ? orderReturn.returnNumber
                      : supplier
                        ? payment?.expenseNumber || entry.document.id
                        : payment?.receiptNumber ? `REC-${payment.receiptNumber}` : `REC-${entry.document.id.substring(0, 6).toUpperCase()}`;
                  const description = invoice
                    ? [
                      invoice.siteReceiptNumber && `إذن استلام: ${invoice.siteReceiptNumber}`,
                      invoice.receiverName && `المستلم: ${invoice.receiverName}`
                    ].filter(Boolean).join(' · ') || '—'
                    : orderReturn
                      ? [
                        `مرتجع من الفاتورة ${orderReturn.order?.invoiceNumber || '—'}`,
                        orderReturn.refundAmount > 0
                          ? `رد ${money(orderReturn.refundAmount)} ج.م ${orderReturn.refundMethod === 'BANK' ? `من ${orderReturn.bank?.name || 'البنك'}` : 'نقدًا'}`
                          : 'تسوية من رصيد العميل'
                      ].join(' · ')
                      : [payment?.bank?.name, payment?.notes].filter(Boolean).join(' · ') || 'سداد دفعة من الحساب';
                  return (
                    <tr key={`${entry.kind}-${entry.document.id}`} className={`statement-${entry.kind}`}>
                      <td className="statement-date">{dateLabel(entry.document.date || entry.document.createdAt || '')}</td>
                      <td className="statement-reference">
                        {(invoice || payment) && <button type="button" className="no-print" aria-label={`فتح ${reference}`}
                          onClick={() => { if (invoice) onInvoice(invoice); else if (payment) onPayment(payment); }}>
                          <bdi>{reference}</bdi>
                        </button>}
                        <span className="statement-print-reference"><bdi>{reference}</bdi></span>
                      </td>
                      <td className="statement-description">{description}</td>
                      <td className="statement-number">{invoice && !showInvoiceAmounts ? '—' : money(entry.debit)}</td>
                      <td className="statement-number">{money(entry.credit)}</td>
                      <td className="statement-number">{showInvoiceAmounts ? money(entry.balance) : '—'}</td>
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr><td colSpan={6} className="statement-empty">لا توجد حركات خلال الفترة المختارة</td></tr>
                )}
              </tbody>
              <tbody className="statement-totals">
                <tr className="statement-total">
                  <th colSpan={5} scope="row">إجمالي الفواتير والرصيد الافتتاحي</th>
                  <td className="statement-number">{showInvoiceAmounts ? money(totals.totalInvoices) : '—'}</td>
                </tr>
                <tr className="statement-total">
                  <th colSpan={5} scope="row">إجمالي السدادات</th>
                  <td className="statement-number">{money(totals.totalPayments)}</td>
                </tr>
                {!supplier && <>
                  <tr className="statement-total">
                    <th colSpan={5} scope="row">إجمالي المرتجعات</th>
                    <td className="statement-number">{money(totals.totalReturns)}</td>
                  </tr>
                  <tr className="statement-total">
                    <th colSpan={5} scope="row">إجمالي المبالغ المردودة</th>
                    <td className="statement-number">{money(totals.totalRefunds)}</td>
                  </tr>
                </>}
                <tr className="statement-closing">
                  <th colSpan={5} scope="row">إجمالي المطلوب <span>· صافي الرصيد المستحق</span></th>
                  <td className="statement-number">{showInvoiceAmounts ? money(totals.totalDue) : '—'}</td>
                </tr>
              </tbody>
            </table>
            <footer className="statement-footer document-footer">
              <span>الإنطلاق · كشف حساب تفصيلي</span>
              <span>الرصيد الافتتاحي + الفواتير − السدادات = إجمالي المطلوب</span>
              <span><bdi>https://www.alentlaq.online/</bdi></span>
              <span><bdi>01030099400 / 01021683030</bdi> · <bdi>admin@alentlaq.online</bdi></span>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
