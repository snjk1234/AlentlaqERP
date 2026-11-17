"use client";

import { useState, type FormEvent } from 'react';
import { PercentIcon, XIcon } from 'lucide-react';
import MoneyInput from './MoneyInput';

type SupplierPrice = { productId: string; price: number };
type Supplier = { id: string; name: string; supplierPrices?: SupplierPrice[] };
type Product = { id: string; supplierId: string; name: string; code?: string; type?: string; size?: string; color?: string };
type Props = {
  supplier: Supplier;
  products: Product[];
  onClose: () => void;
  onSaved: (prices: SupplierPrice[]) => void;
};

export default function SupplierPricesModal({ supplier, products, onClose, onSaved }: Props) {
  const [pricesMap, setPricesMap] = useState<Record<string, number>>(() =>
    Object.fromEntries((supplier.supplierPrices || []).map(({ productId, price }) => [productId, price]))
  );
  const [saving, setSaving] = useState(false);
  const supplierProducts = products.filter(product => product.supplierId === supplier.id);
  const removePrice = (productId: string) => setPricesMap(previous =>
    Object.fromEntries(Object.entries(previous).filter(([id]) => id !== productId))
  );

  const savePrices = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const prices = Object.entries(pricesMap).map(([productId, price]) => ({ productId, price }));
    if (prices.some(entry => !Number.isFinite(entry.price) || entry.price < 0)) {
      alert('يجب إدخال أسعار صالحة لا تقل عن صفر لكل صنف');
      return;
    }

    setSaving(true);
    try {
      const desktop = window as Window & {
        electronAPI?: {
          saveSupplierPrices: (data: { supplierId: string; prices: SupplierPrice[] }) => Promise<SupplierPrice[]>;
        };
      };
      let savedPrices: SupplierPrice[];
      if (desktop.electronAPI) {
        savedPrices = await desktop.electronAPI.saveSupplierPrices({ supplierId: supplier.id, prices });
      } else {
        const response = await fetch(`/api/suppliers/${supplier.id}/prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prices })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'حدث خطأ أثناء حفظ الأسعار');
        if (!Array.isArray(result.prices)) throw new Error('استجابة حفظ الأسعار غير صحيحة، يرجى تحديث الخادم');
        savedPrices = result.prices;
      }
      onSaved(savedPrices);
      onClose();
      alert('تم حفظ أسعار المورد بنجاح');
    } catch (error) {
      console.error('Error saving supplier prices:', error);
      alert(error instanceof Error ? error.message : 'حدث خطأ أثناء حفظ أسعار المورد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <PercentIcon className="text-indigo-500" />
            أسعار مخصصة للمورد: {supplier.name}
          </h3>
          <button type="button" onClick={onClose} disabled={saving} className="text-slate-400 hover:text-white bg-white/5 p-2 rounded transition-colors cursor-pointer disabled:opacity-50">
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <form onSubmit={savePrices} className="bg-white/5 p-4 rounded-lg mb-6 border border-white/10">
            <h4 className="text-white font-bold mb-4">تحديد أسعار مخصصة للأصناف المسجلة لهذا المورد</h4>
            <p className="text-xs text-slate-400 mb-4">اختر الأصناف وحدد سعر التوريد المتفق عليه لكل صنف. اترك الخانة فارغة لاستخدام سعر التكلفة الافتراضي.</p>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {supplierProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>لا توجد أصناف مسجلة لهذا المورد</p>
                </div>
              ) : supplierProducts.map(product => {
                const hasCustom = pricesMap[product.id] !== undefined;
                return (
                  <div key={product.id} className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex-1 text-right">
                      <div className="text-sm font-bold text-white">{product.name}</div>
                      <div className="text-xs text-slate-400">{[product.code, product.type, product.size, product.color].filter(Boolean).join(' - ')}</div>
                    </div>
                    <div className="w-32">
                      <MoneyInput
                        min="0"
                        step="0.01"
                        aria-label={`سعر التوريد المخصص: ${product.name}`}
                        value={pricesMap[product.id] === undefined ? '' : pricesMap[product.id]}
                        onValueChange={value => {
                          const price = parseFloat(value);
                          setPricesMap(previous => {
                            if (Number.isNaN(price)) return Object.fromEntries(
                              Object.entries(previous).filter(([id]) => id !== product.id)
                            );
                            return { ...previous, [product.id]: price };
                          });
                        }}
                        className="w-full bg-black/50 border border-white/10 rounded p-2 text-white font-mono text-center focus:border-indigo-500"
                        placeholder="السعر"
                      />
                    </div>
                    {!hasCustom && (
                      <button
                        type="button"
                        onClick={() => removePrice(product.id)}
                        className="text-xs text-slate-500 hover:text-white px-2 py-1"
                      >
                        استخدام السعر الافتراضي
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-between items-center">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                إغلاق
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 transition-colors shadow-lg"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الأسعار'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
