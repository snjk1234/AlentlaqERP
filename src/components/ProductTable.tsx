import { useState } from 'react';
import type { ReactNode } from 'react';
import { reorderProductColumns } from '@/lib/product-listing';

const COLUMN_ACCENTS: Record<string, { header: string; cell: string }> = {
  code: { header: 'text-cyan-300', cell: 'text-cyan-300 font-mono font-semibold' },
  barcode: { header: 'text-indigo-300', cell: 'text-indigo-300 font-mono' },
  name: { header: 'text-white', cell: 'text-white font-semibold' },
  type: { header: 'text-sky-300', cell: 'text-sky-300' },
  supplier: { header: 'text-teal-300', cell: 'text-teal-300' },
  pricePerKilo: { header: 'text-sky-300', cell: 'text-sky-300 font-mono' },
  costPrice: { header: 'text-amber-300', cell: 'text-amber-300 font-mono' },
  markup: { header: 'text-purple-300', cell: 'text-purple-300' },
  price: { header: 'text-emerald-300', cell: 'text-emerald-300 font-mono font-bold' },
  stockQty: { header: 'text-amber-300', cell: '' },
  minStockQty: { header: 'text-orange-300', cell: 'text-orange-300' },
  maxStockQty: { header: 'text-slate-400', cell: 'text-slate-400' }
};

export type ProductTableProduct = {
  id: string;
  supplierId?: string | null;
  code?: string | null;
  barcode?: string | null;
  name?: string | null;
  type?: string | null;
  size?: string | null;
  gauge?: string | null;
  color?: string | null;
  length?: string | null;
  weight?: string | null;
  pricePerKilo?: number | null;
  costPrice?: number | null;
  markup?: number | null;
  price?: number | null;
  stockQty?: number | null;
  minStockQty?: number | null;
  maxStockQty?: number | null;
  supplier?: { name?: string | null } | null;
  imageUrl?: string | null;
};

export type ProductTableColumn = {
  key: string;
  label: string;
  render: (product: ProductTableProduct) => ReactNode;
  className?: string;
};

type Props = {
  products: ProductTableProduct[];
  columns: ProductTableColumn[];
  columnOrder: string[];
  onColumnOrderChange: (order: string[]) => void;
  ariaLabel: string;
};

export default function ProductTable({ products, columns, columnOrder, onColumnOrderChange, ariaLabel }: Props) {
  const [selectedColumnKey, setSelectedColumnKey] = useState('');
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [targetColumnKey, setTargetColumnKey] = useState<string | null>(null);
  const keys = columns.map(column => column.key);
  const orderedKeys = [
    ...columnOrder.filter(key => keys.includes(key)),
    ...keys.filter(key => !columnOrder.includes(key))
  ];
  const orderedColumns = orderedKeys.flatMap(key => {
    const column = columns.find(item => item.key === key);
    return column ? [column] : [];
  });
  const selectedIndex = orderedKeys.includes(selectedColumnKey)
    ? orderedKeys.indexOf(selectedColumnKey)
    : 0;
  const moveColumn = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= orderedKeys.length) return;
    onColumnOrderChange(reorderProductColumns(orderedKeys, fromIndex, toIndex));
  };
  const dropOnColumn = (sourceKey: string, targetKey: string) => {
    if (!sourceKey || sourceKey === targetKey) return;
    moveColumn(orderedKeys.indexOf(sourceKey), orderedKeys.indexOf(targetKey));
  };

  return (
    <div className="h-full overflow-auto rounded-sm border border-white/10 shadow-lg bg-slate-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900 px-3 py-2 text-xs">
        <span className="text-slate-400">اسحب عناوين الأعمدة أو اختر عمودًا لتحريكه</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="product-column-order" className="font-bold text-slate-300">ترتيب عمود:</label>
          <select id="product-column-order" value={orderedKeys[selectedIndex] || ''}
            onChange={event => setSelectedColumnKey(event.target.value)}
            className="rounded-sm border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-200">
            {orderedColumns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
          </select>
          <button type="button" disabled={selectedIndex <= 0}
            onClick={() => moveColumn(selectedIndex, selectedIndex - 1)}
            className="rounded-sm bg-white/5 px-2 py-1.5 font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40"
            aria-label="تحريك العمود يمينًا">يمين</button>
          <button type="button" disabled={selectedIndex >= orderedKeys.length - 1}
            onClick={() => moveColumn(selectedIndex, selectedIndex + 1)}
            className="rounded-sm bg-white/5 px-2 py-1.5 font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40"
            aria-label="تحريك العمود يسارًا">يسار</button>
        </div>
      </div>
      <table className="w-full min-w-max text-right text-xs" dir="rtl" aria-label={ariaLabel}>
        <thead className="bg-slate-900 text-slate-300 sticky top-0 z-10 border-b border-white/10">
          <tr>{orderedColumns.map(column => {
            const accent = COLUMN_ACCENTS[column.key];
            return (
            <th key={column.key} scope="col" draggable
              onDragStart={event => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', column.key);
                setDraggedColumnKey(column.key);
              }}
              onDragOver={event => event.preventDefault()}
              onDragEnter={() => setTargetColumnKey(column.key)}
              onDrop={event => {
                event.preventDefault();
                const sourceKey = draggedColumnKey || event.dataTransfer.getData('text/plain');
                if (sourceKey) dropOnColumn(sourceKey, column.key);
                setDraggedColumnKey(null);
                setTargetColumnKey(null);
              }}
              onDragEnd={() => {
                setDraggedColumnKey(null);
                setTargetColumnKey(null);
              }}
              title={`اسحب لإعادة ترتيب عمود ${column.label}`}
              className={`cursor-grab select-none py-2.5 px-3 font-semibold whitespace-nowrap ${
                accent?.header || 'text-slate-300'
              } ${targetColumnKey === column.key && draggedColumnKey !== column.key ? 'bg-indigo-950' : ''} ${column.className || ''}`}>
              {column.label}
            </th>
          );})}</tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {products.map(product => (
            <tr key={product.id} className="hover:bg-white/5 transition-colors">
              {orderedColumns.map(column => (
                <td key={column.key} className={`py-2 px-3 whitespace-nowrap ${COLUMN_ACCENTS[column.key]?.cell || ''} ${column.className || ''}`}>
                  {column.render(product)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
