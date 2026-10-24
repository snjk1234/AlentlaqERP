import re

def patch_content():
    with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    new_content = """
        {/* TAB 10: GENERAL_EXPENSES */}
        {activeTab === 'GENERAL_EXPENSES' && (
          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">المصروفات العامة</h2>
                <p className="text-xs text-slate-400 mt-0.5">تسجيل المصروفات التشغيلية والإدارية المتنوعة</p>
              </div>
              <button
                onClick={() => setShowExpenseCategoryModal(true)}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-3 py-2 rounded-sm font-bold text-xs transition-all duration-300 cursor-pointer shadow-lg"
              >
                إدارة التصنيفات
              </button>
            </div>

            <div className="flex gap-1.5 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input
                  type="text"
                  value={generalExpenseSearch}
                  onChange={(e) => setGeneralExpenseSearch(e.target.value)}
                  placeholder="ابحث برقم السند أو التصنيف..."
                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {generalExpenseSearch && (
                  <button
                    onClick={() => setGeneralExpenseSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setGeneralExpenseForm({ categoryId: '', bankId: '', amount: '', notes: '', reference: '' });
                  setShowGeneralExpenseModal(true);
                }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon size={14} />
                <span>إضافة مصروف</span>
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-sm border border-white/10 shadow-lg bg-slate-900/50">
              <table className="w-full text-right text-xs">
                <thead className="bg-white/5 text-slate-300 sticky top-0 backdrop-blur-md z-10 border-b border-white/10">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">رقم السند</th>
                    <th className="py-2.5 px-3 font-semibold">التاريخ</th>
                    <th className="py-2.5 px-3 font-semibold">التصنيف</th>
                    <th className="py-2.5 px-3 font-semibold">البنك/الخزينة</th>
                    <th className="py-2.5 px-3 font-semibold">المبلغ</th>
                    <th className="py-2.5 px-3 font-semibold">المرجع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {generalExpenses.filter((e: any) => 
                    (e.expenseNumber?.toLowerCase().includes(generalExpenseSearch.toLowerCase()) || '') ||
                    (e.category?.name?.toLowerCase().includes(generalExpenseSearch.toLowerCase()) || '')
                  ).map((e: any) => (
                    <tr key={e.id} className="hover:bg-white/5 transition-colors group">
                      <td className="py-2.5 px-3 font-mono text-emerald-400">{e.expenseNumber}</td>
                      <td className="py-2.5 px-3">{new Date(e.date).toLocaleDateString('ar-SA')}</td>
                      <td className="py-2.5 px-3">{e.category?.name}</td>
                      <td className="py-2.5 px-3 text-slate-400">{e.bank?.name}</td>
                      <td className="py-2.5 px-3 font-bold text-red-400">{Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-slate-500">{e.reference || '-'}</td>
                    </tr>
                  ))}
                  {generalExpenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        لا توجد مصروفات عامة مسجلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

"""

    target = "        {/* TAB 9: EXPENSES */}"

    if "TAB 10: GENERAL_EXPENSES" not in text:
        text = text.replace(target, new_content + target)
        with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
            f.write(text)
        print("Content tab injected.")
    else:
        print("Content tab already injected.")

patch_content()
