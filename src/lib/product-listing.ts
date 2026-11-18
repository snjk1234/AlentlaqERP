export type ProductSortField =
  | 'code' | 'barcode' | 'name' | 'type' | 'size' | 'gauge' | 'color' | 'supplier'
  | 'length' | 'weight' | 'pricePerKilo' | 'costPrice' | 'markup' | 'price'
  | 'stockQty' | 'minStockQty' | 'maxStockQty' | 'bestSelling';
export type ProductSalesPeriod = '30' | '90' | 'all';
export type ProductSalesDocument = {
  isQuotation?: boolean;
  status?: string;
  date?: string | Date | null;
  createdAt?: string | Date | null;
  items?: { productId?: string; quantity?: number }[];
  orderReturns?: {
    createdAt?: string | Date | null;
    items?: { productId?: string; quantity?: number }[];
  }[];
};

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
  const getValue = (product: T) => field === 'supplier' ? product.supplier?.name
    : field === 'bestSelling' ? product.bestSellingQuantity : product[field];
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

export function productSalesQuantities(
  documents: readonly ProductSalesDocument[],
  period: ProductSalesPeriod,
  now = new Date()
): Record<string, number> {
  if (!Array.isArray(documents)) throw new Error('بيانات فواتير المبيعات غير صالحة.');
  const cutoff = period === 'all' ? null : new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);
  const quantities = new Map<string, number>();
  const addItems = (items: ProductSalesDocument['items'], sign: 1 | -1) => {
    if (!Array.isArray(items)) throw new Error('بيانات أصناف الفواتير أو المرتجعات غير مكتملة.');
    for (const item of items) {
      if (!item || typeof item.productId !== 'string' || !item.productId
        || typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('توجد كمية أو بيانات صنف غير صالحة في سجل المبيعات.');
      }
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + sign * item.quantity);
    }
  };
  const inPeriod = (value: string | Date | null | undefined) => {
    if (!value) throw new Error('يوجد مستند مبيعات أو مرتجع بلا تاريخ صالح.');
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) throw new Error('يوجد مستند مبيعات أو مرتجع بتاريخ غير صالح.');
    return cutoff === null || timestamp >= cutoff.getTime();
  };

  for (const document of documents) {
    if (document.isQuotation || document.status !== 'COMPLETED') continue;
    if (inPeriod(document.date || document.createdAt)) addItems(document.items, 1);
    if (!Array.isArray(document.orderReturns || [])) throw new Error('بيانات مرتجعات المبيعات غير صالحة.');
    for (const orderReturn of document.orderReturns || []) {
      if (inPeriod(orderReturn.createdAt)) addItems(orderReturn.items, -1);
    }
  }
  return Object.fromEntries(quantities);
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
