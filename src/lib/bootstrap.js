const { createAccessClient } = require('./access-client');

async function seedUsers() {
  const database = createAccessClient();
  const defaultUsers = [
    { username: 'admin', name: 'مدير النظام', password: 'pos121', role: 'ADMIN' },
    { username: 'cashier', name: 'كاشير الانطلاق', password: '123456', role: 'CASHIER' },
    { username: 'storekeeper', name: 'أمين المخزن', password: '123456', role: 'STOREKEEPER' }
  ];

  await database.$transaction(async (transaction) => {
    for (const user of defaultUsers) {
      const existing = await transaction.user.findUnique({ where: { username: user.username } });
      if (!existing) await transaction.user.create({ data: user });
    }
  });
}

module.exports = { seedUsers };
