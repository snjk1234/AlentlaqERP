"use client";

import type { ReactNode } from 'react';
import { PrinterIcon, XIcon } from 'lucide-react';

type Party = {
  name?: string; phone?: string | null; address?: string | null;
  location?: string | null; cr?: string | null; trn?: string | null;
};
type Dated = { date?: string | Date; createdAt: string | Date };
type Product = { code?: string; name?: string; size?: string; color?: string | null };
type Item = {
  id?: string; product?: Product; quantity: number; unitPrice?: number; unitCost?: number;
  taxAmount: number; total: number;
};
export type PrintInvoice = Dated & {
  invoiceNumber?: string; billNumber?: string; invoiceType?: string;
  isQuotation?: boolean; status?: string; customerName?: string | null;
  customer?: Party | null; supplier?: Party | null;
  siteReceiptNumber?: string | null; receiverName?: string | null;
  totalAmount: number; taxAmount: number; netAmount: number; items?: Item[];
};
export type PrintReceipt = Dated & {
  id: string; receiptNumber?: string | null; expenseNumber?: string;
  amount: number; notes?: string | null; reference?: string | null;
  customer?: Party | null; supplier?: Party | null; bank?: { name: string } | null;
};
export type PrintAccountDiscount = {
  discountNumber: string;
  kind: 'ALLOWED' | 'EARNED';
  partyName: string;
  date: string | Date;
  amount: number;
  notes?: string | null;
};
export type PrintTableData = {
  title: string; headers: string[]; rows: ReactNode[][]; footer?: ReactNode[];
  period?: { from: string; to: string };
};
const money = (value: number) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const printCell = (value: ReactNode) => {
  if (typeof value !== 'string') return value;
  const amount = value.match(/^(-?\d+)(\.\d{2})(\s*ج\.م)?$/);
  if (!amount) return value;
  return `${Number(`${amount[1]}${amount[2]}`).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })}${amount[3] || ''}`;
};
const date = (value: string | Date, includeTime = false) => new Date(value).toLocaleString('ar-EG', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  ...(includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {})
});

function DocumentFrame({ id, title, onClose, actions, children }: {
  id: string; title: string; onClose: () => void; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="account-statement-overlay print-document-overlay" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} dir="rtl">
      <div className="account-statement-shell">
        <div className="account-statement-toolbar no-print">
          <h3 id={`${id}-title`}>{title}</h3>
          <div className="account-statement-actions">
            {actions}
            <button type="button" className="account-statement-print" onClick={() => window.print()}>
              <PrinterIcon size={16} /> طباعة
            </button>
            <button type="button" onClick={onClose} aria-label="إغلاق الطباعة"><XIcon size={18} /></button>
          </div>
        </div>
        <div className="account-statement-scroll">
          <article id={id} className="account-statement print-document statement-compact">{children}</article>
        </div>
      </div>
    </div>
  );
}

function DocumentHeader({ title, number, issuedAt, includeTime = false, children }: {
  title: string; number?: string; issuedAt: string | Date; includeTime?: boolean; children?: ReactNode;
}) {
  return (
    <div className="document-header">
      <div className="statement-brand-row">
        <div className="statement-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="شعار الانطلاق" width={64} height={64} />
          <div>
            <span className="statement-eyebrow">AL-ENTLAQ / BUSINESS DOCUMENT</span>
            <h1>الإنطلاق</h1>
            <p>مصنع خراطيم ومواسير وأسلاك الكهرباء</p>
          </div>
        </div>
        <div className="statement-document-label">
          <span className="statement-eyebrow">المستندات المالية</span>
          <h2>{title}</h2>
          {number && <p>رقم المستند <bdi>{number}</bdi></p>}
          <p>التاريخ <bdi>{date(issuedAt, includeTime)}</bdi></p>
        </div>
      </div>
      {children}
    </div>
  );
}

function PartyDetails({ title, party }: { title: string; party: Party }) {
  return (
    <div>
      <span>{title}</span>
      <strong>{party.name || '—'}</strong>
      {(party.address || party.location) && <p>{party.address || party.location}</p>}
      {party.phone && <p>الهاتف: <bdi>{party.phone}</bdi></p>}
    </div>
  );
}

