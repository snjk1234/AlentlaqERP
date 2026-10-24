import { formatMoney } from '../lib/money-format';

type Product = {
  name: string; code: string; type: string; size: string; gauge?: string | null;
  color?: string | null; weight?: string | null; length?: string | null;
  supplier?: { name: string } | null; stockQty: number; minStockQty: number; price: number;
};

const colorStyles = [
  { names: ['أحمر', 'احمر', 'red'], backgroundColor: '#dc2626', color: '#ffffff' },
  { names: ['أخضر', 'اخضر', 'green'], backgroundColor: '#15803d', color: '#ffffff' },
  { names: ['أزرق', 'ازرق', 'blue'], backgroundColor: '#2563eb', color: '#ffffff' },
  { names: ['أصفر', 'اصفر', 'yellow'], backgroundColor: '#facc15', color: '#172033' },
  { names: ['أبيض', 'ابيض', 'white'], backgroundColor: '#ffffff', color: '#172033' },
  { names: ['أسود', 'اسود', 'black'], backgroundColor: '#111111', color: '#ffffff' },
  { names: ['برتقالي', 'orange'], backgroundColor: '#f97316', color: '#172033' },
  { names: ['بني', 'جملي', 'brown'], backgroundColor: '#92400e', color: '#ffffff' },
  { names: ['رمادي', 'رصاصي', 'gray', 'grey'], backgroundColor: '#94a3b8', color: '#172033' },
  { names: ['بنفسجي', 'purple'], backgroundColor: '#7e22ce', color: '#ffffff' },
  { names: ['وردي', 'pink'], backgroundColor: '#f9a8d4', color: '#172033' }
];

export function ProductCardHeader({ product, typeClassName }: {
  product: Pick<Product, 'code' | 'name' | 'type'>; typeClassName?: string;
}) {
  return (
    <div className="product-card-header product-card-inline-details custom-scrollbar" dir="rtl" tabIndex={0} aria-label={`تعريف ${product.name}`}>
      <span className="font-mono text-slate-300" title="الكود">{product.code}</span>
      <h3 className="product-card-name font-bold text-white">{product.name}</h3>
      <span className={typeClassName} title="النوع">{product.type || 'أخرى'}</span>
    </div>
  );
}

export default function ProductCardDetails({ product, children, actions }: {
  product: Product; children?: React.ReactNode; actions?: React.ReactNode;
}) {
  const out = product.stockQty <= 0;
  const low = product.stockQty <= product.minStockQty;
  const colorStyle = colorStyles.find(entry => entry.names.some(name => product.color?.trim().toLowerCase().includes(name)));
  return (
    <div className="product-card-data-row" dir="rtl">
      <div className="product-card-inline-details custom-scrollbar" tabIndex={0} aria-label={`بيانات ${product.name}`}>
        <span title="المقاس">م <bdi>{product.size}</bdi></span>
        {product.gauge && <span title="الدرجة">{product.gauge}</span>}
        {product.color && <span className="product-color-badge" title="اللون"
          style={colorStyle ? { backgroundColor: colorStyle.backgroundColor, color: colorStyle.color } : undefined}>
          {product.color}
        </span>}
        {product.supplier && <span title="المورد">{product.supplier.name}</span>}
        {product.length && <span title="الطول">ط <bdi>{product.length}</bdi></span>}
        {product.weight && <span title="الوزن">ز <bdi>{product.weight}</bdi></span>}
        {children}
      </div>
      <div className="product-card-bottom">
        <span className="product-card-price font-bold text-white">البيع: {formatMoney(product.price)} ج.م</span>
        <p className={`product-card-stock ${out ? 'text-red-500' : low ? 'text-amber-500' : 'text-emerald-400'}`}>
          المخزون: <bdi>{product.stockQty}</bdi>{out ? ' (نافذ)' : low ? ' (منخفض)' : ''}
        </p>
        {actions}
      </div>
    </div>
  );
}
