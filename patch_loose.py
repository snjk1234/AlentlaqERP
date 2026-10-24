import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix Edit Customer
text = re.sub(
    r'(customerType:\s*cust\.customerType\s*\|\|\s*\'CASH\',\s*discount:\s*cust\.discount\s*\?\s*cust\.discount\.toString\(\)\s*:\s*\'0\')(\s*\})',
    r'\1,\n                                    openingBalance: cust.openingBalance ? cust.openingBalance.toString() : \'0\'\2',
    text
)

# Fix Edit Product
text = re.sub(
    r'(minStockQty:\s*p\.minStockQty\s*\?\s*p\.minStockQty\.toString\(\)\s*:\s*\'10\',\s*maxStockQty:\s*p\.maxStockQty\s*\?\s*p\.maxStockQty\.toString\(\)\s*:\s*\'1000\')(\s*\})',
    r'\1,\n                                    pricePerKilo: p.pricePerKilo ? p.pricePerKilo.toString() : \'0\'\2',
    text
)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Done fixing edits.')