function DocumentFooter() {
  return (
    <footer className="statement-footer document-footer">
      <span>الإنطلاق · شكرًا لتعاملكم معنا</span>
      <span><bdi>https://www.alentlaq.online/</bdi></span>
      <span><bdi>01030099400 / 01021683030</bdi> · <bdi>admin@alentlaq.online</bdi></span>
    </footer>
  );
}

export function InvoicePrint({ invoice, purchase = false, showAmounts = true, qrCodeUrl,
  onClose, actions }: {
  invoice: PrintInvoice; purchase?: boolean; showAmounts?: boolean; qrCodeUrl?: string;
  onClose: () => void; actions?: ReactNode;
}) {
  const title = !purchase && invoice.isQuotation
    ? (invoice.status === 'CONVERTED' ? 'عرض سعر (تم التحويل)' : 'عرض سعر')
    : 'فاتورة';
  const columns = showAmounts ? 7 : 4;
  const company = {
    name: 'مصنع الانطلاق للصناعات البلاستيكية', address: 'العاشر من رمضان - المنطقة الصناعية الثالثة'
  };
  return (
    <DocumentFrame id={purchase ? 'printable-purchase' : 'printable-invoice'} title={title} onClose={onClose} actions={actions}>
      <table className="statement-ledger document-table">
        <colgroup>
          {(showAmounts ? [5, 11, 34, 8, 14, 12, 16] : [6, 16, 62, 16]).map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
        </colgroup>
        <thead>
          <tr className="statement-document-heading"><th colSpan={columns}>
            <DocumentHeader title={title} number={purchase ? invoice.billNumber : invoice.invoiceNumber}
              issuedAt={invoice.date || invoice.createdAt} includeTime={!purchase}>
              <div className="statement-account-row document-parties">
                <PartyDetails title={purchase ? 'المورد' : 'البائع'} party={purchase ? invoice.supplier || {} : company} />
                <PartyDetails title={purchase ? 'المشتري' : 'العميل'} party={purchase ? company : invoice.customer || { name: invoice.customerName || 'عميل نقدي' }} />
              </div>
              {(invoice.siteReceiptNumber || invoice.receiverName) && (
                <div className="document-meta">
                  {invoice.siteReceiptNumber && <span>إذن استلام بالموقع: <bdi>{invoice.siteReceiptNumber}</bdi></span>}
                  {invoice.receiverName && <span>المستلم: {invoice.receiverName}</span>}
                </div>
              )}
            </DocumentHeader>
          </th></tr>
          <tr className="statement-column-heading">
            <th scope="col">م</th><th scope="col">الكود</th><th scope="col">الصنف / المواصفات</th><th scope="col">الكمية</th>
            {showAmounts && <><th scope="col">سعر الوحدة</th><th scope="col">الضريبة</th><th scope="col">الإجمالي</th></>}
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item, index) => (
            <tr key={item.id || index}>
              <td>{index + 1}</td><td><bdi>{item.product?.code || '—'}</bdi></td>
              <td className="statement-description">{[item.product?.name, item.product?.size, item.product?.color].filter(Boolean).join(' · ')}</td>
              <td className="statement-number">{item.quantity}</td>
              {showAmounts && <>
                <td className="statement-number">{money(purchase ? item.unitCost || 0 : item.unitPrice || 0)}</td>
                <td className="statement-number">{money(item.taxAmount)}</td>
                <td className="statement-number">{money(item.total)}</td>
              </>}
            </tr>
          ))}
          {!invoice.items?.length && <tr><td colSpan={columns} className="statement-empty">لا توجد أصناف</td></tr>}
        </tbody>
        {showAmounts && <tbody className="statement-totals document-totals">
          <tr className="statement-total"><th scope="row" colSpan={columns - 1}>الإجمالي غير شامل الضريبة</th><td className="statement-number">{money(invoice.totalAmount)}</td></tr>
          <tr className="statement-total"><th scope="row" colSpan={columns - 1}>ضريبة القيمة المضافة</th><td className="statement-number">{money(invoice.taxAmount)}</td></tr>
          <tr className="statement-closing"><th scope="row" colSpan={columns - 1}>الإجمالي المستحق <span>· جنيه مصري</span></th><td className="statement-number">{money(invoice.netAmount)}</td></tr>
        </tbody>}
      </table>
      {!purchase && (
        <div className="document-invoice-note">
          {qrCodeUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrCodeUrl} alt="رمز QR للفاتورة الإلكترونية" width={112} height={112} />
            : invoice.isQuotation && <span>عرض سعر · لا يحتاج رمز QR</span>}
          <p>شكرًا لتعاملكم مع مصنع الانطلاق ونتطلع لخدمتكم دائمًا!</p>
        </div>
      )}
      <DocumentFooter />
    </DocumentFrame>
  );
}

