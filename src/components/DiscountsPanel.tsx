"use client";

import { useState, type FormEvent } from 'react';
import { PercentIcon, PlusIcon, PrinterIcon, SearchIcon, XIcon } from 'lucide-react';
import { inAccountPeriod, statementTotals, type StatementDiscount } from '@/lib/account-period';
import { formatMoney as money } from '@/lib/money-format';
import MoneyInput from '@/components/MoneyInput';
import type { PrintTableData } from '@/components/PrintDocuments';

export type DiscountKind = 'ALLOWED' | 'EARNED';
type Discount = StatementDiscount & {
  kind: DiscountKind;
  customerId: string | null;
  supplierId: string | null;
};
type Customer = {
  id: string;
  name: string;
  openingBalance?: number;
  orders?: { netAmount: number; isQuotation?: boolean }[];
  payments?: { amount: number }[];
  orderReturns?: {
    id: string; returnNumber: string; netAmount: number; refundAmount: number; refundMethod: string;
  }[];
  discounts: Discount[];
};
type Supplier = { id: string; name: string; balance: number; discounts: Discount[] };
type DiscountInput = {
  kind: DiscountKind;
  accountId: string;
  amount: string;
  notes: string;
  requestId: string;
};
type Props = {
  customers: Customer[];
  suppliers: Supplier[];
  canAllow: boolean;
  canEarn: boolean;
  showSupplierBalance: boolean;
  customersReady: boolean;
  suppliersReady: boolean;
  sessionToken?: string;
  onSaved: (kind: DiscountKind) => Promise<boolean>;
  onPrint: (discount: StatementDiscount, kind: DiscountKind, partyName: string) => void;
  onPrintTable: (report: PrintTableData) => void;
};

const kindLabel = (kind: DiscountKind) => kind === 'ALLOWED' ? 'خصم مسموح به' : 'خصم مكتسب';
const inputClass = 'w-full rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500';

function createDiscountRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function DiscountsPanel({
  customers, suppliers, canAllow, canEarn, showSupplierBalance, customersReady, suppliersReady,
  sessionToken, onSaved, onPrint, onPrintTable
}: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | DiscountKind>('ALL');
  const [form, setForm] = useState<DiscountInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const entries = [
    ...(canAllow ? customers.flatMap(customer =>
      customer.discounts.map(discount => ({ discount, partyName: customer.name }))) : []),
    ...(canEarn ? suppliers.flatMap(supplier =>
      supplier.discounts.map(discount => ({ discount, partyName: supplier.name }))) : [])
  ].filter(({ discount, partyName }) =>
    inAccountPeriod(discount, from, to)
      && (kindFilter === 'ALL' || discount.kind === kindFilter)
      && `${discount.discountNumber} ${partyName} ${discount.notes || ''}`.toLowerCase().includes(search.toLowerCase())
  ).sort((left, right) => new Date(right.discount.date || right.discount.createdAt || '').getTime()
    - new Date(left.discount.date || left.discount.createdAt || '').getTime());

  const allowedTotal = entries.filter(entry => entry.discount.kind === 'ALLOWED')
    .reduce((sum, entry) => sum + entry.discount.amount, 0);
  const earnedTotal = entries.filter(entry => entry.discount.kind === 'EARNED')
    .reduce((sum, entry) => sum + entry.discount.amount, 0);
  const selectedCustomer = form?.kind === 'ALLOWED' ? customers.find(customer => customer.id === form.accountId) : undefined;
  const selectedSupplier = form?.kind === 'EARNED' ? suppliers.find(supplier => supplier.id === form.accountId) : undefined;
  const selectedParty = selectedCustomer || selectedSupplier;
  const balance = selectedCustomer
    ? statementTotals(
      selectedCustomer.orders || [], selectedCustomer.payments || [], selectedCustomer.openingBalance || 0,
      selectedCustomer.orderReturns || [], selectedCustomer.discounts
    ).totalDue
    : selectedSupplier?.balance;
  const limit = balance === undefined ? undefined : Math.max(0, Math.floor((balance + 1e-8) * 100) / 100);
  const readyForKind = form?.kind === 'ALLOWED' ? customersReady : suppliersReady;

  const openForm = () => {
    const kind = canAllow && customersReady ? 'ALLOWED' : 'EARNED';
    try {
      setForm({ kind, accountId: '', amount: '', notes: '', requestId: createDiscountRequestId() });
      setFormError('');
      setNotice('');
    } catch (error) {
      console.error('Error creating discount request ID:', error);
      setNotice('تعذر فتح سند الخصم؛ مولّد رقم الطلب الآمن غير متاح على هذا الجهاز.');
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    const amount = Number(form.amount);
    if (!selectedParty) {
      setFormError('اختر العميل أو المورد.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))
      || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
      setFormError('أدخل مبلغًا موجبًا بمنزلتين عشريتين كحد أقصى.');
      return;
    }
    if (!readyForKind) {
      setFormError('تعذر تحديث الحسابات. انتظر إعادة التحميل قبل تسجيل الخصم.');
      return;
    }
    setSaving(true);
    setFormError('');
    let discountNumber: string;
    try {
      const desktop = window as Window & {
        electronAPI?: { createAccountDiscount: (input: DiscountInput) => Promise<unknown> };
      };
      let discount: unknown;
      if (desktop.electronAPI) {
        discount = await desktop.electronAPI.createAccountDiscount(form);
      } else {
        if (!sessionToken) throw new Error('انتهت الجلسة. سجّل الدخول مجددًا.');
        const response = await fetch('/api/discounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify(form)
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error : 'تعذر تسجيل سند الخصم.';
          throw new Error(message);
        }
        discount = result && typeof result === 'object' && 'data' in result ? result.data : null;
      }
      if (!discount || typeof discount !== 'object' || !('discountNumber' in discount)
        || typeof discount.discountNumber !== 'string') {
        throw new Error('استجابة الخادم غير صالحة. أعد المحاولة بالبيانات نفسها للتحقق من السند.');
      }
      discountNumber = discount.discountNumber;
    } catch (error) {
      console.error('Error saving account discount:', error);
      setFormError(error instanceof Error ? error.message : 'تعذر تسجيل سند الخصم.');
      setSaving(false);
      return;
    }
    setForm(null);
    let refreshed = false;
    try {
      refreshed = await onSaved(form.kind);
    } catch (error) {
      console.error('Error refreshing accounts after saving discount:', error);
    }
    setNotice(refreshed
      ? `تم تسجيل سند الخصم ${discountNumber} بنجاح.`
      : `تم حفظ سند الخصم ${discountNumber}، لكن تعذر تحديث الحسابات. لا تعِد تسجيله؛ أعد تحميل البيانات.`);
    setSaving(false);
  };

  const printTable = () => onPrintTable({
    title: 'سجل الخصومات المكتسبة والمسموح بها',
    headers: ['رقم السند', 'التاريخ', 'نوع الخصم', 'العميل / المورد', 'المبلغ', 'الملاحظات'],
    rows: entries.map(({ discount, partyName }) => [
      discount.discountNumber,
      new Date(discount.date || discount.createdAt || '').toLocaleDateString('ar-EG'),
      kindLabel(discount.kind), partyName, discount.amount.toFixed(2), discount.notes || '—'
    ]),
    footer: ['الإجمالي حسب النوع', '', '', '', `${allowedTotal.toFixed(2)} مسموح / ${earnedTotal.toFixed(2)} مكتسب`, ''],
    period: { from, to }
  });

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col gap-3 p-4 text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-white"><PercentIcon size={22} /> الخصومات</h2>
          <p className="mt-1 text-xs text-slate-400">تسويات مستقلة لحسابات العملاء والموردين دون حركة نقدية</p>
        </div>
      </div>
      {notice && <p role="status" className="rounded-sm border border-sky-500/30 bg-sky-500/10 p-2 text-sm text-sky-200">{notice}</p>}
      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-white/10 bg-slate-900 p-2">
        <label className="w-[260px] text-xs font-bold text-slate-300">بحث
          <span className="relative block">
            <SearchIcon size={14} className="pointer-events-none absolute inset-y-0 right-2.5 my-auto text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="اسم الطرف أو رقم السند" className={`${inputClass} pr-8`} />
          </span>
        </label>
        <button type="button" onClick={openForm}
          disabled={!(canAllow && customersReady) && !(canEarn && suppliersReady)}
          className="flex items-center gap-1 rounded-sm bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          <PlusIcon size={16} /> سند خصم جديد
        </button>
        <button type="button" onClick={printTable}
          className="flex items-center gap-1 rounded-sm bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
          <PrinterIcon size={16} /> طباعة الجدول
        </button>
        <label className="text-xs font-bold text-slate-300">من
          <input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} className={inputClass} />
        </label>
        <label className="text-xs font-bold text-slate-300">إلى
          <input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} className={inputClass} />
        </label>
        <label className="text-xs font-bold text-slate-300">النوع
          <select value={kindFilter} onChange={event => {
            const value = event.target.value;
            if (value === 'ALL' || value === 'ALLOWED' || value === 'EARNED') setKindFilter(value);
          }} className={inputClass}>
            <option value="ALL">كل الخصومات</option>
            {canAllow && <option value="ALLOWED">مسموح به</option>}
            {canEarn && <option value="EARNED">مكتسب</option>}
          </select>
        </label>
        {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }}
          className="rounded-sm border border-white/10 px-2 py-2 text-xs font-bold text-slate-300">عرض الكل</button>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <div className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-slate-300">عدد السندات: <b className="text-white">{entries.length}</b></div>
        {canAllow && <div className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-slate-300">المسموح به: <b className="text-sky-400">{money(allowedTotal)} ج.م</b></div>}
        {canEarn && <div className="rounded-sm border border-white/10 bg-slate-900 px-3 py-2 text-slate-300">المكتسب: <b className="text-emerald-400">{money(earnedTotal)} ج.م</b></div>}
      </div>
      <div className="flex-1 overflow-auto rounded-sm border border-slate-800 bg-slate-900">
        <table className="w-full whitespace-nowrap text-right text-sm">
          <thead className="bg-slate-950 text-slate-400">
            <tr>{['رقم السند', 'التاريخ', 'النوع', 'العميل / المورد', 'المبلغ', 'الملاحظات', 'طباعة'].map(label =>
              <th key={label} scope="col" className="p-3">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {entries.map(({ discount, partyName }) => (
              <tr key={discount.id} className="text-white hover:bg-white/5">
                <td className="p-3 font-mono"><bdi>{discount.discountNumber}</bdi></td>
                <td className="p-3">{new Date(discount.date || discount.createdAt || '').toLocaleDateString('ar-EG')}</td>
                <td className="p-3">{kindLabel(discount.kind)}</td>
                <td className="p-3">{partyName}</td>
                <td className="p-3 font-mono text-sky-400">{money(discount.amount)} ج.م</td>
                <td className="p-3 text-slate-400">{discount.notes || '—'}</td>
                <td className="p-3">
                  <button type="button" onClick={() => onPrint(discount, discount.kind, partyName)}
                    aria-label={`طباعة سند الخصم ${discount.discountNumber}`} className="rounded-sm bg-white/5 p-2 text-slate-300 hover:bg-white/10">
                    <PrinterIcon size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا توجد سندات خصم مطابقة</td></tr>}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="discount-form-title">
          <form onSubmit={save} className="w-full max-w-lg rounded border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 id="discount-form-title" className="text-lg font-bold text-white">سند خصم مستقل</h3>
              <button type="button" disabled={saving} onClick={() => setForm(null)} aria-label="إغلاق" className="text-slate-400 hover:text-white"><XIcon size={20} /></button>
            </div>
            {formError && <p role="alert" className="mb-3 rounded-sm border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{formError}</p>}
            <fieldset disabled={saving} className="space-y-3">
              <label className="block text-xs font-bold text-slate-300">نوع الخصم
                <select value={form.kind} onChange={event => {
                  const kind = event.target.value;
                  if (kind === 'ALLOWED' || kind === 'EARNED') setForm({ ...form, kind, accountId: '' });
                }} className={inputClass}>
                  {canAllow && customersReady && <option value="ALLOWED">خصم مسموح به للعميل</option>}
                  {canEarn && suppliersReady && <option value="EARNED">خصم مكتسب من المورد</option>}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-300">{form.kind === 'ALLOWED' ? 'العميل' : 'المورد'} *
                <select required value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value })} className={inputClass}>
                  <option value="">اختر {form.kind === 'ALLOWED' ? 'العميل' : 'المورد'}</option>
                  {(form.kind === 'ALLOWED' ? customers : suppliers).map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
                </select>
              </label>
              {selectedParty && (form.kind === 'ALLOWED' || showSupplierBalance) && limit !== undefined && (
                <p className="text-xs text-sky-300">أقصى خصم متاح حاليًا: {money(limit)} ج.م</p>
              )}
              <label className="block text-xs font-bold text-slate-300">مبلغ الخصم (ج.م) *
                <MoneyInput required min="0.01" step="0.01" value={form.amount}
                  onValueChange={amount => setForm({ ...form, amount })} className={inputClass} />
              </label>
              <label className="block text-xs font-bold text-slate-300">السبب أو الملاحظات
                <textarea maxLength={500} rows={3} value={form.notes}
                  onChange={event => setForm({ ...form, notes: event.target.value })} className={inputClass} />
              </label>
              <p className="text-xs leading-relaxed text-slate-400">يخفض السند الرصيد المستحق فقط، ولا يغيّر الخزينة أو الفواتير أو الضريبة. لا يمكن أن يتجاوز الخصم الرصيد المستحق. لا يمكن تعديل السند أو حذفه بعد الحفظ.</p>
              {form.kind === 'ALLOWED' && (
                <p className="text-xs leading-relaxed text-amber-300">لا يُعكس سند الخصم تلقائيًا عند المرتجع، وقد يزيد مبلغ الرد للعميل.</p>
              )}
              <button type="submit" className="w-full rounded-sm bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                {saving ? 'جارٍ الحفظ...' : 'حفظ سند الخصم'}
              </button>
            </fieldset>
          </form>
        </div>
      )}
    </div>
  );
}
