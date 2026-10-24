import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Change customer form grid from 3 to 4
text = text.replace('<div className="grid grid-cols-3 gap-2">', '<div className="grid grid-cols-4 gap-2">')

# 2. Insert pricePerKilo after maxStockQty in product form
product_ui = """                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الكيلو (إن وجد)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-xs"
                    placeholder="سعر الكيلو..."
                    value={productForm.pricePerKilo}
                    onChange={(e) => setProductForm(prev => ({ ...prev, pricePerKilo: e.target.value }))}
                  />"""

# Let's match maxStockQty input div using regex
# onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}
# ...
# </div>
pattern = r'(onChange=\{\(e\) => setProductForm\(prev => \(\{ \.\.\.prev, maxStockQty: e\.target\.value \}\)\)\}.*?/>\s*</div>)'
replacement = r'\1\n' + product_ui

# Note: this might match multiple if there are multiple, but there is only one maxStockQty input.
if "setProductForm(prev => ({ ...prev, pricePerKilo:" not in text:
    text = re.sub(pattern, replacement, text, flags=re.DOTALL)
    print("Injected pricePerKilo.")
else:
    print("pricePerKilo already exists in the file.")

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
