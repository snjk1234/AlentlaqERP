import sys

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    out_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # 1. customerForm state
        if "const [customerForm, setCustomerForm] = useState({" in line:
            out_lines.append(line)
            # Find the end of this useState block
            j = i + 1
            while "});" not in lines[j]:
                if "discount: '0'" in lines[j]:
                    out_lines.append(lines[j].replace("discount: '0'", "discount: '0',\n    openingBalance: '0'"))
                else:
                    out_lines.append(lines[j])
                j += 1
            out_lines.append(lines[j])
            i = j
            i += 1
            continue
            
        # 2. handleSaveCustomer formattedData
        if "const formattedData = {" in line and "customerForm" in lines[i+1]:
            out_lines.append(line)
            j = i + 1
            while "};" not in lines[j]:
                if "discount: parseFloat(customerForm.discount) || 0" in lines[j]:
                    out_lines.append(lines[j].replace(
                        "discount: parseFloat(customerForm.discount) || 0",
                        "discount: parseFloat(customerForm.discount) || 0,\n      openingBalance: parseFloat(customerForm.openingBalance) || 0"
                    ))
                else:
                    out_lines.append(lines[j])
                j += 1
            out_lines.append(lines[j])
            i = j
            i += 1
            continue

        # 3. setCustomerForm one liners
        if "setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0' });" in line:
            out_lines.append(line.replace(
                "discount: '0' });",
                "discount: '0', openingBalance: '0' });"
            ))
            i += 1
            continue

        # 4. remainingBalance
        if "const remainingBalance = totalSpent - totalPayments;" in line:
            out_lines.append(line.replace(
                "const remainingBalance = totalSpent - totalPayments;",
                "const remainingBalance = totalSpent - totalPayments + (cust.openingBalance || 0);"
            ))
            i += 1
            continue

        # 5. Edit customer
        if "discount: cust.discount ? cust.discount.toString() : '0'" in line and "});" in lines[i+1]:
            out_lines.append(line.replace(
                "discount: cust.discount ? cust.discount.toString() : '0'",
                "discount: cust.discount ? cust.discount.toString() : '0',\n                                  openingBalance: cust.openingBalance ? cust.openingBalance.toString() : '0'"
            ))
            i += 1
            continue
            
        # 6. openingBalance UI Input
        if '<label className="text-xs text-slate-400 block mb-1 text-slate-300">الخصم (%)</label>' in line:
            # We are at the discount field. Let's output it and its input.
            out_lines.append(line)
            j = i + 1
            while "</div>" not in lines[j]:
                out_lines.append(lines[j])
                j += 1
            out_lines.append(lines[j]) # the </div>
            
            # Now insert openingBalance field
            out_lines.append('                <div className="space-y-1">\n')
            out_lines.append('                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة (لك)</label>\n')
            out_lines.append('                  <input\n')
            out_lines.append('                    type="number"\n')
            out_lines.append('                    step="0.01"\n')
            out_lines.append('                    value={customerForm.openingBalance}\n')
            out_lines.append('                    onChange={(e) => setCustomerForm(prev => ({ ...prev, openingBalance: e.target.value }))}\n')
            out_lines.append('                    placeholder="0.00"\n')
            out_lines.append('                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"\n')
            out_lines.append('                  />\n')
            out_lines.append('                </div>\n')
            
            i = j
            i += 1
            continue

        # 7. productForm state
        if "const [productForm, setProductForm] = useState({" in line:
            out_lines.append(line)
            j = i + 1
            while "});" not in lines[j]:
                if "maxStockQty: '1000'" in lines[j]:
                    out_lines.append(lines[j].replace("maxStockQty: '1000'", "maxStockQty: '1000',\n    pricePerKilo: '0'"))
                else:
                    out_lines.append(lines[j])
                j += 1
            out_lines.append(lines[j])
            i = j
            i += 1
            continue

        # 8. setProductForm one liners
        if "maxStockQty: '1000'" in line and "});" in lines[i+1] and "minStockQty:" in lines[i-1]:
            out_lines.append(line.replace("maxStockQty: '1000'", "maxStockQty: '1000',\n                      pricePerKilo: '0'"))
            i += 1
            continue
            
        # 9. handleSaveProduct formattedData
        if "const formattedData = {" in line and "productForm" in lines[i+1]:
            out_lines.append(line)
            j = i + 1
            while "};" not in lines[j]:
                if "maxStockQty: parseInt(productForm.maxStockQty) || 1000" in lines[j]:
                    out_lines.append(lines[j].replace(
                        "maxStockQty: parseInt(productForm.maxStockQty) || 1000",
                        "maxStockQty: parseInt(productForm.maxStockQty) || 1000,\n      pricePerKilo: parseFloat(productForm.pricePerKilo) || 0"
                    ))
                else:
                    out_lines.append(lines[j])
                j += 1
            out_lines.append(lines[j])
            i = j
            i += 1
            continue
            
        # 10. Edit product
        if "maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000'" in line and "});" in lines[i+1]:
            out_lines.append(line.replace(
                "maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000'",
                "maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000',\n                                  pricePerKilo: p.pricePerKilo ? p.pricePerKilo.toString() : '0'"
            ))
            i += 1
            continue
            
        # 11. weight input field
        if '<label className="text-xs text-slate-400 block mb-1 text-slate-300">الوزن / السماكة</label>' in line:
            out_lines.append(line)
            # Find the input for weight and replace its onChange
            j = i + 1
            while "/>" not in lines[j]:
                if "onChange={(e) => setProductForm(prev => ({ ...prev, weight: e.target.value }))}" in lines[j]:
                    out_lines.append('                    onChange={(e) => {\n')
                    out_lines.append('                      const weightVal = e.target.value;\n')
                    out_lines.append('                      setProductForm(prev => {\n')
                    out_lines.append('                        const parsedWeight = parseFloat(weightVal) || 0;\n')
                    out_lines.append('                        const priceKilo = parseFloat(prev.pricePerKilo) || 0;\n')
                    out_lines.append('                        let newCost = prev.costPrice;\n')
                    out_lines.append('                        let newPrice = prev.price;\n')
                    out_lines.append('                        if (parsedWeight > 0 && priceKilo > 0) {\n')
                    out_lines.append('                          newCost = (parsedWeight * priceKilo).toFixed(2);\n')
                    out_lines.append('                          const markupRate = (parseFloat(prev.markup) || 30) / 100;\n')
                    out_lines.append('                          newPrice = (parseFloat(newCost) * (1 + markupRate)).toFixed(2);\n')
                    out_lines.append('                        }\n')
                    out_lines.append('                        return { ...prev, weight: weightVal, costPrice: newCost, price: newPrice };\n')
                    out_lines.append('                      });\n')
                    out_lines.append('                    }}\n')
                else:
                    out_lines.append(lines[j])
                j += 1
            out_lines.append(lines[j]) # the />
            out_lines.append(lines[j+1]) # the </div>
            
            # Now insert pricePerKilo field
            out_lines.append('                <div className="space-y-1">\n')
            out_lines.append('                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الكيلو (للحساب التلقائي)</label>\n')
            out_lines.append('                  <input\n')
            out_lines.append('                    type="number"\n')
            out_lines.append('                    step="0.01"\n')
            out_lines.append('                    value={productForm.pricePerKilo}\n')
            out_lines.append('                    onChange={(e) => {\n')
            out_lines.append('                      const priceKiloVal = e.target.value;\n')
            out_lines.append('                      setProductForm(prev => {\n')
            out_lines.append('                        const parsedWeight = parseFloat(prev.weight) || 0;\n')
            out_lines.append('                        const priceKilo = parseFloat(priceKiloVal) || 0;\n')
            out_lines.append('                        let newCost = prev.costPrice;\n')
            out_lines.append('                        let newPrice = prev.price;\n')
            out_lines.append('                        if (parsedWeight > 0 && priceKilo > 0) {\n')
            out_lines.append('                          newCost = (parsedWeight * priceKilo).toFixed(2);\n')
            out_lines.append('                          const markupRate = (parseFloat(prev.markup) || 30) / 100;\n')
            out_lines.append('                          newPrice = (parseFloat(newCost) * (1 + markupRate)).toFixed(2);\n')
            out_lines.append('                        }\n')
            out_lines.append('                        return { ...prev, pricePerKilo: priceKiloVal, costPrice: newCost, price: newPrice };\n')
            out_lines.append('                      });\n')
            out_lines.append('                    }}\n')
            out_lines.append('                    placeholder="مثال: 12.50"\n')
            out_lines.append('                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"\n')
            out_lines.append('                  />\n')
            out_lines.append('                </div>\n')
            
            i = j + 1
            i += 1
            continue

        out_lines.append(line)
        i += 1

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(out_lines)

patch_file('src/app/page.tsx')
print("Line-by-line patching completed successfully.")
