"use client";

import { useEffect, useState } from 'react';
import MoneyInput from './MoneyInput';
import { formatMoney } from '../lib/money-format';
import { loadQuotationCosts, priceFromProfit, priceQuotation, quotationAnalysis,
  type PricingLine, type PricingUser, type QuotationCosts } from '../lib/quotation-pricing';

const field = 'rounded border border-slate-600 bg-slate-950 p-2 text-white disabled:opacity-40';
const button = `${field} text-xs font-bold hover:bg-slate-700 disabled:cursor-not-allowed`;
const money = (value: number | null) => value === null || !Number.isFinite(value) ? 'غير متاح' : formatMoney(value);
const percent = (value: number | null) => value === null || !Number.isFinite(value) ? 'غير متاح' : `${formatMoney(value)}%`;
type Preview = { lines: PricingLine[]; fingerprint: string; costs: QuotationCosts; label: string; target: number | null };
type Props = {
  user: PricingUser; lines: PricingLine[]; names: Record<string, string>; disabled?: boolean;
  onChange: (lines: PricingLine[]) => void;
};

export default function QuotationPricing(props: Props) {
  if (props.user.role !== 'ADMIN') return null;
  return <ManagerPricing {...props} />;
}

function ManagerPricing({ user, lines, names, disabled, onChange }: Props) {
  const { role, sessionToken } = user;
  const [costs, setCosts] = useState<QuotationCosts | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState('30');
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { value: string; mode: 'markup' | 'unitProfit' }>>({});
  const idsKey = JSON.stringify(lines.map(line => line.productId));
  const loadKey = `${idsKey}:${revision}`;
  const loading = loadedKey !== loadKey;
  const fingerprint = JSON.stringify(lines);
  const analysis = costs && !loading ? quotationAnalysis(lines, costs) : null;
  const previewValid = preview && preview.fingerprint === fingerprint && preview.costs === costs && !loading;
  const previewAnalysis = previewValid ? quotationAnalysis(preview.lines, preview.costs) : null;
  const blocked = disabled || loading || !costs;
  useEffect(() => {
    let active = true;
    const ids: string[] = JSON.parse(idsKey);
    if (!ids.length) return;
    loadQuotationCosts({ role, sessionToken }, ids).then(result => {
      if (!active) return;
      setCosts(result);
      setError('');
      setPreview(null);
      setLoadedKey(loadKey);
    }).catch(error => {
      if (!active) return;
      setCosts(null);
      setPreview(null);
      setLoadedKey(loadKey);
      setError(error instanceof Error ? error.message : 'تعذر تحميل تكاليف الأصناف.');
    });
    return () => { active = false; };
  }, [idsKey, loadKey, role, sessionToken]);
  const prepare = (mode: 'markup' | 'totalProfit') => {
    if (!costs) return;
    setError('');
    try {
      setPreview({
        lines: priceQuotation(lines, costs, locked, mode === 'markup' ? rate : target, mode),
        fingerprint, costs, label: mode === 'markup' ? `زيادة ${rate}% على تكلفة الأصناف غير المثبتة` : `ربح إجمالي مستهدف ${money(Number(target))}`,
        target: mode === 'totalProfit' ? Number(target) : null
      });
    } catch (error) { setError(error instanceof Error ? error.message : 'تعذر حساب التسعير.'); }
  };
  const apply = (next: PricingLine[]) => {
    if (!costs) return;
    const result = quotationAnalysis(next, costs);
    if (result.belowCost && !window.confirm(`${result.belowCost} صنف بأقل من التكلفة الحالية. تأكيد تطبيق هذه الأسعار؟`)) return;
    onChange(next);
    setPreview(null);
    setError('');
  };
  const applyLine = (productId: string, cost: number | null) => {
    const draft = overrides[productId];
    if (!draft) return;
    try {
      const unitPrice = priceFromProfit(cost, draft.value, draft.mode);
      apply(lines.map(line => line.productId === productId ? { ...line, unitPrice } : line));
    } catch (error) { setError(error instanceof Error ? error.message : 'قيمة الربح غير صالحة.'); }
  };
  return <section className="no-print rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 space-y-3" aria-label="تحليل أرباح عرض السعر" dir="rtl">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <h3 className="font-bold text-emerald-300">التسعير والأرباح — للمدير فقط</h3>
      <button type="button" className={button} disabled={disabled || !lines.length} onClick={() => { setPreview(null); setRevision(value => value + 1); }}>تحديث التكلفة الحالية</button>
    </div>
    <p className="text-xs text-slate-400">التكلفة الحالية من بطاقة الصنف بالمخزون التي تتحدث عند تسجيل الوارد، وليست تكلفة تاريخية أو متوسط الوارد. لا تُحفظ تكلفة في العرض. الربح تقديري قبل المصروفات العامة والضريبة. لا يظهر هذا التحليل في طباعة العميل.</p>
    {loading && lines.length > 0 && <p role="status" className="text-sm text-slate-400">جارٍ تحميل التكلفة الحالية...</p>}
    {error && <p role="alert" className="rounded bg-red-950 p-2 text-red-200">{error}</p>}
    {costs && !loading && <p className="text-xs text-slate-400">آخر قراءة للتكلفة: {new Date(costs.checkedAt).toLocaleString('ar-EG')} — تحديث التكلفة يعيد حساب الربح ولا يغير أسعار البيع تلقائيًا.</p>}
    {analysis && <>
      {analysis.missing > 0 && <p role="alert" className="text-amber-300 text-sm">تكلفة {analysis.missing} صنف غير متاحة أو صفر. أكملها في المخزون ثم حدّث التكلفة؛ لا يُحسب ربح إجمالي مضلل ولا يُسمح بتوزيع الربح حتى اكتمالها.</p>}
      <div className="overflow-auto"><table className="w-full text-right text-xs">
        <thead><tr>{['الصنف', 'الكمية', 'تكلفة الوحدة', 'سعر البيع', 'ربح الوحدة', 'الزيادة على التكلفة', 'إجمالي ربح البند', 'تعديل الربح', 'تثبيت السعر'].map(title => <th key={title} className="p-2 whitespace-nowrap">{title}</th>)}</tr></thead>
        <tbody>{analysis.rows.map(row => {
          const override = overrides[row.productId] || { value: '', mode: 'markup' as const };
          return <tr key={row.productId} className={`border-t border-slate-700 ${row.belowCost ? 'bg-red-950/50 text-red-200' : ''}`}>
            <td className="p-2 min-w-40">{names[row.productId] || row.productId}{row.belowCost && <b className="block text-red-300">أقل من التكلفة</b>}</td>
            <td className="p-2"><bdi>{row.quantity || '—'}</bdi></td>
            <td className="p-2"><bdi>{money(row.cost)}</bdi></td>
            <td className="p-2"><MoneyInput aria-label={`سعر بيع ${names[row.productId] || row.productId}`} value={row.unitPrice} required min={0} step="any"
              disabled={disabled} className={`${field} w-28`} onValueChange={value => {
                setPreview(null); onChange(lines.map(line => line.productId === row.productId ? { ...line, unitPrice: value } : line));
              }} /></td>
            <td className="p-2"><bdi>{money(row.unitProfit)}</bdi></td><td className="p-2"><bdi>{percent(row.markup)}</bdi></td><td className="p-2 font-bold"><bdi>{money(row.profit)}</bdi></td>
            <td className="p-2"><div className="flex gap-1">
              <select aria-label={`طريقة ربح ${names[row.productId] || row.productId}`} className={field} disabled={blocked || row.cost === null}
                value={override.mode} onChange={event => setOverrides(previous => ({ ...previous, [row.productId]: { value: '', mode: event.target.value === 'markup' ? 'markup' : 'unitProfit' } }))}>
                <option value="markup">زيادة %</option><option value="unitProfit">ربح الوحدة ج.م</option>
              </select>
              <MoneyInput aria-label={`قيمة ربح ${names[row.productId] || row.productId}`} className={`${field} w-24`} value={override.value} step="any"
                disabled={blocked || row.cost === null} onValueChange={value => setOverrides(previous => ({ ...previous, [row.productId]: { ...override, value } }))} />
              <button type="button" className={button} disabled={blocked || row.cost === null || !override.value.trim()} onClick={() => applyLine(row.productId, row.cost)}>تطبيق</button>
            </div></td>
            <td className="p-2"><input type="checkbox" aria-label={`تثبيت سعر ${names[row.productId] || row.productId}`} checked={locked.has(row.productId)} disabled={disabled}
              onChange={event => { const next = new Set(locked); if (event.target.checked) next.add(row.productId); else next.delete(row.productId); setLocked(next); setPreview(null); }} /></td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>إجمالي التكلفة: <bdi>{money(analysis.cost)}</bdi></span>
        <span>البيع قبل الضريبة: <bdi>{money(analysis.revenue)}</bdi></span>
        <strong className={analysis.profit !== null && analysis.profit < 0 ? 'text-red-300' : 'text-emerald-300'}>إجمالي الربح: <bdi>{money(analysis.profit)}</bdi></strong>
        <span>الزيادة على التكلفة: <bdi>{percent(analysis.markup)}</bdi></span>
      </div>
    </>}
    <div className="flex flex-wrap items-end gap-2 border-t border-slate-700 pt-3">
      <label className="grid gap-1 text-xs">نسبة زيادة موحدة على التكلفة %
        <MoneyInput aria-label="نسبة زيادة العرض" className={`${field} w-40`} value={rate} min={-100} step="any" disabled={blocked} onValueChange={value => { setRate(value); setPreview(null); }} />
      </label>
      <button type="button" className={button} disabled={blocked || !lines.length} onClick={() => prepare('markup')}>معاينة النسبة الموحدة</button>
      <label className="grid gap-1 text-xs">أو إجمالي الربح المطلوب ج.م
        <MoneyInput aria-label="الربح الإجمالي المستهدف" className={`${field} w-40`} value={target} step="any" disabled={blocked} onValueChange={value => { setTarget(value); setPreview(null); }} />
      </label>
      <button type="button" className={button} disabled={blocked || !lines.length} onClick={() => prepare('totalProfit')}>معاينة توزيع الربح</button>
    </div>
    <p className="text-xs text-slate-400">نسبة 30% تعني تكلفة 100 ← سعر بيع 130، وليست هامشًا من المبيعات. الأسعار المثبّتة تُستثنى من التوزيع الجماعي، ويمكن تعديلها يدويًا. الربح المستهدف يُوزّع حسب تكلفة وكميات البنود غير المثبّتة بعد احتساب ربح البنود المثبّتة.</p>
    {previewValid && previewAnalysis && <div className="rounded border border-indigo-500 bg-indigo-950/60 p-3 space-y-2" aria-label="معاينة تسعير العرض">
      <h4 className="font-bold">{preview.label}</h4>
      <div className="overflow-auto"><table className="w-full text-right text-xs">
        <thead><tr>{['الصنف', 'السعر الحالي', 'السعر المقترح', 'ربح البند المقترح'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
        <tbody>{previewAnalysis.rows.map(row => <tr key={row.productId}>
          <td className="p-2">{names[row.productId] || row.productId}{locked.has(row.productId) ? ' (مثبّت)' : ''}</td>
          <td className="p-2"><bdi>{money(Number(lines.find(line => line.productId === row.productId)?.unitPrice))}</bdi></td>
          <td className="p-2"><bdi>{money(Number(row.unitPrice))}</bdi></td><td className="p-2"><bdi>{money(row.profit)}</bdi></td>
        </tr>)}</tbody>
      </table></div>
      <p>الربح الحالي: <bdi>{money(analysis?.profit ?? null)}</bdi> ← الربح المقترح: <bdi>{money(previewAnalysis.profit)}</bdi> · البيع قبل الضريبة: <bdi>{money(previewAnalysis.revenue)}</bdi></p>
      <p className="text-xs text-slate-300">تُقرّب أسعار الوحدات لمنزلتين عشريتين. الربح الفعلي الناتج هو المعروض{preview.target !== null && previewAnalysis.profit !== null ? `؛ الفرق عن الهدف بعد التقريب: ${money(previewAnalysis.profit - preview.target)} ج.م` : ''}.</p>
      <button type="button" className={`${button} bg-indigo-700`} disabled={disabled} onClick={() => apply(preview.lines)}>تطبيق الأسعار المقترحة</button>
      <button type="button" className={button} onClick={() => setPreview(null)}>إلغاء المعاينة</button>
    </div>}
  </section>;
}
