const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
  const types = await prisma.product.findMany({ select: { type: true }, distinct: ['type'] });
  console.log(types.map(t => '[' + t.type + ']'));
}
main().finally(() => prisma.$disconnect());
