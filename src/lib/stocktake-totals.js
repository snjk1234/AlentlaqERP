function stocktakeTotals(items) {
  let shortage = 0;
  let surplus = 0;
  let unvalued = 0;
  for (const item of items) {
    if (item.countedQty === null || item.countedQty === undefined || String(item.countedQty).trim() === '') continue;
    const cost = item.unitCost;
    const counted = Number(item.countedQty);
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || !Number.isInteger(counted) || counted < 0) {
      unvalued += 1;
      continue;
    }
    const value = Math.round((counted - item.bookQty) * cost * 100) / 100;
    if (value < 0) shortage -= value;
    else surplus += value;
  }
  shortage = Number(shortage.toFixed(2));
  surplus = Number(surplus.toFixed(2));
  return { shortage, surplus, net: Number((surplus - shortage).toFixed(2)), unvalued };
}

module.exports = { stocktakeTotals };
