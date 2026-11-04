"use client";

import { useState } from 'react';
import MoneyInput from './MoneyInput';
import { formatMoney } from '../lib/money-format';
import QuotationPricing from './QuotationPricing';
import { confirmQuotationProfit } from '../lib/quotation-pricing';

type Product = { id: string; code?: string; name: string; size?: string; color?: string | null; price: number; taxRate: number };
export type EditableQuotation = {
  id: string; invoiceNumber: string; updatedAt: string | Date; invoiceType: string;
  items: { productId: string; quantity: number; unitPrice: number; taxAmount: number; product?: Product }[];
};
type User = { role: string; sessionToken?: string };
type Bridge = { updateQuotation: (data: Record<string, unknown>) => Promise<EditableQuotation> };
const description = (product: Product) => [product.code, product.name, product.size, product.color].filter(Boolean).join(' - ');
const field = 'rounded border border-slate-600 bg-slate-950 p-2 text-white';

export default function QuotationEdit({ quotation, products, user, onClose, onSaved }: {
  quotation: EditableQuotation; products: Product[]; user: User; onClose: () => void; onSaved: (document: EditableQuotation) => void;
}) {
  const [items, setItems] = useState(() => quotation.items.map(item => ({
    productId: item.productId, quantity: String(item.quantity), unitPrice: String(item.unitPrice)
  })));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const taxRate = (productId: string) => {
    if (['فاتورة', 'فاتورة مبسطة'].includes(quotation.invoiceType)) return 0;
    const old = quotation.items.find(item => item.productId === productId);
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
    if (user.role !== 'ADMIN') { setError('تعديل عرض السعر متاح للمدير فقط.'); return; }
    if (!items.length) { setError('أضف صنفًا واحدًا على الأقل.'); return; }
    setBusy(true);
    try {
      if (!await confirmQuotationProfit(user, items)) return;
      const data = { id: quotation.id, updatedAt: quotation.updatedAt, items };
      const bridge = (window as Window & { electronAPI?: Bridge }).electronAPI;
      let saved: EditableQuotation;
      if (bridge) saved = await bridge.updateQuotation(data);
      else {
        const response = await fetch('/api/quotations', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.sessionToken || ''}` },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر تعديل عرض السعر.');
        saved = result;
      }
      onSaved(saved);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر تعديل عرض السعر.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" role="dialog" aria-modal="true" aria-labelledby="quotation-edit-title" dir="rtl">
    <form onSubmit={save} className="max-h-[92vh] w-full max-w-7xl overflow-auto rounded-lg border border-slate-600 bg-slate-900 p-4 text-white space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="quotation-edit-title" className="text-lg font-bold">تعديل عرض السعر <bdi>{quotation.invoiceNumber}</bdi></h2>
        <button type="button" disabled={busy} onClick={onClose} className={field}>إلغاء</button>
      </div>
      <p className="text-sm text-slate-400">تعديل البنود والكميات والأسعار فقط. يبقى رقم العرض والعميل ونوعه وبيانات الاستلام دون تغيير، ولا يتأثر المخزون.</p>
      {error && <p role="alert" className="rounded bg-red-950 p-3 text-red-200">{error}</p>}
      <input aria-label="بحث أصناف عرض السعر" placeholder="بحث لإضافة صنف" className={`${field} w-full`} value={search} disabled={busy} onChange={event => setSearch(event.target.value)} />
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
            || quotation.items.find(old => old.productId === item.productId)?.product;
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
      {user.role === 'ADMIN' && <QuotationPricing user={user} lines={items} disabled={busy} onChange={setItems}
        names={Object.fromEntries(items.map(item => {
          const product = products.find(product => product.id === item.productId)
            || quotation.items.find(old => old.productId === item.productId)?.product;
          return [item.productId, product ? description(product) : item.productId];
        }))} />}
      <div className="flex flex-wrap gap-5 text-sm">
        <span>قبل الضريبة: <bdi>{formatMoney(totals.amount)}</bdi></span>
        <span>الضريبة: <bdi>{formatMoney(totals.tax)}</bdi></span>
        <span>الصافي: <bdi>{formatMoney(totals.amount + totals.tax)}</bdi></span>
      </div>
      <button disabled={busy || !items.length} className="rounded bg-indigo-600 px-4 py-2 font-bold disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : 'حفظ تعديل عرض السعر'}</button>
    </form>
  </div>;
}
