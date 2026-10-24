import re

def patch_states():
    with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    new_states = """  const [expenseSearch, setExpenseSearch] = useState('');
  
  // GENERAL EXPENSES STATE
  const [generalExpenses, setGeneralExpenses] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [generalExpenseSearch, setGeneralExpenseSearch] = useState('');
  const [showGeneralExpenseModal, setShowGeneralExpenseModal] = useState(false);
  const [showExpenseCategoryModal, setShowExpenseCategoryModal] = useState(false);
  const [generalExpenseForm, setGeneralExpenseForm] = useState({ categoryId: '', bankId: '', amount: '', reference: '', notes: '' });
  const [expenseCategoryForm, setExpenseCategoryForm] = useState({ name: '' });
"""
    if "GENERAL EXPENSES STATE" not in text:
        text = text.replace("  const [expenseSearch, setExpenseSearch] = useState('');", new_states)
        with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
            f.write(text)
        print("States injected successfully.")
    else:
        print("States already injected.")

patch_states()