export function ReturnPrint({ orderReturn, onClose }: {
  orderReturn: {
    returnNumber: string;
    createdAt: string | Date;
    totalAmount: number;
    taxAmount: number;
    netAmount: number;
    refundAmount: number;
    refundMethod: string;
    bank?: { name: string } | null;
    customer?: Party | null;
    order?: { invoiceNumber?: string } | null;
    items?: (Item & { product?: Product })[];
  };
  onClose: () => void;
}) {
  const creditedToAccount = Math.max(0, orderReturn.netAmount - orderReturn.refundAmount);
  const refundMethod = orderReturn.refundMethod === 'BANK'
    ? `تحويل/رد من بنك ${orderReturn.bank?.name || ''}`
    : orderReturn.refundMethod === 'CASH' ? 'نقدًا' : 'لا يوجد مبلغ مصروف';
  return (
    <DocumentFrame id="printable-order-return" title="إشعار مرتجع مبيعات" onClose={onClose}>
      <table className="statement-ledger document-table">
        <colgroup>
          {[6, 16, 38, 12, 14, 14].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
        </colgroup>
        <thead>
          <tr className="statement-document-heading"><th colSpan={6}>
            <DocumentHeader title="إشعار مرتجع مبيعات" number={orderReturn.returnNumber} issuedAt={orderReturn.createdAt}>
              <div className="statement-account-row document-parties">
                <PartyDetails title="العميل" party={orderReturn.customer || { name: 'عميل نقدي' }} />
                <div><span>الفاتورة الأصلية</span><strong><bdi>{orderReturn.order?.invoiceNumber || '—'}</bdi></strong></div>
                <div><span>طريقة رد المبلغ</span><strong>{refundMethod}</strong></div>
              </div>
            </DocumentHeader>
          </th></tr>
          <tr className="statement-column-heading">
            <th scope="col">م</th><th scope="col">الكود</th><th scope="col">الصنف</th>
            <th scope="col">الكمية</th><th scope="col">سعر الوحدة</th><th scope="col">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {(orderReturn.items || []).map((item, index) => (
            <tr key={item.id || index}>
              <td>{index + 1}</td><td><bdi>{item.product?.code || '—'}</bdi></td>
              <td className="statement-description">{[item.product?.name, item.product?.size, item.product?.color].filter(Boolean).join(' · ')}</td>
              <td className="statement-number">{item.quantity}</td>
              <td className="statement-number">{money(item.unitPrice || 0)}</td>
              <td className="statement-number">{money(item.total)}</td>
            </tr>
          ))}
          {!orderReturn.items?.length && <tr><td colSpan={6} className="statement-empty">لا توجد أصناف</td></tr>}
        </tbody>
        <tbody className="statement-totals document-totals">
          <tr className="statement-total"><th scope="row" colSpan={5}>الإجمالي قبل الضريبة</th><td className="statement-number">{money(orderReturn.totalAmount)}</td></tr>
          <tr className="statement-total"><th scope="row" colSpan={5}>الضريبة</th><td className="statement-number">{money(orderReturn.taxAmount)}</td></tr>
          <tr className="statement-total"><th scope="row" colSpan={5}>قيمة المرتجع</th><td className="statement-number">{money(orderReturn.netAmount)}</td></tr>
          <tr className="statement-total"><th scope="row" colSpan={5}>المخصوم من مديونية العميل</th><td className="statement-number">{money(creditedToAccount)}</td></tr>
          <tr className="statement-closing"><th scope="row" colSpan={5}>المبلغ المردود · جنيه مصري</th><td className="statement-number">{money(orderReturn.refundAmount)}</td></tr>
        </tbody>
      </table>
      <div className="document-signatures">
        <div><span>المفوض باعتماد المرتجع</span><p>التوقيع</p></div>
        <div><span>العميل</span><p>التوقيع</p></div>
      </div>
      <DocumentFooter />
    </DocumentFrame>
  );
}

export function ReceiptPrint({ receipt, expense = false, onClose }: {
  receipt: PrintReceipt; expense?: boolean; onClose: () => void;
}) {
  const title = expense ? 'سند صرف' : 'سند قبض';
  const number = expense ? receipt.expenseNumber || receipt.id
    : receipt.receiptNumber ? `REC-${receipt.receiptNumber}` : `REC-${receipt.id.substring(0, 6).toUpperCase()}`;
  const party = expense ? receipt.supplier?.name : receipt.customer?.name;
  const description = receipt.notes || (expense ? 'سداد دفعة للمورد' : 'سداد دفعة من الحساب');
  return (
    <DocumentFrame id={expense ? 'printable-expense-receipt' : 'printable-receipt'} title={title} onClose={onClose}>
      <table className="statement-ledger document-table document-receipt">
        <colgroup><col style={{ width: '28%' }} /><col style={{ width: '72%' }} /></colgroup>
        <thead>
          <tr className="statement-document-heading"><th colSpan={2}>
            <DocumentHeader title={title} number={number} issuedAt={receipt.date || receipt.createdAt}>
              <div className="statement-account-row">
                <div><span>{expense ? 'المورد' : 'العميل'}</span><strong>{party || '—'}</strong></div>
                <div><span>العملة</span><strong>جنيه مصري · EGP</strong></div>
              </div>
            </DocumentHeader>
          </th></tr>
          <tr className="statement-column-heading"><th scope="col">البيان</th><th scope="col">التفاصيل</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">{expense ? 'صُرف إلى / دُفع لـ' : 'استلمنا من السيد/ة'}</th><td>{party || '—'}</td></tr>
          <tr><th scope="row">وذلك عن</th><td>{description}</td></tr>
          {receipt.reference && <tr><th scope="row">رقم الشيك / المرجع</th><td><bdi>{receipt.reference}</bdi></td></tr>}
          <tr><th scope="row">خزينة / بنك</th><td>{receipt.bank?.name || '—'}</td></tr>
          <tr className="statement-closing"><th scope="row">المبلغ <span>· جنيه مصري</span></th><td className="statement-number">{money(receipt.amount)}</td></tr>
        </tbody>
      </table>
      <div className="document-signatures">
        <div><span>{expense ? 'المدير المالي / المفوض بالصرف' : 'المستلم (الخزينة)'}</span><p>التوقيع</p></div>
        <div><span>{expense ? 'المستلم (المورد)' : 'الختم'}</span><p>{expense ? 'التوقيع' : 'الختم'}</p></div>
      </div>
      <section className="document-stub">
        <div className="document-stub-heading">
          <h3>{expense ? 'كعب سند الصرف · نسخة الشركة' : 'كعب سند القبض · يسلّم للعميل بعد التوقيع'}</h3>
          <bdi>{number}</bdi>
        </div>
        <table className="statement-ledger document-table">
          <colgroup>{[20, 30, 20, 30].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
          <tbody>
            <tr><th scope="row">{expense ? 'المورد' : 'العميل'}</th><td>{party || '—'}</td><th scope="row">التاريخ</th><td>{date(receipt.date || receipt.createdAt)}</td></tr>
            <tr><th scope="row">البيان</th><td colSpan={3}>{description}</td></tr>
            <tr className="statement-closing"><th scope="row" colSpan={3}>المبلغ · جنيه مصري</th><td className="statement-number">{money(receipt.amount)}</td></tr>
          </tbody>
        </table>
        {!expense && <div className="document-signatures">
          <div><span>توقيع العميل المقر بالدفع</span><p>التوقيع</p></div>
          <div><span>توقيع المستلم (الخزينة)</span><p>التوقيع</p></div>
        </div>}
      </section>
      <DocumentFooter />
    </DocumentFrame>
  );
}

export function DiscountPrint({ discount, onClose }: {
  discount: PrintAccountDiscount; onClose: () => void;
}) {
  const earned = discount.kind === 'EARNED';
  const title = earned ? 'سند خصم مكتسب' : 'سند خصم مسموح به';
  return (
    <DocumentFrame id="printable-discount" title={title} onClose={onClose}>
      <table className="statement-ledger document-table document-receipt">
        <colgroup><col style={{ width: '28%' }} /><col style={{ width: '72%' }} /></colgroup>
        <thead>
          <tr className="statement-document-heading"><th colSpan={2}>
            <DocumentHeader title={title} number={discount.discountNumber} issuedAt={discount.date}>
              <div className="statement-account-row">
                <div><span>{earned ? 'المورد' : 'العميل'}</span><strong>{discount.partyName}</strong></div>
                <div><span>العملة</span><strong>جنيه مصري · EGP</strong></div>
              </div>
            </DocumentHeader>
          </th></tr>
          <tr className="statement-column-heading"><th scope="col">البيان</th><th scope="col">التفاصيل</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">{earned ? 'المورد' : 'العميل'}</th><td>{discount.partyName}</td></tr>
          <tr><th scope="row">الملاحظات</th><td>{discount.notes || '—'}</td></tr>
          <tr><th scope="row">نوع الحركة</th><td>تسوية رصيد دون حركة نقدية</td></tr>
          <tr className="statement-closing"><th scope="row">مبلغ الخصم <span>· جنيه مصري</span></th><td className="statement-number">{money(discount.amount)}</td></tr>
        </tbody>
      </table>
      <div className="document-signatures">
        <div><span>المفوض باعتماد الخصم</span><p>التوقيع</p></div>
        <div><span>{earned ? 'المورد' : 'العميل'}</span><p>التوقيع</p></div>
      </div>
      <DocumentFooter />
    </DocumentFrame>
  );
}

export function TablePrint({ report, onClose }: { report: PrintTableData; onClose: () => void }) {
  return (
    <DocumentFrame id="printable-table" title={report.title} onClose={onClose}>
      <table className={`statement-ledger document-table document-report-table${report.headers.length > 8 ? ' document-report-dense' : ''}`}>
        <thead>
          <tr className="statement-document-heading"><th colSpan={report.headers.length}>
            <DocumentHeader title={report.title} issuedAt={new Date()}>
              <div className="statement-account-row">
                <div><span>الفترة</span><strong><bdi>{report.period?.from || report.period?.to ? `${report.period.from || 'البداية'} — ${report.period.to || 'اليوم'}` : 'جميع البيانات'}</bdi></strong></div>
                <div><span>عدد السجلات</span><strong>{report.rows.length}</strong></div>
                <div><span>العملة</span><strong>جنيه مصري · EGP</strong></div>
              </div>
            </DocumentHeader>
          </th></tr>
          <tr className="statement-column-heading">{report.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{printCell(cell)}</td>)}</tr>)}
          {!report.rows.length && <tr><td colSpan={report.headers.length} className="statement-empty">لا توجد بيانات مطابقة</td></tr>}
        </tbody>
        {report.footer && <tbody className="statement-totals document-totals"><tr className="statement-closing">
          {report.footer.map((cell, index) => <td key={index}>{printCell(cell)}</td>)}
        </tr></tbody>}
      </table>
      <DocumentFooter />
    </DocumentFrame>
  );
}
