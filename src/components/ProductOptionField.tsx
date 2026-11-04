'use client';

import { useState } from 'react';
import { CheckIcon, PlusIcon, SettingsIcon, Trash2Icon, XIcon, PencilIcon } from 'lucide-react';
import { DEFAULT_PRODUCT_OPTIONS } from '../lib/product-options';

export type ProductOptionKind = 'type' | 'color' | 'gauge';
export type ProductOption = { id: string; value: string; protected?: boolean };
export type ProductOptionLists = Record<ProductOptionKind, ProductOption[]>;
type OptionsBridge = { productOptionOperation: (input: Record<string, unknown>) => Promise<unknown> };

export const initialProductOptions = (): ProductOptionLists => ({
  type: DEFAULT_PRODUCT_OPTIONS.type.map((value: string) => ({ id: `default-${value}`, value, protected: true })),
  color: DEFAULT_PRODUCT_OPTIONS.color.map((value: string) => ({ id: `default-${value}`, value })),
  gauge: DEFAULT_PRODUCT_OPTIONS.gauge.map((value: string) => ({ id: `default-${value}`, value }))
});

export async function requestProductOptions(sessionToken: string | undefined, input: Record<string, unknown>) {
  const bridge = (window as Window & { electronAPI?: OptionsBridge }).electronAPI;
  if (bridge) return await bridge.productOptionOperation(input) as { options: ProductOptionLists; created?: ProductOption };
  const response = await fetch('/api/product-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken || ''}` },
    body: JSON.stringify(input)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ إجراء الخيارات.');
  return result.data as { options: ProductOptionLists; created?: ProductOption };
}

export async function requestExpenseCategories(sessionToken: string | undefined, input: Record<string, unknown>) {
  const bridge = (window as Window & { electronAPI?: { expenseCategoryOperation: (input: Record<string, unknown>) => Promise<unknown> } }).electronAPI;
  type Result = { options: { id: string; name: string }[]; created?: ProductOption };
  if (bridge) return await bridge.expenseCategoryOperation(input) as Result;
  const response = await fetch('/api/expense-categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken || ''}` },
    body: JSON.stringify(input)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ إجراء التصنيفات.');
  return result.data as Result;
}

const controlClass = 'bg-white/5 border border-white/10 rounded-sm text-slate-200 hover:bg-white/10 cursor-pointer';

export default function ProductOptionField<T = ProductOptionLists>({ kind, value, onChange, options, canManage, sessionToken, onOptionsChanged, placeholder, label, required, valueBy = 'value', request, selectClassName, itemLabel = 'الخيار' }: {
  kind?: ProductOptionKind; value: string; onChange: (value: string) => void; options: ProductOption[];
  canManage: boolean; sessionToken?: string; onOptionsChanged: (options: T) => void;
  placeholder?: string; label: string; required?: boolean; valueBy?: 'value' | 'id';
  request?: (input: Record<string, unknown>) => Promise<{ options: T; created?: ProductOption }>;
  selectClassName?: string; itemLabel?: string;
}) {
  const [mode, setMode] = useState<'none' | 'add' | 'manage'>('none');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const optionValue = (option: ProductOption) => valueBy === 'id' ? option.id : option.value;
  const known = options.some(option => optionValue(option) === value);

  const run = async (input: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const payload = kind ? { ...input, kind } : input;
      const result = request
        ? await request(payload)
        : await requestProductOptions(sessionToken, payload) as unknown as { options: T; created?: ProductOption };
      onOptionsChanged(result.options);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تنفيذ العملية.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const result = await run({ action: 'add', value: draft });
    if (!result) return;
    if (result.created) onChange(optionValue(result.created));
    setDraft('');
    setMode('none');
  };

  const rename = async (option: ProductOption) => {
    const result = await run({ action: 'rename', id: option.id, value: draft });
    if (!result) return;
    if (valueBy === 'value' && value === option.value) onChange(draft.replace(/\s+/g, ' ').trim());
    setEditingId('');
    setDraft('');
  };

  const remove = async (option: ProductOption) => {
    if (!window.confirm(`حذف ${itemLabel} «${option.value}» من القائمة؟`)) return;
    const result = await run({ action: 'delete', id: option.id });
    if (result && value === optionValue(option)) onChange('');
  };

  const toggle = (next: 'add' | 'manage') => {
    setMode(current => current === next ? 'none' : next);
    setDraft('');
    setEditingId('');
    setError('');
  };

  return <div className="space-y-1">
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <div className="flex gap-1">
      <select
        value={value}
        required={required}
        onChange={event => onChange(event.target.value)}
        className={selectClassName || 'w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50'}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {valueBy === 'value' && !known && value && <option value={value}>{value}</option>}
        {options.map(option => <option key={option.id} value={optionValue(option)}>{option.value}</option>)}
      </select>
      {canManage && <>
        <button type="button" title={`إضافة ${label}`} aria-label={`إضافة ${label}`} onClick={() => toggle('add')} className={`${controlClass} px-2`}><PlusIcon size={16} /></button>
        <button type="button" title={`إدارة قائمة ${label}`} aria-label={`إدارة قائمة ${label}`} onClick={() => toggle('manage')} className={`${controlClass} px-2`}><SettingsIcon size={16} /></button>
      </>}
    </div>
    {mode === 'add' && <div className="flex gap-1">
      <input
        autoFocus
        value={draft}
        maxLength={100}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void add(); } }}
        placeholder={`اسم ${itemLabel} الجديد`}
        className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
      />
      <button type="button" disabled={busy || !draft.trim()} onClick={() => void add()} aria-label="حفظ الخيار" className={`${controlClass} px-2 disabled:opacity-50`}><CheckIcon size={16} /></button>
      <button type="button" onClick={() => toggle('add')} aria-label="إلغاء" className={`${controlClass} px-2`}><XIcon size={16} /></button>
    </div>}
    {mode === 'manage' && <div className="bg-white/5 border border-white/10 rounded-sm p-2 space-y-1 max-h-48 overflow-y-auto">
      {options.map(option => <div key={option.id} className="flex items-center gap-1 text-sm text-slate-200">
        {editingId === option.id ? <>
          <input
            autoFocus
            value={draft}
            maxLength={100}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void rename(option); } }}
            className="w-full bg-slate-900 border border-white/10 rounded-sm py-1 px-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
          <button type="button" disabled={busy || !draft.trim()} onClick={() => void rename(option)} aria-label="حفظ التعديل" className={`${controlClass} p-1 disabled:opacity-50`}><CheckIcon size={14} /></button>
          <button type="button" onClick={() => { setEditingId(''); setDraft(''); }} aria-label="إلغاء" className={`${controlClass} p-1`}><XIcon size={14} /></button>
        </> : <>
          <span className="flex-1">{option.value}</span>
          {option.protected ? <span className="text-xs text-slate-500">أساسي</span> : <>
            <button type="button" disabled={busy} onClick={() => { setEditingId(option.id); setDraft(option.value); setError(''); }} aria-label={`تعديل ${option.value}`} className={`${controlClass} p-1 disabled:opacity-50`}><PencilIcon size={14} /></button>
            <button type="button" disabled={busy} onClick={() => void remove(option)} aria-label={`حذف ${option.value}`} className={`${controlClass} p-1 text-red-300 disabled:opacity-50`}><Trash2Icon size={14} /></button>
          </>}
        </>}
      </div>)}
    </div>}
    {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
  </div>;
}
