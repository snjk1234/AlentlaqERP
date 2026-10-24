import re

def patch_navigation():
    with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
        text = f.read()

    new_tab = """          {isRoleAllowed('EXPENSES') && (
            <button
              onClick={() => setActiveTab('GENERAL_EXPENSES')}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'GENERAL_EXPENSES' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <ReceiptIcon className="h-5 w-5" />
              <span>المصروفات العامة</span>
            </button>
          )}

"""

    target = "          {isRoleAllowed('EXPENSES') && ("

    if "GENERAL_EXPENSES" not in text:
        text = text.replace(target, new_tab + target, 1)
        with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
            f.write(text)
        print("Navigation tab injected.")
    else:
        print("Navigation tab already injected.")

patch_navigation()
