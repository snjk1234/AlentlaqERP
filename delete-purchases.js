const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.purchaseOrder.findMany({
    include: { items: true }
  });
  
  console.log(`Found ${orders.length} purchase orders to delete.`);
  
  for (const order of orders) {
    console.log(`Deleting order ${order.billNumber}, netAmount: ${order.netAmount}`);
    
    await prisma.$transaction(async (tx) => {
      // Revert supplier balance
      if (order.supplierId && order.netAmount > 0) {
        await tx.supplier.update({
          where: { id: order.supplierId },
          data: {
            balance: { decrement: order.netAmount }
          }
        });
        console.log(`Reverted supplier ${order.supplierId} balance by ${order.netAmount}`);
      }
      
      // If there were any items, we would revert stock here. 
      // But items are empty in these 3 invoices, so we just delete them.
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: { decrement: item.quantity }
            }
          });
        }
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: order.id }
        });
      }
      
      await tx.purchaseOrder.delete({
        where: { id: order.id }
      });
      console.log(`Deleted order ${order.id} successfully.`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
