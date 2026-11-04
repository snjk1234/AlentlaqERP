"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import MoneyInput from './MoneyInput';
import { formatMoney } from '../lib/money-format';
import type { PrintBankTransfer } from './PrintDocuments';

export type TransferBank = { id: string; name: string; accountNumber: string | null; balance: number };
export type BankTransfer = PrintBankTransfer & { requestId: string; createdBy: string };
export type TransferSnapshot = { banks: TransferBank[]; transfers: BankTransfer[] };
type MutationResult = TransferSnapshot & { transfer: BankTransfer; original: BankTransfer | null };
type User = { role: string; sessionToken?: string };
type Bridge = { bankTransferOperation: (data: Record<string, unknown>) => Promise<{ data?: unknown; error?: string; statusCode?: number }> };
const field = 'rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white disabled:opacity-50';
const button = 'rounded border border-slate-600 px-3 py-2 text-sm font-bold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
const localDate = (now = new Date()) => {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const dateLabel = (value: string | Date) => new Date(value).toLocaleDateString('ar-EG');

export default function BankTransfersPanel({ user, banks, onSnapshot, onLoading, onPrint, launch, onCloseLaunch }: {
  user: User; banks: TransferBank[]; onSnapshot: (data: TransferSnapshot) => void; onLoading: () => void;
  onPrint: (transfer: PrintBankTransfer) => void; launch: string | null; onCloseLaunch: () => void;
}) {
  const [snapshot, setSnapshot] = useState<TransferSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bankId, setBankId] = useState('');
  const [status, setStatus] = useState('');
  const [reversing, setReversing] = useState<BankTransfer | null>(null);
  const request = useCallback(async (data: Record<string, unknown>): Promise<unknown> => {
    const bridge = (window as Window & { electronAPI?: Bridge }).electronAPI;
    if (bridge) {
      const result = await bridge.bankTransferOperation(data);
      if (result.error) throw Object.assign(new Error(result.error), { statusCode: result.statusCode });
      return result.data;
    }
    const response = await fetch('/api/bank-transfers', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.sessionToken || ''}` },
      body: JSON.stringify(data), signal: AbortSignal.timeout(30000)
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'تعذر تنفيذ التحويل.'), { statusCode: response.status });
    return result.data;
  }, [user.sessionToken]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    onLoading();
    try {
      const data = await request({ action: 'list' }) as TransferSnapshot;
      setSnapshot(data);
      onSnapshot(data);
    } catch (error) {
      setSnapshot(null);
      setError(error instanceof Error ? error.message : 'تعذر تحميل التحويلات.');
    } finally { setLoading(false); }
  }, [request, onSnapshot, onLoading]);
  useEffect(() => {
    let active = true;
    onLoading();
    request({ action: 'list' }).then(result => {
      if (!active) return;
      const data = result as TransferSnapshot;
      setSnapshot(data);
      onSnapshot(data);
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'تعذر تحميل التحويلات.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, onSnapshot, onLoading]);
  const completed = (result: MutationResult) => {
    const data = { banks: result.banks, transfers: result.transfers };
    setSnapshot(data);
    onSnapshot(data);
    setReversing(null);
    onCloseLaunch();
    setMessage(result.transfer.reversalOf ? 'تم عكس التحويل مع حفظ السند الأصلي والحركة العكسية.' : 'تم التحويل بنجاح بين الحسابين.');
    onPrint({ ...result.transfer, reversedByNumber: result.transfers.find(item => item.reversalOf === result.transfer.id)?.transferNumber });
  };
  const rows = (snapshot?.transfers || []).filter(item => {
    const day = localDate(new Date(item.date));
    return (!from || day >= from) && (!to || day <= to)
      && (!bankId || item.fromBankId === bankId || item.toBankId === bankId)
      && (!status || (status === 'REVERSED' ? item.status === 'REVERSED'
        : status === 'REVERSAL' ? !!item.reversalOf : item.status === 'POSTED' && !item.reversalOf))
      && [item.transferNumber, item.fromBankName, item.toBankName, item.reference, item.notes, item.createdByName]
        .some(value => (value || '').toLowerCase().includes(search.toLowerCase()));
  });
  return <section className="mt-5 border-t border-slate-700 pt-4 space-y-3" dir="rtl">
    <div className="flex flex-wrap justify-between gap-2 items-center">
      <h3 className="text-lg font-bold text-white">التحويلات الداخلية</h3>
      <button type="button" className={button} disabled={loading || launch !== null || !!reversing} onClick={() => void load()}>تحديث التحويلات والأرصدة</button>
    </div>
    {error && <p role="alert" className="rounded bg-red-950 p-3 text-red-200">{error}</p>}
    {message && <p role="status" className="rounded bg-emerald-950 p-3 text-emerald-200">{message}</p>}
    {loading && <p className="text-slate-400">جارٍ تحميل التحويلات والأرصدة...</p>}
    <div className="flex flex-wrap gap-2">
      <span className="relative min-w-56 flex-1">
        <SearchIcon size={16} className="pointer-events-none absolute inset-y-0 right-3 my-auto text-slate-400" />
        <input aria-label="بحث التحويلات" placeholder="رقم السند أو الحساب أو المرجع" className={`${field} w-full pr-9`} value={search} onChange={event => setSearch(event.target.value)} />
      </span>
      <select aria-label="حساب التحويلات" className={field} value={bankId} onChange={event => setBankId(event.target.value)}>
        <option value="">كل الحسابات</option>
        {banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
      </select>
      <select aria-label="حالة التحويلات" className={field} value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">كل الحالات</option><option value="POSTED">منفّذ</option>
        <option value="REVERSED">تم عكسه</option><option value="REVERSAL">سند عكسي</option>
      </select>
      <label className="text-sm text-slate-300">من <input aria-label="تحويلات من تاريخ" type="date" className={field} value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label className="text-sm text-slate-300">إلى <input aria-label="تحويلات إلى تاريخ" type="date" className={field} value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
    </div>
    <div className="overflow-auto">
      <table className="w-full text-right text-xs text-slate-200">
        <thead><tr>{['السند', 'التاريخ', 'من حساب', 'إلى حساب', 'المبلغ', 'المنفّذ', 'الحالة', 'الإجراءات'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
        <tbody>{rows.map(item => <tr key={item.id} className="border-t border-slate-700">
          <td className="p-2"><bdi>{item.transferNumber}</bdi>{item.reversalOf && <span className="block text-amber-300">عكس {item.reference}</span>}</td>
          <td className="p-2">{dateLabel(item.date)}</td><td className="p-2">{item.fromBankName}</td><td className="p-2">{item.toBankName}</td>
          <td className="p-2"><bdi>{formatMoney(item.amount)}</bdi></td><td className="p-2">{item.createdByName}</td>
          <td className="p-2">{item.status === 'REVERSED' ? `تم عكسه بـ ${snapshot?.transfers.find(row => row.reversalOf === item.id)?.transferNumber || ''}` : item.reversalOf ? 'سند عكسي' : 'منفّذ'}</td>
          <td className="p-2"><div className="flex gap-1">
            <button type="button" className={button} onClick={() => onPrint({
              ...item, reversedByNumber: snapshot?.transfers.find(row => row.reversalOf === item.id)?.transferNumber
            })}>طباعة السند</button>
            {item.status === 'POSTED' && !item.reversalOf && <button type="button" className={`${button} text-amber-300`} disabled={launch !== null || !!reversing}
              onClick={() => { setMessage(''); setReversing(item); }}>عكس التحويل</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
      {snapshot && !rows.length && <p className="p-4 text-slate-400">لا توجد تحويلات مطابقة.</p>}
    </div>
    <p className="text-xs text-slate-400">التحويل ليس مصروفًا أو إيرادًا. الرسوم البنكية، إن وُجدت، تُسجل كمصروف عام منفصل مع رقم سند التحويل في المرجع. لا يمكن تعديل أو حذف السند؛ التصحيح بسند عكسي.</p>
    {snapshot && (launch !== null || reversing) && <TransferForm key={reversing?.id || launch || 'new'}
      banks={banks} sourceId={launch || ''} original={reversing} request={request} onCompleted={completed}
      onClose={() => { setReversing(null); onCloseLaunch(); }} />}
  </section>;
}

function TransferForm({ banks, sourceId, original, request, onCompleted, onClose }: {
  banks: TransferBank[]; sourceId: string; original: BankTransfer | null;
  request: (data: Record<string, unknown>) => Promise<unknown>; onCompleted: (result: MutationResult) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    fromBankId: original?.toBankId || sourceId, toBankId: original?.fromBankId || '',
    amount: original ? String(original.amount) : '', date: localDate(), reference: '', notes: '', reason: ''
  });
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<Record<string, unknown> | null>(null);
  const submitting = useRef(false);
  const fromBank = banks.find(bank => bank.id === form.fromBankId);
  const toBank = banks.find(bank => bank.id === form.toBankId);
  const amount = Number(form.amount);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const change = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (!pending.current) {
      if (!window.confirm(original ? 'عكس التحويل سيخصم المبلغ من المستلم ويعيده إلى المصدر بسند جديد. متابعة؟' : 'تأكيد التحويل بين الحسابين؟')) return;
      pending.current = original
        ? { action: 'reverse', requestId: crypto.randomUUID(), id: original.id, reason: form.reason }
        : { action: 'create', requestId: crypto.randomUUID(), ...form };
    }
    submitting.current = true;
    setBusy(true);
    try {
      const result = await request(pending.current) as MutationResult;
      onCompleted(result);
    } catch (error) {
      const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 0;
      const unresolved = !status || status >= 500;
      setUncertain(unresolved);
      if (!unresolved) pending.current = null;
      setError((error instanceof Error ? error.message : 'تعذر تنفيذ التحويل.') + (unresolved
        ? ' قد تكون العملية نُفّذت. أعد التحقق بالزر نفسه؛ لن يُخصم المبلغ مرتين. لا تنشئ تحويلًا بديلًا قبل التحقق.' : ''));
    } finally { submitting.current = false; setBusy(false); }
  };
  const locked = busy || uncertain;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" role="dialog" aria-modal="true" aria-labelledby="transfer-form-title">
    <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-600 bg-slate-900 p-4 space-y-4 text-white">
      <div className="flex justify-between items-center gap-2">
        <h3 id="transfer-form-title" className="font-bold text-lg">{original ? `عكس التحويل ${original.transferNumber}` : 'تحويل بين الحسابات'}</h3>
        <button type="button" className={button} disabled={locked} onClick={onClose}>إلغاء</button>
      </div>
      {error && <p role="alert" className="bg-red-950 rounded p-3 text-red-200">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">من حساب<select required className={field} disabled={locked || !!original} value={form.fromBankId} onChange={event => change('fromBankId', event.target.value)}>
          <option value="">اختر المصدر</option>{banks.map(bank => <option key={bank.id} value={bank.id} disabled={bank.id === form.toBankId}>{bank.name}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">إلى حساب<select required className={field} disabled={locked || !!original} value={form.toBankId} onChange={event => change('toBankId', event.target.value)}>
          <option value="">اختر المستلم</option>{banks.map(bank => <option key={bank.id} value={bank.id} disabled={bank.id === form.fromBankId}>{bank.name}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">مبلغ التحويل<MoneyInput required min={0.01} step={0.01} className={field} disabled={locked || !!original}
          value={form.amount} onValueChange={value => change('amount', value)} /></label>
        {!original && <label className="grid gap-1 text-sm">تاريخ التحويل<input required type="date" className={field} max={localDate()} value={form.date} disabled={locked}
          onChange={event => change('date', event.target.value)} /></label>}
      </div>
      {original ? <textarea required aria-label="سبب عكس التحويل" placeholder="سبب عكس التحويل (إلزامي)" maxLength={2000} className={`${field} w-full`} disabled={locked}
        value={form.reason} onChange={event => change('reason', event.target.value)} /> : <>
        <input aria-label="مرجع التحويل" placeholder="رقم العملية البنكية أو الإيداع (اختياري)" maxLength={255} className={`${field} w-full`} disabled={locked}
          value={form.reference} onChange={event => change('reference', event.target.value)} />
        <textarea aria-label="ملاحظات التحويل" placeholder="ملاحظات التحويل (اختياري)" maxLength={2000} className={`${field} w-full`} disabled={locked}
          value={form.notes} onChange={event => change('notes', event.target.value)} />
      </>}
      <div className="grid sm:grid-cols-2 gap-3">
        {[{ bank: fromBank, direction: -1 }, { bank: toBank, direction: 1 }].map(({ bank, direction }) => bank && <div key={direction} className="rounded border border-slate-700 p-3">
          <p>{bank.name}</p><p className="text-sm text-slate-400">الرصيد الحالي: <bdi>{formatMoney(bank.balance)}</bdi></p>
          <p className="font-bold">بعد التحويل: <bdi>{validAmount ? formatMoney((Math.round(bank.balance * 100) + direction * Math.round(amount * 100)) / 100) : '—'}</bdi></p>
        </div>)}
      </div>
      {fromBank && validAmount && amount > fromBank.balance && <p className="text-amber-300">رصيد المصدر لا يكفي. سيُراجع الرصيد مجددًا عند التنفيذ.</p>}
      <p className="text-xs text-slate-400">هذه معاينة للأرصدة الحالية، والتنفيذ يُراجع الرصيد على الخادم. عكس التحويل يُسجل بتاريخ ووقت التنفيذ الحاليين.</p>
      <button className={`${button} bg-indigo-700`} disabled={busy || (!uncertain && (!fromBank || !toBank || !validAmount || amount > fromBank.balance))}>
        {busy ? 'جارٍ التنفيذ...' : uncertain ? 'التحقق وإعادة المحاولة دون تكرار' : original ? 'تأكيد عكس التحويل' : 'تأكيد التحويل'}
      </button>
    </form>
  </div>;
}
