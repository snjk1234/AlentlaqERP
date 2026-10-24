import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

for i in range(len(lines)):
    line = lines[i]

    # 1. Initial Customer Form (around line 280-300)
    if "discount: '0'" in line and i < 300:
        lines[i] = line.replace("discount: '0'", "discount: '0',\n    openingBalance: '0'")

    # 2. Initial Product Form (around line 300-330)
    if "maxStockQty: '1000'" in line and i < 330:
        lines[i] = line.replace("maxStockQty: '1000'", "maxStockQty: '1000',\n    pricePerKilo: '0'")

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print('Initial states successfully updated.')
