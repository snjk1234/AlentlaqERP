import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace <div className="grid grid-cols-2 gap-2"> with <div className="grid grid-cols-3 gap-2"> 
# IF it is followed by الطول block
pattern = r'(<div className="grid) grid-cols-2 (gap-2">\s*<div className="space-y-1">\s*<label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الطول)'
replacement = r'\1 grid-cols-3 \2'

text = re.sub(pattern, replacement, text, flags=re.DOTALL)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Grid updated successfully.")
