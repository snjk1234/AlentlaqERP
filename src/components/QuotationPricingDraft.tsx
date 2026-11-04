"use client";

import { useState } from 'react';
import QuotationPricing from './QuotationPricing';
import { formatMoney } from '../lib/money-format';
import type { PricingLine, PricingUser } from '../lib/quotation-pricing';

export default function QuotationPricingDraft({ user, initialLines, names, taxRates, busy, onClose, onSave }: {
  user: PricingUser; initialLines: PricingLine[]; names: Record<string, string>; taxRates: Record<string, number>;
  busy: boolean; onClose: () => void; onSave: (lines: PricingLine[]) => Promise<void>;
}) {
  const [lines, setLines] = useState(initialLines);
  if (user.role !== 'ADMIN') return null;
  const subtotal = lines.reduce((sum, line) => sum + Number((Number(line.quantity) * Number(line.unitPrice)).toFixed(2)), 0);
  const tax = lines.reduce((sum, line) => sum + Number((Number((Number(line.quantity) * Number(line.unitPrice)).toFixed(2)) * taxRates[line.productId]).toFixed(2)), 0);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="quotation-pricing-title">
    <form className="max-h-[92vh] w-full max-w-7xl overflow-auto rounded-lg border border-slate-600 bg-slate-900 p-4 text-white space-y-3"
      onSubmit={event => { event.preventDefault(); if (!busy) void onSave(lines); }}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="quotation-pricing-title" className="text-lg font-bold">تسعير وأرباح عرض سعر جديد</h2>
        <button type="button" disabled={busy} onClick={onClose} className="rounded border border-slate-600 p-2">إلغاء</button>
      </div>
      <p className="text-sm text-slate-400">تُستخدم هذه الأسعار لحفظ عرض السعر فقط. إلغاء النافذة لا يغيّر أسعار السلة أو أسعار المخزون.</p>
      <QuotationPricing user={user} lines={lines} names={names} disabled={busy} onChange={setLines} />
      <div className="flex flex-wrap gap-5 text-sm">
        <span>قبل الضريبة: <bdi>{formatMoney(subtotal)}</bdi></span>
        <span>الضريبة: <bdi>{formatMoney(tax)}</bdi></span>
        <strong>إجمالي العرض للعميل: <bdi>{formatMoney(subtotal + tax)}</bdi></strong>
      </div>
      <button disabled={busy || !lines.length} className="rounded bg-indigo-600 px-4 py-2 font-bold disabled:opacity-40">{busy ? 'جارٍ الحفظ...' : 'حفظ عرض السعر بهذه الأسعار'}</button>
    </form>
  </div>;
}
