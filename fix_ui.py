import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# We need to find the specific block for the customer form.
search_str = """                    className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"

                  />

                </div>

                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة (مديونية سابقة)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                    placeholder="رصيد أول المدة..."
                    value={customerForm.openingBalance}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}
                  />

              </div>"""

replace_str = """                    className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"

                  />

                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                    placeholder="رصيد أول المدة..."
                    value={customerForm.openingBalance}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}
                  />

                </div>

              </div>"""

if search_str in text:
    text = text.replace(search_str, replace_str)
    with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Replaced successfully!")
else:
    print("Could not find the target string.")
