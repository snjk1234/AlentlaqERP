const fs = require('fs');

let lines = fs.readFileSync('src/app/page.tsx', 'utf8').split('\n');

// 1. Edit Customer (line 1992-2002)
let outLines = [];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('discount: cust.discount ? cust.discount.toString() : \'0\'') && lines[i].includes('}')) {
       // it's a one liner, but wait, it's NOT a one liner.
    }
    
    // Edit Customer
    if (lines[i].includes('discount: cust.discount ? cust.discount.toString() : \'0\'') && !lines[i].includes('}')) {
        outLines.push(lines[i] + ',');
        outLines.push('                                  openingBalance: cust.openingBalance ? cust.openingBalance.toString() : \'0\'');
    }
    // Edit Product
    else if (lines[i].includes('maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : \'1000\'') && !lines[i].includes('}')) {
        outLines.push(lines[i] + ',');
        outLines.push('                                  pricePerKilo: p.pricePerKilo ? p.pricePerKilo.toString() : \'0\'');
    }
    // Add Customer Form UI
    else if (lines[i].includes('{/* أزرار الحفظ والإلغاء */}')) {
        // Only if we are inside the customer modal? 
        // Wait, {/* أزرار الحفظ والإلغاء */} is used in MULTIPLE modals!
        // We only want to inject it in the customer modal.
        // How do we know it's the customer modal? 
        // We can check if previous lines have "نوع العميل".
        let isCustomerModal = false;
        for (let j = 1; j < 20; j++) {
            if (i - j >= 0 && lines[i-j].includes('نسبة الخصم %')) {
                isCustomerModal = true;
                break;
            }
        }
        
        let isProductModal = false;
        for (let j = 1; j < 20; j++) {
            if (i - j >= 0 && lines[i-j].includes('الحد الأقصى للمخزون')) {
                isProductModal = true;
                break;
            }
        }

        if (isCustomerModal) {
            outLines.push(`                <div className="flex flex-col gap-1.5 col-span-2">
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
                </div>`);
        }
        
        outLines.push(lines[i]);
    }
    // Add Product Form UI
    else if (lines[i].includes('onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}')) {
        outLines.push(lines[i]);
        // insert the rest of the maxStockQty div then our new div
        outLines.push(lines[i+1]); // "                    />"
        outLines.push(lines[i+2]); // "                  </div>"
        
        outLines.push(`                  <div className="flex flex-col gap-1.5">
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
                  </div>`);
                  
        i += 2; // skip the lines we manually pushed
    }
    else {
        outLines.push(lines[i]);
    }
}

fs.writeFileSync('src/app/page.tsx', outLines.join('\n'));
console.log('Done.');
