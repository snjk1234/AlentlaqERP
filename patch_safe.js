const fs = require('fs');

let text = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Initial State Hooks
text = text.replace(
  "    customerType: 'CASH',\r\n    discount: '0'\r\n  });",
  "    customerType: 'CASH',\r\n    discount: '0',\r\n    openingBalance: '0'\r\n  });"
);

text = text.replace(
  "    customerType: 'CASH',\n    discount: '0'\n  });",
  "    customerType: 'CASH',\n    discount: '0',\n    openingBalance: '0'\n  });"
);

text = text.replace(
  "    minStockQty: '10',\r\n    maxStockQty: '1000'\r\n  });",
  "    minStockQty: '10',\r\n    maxStockQty: '1000',\r\n    pricePerKilo: '0'\r\n  });"
);

text = text.replace(
  "    minStockQty: '10',\n    maxStockQty: '1000'\n  });",
  "    minStockQty: '10',\n    maxStockQty: '1000',\n    pricePerKilo: '0'\n  });"
);

// 2. Add Button for Customer
text = text.replace(
  "setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0' });",
  "setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0', openingBalance: '0' });"
);
// replace all occurrences of the one-liner
text = text.replaceAll(
  "setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0' });",
  "setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0', openingBalance: '0' });"
);

// 3. Edit Button for Customer (Block replacement)
const editCustomerSearch = `                                  customerType: cust.customerType || 'CASH',
                                  discount: cust.discount ? cust.discount.toString() : '0'
                                });`;

const editCustomerReplace = `                                  customerType: cust.customerType || 'CASH',
                                  discount: cust.discount ? cust.discount.toString() : '0',
                                  openingBalance: cust.openingBalance ? cust.openingBalance.toString() : '0'
                                });`;
text = text.replace(editCustomerSearch, editCustomerReplace);
// try with \r\n
text = text.replace(editCustomerSearch.replaceAll('\n', '\r\n'), editCustomerReplace.replaceAll('\n', '\r\n'));

// 4. Add Button for Product (Block replacement)
const addProductSearch = `                      stockQty: '',
                      minStockQty: '10',
                      maxStockQty: '1000'
                    });`;
const addProductReplace = `                      stockQty: '',
                      minStockQty: '10',
                      maxStockQty: '1000',
                      pricePerKilo: '0'
                    });`;
text = text.replace(addProductSearch, addProductReplace);
text = text.replace(addProductSearch.replaceAll('\n', '\r\n'), addProductReplace.replaceAll('\n', '\r\n'));

// 5. Edit Button for Product (Block replacement)
const editProductSearch = `                                  stockQty: p.stockQty ? p.stockQty.toString() : '0',
                                  minStockQty: p.minStockQty ? p.minStockQty.toString() : '10',
                                  maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000'
                                });`;
const editProductReplace = `                                  stockQty: p.stockQty ? p.stockQty.toString() : '0',
                                  minStockQty: p.minStockQty ? p.minStockQty.toString() : '10',
                                  maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000',
                                  pricePerKilo: p.pricePerKilo ? p.pricePerKilo.toString() : '0'
                                });`;
text = text.replace(editProductSearch, editProductReplace);
text = text.replace(editProductSearch.replaceAll('\n', '\r\n'), editProductReplace.replaceAll('\n', '\r\n'));

// 6. UI for Customer openingBalance
const customerUI = `                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-slate-300 text-xs font-bold flex items-center gap-1.5"><BadgeDollarSignIcon size={14} /> رصيد أول المدة (مديونية سابقة)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-entlaq-primary transition-colors"
                    placeholder="رصيد أول المدة..."
                    value={customerForm.openingBalance}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}
                  />
                </div>
                {/* أزرار الحفظ والإلغاء */}`;
                
text = text.replace('                {/* أزرار الحفظ والإلغاء */}', customerUI);

// 7. UI for Product pricePerKilo
const productUI = `                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-bold">الحد الأقصى للمخزون</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="أقصى كمية..."
                      value={productForm.maxStockQty}
                      onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-bold">سعر الكيلو (إن وجد)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="سعر الكيلو..."
                      value={productForm.pricePerKilo}
                      onChange={(e) => setProductForm(prev => ({ ...prev, pricePerKilo: e.target.value }))}
                    />
                  </div>`;
text = text.replace(
`                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-bold">الحد الأقصى للمخزون</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                      placeholder="أقصى كمية..."
                      value={productForm.maxStockQty}
                      onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}
                    />
                  </div>`, productUI);

text = text.replace(
`                  <div className="flex flex-col gap-1.5">\r
                    <label className="text-slate-300 text-xs font-bold">الحد الأقصى للمخزون</label>\r
                    <input\r
                      type="number"\r
                      min="0"\r
                      className="w-full bg-black/50 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"\r
                      placeholder="أقصى كمية..."\r
                      value={productForm.maxStockQty}\r
                      onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}\r
                    />\r
                  </div>`, productUI.replaceAll('\n', '\r\n'));

fs.writeFileSync('src/app/page.tsx', text);
console.log('Done mapping.');
