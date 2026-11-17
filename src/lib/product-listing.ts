export type ProductSortField =
  | 'code' | 'barcode' | 'name' | 'type' | 'size' | 'gauge' | 'color' | 'supplier'
  | 'length' | 'weight' | 'pricePerKilo' | 'costPrice' | 'markup' | 'price'
  | 'stockQty' | 'minStockQty' | 'maxStockQty';

export type ProductSortOption = { value: ProductSortField; label: string; adminOnly?: boolean };

export const PRODUCT_SORT_OPTIONS: readonly ProductSortOption[] = [
  { value: 'code', label: 'الكود' },
  { value: 'barcode', label: 'الباركود' },
  { value: 'name', label: 'اسم الصنف' },
  { value: 'type', label: 'النوع' },
  { value: 'size', label: 'المقاس' },
  { value: 'gauge', label: 'الدرجة' },
  { value: 'color', label: 'اللون' },
  { value: 'supplier', label: 'المورد' },
  { value: 'length', label: 'الطول' },
  { value: 'weight', label: 'الوزن' },
  { value: 'pricePerKilo', label: 'سعر الكيلو' },
  { value: 'costPrice', label: 'التكلفة', adminOnly: true },
  { value: 'markup', label: 'نسبة الربح', adminOnly: true },
  { value: 'price', label: 'سعر البيع' },
  { value: 'stockQty', label: 'المخزون' },
  { value: 'minStockQty', label: 'حد التنبيه' },
  { value: 'maxStockQty', label: 'الحد الأقصى' }
];

type SortableProduct = {
  [key: string]: unknown;
  supplier?: { name?: string | null } | null;
};

export function sortProducts<T extends SortableProduct>(
  products: readonly T[],
  field: ProductSortField,
  direction: 'asc' | 'desc'
): T[] {
  const getValue = (product: T) => field === 'supplier' ? product.supplier?.name : product[field];
  return [...products].sort((first, second) => {
    const firstValue = getValue(first);
    const secondValue = getValue(second);
    const firstEmpty = firstValue === null || firstValue === undefined || firstValue === '';
    const secondEmpty = secondValue === null || secondValue === undefined || secondValue === '';
    if (firstEmpty || secondEmpty) return firstEmpty === secondEmpty ? 0 : firstEmpty ? 1 : -1;

    const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? comparison : -comparison;
  });
}

export function reorderProductColumns(columns: readonly string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || fromIndex >= columns.length || toIndex < 0 || toIndex >= columns.length) {
    return [...columns];
  }
  const reordered = [...columns];
  const [column] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, column);
  return reordered;
}
