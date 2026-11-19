"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import type { PrintTableData } from '@/components/PrintDocuments';
import { formatMoney } from '@/lib/money-format';

type User = { id: string; name: string; role: string; sessionToken?: string };
type Product = {
  id: string;
  code: string;
  barcode?: string | null;
  name: string;
  type?: string;
  size?: string;
  gauge?: string | null;
  color?: string | null;
  length?: string | null;
  weight?: string | null;
  supplierName?: string;
  stockQty?: number;
  reservedQty?: number;
  availableQty?: number;
  price?: number;
  taxRate?: number;
};
type Customer = { id: string; name: string };
type ProductDetails = Omit<Product, 'id' | 'stockQty' | 'reservedQty' | 'availableQty'>;
type DistributionItem = {
  id: string;
  productId: string;
  productLabel: string;
  productDetails?: ProductDetails | null;
  quantity: number;
  shippedQuantity: number;
  invoicedQuantity: number;
  unitPrice?: number;
  taxRate?: number;
  isCancelled?: boolean;
};
type Distribution = {
  id: string;
  documentNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  revision: number;
  notes?: string;
  createdAt?: string | Date;
  items: DistributionItem[];
};
type DistributionLine = { productId: string; quantity: string; unitPrice: string; taxRate: string };
type DistributionListResult = { documents: Distribution[]; customers: Customer[]; products: Product[] };
type DistributionApi = { distributionOperation: (payload: Record<string, unknown>) => Promise<unknown> };
export type DistributionInvoiceDraft = {
  customerId: string;
  customerName: string;
  invoiceType: string;
  documents: { id: string; revision: number }[];
  items: {
    distributionItemId: string; productId: string; quantity: number;
    unitPrice: number; taxRate: number; productLabel: string; productDetails?: ProductDetails | null;
  }[];
};

const EMPTY_LINE: DistributionLine = { productId: '', quantity: '', unitPrice: '', taxRate: '0.14' };
const statusLabels: Record<string, string> = {
  DRAFT: 'مسودة',
  APPROVED: 'معتمدة',
  PARTIALLY_SHIPPED: 'شحن جزئي',
  SHIPPED: 'تم الشحن',
  PARTIALLY_INVOICED: 'فوتر جزئيًا',
  INVOICED: 'مفوتر',
  CANCELLED: 'ملغاة'
};
const shippingStyles = {
  PENDING: { label: 'لم تُشحن', badge: 'bg-slate-500/15 text-slate-300', row: 'border-r-slate-500' },
  PARTIAL: { label: 'شحن جزئي', badge: 'bg-amber-500/15 text-amber-300', row: 'border-r-amber-400 bg-amber-500/5' },
  SHIPPED: { label: 'تم الشحن', badge: 'bg-emerald-500/15 text-emerald-300', row: 'border-r-emerald-400 bg-emerald-500/5' }
};
const inputClass = 'w-full min-w-[100px] rounded-sm border border-white/10 bg-slate-950/80 px-2 py-1.5 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none';
const actionClass = 'inline-flex items-center gap-1 rounded-sm border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50';
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function calculateTotals(items: Array<{ quantity: number | string; unitPrice?: number | string; taxRate?: number | string }>, includeTax = true) {
  const subtotal = roundMoney(items.reduce((sum, item) =>
    sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0));
  const tax = includeTax
    ? roundMoney(items.reduce((sum, item) =>
      sum + roundMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0) * Number(item.taxRate || 0)), 0))
    : 0;
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

function shippingState(items: Pick<DistributionItem, 'quantity' | 'shippedQuantity' | 'isCancelled'>[]) {
  const relevant = items.filter(item => !item.isCancelled || item.shippedQuantity > 0);
  if (!relevant.some(item => item.shippedQuantity > 0)) return 'PENDING';
  return relevant.every(item => item.isCancelled || item.shippedQuantity >= item.quantity) ? 'SHIPPED' : 'PARTIAL';
}

