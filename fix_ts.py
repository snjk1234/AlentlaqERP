import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add GENERAL_EXPENSES to the activeTab type
text = text.replace(
    "const [activeTab, setActiveTab] = useState<'POS' | 'CUSTOMERS' | 'INVENTORY' | 'BANKS' | 'PAYMENTS' | 'INVOICES' | 'SUPPLIERS' | 'PURCHASES' | 'EXPENSES'>('POS');",
    "const [activeTab, setActiveTab] = useState<'POS' | 'CUSTOMERS' | 'INVENTORY' | 'BANKS' | 'PAYMENTS' | 'INVOICES' | 'SUPPLIERS' | 'PURCHASES' | 'EXPENSES' | 'GENERAL_EXPENSES'>('POS');"
)

# 2. Replace SaveIcon with CheckCircle2Icon in the General Expense modal
text = text.replace("<SaveIcon size={16} />", "<CheckCircle2Icon size={16} />")

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("TypeScript errors fixed.")
