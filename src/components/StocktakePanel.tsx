"use client";

import { useCallback, useEffect, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { formatMoney } from '@/lib/money-format';
import { stocktakeTotals } from '@/lib/stocktake-totals';
import type { PrintStocktake } from '@/components/PrintDocuments';

type Product = {
  id: string; code: string; name: string; size: string; color: string | null; stockQty: number; costPrice: number;
  type?: string; gauge?: string | null; length?: string | null; weight?: string | null;
  supplier?: { name: string } | null; barcode?: string | null;
};
type Line = { productId: string; productLabel: string; bookQty: number; countedQty: number | null; unitCost: number | null };
type Stocktake = {
  id: string; documentNumber: string; status: string; revision: number; notes: string | null;
  createdBy: string; createdAt: string; approvedBy: string | null; approvedAt: string | null; items: Line[];
};
type Listing = { documents: Stocktake[]; products: Product[]; passwordConfigured: boolean };
type DraftLine = Omit<Line, 'countedQty'> & { countedQty: string };
type User = { id: string; role: string; sessionToken?: string };
type StocktakeBridge = { stocktakeOperation: (input: Record<string, unknown>) => Promise<unknown> };
const fieldClass = 'bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-60';
const buttonClass = 'rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
const label = (product: Product) => [product.code, product.name, product.size, product.color].filter(Boolean).join(' - ');
const details = (product: Product) => [
  product.barcode, product.type, product.gauge, product.supplier?.name, product.length, product.weight
].filter(Boolean).join(' · ');
const date = (value: string) => new Date(value).toLocaleString('ar-EG');

export default function StocktakePanel({ user, onInventoryChanged, onPrint }: {
  user: User; onInventoryChanged: () => void; onPrint: (document: PrintStocktake) => void;
}) {
  const [listing, setListing] = useState<Listing>({ documents: [], products: [], passwordConfigured: false });
  const [document, setDocument] = useState<Stocktake | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [approvalPassword, setApprovalPassword] = useState('');
  const [showPasswordSettings, setShowPasswordSettings] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ accountPassword: '', newPassword: '', confirmPassword: '' });
  const approved = document?.status === 'APPROVED';
  const admin = user.role === 'ADMIN';

  const request = useCallback(async (input: Record<string, unknown>): Promise<unknown> => {
    const bridge = (window as Window & { electronAPI?: StocktakeBridge }).electronAPI;
    if (bridge) return bridge.stocktakeOperation(input);
    const response = await fetch('/api/stocktakes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.sessionToken || ''}` },
      body: JSON.stringify(input)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ إجراء الجرد.');
    return result.data;
  }, [user.sessionToken]);

  const reload = useCallback(async () => {
    const result = await request({ action: 'list' }) as Listing;
    setListing(result);
    setLoaded(true);
  }, [request]);

  useEffect(() => {
    let active = true;
    request({ action: 'list' }).then(result => {
      if (active) { setListing(result as Listing); setLoaded(true); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'تعذر تحميل الجرد.'); });
    return () => { active = false; };
  }, [request]);

  const open = (selected: Stocktake | null) => {
    if (dirty && !window.confirm('هناك تعديلات غير محفوظة. هل تريد تجاهلها؟')) return;
    setDocument(selected);
    setLines(selected ? selected.items.map(item => ({ ...item, countedQty: item.countedQty === null ? '' : String(item.countedQty) })) : []);
    setNotes(selected?.notes || '');
    setDirty(false);
    setApprovalPassword('');
    setError('');
    setMessage('');
  };

  const run = async (action: 'save' | 'approve' | 'refresh' | 'password' | 'list' | 'delete' | 'notes') => {
    if (busy) return;
    setError('');
    setMessage('');
    if (action === 'password' && passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('كلمتا مرور الجرد غير متطابقتين.');
      return;
    }
    if (action === 'approve' && !window.confirm('اعتماد الجرد سيغيّر أرصدة الأصناف إلى الكميات الفعلية المحفوظة، ولا يمكن تعديل الجرد بعد ذلك. متابعة؟')) return;
    if (action === 'refresh' && !window.confirm('سيتم تحديث أرصدة الدفتر وإفراغ الكميات الفعلية للأصناف التي تغير رصيدها لتعيد عدّها. متابعة؟')) return;
    if (action === 'delete' && !window.confirm('هل تريد حذف المسودة؟ ستُحذف تعديلاتك غير المحفوظة أيضًا، ولن تتغير أرصدة المخزون.')) return;
    setBusy(true);
    try {
      if (action === 'list') {
        await reload();
        setMessage('تم تحديث قائمة الجرد والأصناف.');
      } else {
        const result = await request({
          action, ...(document ? { id: document.id, revision: document.revision } : {}),
          ...(action === 'save' ? { notes, items: lines } : {}),
          ...(action === 'notes' ? { notes } : {}),
          ...(action === 'approve' ? { password: approvalPassword } : {}),
          ...(action === 'password' ? { accountPassword: passwordForm.accountPassword, newPassword: passwordForm.newPassword } : {})
        });
        if (action === 'password') {
          setListing(previous => ({ ...previous, passwordConfigured: true }));
          setShowPasswordSettings(false);
          setPasswordForm({ accountPassword: '', newPassword: '', confirmPassword: '' });
          setMessage('تم حفظ كلمة مرور اعتماد الجرد.');
        } else if (action === 'delete') {
          const { deletedId } = result as { deletedId: string };
          setListing(previous => ({ ...previous, documents: previous.documents.filter(item => item.id !== deletedId) }));
          setDocument(null);
          setLines([]);
          setNotes('');
          setDirty(false);
          setApprovalPassword('');
          setMessage('تم حذف المسودة دون تغيير أرصدة المخزون.');
        } else {
          const saved = result as Stocktake;
          setDocument(saved);
          setLines(saved.items.map(item => ({ ...item, countedQty: item.countedQty === null ? '' : String(item.countedQty) })));
          setNotes(saved.notes || '');
          setDirty(false);
          setApprovalPassword('');
          setListing(previous => ({
            ...previous,
            documents: [saved, ...previous.documents.filter(item => item.id !== saved.id)],
            products: previous.products.map(product => {
              const line = saved.items.find(item => item.productId === product.id);
              if (!line || !['approve', 'refresh'].includes(action)) return product;
              return { ...product, stockQty: action === 'approve' && line.countedQty !== null ? line.countedQty : line.bookQty };
            })
          }));
          setMessage(action === 'approve' ? 'تم اعتماد الجرد وتحديث أرصدة الأصناف بنجاح.'
            : action === 'notes' ? 'تم حفظ ملاحظات الجرد دون تغيير الكميات أو الاعتماد.'
            : action === 'refresh' ? 'تم تحديث أرصدة الدفتر. أعد عدّ الأصناف ذات الكمية الفعلية الفارغة.' : 'تم حفظ المسودة دون تغيير المخزون.');
          if (action === 'approve') onInventoryChanged();
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر تنفيذ إجراء الجرد.');
    } finally {
      setBusy(false);
      if (action === 'approve') setApprovalPassword('');
      if (action === 'password') setPasswordForm({ accountPassword: '', newPassword: '', confirmPassword: '' });
    }
  };

  const choose = (product: Product, checked: boolean) => {
    setLines(previous => checked ? [...previous, { productId: product.id, productLabel: label(product), bookQty: product.stockQty, countedQty: '', unitCost: product.costPrice }]
      : previous.filter(item => item.productId !== product.id));
    setDirty(true);
  };
  const reserved = new Map(listing.documents.filter(item => item.status === 'DRAFT' && item.id !== document?.id)
    .flatMap(item => item.items.map(line => [line.productId, item.documentNumber] as const)));
  const productDetails = new Map(listing.products.map(product => [product.id, details(product)]));
  const filtered = listing.products.filter(product => `${label(product)} ${details(product)}`.toLowerCase().includes(search.toLowerCase()));
  const selected = new Set(lines.map(item => item.productId));
  const incomplete = lines.filter(item => item.countedQty.trim() === '').length;
  const canEdit = loaded && !busy && !approved;
  const totals = stocktakeTotals(lines);

  return <section dir="rtl" className="flex-1 min-w-0 overflow-auto p-4 text-slate-100 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold">جرد</h1><p className="text-sm text-slate-400">إعداد الجرد وحفظه لا يغيّر المخزون. التسوية تتم عند اعتماد المدير فقط.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={busy || !loaded} onClick={() => open(null)}>جرد جديد</button>
        <button className={buttonClass} disabled={busy} onClick={() => void run('list')}>تحديث القائمة</button>
        {admin && <button className={buttonClass} disabled={busy} onClick={() => {
          setShowPasswordSettings(previous => !previous);
          setPasswordForm({ accountPassword: '', newPassword: '', confirmPassword: '' });
        }}>{listing.passwordConfigured ? 'تغيير كلمة مرور الاعتماد' : 'تعيين كلمة مرور الاعتماد'}</button>}
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg bg-red-950 border border-red-500 p-3">{error}</div>}
    {message && <div role="status" className="rounded-lg bg-emerald-950 border border-emerald-600 p-3">{message}</div>}
    {!loaded && !error && <p>جارٍ تحميل الجرد...</p>}
    {admin && showPasswordSettings && <form className="rounded-xl border border-slate-700 p-4 flex flex-wrap items-end gap-3"
      onSubmit={event => { event.preventDefault(); void run('password'); }}>
      <label className="grid gap-1 text-sm">كلمة مرور حساب المدير<input required type="password" autoComplete="current-password" className={fieldClass}
        disabled={busy} value={passwordForm.accountPassword} onChange={event => setPasswordForm({ ...passwordForm, accountPassword: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">كلمة مرور الجرد الجديدة<input required type="password" minLength={8} maxLength={256} autoComplete="new-password" className={fieldClass}
        disabled={busy} value={passwordForm.newPassword} onChange={event => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">تأكيد كلمة مرور الجرد<input required type="password" autoComplete="new-password" className={fieldClass}
        disabled={busy} value={passwordForm.confirmPassword} onChange={event => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} /></label>
      <button className={buttonClass} disabled={busy}>حفظ كلمة المرور</button>
    </form>}
    <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="rounded-xl border border-slate-700 p-3 space-y-2 max-h-[70vh] overflow-auto">
        <h2 className="font-bold">مسودات وسجل الجرد</h2>
        {loaded && !listing.documents.length && <p className="text-sm text-slate-400">لا توجد مستندات جرد بعد.</p>}
        {listing.documents.map(item => <button key={item.id} disabled={busy} onClick={() => open(item)}
          className={`w-full text-right rounded-lg p-3 border ${document?.id === item.id ? 'border-indigo-500 bg-indigo-950' : 'border-slate-700'}`}>
          <span dir="ltr" className="font-bold">{item.documentNumber}</span>
          <span className={`block text-sm ${item.status === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400'}`}>{item.status === 'APPROVED' ? 'معتمد' : 'مسودة'}</span>
          <span className="block text-xs text-slate-400">{date(item.createdAt)} · {item.items.length} صنف</span>
        </button>)}
      </aside>
      <div className="min-w-0 space-y-3">
        <div className="rounded-xl border border-slate-700 p-3 space-y-2">
          <h2 className="font-bold">{document ? `${document.documentNumber} — ${approved ? 'معتمد' : 'مسودة'}` : 'جرد جديد'}</h2>
          {document && <p className="text-sm text-slate-400">إعداد: {document.createdBy} · {date(document.createdAt)}</p>}
          {approved && document?.approvedAt && <p className="text-sm text-emerald-400">اعتماد: {document.approvedBy} · {date(document.approvedAt)}</p>}
          <textarea aria-label="ملاحظات الجرد" placeholder="ملاحظات الجرد" className={`${fieldClass} w-full`} maxLength={2000} value={notes} disabled={!loaded || busy}
            onChange={event => { setNotes(event.target.value); setDirty(true); }} />
          {approved && <button className={buttonClass} disabled={busy || !dirty} onClick={() => void run('notes')}>حفظ الملاحظات</button>}
          {document && <button className={buttonClass} disabled={busy || dirty} onClick={() => onPrint(document)}>طباعة الجرد</button>}
          {document && dirty && <p className="text-sm text-amber-400">احفظ التعديلات قبل الطباعة.</p>}
        </div>
        {!approved && <div className="rounded-xl border border-slate-700 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <span className="relative w-[460px]">
              <SearchIcon size={16} className="pointer-events-none absolute inset-y-0 right-3 my-auto text-slate-400" />
              <input aria-label="بحث أصناف الجرد" placeholder="بحث بالكود أو الاسم أو المواصفات أو المورد" className={`${fieldClass} w-full pr-9`}
                value={search} onChange={event => setSearch(event.target.value)} />
            </span>
            <button className={buttonClass} disabled={!canEdit} onClick={() => {
              setLines(previous => [...previous, ...listing.products.filter(product => !selected.has(product.id) && !reserved.has(product.id))
                .map(product => ({ productId: product.id, productLabel: label(product), bookQty: product.stockQty, countedQty: '', unitCost: product.costPrice }))]);
              setDirty(true);
            }}>اختيار جميع الأصناف</button>
          </div>
          <div className="max-h-64 overflow-auto grid sm:grid-cols-2 gap-2">
            {filtered.map(product => <label key={product.id} className="flex items-center gap-2 text-sm p-1">
              <input type="checkbox" disabled={!canEdit || (reserved.has(product.id) && !selected.has(product.id))} checked={selected.has(product.id)} onChange={event => choose(product, event.target.checked)} />
              <span className="min-w-0">
                <span className="block">{label(product)}</span>
                <span className="block text-xs text-slate-400 leading-relaxed break-words">{details(product)}</span>
              </span>
              {reserved.has(product.id) && <span className="text-amber-400 text-xs">في المسودة {reserved.get(product.id)}</span>}
            </label>)}
          </div>
        </div>}
        <div className="overflow-auto rounded-xl border border-slate-700 max-h-[50vh]">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-800 sticky top-0"><tr>{['الصنف', 'رصيد الدفتر', 'الكمية الفعلية', 'الفرق', ''].map((heading, index) => <th key={index} className="p-3">{heading}</th>)}</tr></thead>
            <tbody>{lines.map((item, index) => <tr key={item.productId} className="border-t border-slate-700">
              <td className="p-3">
                <span className="block">{item.productLabel}</span>
                {productDetails.has(item.productId) && <span className="block min-w-64 text-xs text-slate-400 leading-relaxed break-words">
                  {productDetails.get(item.productId)}
                </span>}
              </td><td className="p-3">{item.bookQty.toLocaleString('en-US')}</td>
              <td className="p-2"><input aria-label={`الكمية الفعلية ${item.productLabel}`} className={`${fieldClass} w-28`} type="number" min={0} max={2147483647} step={1}
                disabled={!canEdit} value={item.countedQty} onChange={event => {
                  setLines(previous => previous.map((line, i) => i === index ? { ...line, countedQty: event.target.value } : line));
                  setDirty(true);
                }} /></td>
              <td className="p-3" dir="ltr">{item.countedQty.trim() === '' ? '—' : (Number(item.countedQty) - item.bookQty).toLocaleString('en-US')}</td>
              <td>{!approved && <button aria-label={`إزالة ${item.productLabel}`} disabled={busy} className={buttonClass} onClick={() => {
                setLines(previous => previous.filter(line => line.productId !== item.productId)); setDirty(true);
              }}>إزالة</button>}</td>
            </tr>)}</tbody>
          </table>
          {!lines.length && <p className="p-4 text-slate-400">اختر الأصناف المراد جردها. الخانة الفارغة تعني «لم يُعدّ بعد»، وليست صفرًا.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="قيمة فروق الجرد بسعر التكلفة">
          {[['قيمة النقص', totals.shortage], ['قيمة الزيادة', totals.surplus], ['الصافي (الزيادة − النقص)', totals.net]].map(([title, value]) =>
            <div key={title} className="rounded-lg border border-slate-700 p-3">
              <div className="text-sm text-slate-400">{title}</div>
              <bdi className="text-lg font-bold">{totals.unvalued ? '—' : formatMoney(value)}</bdi>
            </div>)}
        </div>
        <p className="text-xs text-slate-400">القيم بسعر التكلفة المثبّت عند حفظ الصنف في الجرد، وللأصناف المعدودة فقط. الخانات الفارغة لا تدخل في الإجمالي.</p>
        {totals.unvalued > 0 && <p role="alert" className="text-amber-400 text-sm">{approved
          ? 'قيمة الفروق غير متاحة لهذا الجرد القديم لأن تكلفة الأصناف لم تكن محفوظة وقت الجرد.'
          : 'قيمة الفروق غير مكتملة. احفظ المسودة لتثبيت التكلفة للأصناف القديمة، وتحقق من صحة الكميات.'}</p>}
        {!approved && <div className="flex flex-wrap gap-3 items-center">
          <button className={`${buttonClass} bg-indigo-700`} disabled={!canEdit || !lines.length} onClick={() => void run('save')}>{busy ? 'جارٍ التنفيذ...' : 'حفظ مسودة'}</button>
          {document && <button className={buttonClass} disabled={!canEdit || dirty} onClick={() => void run('refresh')}>تحديث أرصدة الدفتر</button>}
          {document && <button className={`${buttonClass} text-red-400`} disabled={!canEdit} onClick={() => void run('delete')}>حذف المسودة</button>}
          <span className="text-sm text-slate-400">{lines.length} صنف · {incomplete} لم يُعدّ بعد{dirty ? ' · تعديلات غير محفوظة' : ''}</span>
        </div>}
        {!approved && admin && document && <form className="flex flex-wrap gap-3 items-end rounded-xl border border-emerald-800 p-3"
          onSubmit={event => { event.preventDefault(); void run('approve'); }}>
          <input aria-label="كلمة مرور اعتماد الجرد" placeholder="كلمة مرور اعتماد الجرد" required type="password" autoComplete="off" className={fieldClass}
            disabled={busy || dirty || !listing.passwordConfigured} value={approvalPassword} onChange={event => setApprovalPassword(event.target.value)} />
          <button className={`${buttonClass} bg-emerald-800`} disabled={busy || dirty || !listing.passwordConfigured || incomplete > 0}>اعتماد الجرد وتسوية الأرصدة</button>
          {dirty && <span className="text-amber-400 text-sm">احفظ التعديلات قبل الاعتماد.</span>}
          {!listing.passwordConfigured && <span className="text-amber-400 text-sm">عيّن كلمة مرور الاعتماد من أعلى الصفحة أولًا.</span>}
        </form>}
      </div>
    </div>
  </section>;
}
