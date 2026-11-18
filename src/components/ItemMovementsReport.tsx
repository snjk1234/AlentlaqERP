"use client";

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PrinterIcon } from 'lucide-react';
import { invoiceQrTextFromDocument } from '../lib/invoice-qr';
import { InvoicePrint, ReturnPrint, TablePrint, type PrintTableData } from './PrintDocuments';
import { formatMoney } from '../lib/money-format';
import {
  buildItemMovements, filterItemMovements, summarizeItemMovements, itemMovementTotals, loadItemMovementDocuments,
  CASH_PARTY, type MovementKind, type MovementFilters, type ItemMovement
} from '../lib/item-movements';

type Party = { id: string; name: string };
export default function ItemMovementsReport({ role, customers, suppliers }: {
  role: string; customers: Party[]; suppliers: Party[];
}) {
  const allowedKinds: MovementKind[] = role === 'ADMIN' ? ['sales', 'purchases']
    : role === 'CASHIER' ? ['sales'] : role === 'STOREKEEPER' ? ['purchases'] : [];
  const [kind, setKind] = useState<MovementKind>(role === 'STOREKEEPER' ? 'purchases' : 'sales');
  const [filters, setFilters] = useState<MovementFilters>({
    partyId: '', from: '', to: '',
    search: '', productId: '', includeReturns: true
  });
  const [view, setView] = useState<'detail' | 'summary'>('detail');
  const [source, setSource] = useState<{ kind: MovementKind; rows: ItemMovement[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [print, setPrint] = useState<PrintTableData | null>(null);
  const [preview, setPreview] = useState<{ row: ItemMovement; qr: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const allowed = allowedKinds.includes(kind);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    loadItemMovementDocuments(kind).then(documents => {
      const rows = buildItemMovements(documents, kind);
      if (active) setSource({ kind, rows });
    }).catch((failure: unknown) => {
      console.error('Failed to load item movements:', failure);
      if (active) setError(failure instanceof Error ? failure.message : 'تعذر تحميل كشف الأصناف.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, allowed, reload]);
  if (!allowed) return null;

  const supplierNames = new Map(suppliers.map(supplier => [supplier.id, supplier.name]));
  const sourceRows = source?.kind === kind ? source.rows.map(row => ({
    ...row,
    description: [row.description, supplierNames.get(row.product.supplierId || '') || 'مورد غير محدد'].join(' · ')
  })) : [];
  let rows: ItemMovement[] = [];
  let filterError = '';
  try { rows = filterItemMovements(sourceRows, filters); }
  catch (failure) { filterError = failure instanceof Error ? failure.message : 'فلاتر غير صالحة.'; }
  const summary = summarizeItemMovements(rows);
  const totals = itemMovementTotals(rows);
  const showAmounts = kind === 'sales' || role === 'ADMIN';
  const partyMap = new Map((kind === 'sales' ? customers : suppliers).map(party => [party.id, party]));
  if (kind === 'sales') partyMap.set(CASH_PARTY, { id: CASH_PARTY, name: 'العملاء النقديون (دون حساب)' });
  for (const row of sourceRows) if (!partyMap.has(row.partyId)) partyMap.set(row.partyId, { id: row.partyId, name: row.partyName });
  const parties = [...partyMap.values()];
  const products = [...new Map(sourceRows.map(row => [row.product.id, row])).values()]
    .sort((a, b) => a.description.localeCompare(b.description, 'ar'));
  const partyName = filters.partyId ? parties.find(party => party.id === filters.partyId)?.name || 'طرف غير متاح' : 'جميع الأطراف';
  const headers = view === 'detail'
    ? ['الكود', 'الصنف والمواصفات', 'التاريخ', kind === 'sales' ? 'العميل' : 'المورد', 'الحركة', 'الكمية',
      ...(showAmounts ? ['سعر الوحدة', 'قبل الضريبة', 'الضريبة', 'الإجمالي'] : []), 'المستند']
    : ['الكود', 'الصنف والمواصفات', kind === 'sales' ? 'المباع' : 'الوارد',
      ...(kind === 'sales' ? ['المرتجع', 'الصافي'] : []), 'عدد الفواتير',
      ...(kind === 'sales' ? ['عدد المرتجعات'] : []), ...(showAmounts ? ['قبل الضريبة', 'الضريبة', 'الإجمالي'] : [])];
  const values = view === 'detail' ? rows.map(row => [
    row.product.code, row.description, new Date(row.date).toLocaleDateString('ar-EG'), row.partyName,
    row.kind === 'return' ? `مرتجع / ${row.originalNumber}` : kind === 'sales' ? 'بيع' : 'شراء',
    String(row.quantity),
    ...(showAmounts ? [formatMoney(row.unitPrice), formatMoney(row.beforeTax), formatMoney(row.tax), formatMoney(row.total)] : []),
    row.number
  ]) : summary.map(row => [
    row.product.code, row.description, String(row.quantity),
    ...(kind === 'sales' ? [String(row.returned), String(row.netQuantity)] : []), String(row.invoiceCount),
    ...(kind === 'sales' ? [String(row.returnCount)] : []),
    ...(showAmounts ? [formatMoney(row.beforeTax), formatMoney(row.tax), formatMoney(row.total)] : [])
  ]);
  const reportTitle = `كشف حركة الأصناف — ${kind === 'sales' ? 'مبيعات' : 'مشتريات'} — ${partyName} — ${view === 'detail' ? 'تفصيلي' : 'ملخص حسب الصنف'}`;
  const scope = [
    filters.productId && `الصنف: ${products.find(row => row.product.id === filters.productId)?.description || filters.productId}`,
    filters.search.trim() && `بحث: ${filters.search.trim()}`,
    kind === 'sales' && (filters.includeReturns ? 'يشمل المرتجعات بتاريخها' : 'دون المرتجعات')
  ].filter(Boolean).join(' · ');
  const update = <K extends keyof MovementFilters>(key: K, value: MovementFilters[K]) =>
    setFilters(current => ({ ...current, [key]: value }));
  const openDocument = async (row: ItemMovement) => {
    setOpening(true); setError('');
    try {
      const qr = row.document.qrCode && !row.orderReturn && kind === 'sales'
        ? await QRCode.toDataURL(invoiceQrTextFromDocument(row.document), { width: 320, margin: 4 }) : '';
      setPreview({ row, qr });
    } catch (failure) {
      console.error('Failed to open movement invoice:', failure);
      setError('تعذر فتح الفاتورة ورمز QR. أعد المحاولة.');
    } finally { setOpening(false); }
  };
  if (print) return <TablePrint report={print} onClose={() => setPrint(null)} />;
  if (preview) {
    const { row, qr } = preview;
    return row.orderReturn
      ? <ReturnPrint orderReturn={{ ...row.orderReturn, customer: row.document.customer || { name: row.partyName },
        order: { invoiceNumber: row.document.invoiceNumber } }} onClose={() => setPreview(null)} />
      : <InvoicePrint invoice={row.document} purchase={kind === 'purchases'} showAmounts={showAmounts}
        qrCodeUrl={qr} onClose={() => setPreview(null)} />;
  }
  const inputClass = 'w-full min-w-0 bg-white/5 border border-white/10 rounded-sm py-2 px-2 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg';
  const selectClass = 'w-full min-w-0 bg-slate-900 border border-white/10 rounded py-1.5 px-3 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-transparent transition-all shadow-lg';
  const optionClass = 'bg-slate-900 text-slate-200';
  const buttonClass = 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs transition-all cursor-pointer shrink-0 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <section className="flex-1 min-h-0 flex flex-col p-2 space-y-4 overflow-hidden no-print" dir="rtl" aria-label="كشف حركة الأصناف">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">كشف حركة الأصناف</h2>
          <p className="text-xs text-slate-400 mt-0.5">مراجعة أصناف فواتير البيع والشراء تفصيليًا أو مجمعة حسب الصنف</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} disabled={loading} onClick={() => {
            setLoading(true); setError(''); setSource(null); setReload(value => value + 1);
          }}>تحديث الكشف</button>
          <button type="button" className={`${buttonClass} flex items-center gap-1.5`} title="معاينة وطباعة كشف حركة الأصناف"
            disabled={loading || !!error || !!filterError || !rows.length}
            onClick={() => setPrint({
              title: `${reportTitle}${scope ? ` — ${scope}` : ''}`, headers, rows: values, period: { from: filters.from, to: filters.to },
              footer: headers.map((header, index) => index === 0 ? 'الإجمالي'
                : showAmounts && header === 'قبل الضريبة' ? formatMoney(totals.beforeTax)
                  : showAmounts && header === 'الضريبة' ? formatMoney(totals.tax)
                    : showAmounts && header === 'الإجمالي' ? formatMoney(totals.total) : '')
            })}><PrinterIcon size={16} /><span>طباعة الكشف</span></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-8 text-xs text-slate-400 shrink-0">
        <label className="grid gap-1">نوع الكشف<select aria-label="نوع الكشف" className={selectClass} value={kind} disabled={opening} onChange={event => {
          setLoading(true); setError(''); setSource(null);
          setKind(event.target.value === 'purchases' ? 'purchases' : 'sales');
          setFilters(current => ({ ...current, partyId: '', productId: '', search: '' }));
        }}>{allowedKinds.map(value => <option className={optionClass} key={value} value={value}>{value === 'sales' ? 'مبيعات العملاء' : 'مشتريات الموردين'}</option>)}</select></label>
        <label className="grid gap-1">{kind === 'sales' ? 'العميل' : 'المورد'}<select aria-label="طرف الكشف" className={selectClass} value={filters.partyId} onChange={event => update('partyId', event.target.value)}>
          <option className={optionClass} value="">جميع الأطراف</option>{parties.map(party => <option className={optionClass} key={party.id} value={party.id}>{party.name}</option>)}
        </select></label>
        <label className="grid gap-1">من<input aria-label="من تاريخ" type="date" className={inputClass} value={filters.from} onChange={event => update('from', event.target.value)} /></label>
        <label className="grid gap-1">إلى<input aria-label="إلى تاريخ" type="date" className={inputClass} value={filters.to} onChange={event => update('to', event.target.value)} /></label>
        <label className="grid gap-1">الصنف<select aria-label="صنف الكشف" className={selectClass} value={filters.productId} onChange={event => update('productId', event.target.value)}>
          <option className={optionClass} value="">جميع الأصناف</option>{products.map(row => <option className={optionClass} key={row.product.id} value={row.product.id}>{row.product.code} · {row.description}</option>)}
        </select></label>
        <label className="grid gap-1">بحث بالكود أو الاسم أو المواصفات<input aria-label="بحث الأصناف" className={inputClass} value={filters.search} onChange={event => update('search', event.target.value)} /></label>
        <label className="grid gap-1">طريقة العرض<select aria-label="طريقة العرض" className={selectClass} value={view} onChange={event => setView(event.target.value === 'summary' ? 'summary' : 'detail')}>
          <option className={optionClass} value="detail">تفصيلي حسب الفواتير</option><option className={optionClass} value="summary">ملخص حسب الصنف</option>
        </select></label>
        {kind === 'sales' && <label className="flex items-center gap-2"><input type="checkbox" checked={filters.includeReturns} onChange={event => update('includeReturns', event.target.checked)} />إظهار المرتجعات بتاريخها</label>}
      </div>
      <p className="text-xs text-slate-400">الأسعار من بنود المستندات الأصلية، ولا تشمل عروض الأسعار. المرتجعات تخصم بتاريخ إصدارها ولو كانت الفاتورة خارج الفترة. الكميات تجمع لكل صنف فقط.</p>
      {(error || filterError) && <p role="alert" className="rounded bg-red-950 p-3 text-red-200">{error || filterError}</p>}
      {loading ? <p role="status">جارٍ تحميل حركات الأصناف…</p> : !error && !filterError && <>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-sm px-2 py-1.5 shrink-0">
          <span>الفواتير: {totals.invoiceCount}</span><span>المرتجعات: {totals.returnCount}</span><span>الأصناف: {totals.productCount}</span>
          {showAmounts && <><span>الصافي قبل الضريبة: {formatMoney(totals.beforeTax)}</span><span>الضريبة: {formatMoney(totals.tax)}</span><strong>الإجمالي: {formatMoney(totals.total)} ج.م</strong></>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded overflow-auto shadow-xl flex-1 min-h-0 custom-scrollbar">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0"><tr>{headers.map(header => <th className="p-2 font-bold whitespace-nowrap" key={header}>{header}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800/50">{values.map((cells, index) => <tr key={view === 'detail' ? rows[index].key : summary[index].product.id} className="hover:bg-white/5 transition-colors">
              {cells.map((cell, cellIndex) => <td className={cellIndex === 1 ? 'p-2 font-bold text-white min-w-48' : 'p-2 font-mono text-slate-300 text-xs whitespace-nowrap'} key={cellIndex}>
                {view === 'detail' && cellIndex === headers.length - 1
                  ? <button type="button" className="text-indigo-300 hover:text-indigo-200 underline cursor-pointer" disabled={opening} onClick={() => openDocument(rows[index])}>{cell}</button> : cell}
              </td>)}
            </tr>)}
            {!values.length && <tr><td className="p-6 text-center" colSpan={headers.length}>لا توجد حركات مطابقة للفلاتر.</td></tr>}</tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
