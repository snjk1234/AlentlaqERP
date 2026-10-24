import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove the old pricePerKilo block
# The block looks like this:
old_block_pattern = r'(\s*<div className="space-y-1">\s*<label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الكيلو \(إن وجد\)</label>\s*<input\s*type="number"\s*min="0"\s*step="0\.01"\s*className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-xs"\s*placeholder="سعر الكيلو\.\.\."\s*value=\{productForm\.pricePerKilo\}\s*onChange=\{\(e\) => setProductForm\(prev => \(\{ \.\.\.prev, pricePerKilo: e\.target\.value \}\)\)\}\s*/>\s*</div>)'
text = re.sub(old_block_pattern, '', text)

# 2. Add it next to weight
# Change <div className="grid grid-cols-2 gap-2"> that contains weight to grid-cols-3
# Let's find the grid containing weight
grid_weight_pattern = r'(<div className="grid grid-cols-2 gap-2">)(\s*<div className="space-y-1">\s*<label.*?الطول.*?</label>.*?</label>.*?onChange=\{\(e\) => setProductForm\(prev => \(\{ \.\.\.prev, weight: e\.target\.value \}\)\)\}.*?/>\s*</div>)'

new_price_block = """

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الكيلو</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    placeholder="سعر الكيلو..."
                    value={productForm.pricePerKilo}
                    onChange={(e) => setProductForm(prev => ({ ...prev, pricePerKilo: e.target.value }))}
                  />
                </div>"""

text = re.sub(
    grid_weight_pattern, 
    r'<div className="grid grid-cols-3 gap-2">\2' + new_price_block, 
    text, 
    flags=re.DOTALL
)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Moved pricePerKilo successfully.")
