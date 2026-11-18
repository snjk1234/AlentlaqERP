"use client";

import { useRef, useState } from 'react';
import type { PrintInvoice } from './PrintDocuments';

export type EditableInvoiceDetails = PrintInvoice & {
  id: string; updatedAt: string | Date; customerId?: string | null;
  qrCode?: string | null;
  customer?: { name: string } | null;
};
type Customer = { id: string; name: string; payments?: { id: string }[] };
type User = { role: string; sessionToken?: string };
type Bridge = { updateInvoiceDetails: (data: Record<string, unknown>) => Promise<EditableInvoiceDetails> };
const field = 'rounded border border-slate-600 bg-slate-950 p-2 text-white disabled:opacity-50';

export default function InvoiceDetailsEdit({ invoice, customers, user, onClose, onSaved }: {
  invoice: EditableInvoiceDetails; customers: Customer[]; user: User;
  onClose: () => void; onSaved: (invoice: EditableInvoiceDetails) => void;
}) {
  const [form, setForm] = useState({
    customerId: invoice.customerId || '',
    customerName: invoice.customerName || 'عميل نقدي',
    receiverName: invoice.receiverName || '',
    siteReceiptNumber: invoice.siteReceiptNumber || '',
    purchaseOrderNumber: invoice.purchaseOrderNumber || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  if (user.role !== 'ADMIN') return null;
  const moving = form.customerId !== (invoice.customerId || '');
  const oldName = invoice.customer?.name || invoice.customerName || 'عميل نقدي';
  const target = customers.find(customer => customer.id === form.customerId);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (moving && !window.confirm(`نقل الفاتورة من «${oldName}» إلى «${target?.name || form.customerName}» سيغيّر كشف حساب العميلين وتسليماتهما. لا يُسمح بالنقل مع وجود مرتجعات على الفاتورة أو دفعات أو سندات خصم للعميل الأصلي. هل تؤكد؟`)) return;
    submitting.current = true;
    setBusy(true);
    try {
      const data = { id: invoice.id, updatedAt: invoice.updatedAt, ...form, customerId: form.customerId || null };
      const bridge = (window as Window & { electronAPI?: Bridge }).electronAPI;
      let saved: EditableInvoiceDetails;
      if (bridge) saved = await bridge.updateInvoiceDetails(data);
      else {
        const response = await fetch('/api/invoice-details', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.sessionToken || ''}` },
          body: JSON.stringify(data), signal: AbortSignal.timeout(30000)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر تعديل بيانات الفاتورة.');
        saved = result;
      }
      onSaved(saved);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر تعديل بيانات الفاتورة.');
    } finally { submitting.current = false; setBusy(false); }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" dir="rtl"
    role="dialog" aria-modal="true" aria-labelledby="invoice-details-title">
    <form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-600 bg-slate-900 p-4 text-white space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="invoice-details-title" className="text-lg font-bold">تعديل بيانات الفاتورة <bdi>{invoice.invoiceNumber}</bdi></h2>
        <button type="button" className={field} disabled={busy} onClick={onClose}>إلغاء</button>
      </div>
      <p className="text-sm text-slate-400">تعديل العميل والمستلم ورقم إذن الاستلام وأمر التوريد فقط. لا تتغير الأصناف أو الأسعار أو الضرائب أو رقم الفاتورة وتاريخها أو المخزون.</p>
      {error && <p role="alert" className="rounded bg-red-950 p-3 text-red-200">{error}</p>}
      <label className="grid gap-1 text-sm">العميل المرتبط بالفاتورة
        <select aria-label="عميل الفاتورة" className={field} disabled={busy} value={form.customerId}
          onChange={event => setForm(previous => ({ ...previous, customerId: event.target.value }))}>
          <option value="">عميل نقدي (دون حساب مرتبط)</option>
          {invoice.customerId && !customers.some(customer => customer.id === invoice.customerId)
            && <option value={invoice.customerId}>{oldName}</option>}
          {customers.filter(customer => !['CASH', 'CREDIT_GENERAL'].includes(customer.id)).map(customer =>
            <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
      </label>
      {!form.customerId && <label className="grid gap-1 text-sm">اسم العميل النقدي في الفاتورة
        <input aria-label="اسم العميل النقدي" className={field} required maxLength={255} disabled={busy} value={form.customerName}
          onChange={event => setForm(previous => ({ ...previous, customerName: event.target.value }))} />
      </label>}
      <label className="grid gap-1 text-sm">اسم المستلم
        <input aria-label="اسم المستلم" className={field} maxLength={255} disabled={busy} value={form.receiverName}
          onChange={event => setForm(previous => ({ ...previous, receiverName: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm">رقم إذن الاستلام
        <input aria-label="رقم إذن الاستلام" className={field} maxLength={255} disabled={busy} value={form.siteReceiptNumber}
          onChange={event => setForm(previous => ({ ...previous, siteReceiptNumber: event.target.value }))} />
      </label>
      <label className="grid gap-1 text-sm">رقم أمر التوريد
        <input aria-label="رقم أمر التوريد" className={field} maxLength={255} disabled={busy} value={form.purchaseOrderNumber}
          onChange={event => setForm(previous => ({ ...previous, purchaseOrderNumber: event.target.value }))} />
      </label>
      <p className="rounded border border-amber-600/30 p-3 text-xs text-amber-200">
        تغيير العميل ينقل الفاتورة وأثرها الحسابي وتسليماتها إلى الحساب المختار، وليس مجرد تغيير اسم بالطباعة.
        يُمنع النقل إذا كانت للفاتورة مرتجعات أو للعميل الأصلي أي دفعات أو سندات خصم. يبقى تعديل المستلم وإذن الاستلام مسموحًا دون نقل العميل.
        اسم العميل المسجل يُؤخذ من حسابه ولا يُعاد تسمية الحساب.
      </p>
      <button disabled={busy} className="rounded bg-indigo-600 px-4 py-2 font-bold disabled:opacity-40">{busy ? 'جارٍ الحفظ...' : 'حفظ بيانات الفاتورة'}</button>
    </form>
  </div>;
}
