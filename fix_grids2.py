import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix the pricing row grid
pricing_pattern = r'(<div className="grid) grid-cols-4 (gap-2">\s*<div className="space-y-1">\s*<label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الشراء \(التكلفة\) \*)'
pricing_replacement = r'\1 grid-cols-3 \2'
text = re.sub(pricing_pattern, pricing_replacement, text, flags=re.DOTALL)

# Fix the stock row grid
stock_pattern = r'(<div className="grid) grid-cols-4 (gap-2">\s*<div className="space-y-1">\s*<label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الكمية الحالية \*)'
stock_replacement = r'\1 grid-cols-3 \2'
text = re.sub(stock_pattern, stock_replacement, text, flags=re.DOTALL)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Grids updated successfully.")
