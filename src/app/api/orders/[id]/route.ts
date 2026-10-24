import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = id;
    
    // First find the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (await prisma.orderReturn.count({ where: { orderId: order.id } })) {
      return NextResponse.json({ error: 'لا يمكن حذف فاتورة لها مرتجعات مسجلة.' }, { status: 409 });
    }

    // Revert stock and ceilings
    if (!order.isQuotation && order.status !== 'RETURNED') {
      for (const item of order.items) {
        // Revert stock
        await prisma.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } }
        });

        // Revert ceiling
        if (order.customerId) {
          const quota = await prisma.customerCeilingQuota.findUnique({
            where: { customerId_productId: { customerId: order.customerId, productId: item.productId } }
          });
          if (quota) {
            await prisma.customerCeilingQuota.update({
              where: { id: quota.id },
              data: { deliveredQuantity: { decrement: item.quantity } }
            });
          }
        }
      }
    }

    // Delete Order
    await prisma.order.delete({ where: { id: orderId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
  }
}
