const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.product.updateMany({
    where: { type: 'PIPE' },
    data: { type: 'مواسير' }
  });
  console.log(`Updated ${result.count} products from PIPE to مواسير`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
