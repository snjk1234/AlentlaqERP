'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Kind = 'bank' | 'supplier' | 'customer' | 'product';
type Entity = { id: string; name: string; value: number; current?: number };
type Preview = { counts: Record<string, number>; entities: Record<Kind, Entity[]>; confirmWord: string };
type Bridge = { productionResetOperation: (input: Record<string, unknown>) => Promise<unknown> };

const SECTIONS: { kind: Kind; title: string; unit: string; hint: string }[] = [
  { kind: 'bank', title: 'البنوك والخزائن', unit: 'ج.م', hint: 'الرصيد الفعلي يوم البدء' },
  { kind: 'supplier', title: 'الموردون', unit: 'ج.م', hint: 'الرصيد الافتتاحي (المستحق للمورد)' },
  { kind: 'customer', title: 'العملاء', unit: 'ج.م', hint: 'الرصيد الافتتاحي (المستحق على العميل)' },
  { kind: 'product', title: 'الأصناف', unit: 'قطعة', hint: 'الكمية الفعلية من الجرد' }
];
const LABELS: Record<string, string> = {
  order: 'الفواتير وعروض الأسعار', orderItem: 'بنود الفواتير', orderReturn: 'مرتجعات المبيعات', orderReturnItem: 'بنود المرتجعات',
  payment: 'الدفعات', purchaseOrder: 'فواتير الشراء', purchaseOrderItem: 'بنود فواتير الشراء', expensePayment: 'سداد الموردين',
  generalExpense: 'المصروفات العامة', bankTransfer: 'التحويلات بين الحسابات', accountDiscount: 'سندات الخصم',
  stocktake: 'مستندات الجرد', stocktakeItem: 'بنود الجرد'
};
const inputClass = 'w-28 bg-white/5 border border-white/10 rounded-sm py-1 px-2 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-white/20 text-left';
const buttonClass = 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2 rounded-sm font-bold text-xs transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed';

