import re

def patch_modals():
    with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    new_modals = """
      {/* General Expense Modal */}
      {showGeneralExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-md w-full max-w-lg shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">
              تسجيل مصروف عام
            </h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await fetch('/api/general-expenses', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(generalExpenseForm)
                });
                if (!res.ok) {
                  const error = await res.json();
                  alert(error.error || 'حدث خطأ أثناء الحفظ');
                  return;
                }
                setShowGeneralExpenseModal(false);
                setGeneralExpenseForm({ categoryId: '', bankId: '', amount: '', notes: '', reference: '' });
                fetchGeneralExpenses();
                fetchBanks();
              } catch (err) {
                console.error(err);
                alert('حدث خطأ');
              }
            }} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">التصنيف *</label>
                  <select
                    required
                    value={generalExpenseForm.categoryId}
                    onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, categoryId: e.target.value }))}
                    className="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="">-- اختر التصنيف --</option>
                    {expenseCategories.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">يخصم من (البنك/الخزينة) *</label>
                  <select
                    required
                    value={generalExpenseForm.bankId}
                    onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, bankId: e.target.value }))}
                    className="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="">-- اختر الحساب --</option>
                    {banks.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name} (الرصيد: {Number(b.balance).toLocaleString()})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">المبلغ *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={generalExpenseForm.amount}
                    onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    placeholder="المبلغ..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رقم المرجع / الفاتورة</label>
                  <input
                    type="text"
                    value={generalExpenseForm.reference}
                    onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    placeholder="اختياري"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 text-slate-300">البيان / ملاحظات</label>
                <textarea
                  rows={3}
                  value={generalExpenseForm.notes}
                  onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                  placeholder="اكتب تفاصيل المصروف هنا..."
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-1.5">
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600/80 hover:bg-emerald-600 text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center transition-all cursor-pointer shadow-lg shadow-emerald-900/20"
                >
                  <SaveIcon size={16} />
                  <span>حفظ واعتماد</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGeneralExpenseModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-sm font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Category Modal */}
      {showExpenseCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-md w-full max-w-lg shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">
              إدارة تصنيفات المصروفات
            </h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await fetch('/api/expense-categories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(expenseCategoryForm)
                });
                if (!res.ok) {
                  const error = await res.json();
                  alert(error.error || 'حدث خطأ');
                  return;
                }
                setExpenseCategoryForm({ name: '' });
                fetchExpenseCategories();
              } catch (err) {
                console.error(err);
              }
            }} className="flex gap-2 mb-6">
              <input
                type="text"
                required
                value={expenseCategoryForm.name}
                onChange={(e) => setExpenseCategoryForm({ name: e.target.value })}
                className="flex-1 bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                placeholder="اسم التصنيف الجديد (مثال: رواتب، إيجار)..."
              />
              <button
                type="submit"
                className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-4 py-2 rounded-sm font-bold transition-all cursor-pointer shadow-lg shadow-emerald-900/20 text-xs flex gap-1.5 items-center"
              >
                <PlusIcon size={14} />
                إضافة
              </button>
            </form>

            <div className="bg-black/20 border border-white/5 rounded-sm max-h-64 overflow-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-white/5 text-slate-300 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">التصنيف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {expenseCategories.map((c: any) => (
                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-200">{c.name}</td>
                    </tr>
                  ))}
                  {expenseCategories.length === 0 && (
                    <tr>
                      <td className="py-4 text-center text-slate-500">لا توجد تصنيفات بعد</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 mt-6 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowExpenseCategoryModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-sm font-bold transition-all cursor-pointer text-sm"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

"""

    target = "      {showProductModal && selectedProduct && ("

    if "General Expense Modal" not in text:
        text = text.replace(target, new_modals + target, 1)
        with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
            f.write(text)
        print("Modals injected.")
    else:
        print("Modals already injected.")

patch_modals()
