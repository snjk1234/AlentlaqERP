export function attachAccountDiscounts<
  Account extends { id: string },
  Discount extends { customerId: string | null; supplierId: string | null }
>(accounts: Account[], discounts: Discount[], party: 'customerId' | 'supplierId') {
  const byAccount = new Map<string, Discount[]>();
  for (const discount of discounts) {
    const id = discount[party];
    if (id) {
      const entries = byAccount.get(id) || [];
      entries.push(discount);
      byAccount.set(id, entries);
    }
  }
  return accounts.map(account => ({ ...account, discounts: byAccount.get(account.id) || [] }));
}