function invoiceLines(entries: Distribution[]) {
  return entries.filter(entry => entry.status !== 'DRAFT').flatMap(entry =>
    entry.items.map(item => ({
      distributionItemId: item.id,
      quantity: Math.max(0, item.shippedQuantity - item.invoicedQuantity)
    })).filter(item => item.quantity > 0));
}

function dateLabel(value?: string | Date) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG');
}

function detailValues(product?: ProductDetails | null) {
  return [
    ['الكود', product?.code],
    ['الباركود', product?.barcode],
    ['الاسم', product?.name],
    ['النوع', product?.type],
    ['المقاس', product?.size],
    ['الدرجة', product?.gauge],
    ['اللون', product?.color],
    ['الطول', product?.length],
    ['الوزن', product?.weight],
    ['المورد', product?.supplierName]
  ] as const;
}

export default function DistributionPanel({
  user,
  onPrintTable,
  onPrepareInvoice
}: {
  user: User;
  onPrintTable?: (report: PrintTableData) => void;
  onPrepareInvoice: (draft: DistributionInvoiceDraft) => boolean;
}) {
  const [documents, setDocuments] = useState<Distribution[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DistributionLine[]>([]);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [invoiceSelection, setInvoiceSelection] = useState<string[]>([]);
  const [invoiceType, setInvoiceType] = useState('فاتورة ضريبية');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = user.role === 'ADMIN';
  const canDispatch = canEdit || user.role === 'STOREKEEPER';
  const canInvoice = canEdit || user.role === 'CASHIER';

  const operation = useCallback(async (payload: Record<string, unknown>) => {
    const electronAPI = typeof window !== 'undefined'
      ? (window as Window & { electronAPI?: DistributionApi }).electronAPI
      : undefined;
    if (electronAPI) return electronAPI.distributionOperation(payload);
    const response = await fetch('/api/distributions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${user.sessionToken || ''}` },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ العملية.');
    return result.data;
  }, [user.sessionToken]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await operation({ action: 'list' }) as DistributionListResult;
      setDocuments(result.documents || []);
      setCustomers(result.customers || []);
      setProducts(result.products || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تحميل التوزيعات.');
    } finally {
      setBusy(false);
    }
  }, [operation]);

  useEffect(() => {
    const load = async () => { await refresh(); };
    void load();
  }, [refresh]);

  const selected = useMemo(() => documents.find(document => document.id === selectedId), [documents, selectedId]);
  const selectedForInvoice = documents.filter(document => invoiceSelection.includes(document.id));
  const editable = canEdit && (!selected || selected.status === 'DRAFT' || editing);
  const draftTotals = calculateTotals(lines.filter(line => line.productId));
  const selectedTotals = calculateTotals(
    (selected?.items || []).filter(item => !item.isCancelled),
    !(canInvoice && invoiceType === 'فاتورة')
  );
  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return documents.filter(document => {
      const documentDate = document.createdAt ? new Date(document.createdAt).toISOString().slice(0, 10) : '';
      const matchesSearch = !query || [
        document.documentNumber,
        document.customerName,
        ...document.items.flatMap(item => [
          item.productLabel,
          item.productDetails?.code,
          item.productDetails?.barcode,
          item.productDetails?.name,
          item.productDetails?.type,
          item.productDetails?.size,
          item.productDetails?.gauge,
          item.productDetails?.color
        ])
      ].some(value => String(value || '').toLocaleLowerCase().includes(query));
      return matchesSearch
        && (statusFilter === 'ALL' || document.status === statusFilter)
        && (customerFilter === 'ALL' || document.customerId === customerFilter)
        && (!dateFrom || documentDate >= dateFrom)
        && (!dateTo || documentDate <= dateTo);
    });
  }, [documents, search, statusFilter, customerFilter, dateFrom, dateTo]);

  const updateLine = (index: number, field: keyof DistributionLine, value: string) => {
    if (field === 'productId' && value && lines.some((line, lineIndex) => lineIndex !== index && line.productId === value)) {
      const productName = products.find(product => product.id === value)?.name || 'هذا الصنف';
      setError(`${productName} مضاف بالفعل إلى التوزيعة، ولا يمكن تكراره.`);
      return;
    }
    if (field === 'productId') setError('');
    setLines(current => {
      const next = current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (field === 'productId') {
          const product = products.find(item => item.id === value);
          return {
            ...line,
            productId: value,
            unitPrice: product ? String(product.price ?? 0) : line.unitPrice,
            taxRate: product ? String(product.taxRate ?? 0.14) : line.taxRate
          };
        }
        return { ...line, [field]: value };
      });
      if (index === current.length - 1 && value.trim() && next.length < 500) next.push({ ...EMPTY_LINE });
      return next;
    });
  };

  const removeLine = (index: number) => {
    setLines(current => {
      const next = current.filter((_, lineIndex) => lineIndex !== index);
      const last = next[next.length - 1];
      if (!last || last.productId || last.quantity || last.unitPrice || last.taxRate !== EMPTY_LINE.taxRate) {
        next.push({ ...EMPTY_LINE });
      }
      return next;
    });
    setError('');
  };

  const selectDocument = (document: Distribution) => {
    setSelectedId(document.id);
    setCustomerId(document.customerId);
    setNotes(document.notes || '');
    const savedLines = document.items.filter(item => !item.isCancelled).map(item => ({
      productId: item.productId,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice ?? 0),
      taxRate: String(item.taxRate ?? 0.14)
    }));
    setLines(canEdit ? [...savedLines, { ...EMPTY_LINE }] : savedLines);
    setEditing(false);
    setDispatchQuantities({});
    setShowModal(true);
    setError('');
  };

  const newDocument = () => {
    setSelectedId('');
    setEditing(false);
    setCustomerId('');
    setNotes('');
    setLines([{ ...EMPTY_LINE }]);
    setDispatchQuantities({});
    setShowModal(true);
    setError('');
  };

  const save = async () => {
    const filledLines = lines.filter(line => line.productId);
    if (!customerId || !filledLines.length || filledLines.some(line => !line.quantity || Number(line.quantity) <= 0)) {
      setError('اختر العميل، ثم أكمل الصنف والكمية في كل صف مستخدم.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await operation({
        action: selectedId ? 'save' : 'create',
        ...(selectedId ? { id: selectedId, revision: selected?.revision } : {}),
        customerId, notes,
        items: filledLines.map(line => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          taxRate: Number(line.taxRate)
        }))
      }) as Distribution;
      await refresh();
      selectDocument(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر حفظ التوزيعة.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await operation({ action, id: selected.id, revision: selected.revision, ...extra }) as Distribution;
      await refresh();
      if (action === 'delete') {
        setShowModal(false);
        setSelectedId('');
      } else {
        selectDocument(result);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  };

  const dispatch = () => act('dispatch', {
    items: selected?.items
      .map(item => ({ distributionItemId: item.id, quantity: Number(dispatchQuantities[item.id] || 0) }))
      .filter(item => item.quantity > 0)
  });

  const toggleInvoiceSelection = (document: Distribution) => {
    if (invoiceSelection.includes(document.id)) {
      setInvoiceSelection(current => current.filter(id => id !== document.id));
      setError('');
      return;
    }
    if (selectedForInvoice.some(entry => entry.customerId !== document.customerId)) {
      setError('اختر توزيعات العميل نفسه لإصدار فاتورة واحدة.');
      return;
    }
    setInvoiceSelection(current => [...current, document.id]);
    setError('');
  };

  const invoice = (entries: Distribution[]) => {
    if (!entries.length || entries.some(entry => entry.customerId !== entries[0].customerId)) {
      setError('اختر توزيعة واحدة أو عدة توزيعات للعميل نفسه.');
      return;
    }
    const items = invoiceLines(entries);
    if (!items.length) {
      setError('لا توجد كميات مشحونة غير مفوترة في التوزيعات المختارة.');
      return;
    }
    const prepared = onPrepareInvoice({
      customerId: entries[0].customerId,
      customerName: entries[0].customerName,
      invoiceType,
      documents: entries.map(entry => ({ id: entry.id, revision: entry.revision })),
      items: items.map(line => {
        const item = entries.flatMap(entry => entry.items).find(item => item.id === line.distributionItemId)!;
        return { ...line, productId: item.productId, unitPrice: item.unitPrice ?? 0,
          taxRate: item.taxRate ?? 0, productLabel: item.productLabel, productDetails: item.productDetails };
      })
    });
    if (prepared) {
      setInvoiceSelection([]);
      setShowModal(false);
    }
  };

  const printReport = (document?: Distribution) => {
    if (!onPrintTable) return;
    if (document) {
      const items = document.items.filter(item => !item.isCancelled);
      const showPrices = user.role !== 'STOREKEEPER';
      const totals = calculateTotals(items);
      onPrintTable({
        title: 'توزيعة بضائع',
        issuedAt: document.createdAt,
        metadata: [
          { label: 'رقم التوزيعة', value: document.documentNumber },
          { label: 'العميل', value: document.customerName },
          { label: 'الحالة', value: statusLabels[document.status] || document.status }
        ],
        headers: ['الصنف وتفاصيله', ...(showPrices ? ['الكمية المتاحة'] : []), 'العدد', ...(showPrices ? ['سعر الوحدة', 'السعر الإجمالي'] : [])],
        rows: items.map(item => [
          detailValues(item.productDetails).map(([, value]) => value).filter(Boolean).join(' | ') || item.productLabel,
          ...(showPrices ? [products.find(product => product.id === item.productId)?.availableQty ?? '—'] : []),
          item.quantity,
          ...(showPrices ? [
            formatMoney(item.unitPrice || 0),
            formatMoney(roundMoney(Number(item.unitPrice || 0) * item.quantity))
          ] : [])
        ]),
        totals: showPrices ? [
          { label: 'الإجمالي قبل الضريبة', value: `${formatMoney(totals.subtotal)} ج.م` },
          { label: 'القيمة المضافة', value: `${formatMoney(totals.tax)} ج.م` },
          { label: 'الإجمالي شامل الضريبة', value: `${formatMoney(totals.total)} ج.م` }
        ] : undefined,
        notes: document.notes
      });
      return;
    }
    const rows = filteredDocuments.flatMap(entry =>
      entry.items.filter(item => !item.isCancelled).map(item => {
        const details = detailValues(item.productDetails);
        const row = [
          entry.documentNumber,
          dateLabel(entry.createdAt),
          entry.customerName,
          ...details.map(([, value]) => value || '—'),
          item.quantity,
          item.shippedQuantity,
          item.invoicedQuantity,
          statusLabels[entry.status] || entry.status
        ];
        if (user.role !== 'STOREKEEPER') {
          row.push(String(item.unitPrice ?? 0), String((Number(item.unitPrice || 0) * item.quantity).toFixed(2)));
        }
        return row;
      })
    );
    const headers = [
      'رقم التوزيعة', 'التاريخ', 'العميل',
      ...detailValues().map(([label]) => label),
      'الكمية المطلوبة', 'المشحون', 'المفوتر', 'الحالة'
    ];
    if (user.role !== 'STOREKEEPER') headers.push('سعر الوحدة', 'الإجمالي');
    onPrintTable({
      title: 'كشف التوزيعات',
      headers,
      rows
    });
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setCustomerFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col p-2 space-y-3 overflow-hidden no-print" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-white">التوزيعات</h2>
        <p className="text-xs text-slate-400 mt-0.5">تجهيز وشحن بضائع العملاء على دفعات وإصدار فواتير بالمشحون</p>
      </div>

      {error && !showModal && <div role="alert" className="p-3 rounded border border-red-500/40 bg-red-950/30 text-red-300 text-sm font-bold">{error}</div>}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative group w-[260px] shrink-0">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث برقم التوزيعة أو العميل أو الصنف..."
            className={`${inputClass} !py-2 !pr-3 ${search ? '!pl-9' : ''}`} aria-label="البحث في التوزيعات" />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label="مسح البحث">×</button>}
        </div>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={`${inputClass} !w-auto !py-2`}>
          <option value="ALL">كل الحالات</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {user.role !== 'STOREKEEPER' && <select value={customerFilter} onChange={event => setCustomerFilter(event.target.value)} className={`${inputClass} !w-auto !py-2`}>
          <option value="ALL">كل العملاء</option>
          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>}
        <label className="flex items-center gap-1 text-[11px] text-slate-400">من <input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} className={`${inputClass} !w-[140px] !py-2`} /></label>
        <label className="flex items-center gap-1 text-[11px] text-slate-400">إلى <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} className={`${inputClass} !w-[140px] !py-2`} /></label>
        {(search || statusFilter !== 'ALL' || customerFilter !== 'ALL' || dateFrom || dateTo) && <button type="button" onClick={clearFilters} className={actionClass}>مسح الفلاتر</button>}
        {onPrintTable && <button type="button" onClick={() => printReport()} disabled={!filteredDocuments.length} className={actionClass}>طباعة الكشف</button>}
        <button type="button" onClick={() => void refresh()} disabled={busy} className={actionClass}>تحديث</button>
        {canEdit && <button type="button" onClick={newDocument} className="inline-flex items-center gap-1 rounded-sm bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50" disabled={busy}>+ توزيعة جديدة</button>}
      </div>

      {canInvoice && <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">حدد توزيعتين أو أكثر للعميل نفسه لدمج المشحون غير المفوتر في فاتورة واحدة.</span>
        <select aria-label="نوع فاتورة التوزيعات" value={invoiceType} onChange={event => setInvoiceType(event.target.value)} disabled={busy} className={`${inputClass} !w-auto`}>
          <option>فاتورة ضريبية</option><option>فاتورة</option>
        </select>
        <button type="button" onClick={() => void invoice(selectedForInvoice)} disabled={busy || !selectedForInvoice.length} className="rounded-sm bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">إصدار فاتورة واحدة ({selectedForInvoice.length})</button>
        {!!invoiceSelection.length && <button type="button" onClick={() => setInvoiceSelection([])} disabled={busy} className={actionClass}>إلغاء التحديد</button>}
        {!!selectedForInvoice.length && <span className="text-emerald-300">المحدد: {selectedForInvoice.map(entry => entry.documentNumber).join('، ')}</span>}
      </div>}

      <div className="flex-1 min-h-0 overflow-auto rounded-sm border border-white/10 shadow-lg bg-slate-900/50">
        <table className="w-full min-w-[800px] text-right text-xs">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-slate-950 text-slate-300">
            <tr>
              {canInvoice && <th className="py-2.5 px-3">تحديد</th>}
              <th className="py-2.5 px-3">رقم التوزيعة</th>
              <th className="py-2.5 px-3">التاريخ</th>
              <th className="py-2.5 px-3">العميل</th>
              <th className="py-2.5 px-3">الشحن</th>
              <th className="py-2.5 px-3">الحالة</th>
              <th className="py-2.5 px-3">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-200">
            {filteredDocuments.map(document => {
              const shipping = shippingStyles[shippingState(document.items)];
              return <tr key={document.id} className={`align-top border-r-4 transition-colors hover:bg-white/5 ${document.status === 'CANCELLED' ? 'border-r-red-400' : shipping.row}`}>
                {canInvoice && <td className="py-2.5 px-3">
                  <input type="checkbox" aria-label={`تحديد ${document.documentNumber} للفوترة`} checked={invoiceSelection.includes(document.id)}
                    disabled={busy || (!invoiceSelection.includes(document.id) && !invoiceLines([document]).length)} onChange={() => toggleInvoiceSelection(document)} className="accent-emerald-500" />
                </td>}
                <td className="whitespace-nowrap py-2.5 px-3 font-mono font-bold text-indigo-300">{document.documentNumber}</td>
                <td className="whitespace-nowrap py-2.5 px-3">{dateLabel(document.createdAt)}</td>
                <td className="py-2.5 px-3 font-bold text-white">{document.customerName}</td>
                <td className="whitespace-nowrap py-2.5 px-3">
                  {document.status === 'CANCELLED' ? '—' : <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-bold ${shipping.badge}`}>
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{shipping.label}
                  </span>}
                </td>
                <td className="whitespace-nowrap py-2.5 px-3">
                  <span className={`rounded px-2 py-1 font-bold ${document.status === 'CANCELLED' ? 'bg-red-500/15 text-red-300' : document.status === 'INVOICED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-500/15 text-indigo-200'}`}>
                    {statusLabels[document.status] || document.status}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2.5 px-3">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => selectDocument(document)} className={actionClass}>عرض / إجراء</button>
                    {onPrintTable && <button type="button" onClick={() => printReport(document)} className={actionClass}>طباعة</button>}
                  </div>
                </td>
              </tr>;
            })}
            {!filteredDocuments.length && (
              <tr><td colSpan={6 + (canInvoice ? 1 : 0)} className="py-10 text-center font-bold text-slate-500">{busy ? 'جاري تحميل التوزيعات...' : 'لا توجد توزيعات مطابقة للبحث والفلاتر.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm no-print" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget && !busy) setShowModal(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="distribution-modal-title" className="flex max-h-[94vh] w-full max-w-[1050px] flex-col overflow-hidden rounded-sm border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <div>
                <h3 id="distribution-modal-title" className="font-bold text-white">{selected ? `التوزيعة ${selected.documentNumber}` : 'إنشاء توزيعة جديدة'}</h3>
                {selected && <p className="mt-1 text-xs text-slate-400">الحالة: {statusLabels[selected.status] || selected.status} · الإصدار {selected.revision}</p>}
              </div>
              <div className="flex gap-2">
                {canEdit && selected && !editable && <button type="button" onClick={() => setEditing(true)} disabled={busy} className={actionClass}>تعديل التوزيعة</button>}
                {selected && onPrintTable && <button type="button" onClick={() => printReport(selected)} className={actionClass}>طباعة</button>}
                <button type="button" onClick={() => setShowModal(false)} className={actionClass} aria-label="إغلاق النافذة">إغلاق ×</button>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-4">
              {error && <div role="alert" className="mb-3 rounded border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">{error}</div>}
              {editable && selected && selected.status !== 'DRAFT' && <p className="mb-3 text-xs text-amber-300">تُحفظ نسخة من التوزيعة قبل التعديل. لا تتغير الشحنات والفواتير السابقة، ولا يمكن خفض العدد عن الكمية المشحونة. إزالة صنف توقف شحن المتبقي منه مع إبقاء المشحون متاحًا للفوترة.</p>}
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-300">العميل
                  <select value={customerId} onChange={event => setCustomerId(event.target.value)} disabled={!editable} className={`${inputClass} mt-1 !py-2`}>
                    <option value="">اختر العميل</option>
                    {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </label>
              </div>

              {editable ? (
                <div className="overflow-x-auto rounded-sm border border-white/10">
                  <table className="w-full min-w-[850px] table-fixed text-right text-xs">
                    <colgroup>
                      <col />
                      <col style={{ width: 95 }} />
                      <col style={{ width: 60 }} />
                      <col style={{ width: 75 }} />
                      <col style={{ width: 135 }} />
                      <col style={{ width: 45 }} />
                    </colgroup>
                    <thead className="bg-slate-950 text-slate-300"><tr>
                      {['الصنف وتفاصيله', 'الكمية المتاحة', 'العدد', 'سعر الوحدة', 'السعر الإجمالي', 'الإجراء'].map(header => <th key={header} className="p-2">{header}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-white/5">
                      {lines.map((line, index) => {
                        const product = products.find(item => item.id === line.productId);
                        const lineTotal = roundMoney(Number(line.quantity || 0) * Number(line.unitPrice || 0));
                        return <tr key={`${line.productId}-${index}`} className="align-middle">
                          <td className="p-1.5">
                            <select value={line.productId} onChange={event => updateLine(index, 'productId', event.target.value)} className={`${inputClass} !min-w-0`}>
                              <option value="">اختر الصنف</option>
                              {products.map(item => <option key={item.id} value={item.id}>{item.code} - {item.name} | {item.type || '—'} | {item.size || '—'} | {item.gauge || '—'} | {item.color || '—'}</option>)}
                            </select>
                            {product && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] text-slate-400">
                              {detailValues(product).map(([label, value]) => value
                                ? <span key={label} title={label}>{value}</span>
                                : null)}
                            </div>}
                          </td>
                          <td className="whitespace-nowrap p-2 text-center font-mono font-bold text-emerald-300">{product?.availableQty ?? '—'}</td>
                          <td className="p-1"><input type="number" min={Math.max(1, selected?.items.find(item => item.productId === line.productId)?.shippedQuantity || 0)} value={line.quantity} onChange={event => updateLine(index, 'quantity', event.target.value)} placeholder="الكمية" className={`${inputClass} !min-w-0 !px-1`} /></td>
                          <td className="p-1"><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => updateLine(index, 'unitPrice', event.target.value)} placeholder="السعر" className={`${inputClass} !min-w-0 !px-1`} /></td>
                          <td className="whitespace-nowrap p-2 font-mono font-bold text-emerald-300">{formatMoney(lineTotal)} ج.م</td>
                          <td className="p-1.5">
                            <button type="button" onClick={() => removeLine(index)} disabled={busy}
                              aria-label={`إزالة الصف ${index + 1}`}
                              className={`${actionClass} !px-1 !text-red-300 hover:!bg-red-500/10`}><Trash2Icon size={16} aria-hidden="true" /></button>
                          </td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                  <p className="border-t border-white/10 bg-black/10 px-3 py-2 text-[11px] text-slate-500">يُضاف صف جديد تلقائيًا عند إدخال بيانات في آخر صف.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-sm border border-white/10">
                  <table className="w-full min-w-[900px] text-right text-xs">
                    <thead className="bg-slate-950 text-slate-300"><tr>
                      {['الصنف وتفاصيله', 'الكمية المتاحة', 'العدد', 'المشحون', 'المتبقي للشحن', 'المفوتر', 'المتاح للفوترة', ...(user.role !== 'STOREKEEPER' ? ['سعر الوحدة', 'السعر الإجمالي'] : []), ...(canDispatch ? ['كمية الشحن'] : [])].map(header => <th key={header} className="p-2">{header}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {selected?.items.filter(item => !item.isCancelled || item.shippedQuantity > item.invoicedQuantity).map(item => {
                        const details = item.productDetails;
                        const availableQty = products.find(product => product.id === item.productId)?.availableQty;
                        const remainingToShip = item.isCancelled ? 0 : Math.max(0, item.quantity - item.shippedQuantity);
                        const remainingToInvoice = Math.max(0, item.shippedQuantity - item.invoicedQuantity);
                        const lineTotal = roundMoney(Number(item.unitPrice || 0) * item.quantity);
                        const shipping = shippingStyles[shippingState([item])];
                        return <tr key={item.id} className={`border-r-4 ${shipping.row}`}>
                          <td className="min-w-[300px] p-2">
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                              {detailValues(details).map(([label, value]) => value
                                ? <span key={label} title={label}>{value}</span>
                                : null)}
                              {!details && <span className="font-bold text-white">{item.productLabel}</span>}
                            </div>
                            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${shipping.badge}`}>{shipping.label}</span>
                          </td>
                          <td className="whitespace-nowrap p-2 text-center font-mono font-bold text-emerald-300">{availableQty ?? '—'}</td>
                          <td className="p-2 font-mono">{item.quantity}</td>
                          <td className="p-2 font-mono">{item.shippedQuantity}</td>
                          <td className="p-2 font-mono">{remainingToShip}</td>
                          <td className="p-2 font-mono">{item.invoicedQuantity}</td>
                          <td className="p-2 font-mono">{remainingToInvoice}</td>
                          {user.role !== 'STOREKEEPER' && <>
                            <td className="whitespace-nowrap p-2 font-mono">{formatMoney(item.unitPrice || 0)} ج.م</td>
                            <td className="whitespace-nowrap p-2 font-mono font-bold text-emerald-300">{formatMoney(lineTotal)} ج.م</td>
                          </>}
                          {canDispatch && <td className="min-w-[100px] p-1.5"><input type="number" min="0" max={remainingToShip} disabled={item.isCancelled} value={dispatchQuantities[item.id] || ''} onChange={event => setDispatchQuantities(value => ({ ...value, [item.id]: event.target.value }))} placeholder="الكمية" className={inputClass} /></td>}
                        </tr>;
                      })}
                      {!selected?.items.some(item => !item.isCancelled || item.shippedQuantity > item.invoicedQuantity) && <tr><td colSpan={7 + (user.role !== 'STOREKEEPER' ? 2 : 0) + (canDispatch ? 1 : 0)} className="p-6 text-center text-slate-500">لا توجد أصناف في التوزيعة.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              {user.role !== 'STOREKEEPER' && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-sm border border-indigo-400/20 bg-indigo-950/30 p-3 text-xs font-bold sm:grid-cols-3">
                  <div className="text-slate-200">الإجمالي قبل الضريبة: <bdi>{formatMoney((editable ? draftTotals : selectedTotals).subtotal)} ج.م</bdi></div>
                  <div className="text-amber-300">القيمة المضافة: <bdi>{formatMoney((editable ? draftTotals : selectedTotals).tax)} ج.م</bdi></div>
                  <div className="text-emerald-300">الإجمالي شامل الضريبة: <bdi>{formatMoney((editable ? draftTotals : selectedTotals).total)} ج.م</bdi></div>
                </div>
              )}
              <label className="mt-4 block text-xs font-bold text-slate-300">ملاحظات
                <input value={notes} onChange={event => setNotes(event.target.value)} disabled={!editable}
                  className={`${inputClass} mt-1 !py-2`} />
              </label>
            </div>
            <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-800 bg-slate-950 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {editable && <button type="button" onClick={() => void save()} disabled={busy} className="rounded-sm bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{selected ? 'حفظ التعديلات' : 'حفظ التوزيعة'}</button>}
                {editing && selected && <button type="button" onClick={() => selectDocument(selected)} disabled={busy} className={actionClass}>إلغاء التعديل</button>}
                {canEdit && selected?.status === 'DRAFT' && <button type="button" onClick={() => void act('approve')} disabled={busy} className="rounded-sm bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">اعتماد وحجز المخزون</button>}
                {!editable && canDispatch && selected && selected.status !== 'DRAFT' && selected.status !== 'CANCELLED' && <button type="button" onClick={() => void dispatch()} disabled={busy} className="rounded-sm bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">تسجيل الشحن المحدد</button>}
                {!editable && canInvoice && selected && selected.status !== 'DRAFT' && <div className="flex gap-2">
                  <select value={invoiceType} onChange={event => setInvoiceType(event.target.value)} className={`${inputClass} !w-auto`}>
                    <option>فاتورة ضريبية</option><option>فاتورة</option>
                  </select>
                  <button type="button" onClick={() => void invoice([selected])} disabled={busy || !invoiceLines([selected]).length} className="rounded-sm bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">إصدار فاتورة بكل المشحون غير المفوتر</button>
                </div>}
                {canEdit && selected && selected.status !== 'CANCELLED' && <button type="button" onClick={() => void act('delete')} disabled={busy} className="rounded-sm bg-red-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">إلغاء التوزيعة</button>}
              </div>
              {busy && <span className="self-center text-xs text-slate-400">جاري التنفيذ...</span>}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
