"use client";

import { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import MoneyInput from './MoneyInput';
import { formatMoney } from '../lib/money-format';

type Product = { id: string; code?: string; name: string; size?: string; color?: string | null; price: number; taxRate: number; stockQty?: number };
export type EditableInvoiceItems = {
  id: string; invoiceNumber: string; updatedAt: string | Date; invoiceType: string;
  qrCode?: string | null;
  orderReturns?: { id: string }[];
  items: { productId: string; quantity: number; unitPrice: number; taxAmount: number; product?: Product }[];
};
type User = { role: string; sessionToken?: string };
type Bridge = { updateInvoiceItems: (data: Record<string, unknown>) => Promise<EditableInvoiceItems> };
const description = (product: Product) => [product.code, product.name, product.size, product.color].filter(Boolean).join(' - ');
const field = 'rounded border border-slate-600 bg-slate-950 p-2 text-white';

export default function InvoiceItemsEdit({ invoice, products, user, onClose, onSaved }: {
  invoice: EditableInvoiceItems; products: Product[]; user: User; onClose: () => void; onSaved: (document: EditableInvoiceItems) => void;
}) {
  const [items, setItems] = useState(() => invoice.items.map(item => ({
    productId: item.productId, quantity: String(item.quantity), unitPrice: String(item.unitPrice)
  })));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const taxRate = (productId: string) => {
    if (['فاتورة', 'فاتورة مبسطة'].includes(invoice.invoiceType)) return 0;
    const old = invoice.items.find(item => item.productId === productId);
    return old && old.quantity * old.unitPrice > 0 ? old.taxAmount / (old.quantity * old.unitPrice)
      : products.find(product => product.id === productId)?.taxRate ?? old?.product?.taxRate ?? 0;
  };
  const totals = items.reduce((sum, item) => {
    const amount = Number((Number(item.quantity) * Number(item.unitPrice)).toFixed(2));
    const tax = Number((amount * taxRate(item.productId)).toFixed(2));
    return { amount: sum.amount + amount, tax: sum.tax + tax };
  }, { amount: 0, tax: 0 });
  const change = (index: number, key: 'quantity' | 'unitPrice', value: string) =>
    setItems(previous => previous.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (user.role !== 'ADMIN') { setError('تعديل أصناف الفاتورة متاح للمدير فقط.'); return; }
    if (!items.length) { setError('أضف صنفًا واحدًا على الأقل.'); return; }
    setBusy(true);
    try {
      const data = { id: invoice.id, updatedAt: invoice.updatedAt, items };
      const bridge = (window as Window & { electronAPI?: Bridge }).electronAPI;
      let saved: EditableInvoiceItems;
      if (bridge) saved = await bridge.updateInvoiceItems(data);
      else {
        const response = await fetch('/api/invoice-items', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.sessionToken || ''}` },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر تعديل أصناف الفاتورة.');
        saved = result;
      }
      onSaved(saved);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر تعديل أصناف الفاتورة.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" role="dialog" aria-modal="true" aria-labelledby="invoice-items-edit-title" dir="rtl">
    <form onSubmit={save} className="max-h-[92vh] w-full max-w-7xl overflow-auto rounded-lg border border-slate-600 bg-slate-900 p-4 text-white space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="invoice-items-edit-title" className="text-lg font-bold">تعديل أصناف الفاتورة <bdi>{invoice.invoiceNumber}</bdi></h2>
        <button type="button" disabled={busy} onClick={onClose} className={field}>إلغاء</button>
      </div>
      <p className="text-sm text-slate-400">يُعاد ضبط المخزون والإجماليات والضريبة ورمز QR تلقائيًا بعد الحفظ. يبقى رقم الفاتورة والعميل وبيانات الاستلام دون تغيير. لا يمكن التعديل إذا كانت للفاتورة مرتجعات.</p>
      {error && <p role="alert" className="rounded bg-red-950 p-3 text-red-200">{error}</p>}
      <span className="relative block w-full">
        <SearchIcon size={16} className="pointer-events-none absolute inset-y-0 right-3 my-auto text-slate-400" />
        <input aria-label="بحث أصناف الفاتورة" placeholder="بحث لإضافة صنف" className={`${field} w-full pr-9`} value={search} disabled={busy} onChange={event => setSearch(event.target.value)} />
      </span>
      {search.trim() && <div className="max-h-36 overflow-auto space-y-1">
        {products.filter(product => !items.some(item => item.productId === product.id)
          && description(product).toLowerCase().includes(search.toLowerCase())).map(product =>
          <button type="button" disabled={busy} key={product.id} className={`${field} block w-full text-right`} onClick={() => {
            setItems(previous => [...previous, { productId: product.id, quantity: '1', unitPrice: String(product.price) }]);
            setSearch('');
          }}>{description(product)}</button>)}
      </div>}
      <div className="overflow-auto"><table className="w-full text-right text-sm">
        <thead><tr>{['الصنف', 'الكمية', 'السعر', 'الإجمالي قبل الضريبة', ''].map((label, i) => <th className="p-2" key={i}>{label}</th>)}</tr></thead>
        <tbody>{items.map((item, index) => {
          const product = products.find(product => product.id === item.productId)
            || invoice.items.find(old => old.productId === item.productId)?.product;
          return <tr key={item.productId} className="border-t border-slate-700">
            <td className="p-2">{product ? description(product) : item.productId}</td>
            <td className="p-2"><input aria-label={`كمية البند ${index + 1}`} className={`${field} w-24`} type="number" required min={1} max={2147483647} step={1} disabled={busy}
              value={item.quantity} onChange={event => change(index, 'quantity', event.target.value)} /></td>
            <td className="p-2"><MoneyInput aria-label={`سعر البند ${index + 1}`} className={`${field} w-32`} required min={0} step="any" disabled={busy}
              value={item.unitPrice} onValueChange={value => change(index, 'unitPrice', value)} /></td>
            <td className="p-2"><bdi>{formatMoney(Number(item.quantity) * Number(item.unitPrice))}</bdi></td>
            <td className="p-2"><button type="button" disabled={busy} className={field} onClick={() => setItems(previous => previous.filter((_, i) => i !== index))}>إزالة</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="flex flex-wrap gap-5 text-sm">
        <span>قبل الضريبة: <bdi>{formatMoney(totals.amount)}</bdi></span>
        <span>الضريبة: <bdi>{formatMoney(totals.tax)}</bdi></span>
        <span>الصافي: <bdi>{formatMoney(totals.amount + totals.tax)}</bdi></span>
      </div>
      <button disabled={busy || !items.length} className="rounded bg-indigo-600 px-4 py-2 font-bold disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : 'حفظ تعديل الأصناف'}</button>
    </form>
  </div>;
}
