import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove mock users block
# Search for: setDbUsers([{ id: 'admin-id' ... }]);
text = re.sub(r'// Browser mock users.*?\]\);', '', text, flags=re.DOTALL)

# 2. Remove mockup auth block
# Search for: // Browser mockup auth ... } else { setActiveTab('POS'); }
auth_regex = r'// Browser mockup auth.*?setActiveTab\(\'POS\'\);\s*\}\s*\}'
text = re.sub(auth_regex, '', text, flags=re.DOTALL)

# 3. Remove fallback dummy products
prod_regex = r'// Fallback dummy products for web view.*?\n\s*\]\);'
text = re.sub(prod_regex, '', text, flags=re.DOTALL)

# 4. Remove fallback dummy customers
cust_regex = r'// Fallback dummy customers for web view.*?\n\s*\]\);'
text = re.sub(cust_regex, '', text, flags=re.DOTALL)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Mock data removed.")
