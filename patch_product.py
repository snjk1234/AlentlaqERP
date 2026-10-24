import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix any remaining maxStockQty: '1000' that is NOT followed by pricePerKilo
text = re.sub(
    r"(maxStockQty:\s*'1000')(\s*\})",
    r"\1,\n                      pricePerKilo: '0'\2",
    text
)

text = re.sub(
    r"(maxStockQty:\s*'1000')(\s*\}\);)",
    r"\1,\n                      pricePerKilo: '0'\2",
    text
)

# And also let's just make sure we didn't miss it in a multi-line format
with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Done fixing remaining products.')
