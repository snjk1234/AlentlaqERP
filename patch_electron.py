import sys
import re

# 1. Update preload.js
with open('electron/preload.js', 'r', encoding='utf-8') as f:
    preload_content = f.read()

new_preload_methods = """  getExpenses: () => ipcRenderer.invoke('get-expenses'),
  createExpense: (expenseData) => ipcRenderer.invoke('create-expense', expenseData),
  
  getExpenseCategories: () => ipcRenderer.invoke('get-expense-categories'),
  createExpenseCategory: (categoryData) => ipcRenderer.invoke('create-expense-category', categoryData),
  
  getGeneralExpenses: () => ipcRenderer.invoke('get-general-expenses'),
  createGeneralExpense: (expenseData) => ipcRenderer.invoke('create-general-expense', expenseData),"""

preload_content = preload_content.replace(
    "  getExpenses: () => ipcRenderer.invoke('get-expenses'),\n  createExpense: (expenseData) => ipcRenderer.invoke('create-expense', expenseData),",
    new_preload_methods
)

with open('electron/preload.js', 'w', encoding='utf-8') as f:
    f.write(preload_content)


# 2. Update main.js
with open('electron/main.js', 'r', encoding='utf-8') as f:
    main_content = f.read()

new_main_methods = """// General Expenses IPC
ipcMain.handle('get-expense-categories', async () => {
  try {
    return await prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching expense categories:', err);
    throw err;
  }
});

ipcMain.handle('create-expense-category', async (event, categoryData) => {
  try {
    return await prisma.expenseCategory.create({
      data: {
        name: categoryData.name
      }
    });
  } catch (err) {
    console.error('Error creating expense category:', err);
    throw err;
  }
});

ipcMain.handle('get-general-expenses', async () => {
  try {
    return await prisma.generalExpense.findMany({
      include: {
        category: true,
        bank: true
      },
      orderBy: { date: 'desc' }
    });
  } catch (err) {
    console.error('Error fetching general expenses:', err);
    throw err;
  }
});

ipcMain.handle('create-general-expense', async (event, expenseData) => {
  const { categoryId, bankId, amount, notes, reference } = expenseData;
  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.generalExpense.count();
      const expenseNumber = `GEXP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const expense = await tx.generalExpense.create({
        data: {
          expenseNumber,
          categoryId,
          bankId,
          amount: Number(amount),
          reference: reference || null,
          notes: notes || null
        },
        include: {
          category: true,
          bank: true
        }
      });

      // Decrement bank balance
      await tx.bank.update({
        where: { id: bankId },
        data: { balance: { decrement: Number(amount) } }
      });

      return expense;
    }, { timeout: 20000, maxWait: 20000 });
  } catch (err) {
    console.error('Error creating general expense native:', err);
    throw err;
  }
});

// Users Management IPC"""

main_content = main_content.replace("// Users Management IPC", new_main_methods)

with open('electron/main.js', 'w', encoding='utf-8') as f:
    f.write(main_content)

print("Electron patches applied.")
