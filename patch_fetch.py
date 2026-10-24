import re

def patch_fetch():
    with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    new_fetch_funcs = """
  const fetchGeneralExpenses = () => {
    fetch('/api/general-expenses')
      .then(res => res.json())
      .then(data => setGeneralExpenses(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  const fetchExpenseCategories = () => {
    fetch('/api/expense-categories')
      .then(res => res.json())
      .then(data => setExpenseCategories(Array.isArray(data) ? data : []))
      .catch(console.error);
  };
"""

    if "fetchGeneralExpenses" not in text:
        # Insert after fetchExpenses
        text = text.replace("  const fetchExpenses = () => {", new_fetch_funcs + "\n  const fetchExpenses = () => {")

    # Insert into useEffect
    if "fetchGeneralExpenses();" not in text:
        text = text.replace("      fetchExpenses();", "      fetchExpenses();\n      fetchGeneralExpenses();\n      fetchExpenseCategories();")

    # Clear search query on tab change
    if "setGeneralExpenseSearch('');" not in text:
        text = text.replace("    setExpenseSearch('');", "    setExpenseSearch('');\n    setGeneralExpenseSearch('');")

    with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
        f.write(text)
    
    print("Fetch logic injected.")

patch_fetch()
