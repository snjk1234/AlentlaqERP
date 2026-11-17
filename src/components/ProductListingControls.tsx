import { PRODUCT_SORT_OPTIONS, type ProductSortField } from '@/lib/product-listing';

type Props = {
  layout: 'cards' | 'table';
  onLayoutChange: (layout: 'cards' | 'table') => void;
  sortBy: ProductSortField;
  onSortByChange: (field: ProductSortField) => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (direction: 'asc' | 'desc') => void;
  isAdmin: boolean;
};

export default function ProductListingControls({
  layout, onLayoutChange, sortBy, onSortByChange, sortDirection, onSortDirectionChange, isAdmin
}: Props) {
  const options = PRODUCT_SORT_OPTIONS.filter(option => isAdmin || !option.adminOnly);
  const selectedSortBy = options.some(option => option.value === sortBy) ? sortBy : 'code';
  const buttonClass = (active: boolean) => `px-2.5 py-2 rounded-sm text-xs font-bold transition-colors ${
    active ? 'bg-entlaq-primary text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
  }`;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-400 font-bold">العرض:</span>
      <div className="flex gap-1" role="group" aria-label="طريقة عرض المنتجات">
        <button type="button" aria-pressed={layout === 'cards'} className={buttonClass(layout === 'cards')}
          onClick={() => onLayoutChange('cards')}>بطاقات</button>
        <button type="button" aria-pressed={layout === 'table'} className={buttonClass(layout === 'table')}
          onClick={() => onLayoutChange('table')}>جدول</button>
      </div>
      <label className="text-slate-400 font-bold" htmlFor="product-sort-field">الترتيب حسب:</label>
      <select id="product-sort-field" value={selectedSortBy}
        onChange={event => {
          const option = options.find(item => item.value === event.target.value);
          if (option) onSortByChange(option.value);
        }}
        className="bg-slate-900 border border-white/10 rounded-sm py-2 px-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-white/20">
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button type="button" onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
        className="px-2.5 py-2 rounded-sm bg-white/5 text-slate-300 hover:bg-white/10 font-bold"
        aria-label={sortDirection === 'asc' ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'}>
        {sortDirection === 'asc' ? 'تصاعدي ↑' : 'تنازلي ↓'}
      </button>
    </div>
  );
}
