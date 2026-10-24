import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Insert Customer openingBalance UI
# The comment is: {/* أزرار الحفظ والإلغاء */}
# We need to insert our UI right before this comment, but ONLY inside the customer form.
# The customer form has a discount input. We can just insert it after the discount input block!

customer_ui = """                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة (مديونية سابقة)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                    placeholder="رصيد أول المدة..."
                    value={customerForm.openingBalance}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}
                  />"""

# Replace the discount block end `</div>` with `</div>\n\n` + customer_ui
# But how to find the discount block end exactly?
discount_target = """                    onChange={(e) => setCustomerForm(prev => ({ ...prev, discount: e.target.value }))}

                    placeholder="مثال: 10"

                    className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"

                  />

                </div>"""

text = text.replace(discount_target, discount_target + "\n" + customer_ui)


# 2. Insert Product pricePerKilo UI
# Inside product form, we find the maxStockQty block end.
product_ui = """                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الكيلو (إن وجد)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                    placeholder="سعر الكيلو..."
                    value={productForm.pricePerKilo}
                    onChange={(e) => setProductForm(prev => ({ ...prev, pricePerKilo: e.target.value }))}
                  />"""

maxstock_target = """                    onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}

                    placeholder="مثال: 1000"

                    className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"

                  />

                </div>"""

text = text.replace(maxstock_target, maxstock_target + "\n" + product_ui)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('UI injected successfully.')
