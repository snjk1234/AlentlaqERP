export type PricingLine = { productId: string; quantity: string; unitPrice: string };
export type QuotationCosts = { costs: { productId: string; costPrice: number | null }[]; checkedAt: string };
export type PricingUser = { role: string; sessionToken?: string };
export const roundPrice = (value: number) => Number(value.toFixed(2));
const valid = (text: string) => text.trim() !== '' && Number.isFinite(Number(text));

export function quotationAnalysis(lines: PricingLine[], data: QuotationCosts) {
  const rows = lines.map(line => {
    const quantity = valid(line.quantity) && Number.isInteger(Number(line.quantity)) && Number(line.quantity) > 0 && Number(line.quantity) <= 2147483647
      ? Number(line.quantity) : null;
    const price = valid(line.unitPrice) && Number(line.unitPrice) >= 0 ? Number(line.unitPrice) : null;
    const found = data.costs.find(cost => cost.productId === line.productId)?.costPrice;
    const cost = typeof found === 'number' && Number.isFinite(found) && found > 0 ? found : null;
    const revenue = quantity !== null && price !== null ? roundPrice(quantity * price) : null;
    const costTotal = quantity !== null && cost !== null ? roundPrice(quantity * cost) : null;
    const profit = revenue !== null && costTotal !== null ? roundPrice(revenue - costTotal) : null;
    return {
      ...line, cost, revenue, costTotal, profit,
      unitProfit: price !== null && cost !== null ? roundPrice(price - cost) : null,
      markup: price !== null && cost !== null ? (price - cost) / cost * 100 : null,
      belowCost: price !== null && cost !== null && price < cost
    };
  });
  const total = (key: 'revenue' | 'costTotal' | 'profit') => rows.length && rows.every(row => row[key] !== null && Number.isFinite(row[key]))
    ? roundPrice(rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)) : null;
  const cost = total('costTotal');
  const profit = total('profit');
  return {
    rows, cost, profit, revenue: total('revenue'),
    markup: cost !== null && cost > 0 && profit !== null ? profit / cost * 100 : null,
    missing: rows.filter(row => row.cost === null).length,
    belowCost: rows.filter(row => row.belowCost).length
  };
}

export function priceFromProfit(cost: number | null, value: string, mode: 'markup' | 'unitProfit') {
  if (cost === null || !Number.isFinite(cost) || cost <= 0) throw new Error('تكلفة الصنف غير متاحة. حدّث سعر التكلفة في المخزون أولًا.');
  if (!valid(value)) throw new Error('أدخل قيمة ربح صالحة.');
  const price = mode === 'markup' ? cost * (1 + Number(value) / 100) : cost + Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 1e12) throw new Error('الربح المدخل ينتج سعر بيع غير صالح أو سالب.');
  return String(roundPrice(price));
}

export function priceQuotation(lines: PricingLine[], data: QuotationCosts, locked: Set<string>, value: string, mode: 'markup' | 'totalProfit') {
  if (!lines.length) throw new Error('أضف صنفًا واحدًا على الأقل.');
  if (!valid(value)) throw new Error('أدخل نسبة أو مبلغ ربح صالحًا.');
  const analysis = quotationAnalysis(lines, data);
  if (analysis.rows.some(row => row.revenue === null || row.costTotal === null || !Number.isFinite(row.revenue) || !Number.isFinite(row.costTotal))) {
    throw new Error('أكمل الكميات والأسعار والتكاليف لجميع البنود أولًا.');
  }
  const unlocked = analysis.rows.filter(row => !locked.has(row.productId));
  if (!unlocked.length) throw new Error('جميع الأسعار مثبتة. ألغِ تثبيت صنف واحد على الأقل.');
  if (mode === 'markup') {
    return analysis.rows.map((row, index) => locked.has(row.productId) ? { ...lines[index] }
      : { ...lines[index], unitPrice: priceFromProfit(row.cost, value, 'markup') });
  }
  const fixedProfit = analysis.rows.filter(row => locked.has(row.productId)).reduce((sum, row) => sum + (row.profit ?? 0), 0);
  const availableCost = unlocked.reduce((sum, row) => sum + (row.costTotal ?? 0), 0);
  const target = Number(value);
  if (!Number.isFinite(availableCost) || availableCost <= 0 || Math.abs(target) > 1e12) throw new Error('تعذر توزيع الربح المطلوب على تكاليف البنود.');
  const markup = (target - fixedProfit) / availableCost * 100;
  return analysis.rows.map((row, index) => locked.has(row.productId) ? { ...lines[index] } : {
    ...lines[index], unitPrice: priceFromProfit(row.cost, String(markup), 'markup')
  });
}

export async function loadQuotationCosts(user: PricingUser, productIds: string[]): Promise<QuotationCosts> {
  if (user.role !== 'ADMIN') throw new Error('تحليل أرباح عرض السعر متاح للمدير فقط.');
  const bridge = (window as Window & { electronAPI?: { quotationCosts: (data: { productIds: string[] }) => Promise<QuotationCosts> } }).electronAPI;
  if (bridge) return bridge.quotationCosts({ productIds });
  const response = await fetch('/api/quotation-costs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.sessionToken || ''}` },
    body: JSON.stringify({ productIds }), cache: 'no-store', signal: AbortSignal.timeout(30000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر تحميل تكاليف الأصناف.');
  return result;
}

export async function confirmQuotationProfit(user: PricingUser, lines: PricingLine[]) {
  const costs = await loadQuotationCosts(user, lines.map(line => line.productId));
  const analysis = quotationAnalysis(lines, costs);
  if (analysis.rows.some(row => row.revenue === null || !Number.isFinite(row.revenue))) throw new Error('كميات أو أسعار عرض السعر غير صالحة.');
  if (analysis.missing && !window.confirm(`تكلفة ${analysis.missing} صنف غير متاحة؛ لا يمكن حساب ربح العرض كاملًا. متابعة بالأسعار المدخلة؟`)) return false;
  if (analysis.belowCost && !window.confirm(`تنبيه: ${analysis.belowCost} صنف يباع بأقل من التكلفة الحالية. هل تؤكد المتابعة بالخسارة؟`)) return false;
  return true;
}