async function request(sessionToken: string | undefined, input: Record<string, unknown>) {
  const bridge = (window as Window & { electronAPI?: Bridge }).electronAPI;
  if (bridge) return await bridge.productionResetOperation(input);
  const response = await fetch('/api/production-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken || ''}` },
    body: JSON.stringify(input)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ العملية.');
  return result.data;
}

export default function ProductionResetPanel({ sessionToken, onCompleted }: { sessionToken?: string; onCompleted: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ backupPath: string; deleted: Record<string, number> } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await request(sessionToken, { action: 'preview' }) as Preview;
      setPreview(result);
      const next: Record<string, string> = {};
      for (const section of SECTIONS) for (const row of result.entities[section.kind]) next[`${section.kind}:${row.id}`] = String(row.value);
      setValues(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل البيانات.');
    }
  }, [sessionToken]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const total = useMemo(() => Object.values(preview?.counts || {}).reduce((sum, count) => sum + count, 0), [preview]);
  const zero = (kind: Kind) => setValues(previous => {
    const next = { ...previous };
    for (const row of preview?.entities[kind] || []) next[`${kind}:${row.id}`] = '0';
    return next;
  });

  const execute = async () => {
    if (!preview) return;
    setError('');
    setBusy(true);
    try {
      const rows = SECTIONS.flatMap(section => preview.entities[section.kind].map(row => ({ type: section.kind, id: row.id, value: values[`${section.kind}:${row.id}`] ?? '' })));
      const result = await request(sessionToken, { action: 'execute', values: rows, password, confirm }) as { backupPath: string; deleted: Record<string, number> };
      setDone(result);
      setPassword('');
      setConfirm('');
      onCompleted();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تنفيذ التفريغ.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="flex-1 min-h-0 overflow-auto custom-scrollbar no-print p-2" dir="rtl" aria-label="تفريغ البيانات">
    <div className="w-full max-w-6xl space-y-3">
    <div>
      <h2 className="text-xl font-bold text-white">تفريغ البيانات</h2>
      <p className="text-xs text-slate-400 mt-0.5">يحذف الفواتير والدفعات وسندات الخصم والمشتريات والمصروفات والتحويلات والجرد، ويُبقي الأصناف والموردين والعملاء والبنوك والمستخدمين.</p>
    </div>
    <div className="bg-red-500/10 border border-red-500/30 rounded-sm p-2 text-xs text-red-200 space-y-1">
      <p className="font-bold">إجراء لا يمكن التراجع عنه من البرنامج.</p>
    </div>
    {error && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-sm p-2" role="alert">{error}</p>}
    {done && <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-2 space-y-1" role="status">
      <p className="font-bold">تم التفريغ بنجاح.</p>
      <p>النسخة الاحتياطية على الخادم: <span dir="ltr" className="font-mono">{done.backupPath}</span></p>
    </div>}
    {preview && <>
      <div className="bg-slate-900 border border-slate-800 rounded p-2">
        <h3 className="text-sm font-bold text-white mb-2">السجلات التي ستُحذف ({total})</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs text-slate-300">
          {Object.keys(LABELS).map(model => <div key={model} className="flex justify-between bg-white/5 rounded-sm px-2 py-1"><span>{LABELS[model]}</span><span className="font-bold text-white">{preview.counts[model] ?? 0}</span></div>)}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 items-start">
      {SECTIONS.map(section => <div key={section.kind} className="bg-slate-900 border border-slate-800 rounded">
        <div className="flex items-center justify-between gap-2 p-2 border-b border-slate-800">
          <div><h3 className="text-sm font-bold text-white">{section.title} ({preview.entities[section.kind].length})</h3><p className="text-[11px] text-slate-400">{section.hint}</p></div>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => zero(section.kind)}>تصفير الكل</button>
        </div>
        <div className="max-h-56 overflow-auto custom-scrollbar">
          <table className="w-full text-right text-xs">
            <thead className="bg-white/5 text-slate-300 sticky top-0"><tr><th className="py-1.5 px-2">الاسم</th><th className="py-1.5 px-2 w-36 whitespace-nowrap">القيمة الحالية</th><th className="py-1.5 px-2 w-44 whitespace-nowrap">القيمة بعد التفريغ ({section.unit})</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {preview.entities[section.kind].map(row => <tr key={row.id}>
                <td className="py-1 px-2 text-slate-200">{row.name}</td>
                <td className="py-1 px-2 text-slate-400">{section.kind === 'supplier' ? `${row.current} (افتتاحي ${row.value})` : row.value}</td>
                <td className="py-1 px-2"><input aria-label={`${section.title} ${row.name}`} inputMode="decimal" className={inputClass} disabled={busy}
                  value={values[`${section.kind}:${row.id}`] ?? ''} onChange={event => setValues(previous => ({ ...previous, [`${section.kind}:${row.id}`]: event.target.value }))} /></td>
              </tr>)}
              {!preview.entities[section.kind].length && <tr><td colSpan={3} className="py-3 text-center text-slate-500">لا توجد سجلات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>)}
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded p-2 w-fit flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-slate-300">كلمة مرور حساب المدير
          <input type="password" autoComplete="current-password" className={inputClass + ' w-48 text-right'} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-slate-300">اكتب «{preview.confirmWord}» للتأكيد
          <input className={inputClass + ' w-48 text-right'} value={confirm} disabled={busy} onChange={event => setConfirm(event.target.value)} />
        </label>
        <button type="button" className="bg-red-600/80 hover:bg-red-600 text-white px-3 py-2 rounded-sm font-bold text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={busy || !password || confirm !== preview.confirmWord} onClick={() => {
            if (window.confirm(`سيتم حذف ${total} سجلًا نهائيًا. هل أنت متأكد؟`)) void execute();
          }}>{busy ? 'جارٍ التفريغ...' : 'تفريغ البيانات الآن'}</button>
      </div>
    </>}
    {!preview && !error && <p className="text-xs text-slate-400">جارٍ التحميل...</p>}
    </div>
  </section>;
}
