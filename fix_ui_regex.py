import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# I want to find the UI block for openingBalance.
# 1. Change <div className="space-y-1 col-span-2"> to <div className="space-y-1">
text = re.sub(
    r'<div className="space-y-1 col-span-2">(\s*)<label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة \(مديونية سابقة\)</label>',
    r'<div className="space-y-1">\1<label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة</label>',
    text
)

# 2. To put it inside the same grid, I need to remove the closing </div></div> that precedes it,
#    and put ONE </div> AFTER the openingBalance block.
# Let's find the closing of the discount input which precedes it.
# We have:
# onChange={(e) => setCustomerForm(prev => ({ ...prev, discount: e.target.value }))}
# ...
# </div>
# </div>
# <div className="space-y-1"> (this is the new openingBalance div)

# Let's match the discount block end and the opening balance block start.
pattern = r'(onChange=\{\(e\) => setCustomerForm\(prev => \(\{ \.\.\.prev, discount: e\.target\.value \}\)\)\}.*?/>\s*</div>\s*)</div>(\s*<div className="space-y-1">)'
replacement = r'\1\2'

text = re.sub(pattern, replacement, text, flags=re.DOTALL)

# Now we need to close the grid AFTER openingBalance block.
# openingBalance block ends with:
# onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}
# />
# </div>
# We need to add one more </div> after it to close the grid.
pattern2 = r'(onChange=\{\(e\) => setCustomerForm\(prev => \(\{ \.\.\.prev, openingBalance: e\.target\.value \}\)\)\}.*?/>\s*</div>)'
replacement2 = r'\1\n              </div>'

text = re.sub(pattern2, replacement2, text, flags=re.DOTALL)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("UI replaced with regex.")
