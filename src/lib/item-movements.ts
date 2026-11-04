import { inAccountPeriod } from './account-period';
import type { PrintInvoice } from '../components/PrintDocuments';

export type MovementKind = 'sales' | 'purchases';
export type MovementProduct = {
  id: string; code: string; name: string; size?: string; color?: string | null;
  type?: string; gauge?: string | null; length?: string | null;
};
type MovementItem = {
  id: string; productId: string; product: MovementProduct; quantity: number;
  unitPrice?: number; unitCost?: number; taxAmount: number; total: number;
};
export type MovementReturn = {
  id: string; returnNumber: string; createdAt: string | Date; customerId: string | null;
  totalAmount: number; taxAmount: number; netAmount: number; refundAmount: number; refundMethod: string;
  bank?: { name: string } | null; items: MovementItem[];
};
export type MovementDocument = PrintInvoice & {
  id: string; customerId?: string | null; supplierId?: string;
  qrCode?: string | null; items: MovementItem[]; orderReturns?: MovementReturn[];
};
export type MovementFilters = {
  partyId: string; from: string; to: string; productId: string; search: string; includeReturns: boolean;
};
export type ItemMovement = {
  key: string; document: MovementDocument; orderReturn?: MovementReturn;
  documentId: string; number: string; originalNumber: string; date: string | Date;
  partyId: string; partyName: string; product: MovementProduct; description: string;
  kind: 'invoice' | 'return'; quantity: number; unitPrice: number; beforeTax: number; tax: number; total: number;
};
export const CASH_PARTY = '__CASH__';
export const productDescription = (product: MovementProduct) =>
  [product.name, product.type, product.size, product.gauge, product.color, product.length].filter(Boolean).join(' · ');
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildItemMovements(documents: MovementDocument[], kind: MovementKind): ItemMovement[] {
  const rows: ItemMovement[] = [];
  for (const document of documents) {
    if (kind === 'sales' && (document.isQuotation || document.status !== 'COMPLETED')) continue;
    const add = (items: MovementItem[], orderReturn?: MovementReturn) => {
      if (!Array.isArray(items)) throw new Error('بيانات بنود الفواتير غير مكتملة. حدّث الخادم وأعد تحميل الكشف.');
      const date = orderReturn?.createdAt || document.date || document.createdAt;
      if (!Number.isFinite(new Date(date).getTime())) throw new Error('يوجد مستند بتاريخ غير صالح في كشف الأصناف.');
      const originalNumber = (kind === 'sales' ? document.invoiceNumber : document.billNumber) || document.id;
      const number = orderReturn?.returnNumber || originalNumber;
      const partyId = kind === 'purchases' ? document.supplierId : orderReturn ? orderReturn.customerId : document.customerId;
      for (const item of items) {
        const unitPrice = kind === 'purchases' ? item.unitCost : item.unitPrice;
        if (!item.product || !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0
          || typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0
          || !Number.isFinite(item.total) || !Number.isFinite(item.taxAmount)) {
          throw new Error(`بيانات أحد أصناف المستند ${number} غير صالحة. راجع الفاتورة.`);
        }
        const sign = orderReturn ? -1 : 1;
        rows.push({
          key: `${orderReturn?.id || document.id}:${item.id}`, document, orderReturn,
          documentId: orderReturn?.id || document.id, number,
          originalNumber, date,
          partyId: partyId || CASH_PARTY,
          partyName: kind === 'purchases' ? document.supplier?.name || 'مورد غير محدد'
            : document.customer?.name || document.customerName || 'عميل نقدي',
          product: item.product, description: productDescription(item.product),
          kind: orderReturn ? 'return' : 'invoice', quantity: sign * item.quantity, unitPrice,
          beforeTax: sign * money(item.total - item.taxAmount), tax: sign * money(item.taxAmount), total: sign * money(item.total)
        });
      }
    };
    add(document.items);
    if (kind === 'sales') for (const orderReturn of document.orderReturns || []) add(orderReturn.items, orderReturn);
  }
  return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    || a.documentId.localeCompare(b.documentId));
}

export function filterItemMovements(rows: ItemMovement[], filters: MovementFilters) {
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
  const search = filters.search.trim().toLocaleLowerCase();
  return rows.filter(row => (!filters.partyId || row.partyId === filters.partyId)
    && (!filters.productId || row.product.id === filters.productId)
    && (filters.includeReturns || row.kind !== 'return')
    && inAccountPeriod({ date: row.date }, filters.from, filters.to)
    && (!search || `${row.product.code} ${row.description}`.toLocaleLowerCase().includes(search)));
}

export function summarizeItemMovements(rows: ItemMovement[]) {
  const groups = new Map<string, {
    product: MovementProduct; description: string; quantity: number; returned: number; netQuantity: number;
    beforeTax: number; tax: number; total: number; invoiceIds: Set<string>; returnIds: Set<string>;
  }>();
  for (const row of rows) {
    let group = groups.get(row.product.id);
    if (!group) {
      group = { product: row.product, description: row.description, quantity: 0, returned: 0, netQuantity: 0,
        beforeTax: 0, tax: 0, total: 0, invoiceIds: new Set(), returnIds: new Set() };
      groups.set(row.product.id, group);
    }
    if (row.kind === 'return') { group.returned -= row.quantity; group.returnIds.add(row.documentId); }
    else { group.quantity += row.quantity; group.invoiceIds.add(row.documentId); }
    group.netQuantity += row.quantity;
    group.beforeTax += row.beforeTax; group.tax += row.tax; group.total += row.total;
  }
  return [...groups.values()].map(group => ({
    product: group.product, description: group.description, quantity: group.quantity, returned: group.returned,
    netQuantity: group.netQuantity, beforeTax: money(group.beforeTax), tax: money(group.tax), total: money(group.total),
    invoiceCount: group.invoiceIds.size, returnCount: group.returnIds.size
  })).sort((a, b) => a.product.code.localeCompare(b.product.code, 'ar', { numeric: true })
    || a.description.localeCompare(b.description, 'ar'));
}

export function itemMovementTotals(rows: ItemMovement[]) {
  return {
    beforeTax: money(rows.reduce((sum, row) => sum + row.beforeTax, 0)),
    tax: money(rows.reduce((sum, row) => sum + row.tax, 0)),
    total: money(rows.reduce((sum, row) => sum + row.total, 0)),
    invoiceCount: new Set(rows.filter(row => row.kind === 'invoice').map(row => row.documentId)).size,
    returnCount: new Set(rows.filter(row => row.kind === 'return').map(row => row.documentId)).size,
    productCount: new Set(rows.map(row => row.product.id)).size
  };
}

export async function loadItemMovementDocuments(kind: MovementKind) {
  const bridge = (window as Window & { electronAPI?: {
    getOrders: () => Promise<MovementDocument[]>; getPurchases: () => Promise<MovementDocument[]>;
  } }).electronAPI;
  let documents: MovementDocument[];
  if (bridge) documents = await (kind === 'sales' ? bridge.getOrders() : bridge.getPurchases());
  else {
    const response = await fetch(kind === 'sales' ? '/api/orders' : '/api/purchases', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل بيانات كشف الأصناف.');
    documents = data;
  }
  if (!Array.isArray(documents)) throw new Error('استجابة كشف الأصناف غير صالحة.');
  return documents;
}
