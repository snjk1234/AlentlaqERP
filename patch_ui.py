import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add openingBalance to initial states
text = text.replace(
    "discount: '0' })",
    "discount: '0', openingBalance: '0' })"
)

# 2. Add pricePerKilo to initial states
text = text.replace(
    "maxStockQty: '1000' })",
    "maxStockQty: '1000', pricePerKilo: '0' })"
)
text = text.replace(
    "maxStockQty: '1000'\r\n    });",
    "maxStockQty: '1000',\r\n                      pricePerKilo: '0'\r\n    });"
)
text = text.replace(
    "maxStockQty: '1000'\n    });",
    "maxStockQty: '1000',\n                      pricePerKilo: '0'\n    });"
)

# 3. Add to Edit Customer Form
text = re.sub(
    r'(discount:\s*cust\.discount\s*\?\s*cust\.discount\.toString\(\)\s*:\s*\'0\')(\s*\})',
    r'\1,\n                                  openingBalance: cust.openingBalance ? cust.openingBalance.toString() : \'0\'\2',
    text
)

# 4. Add to Edit Product Form
text = re.sub(
    r'(maxStockQty:\s*p\.maxStockQty\s*\?\s*p\.maxStockQty\.toString\(\)\s*:\s*\'1000\')(\s*\})',
    r'\1,\n                                  pricePerKilo: p.pricePerKilo ? p.pricePerKilo.toString() : \'0\'\2',
    text
)

# 5. Add Input Field to Customer Form (in the UI)
customer_input = """
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-slate-300 text-xs font-bold flex items-center gap-1.5"><BadgeDollarSignIcon size={14} /> رصيد أول المدة (مديونية سابقة)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-entlaq-primary transition-colors"
                    placeholder="رصيد أول المدة..."
                    value={customerForm.openingBalance}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}
                  />
                </div>
"""
# insert before Save button in Customer modal
text = text.replace(
    '                {/* أزرار الحفظ والإلغاء */}',
    customer_input + '\n                {/* أزرار الحفظ والإلغاء */}'
)


# 6. Add Input Field to Product Form (in the UI)
product_input = """
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-bold">سعر الكيلو (إن وجد)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="سعر الكيلو..."
                      value={productForm.pricePerKilo}
                      onChange={(e) => setProductForm(prev => ({ ...prev, pricePerKilo: e.target.value }))}
                    />
                  </div>
"""
# insert after maxStockQty in Product modal
text = text.replace(
    """                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-bold">الحد الأقصى للمخزون</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="أقصى كمية..."
                      value={productForm.maxStockQty}
                      onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}
                    />
                  </div>""",
    """                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-bold">الحد الأقصى للمخزون</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="أقصى كمية..."
                      value={productForm.maxStockQty}
                      onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}
                    />
                  </div>""" + product_input
)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('UI and State logic patched successfully.')
