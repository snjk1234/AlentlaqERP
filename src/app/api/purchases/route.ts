import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET all purchase orders
export async function GET() {
  try {
    const purchases = await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        items: {
          include: { product: true }
        }
      }
    });
    return NextResponse.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 });
  }
}

// POST create purchase order (stock in and update stockQty)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { billNumber, supplierId, items } = body;

    if (!billNumber || !supplierId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required purchase order fields' }, { status: 400 });
    }

    // Wrap in a transaction to guarantee stock updates match financial records
    const result = await prisma.$transaction(async (tx) => {
      // 1. Calculate totals
      let totalAmount = 0;
      let taxAmount = 0;

      const orderItemsData = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        const cost = Number(item.unitCost) || product.costPrice;
        const qty = Number(item.quantity) || 1;
        const taxRate = product.taxRate || 0.14;

        const totalCost = cost * qty;
        const itemTax = totalCost * taxRate;
        const totalWithTax = totalCost + itemTax;

        totalAmount += totalCost;
        taxAmount += itemTax;

        orderItemsData.push({
          productId: item.productId,
          quantity: qty,
          unitCost: cost,
          taxAmount: itemTax,
          total: totalWithTax
        });

        // 2. Increase stockQty in Product table
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: { increment: qty },
            costPrice: cost, // update cost price to latest purchased price
            price: cost * (1 + (product.markup / 100)) // update sell price dynamically based on markup percentage
          }
        });
      }

      const netAmount = totalAmount + taxAmount;

      // 3. Update Supplier balance (increase supplier debt / credit)
      await tx.supplier.update({
        where: { id: supplierId },
        data: {
          balance: { increment: netAmount }
        }
      });

      // 4. Create the purchase order record
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          billNumber,
          supplierId,
          totalAmount,
          taxAmount,
          netAmount,
          items: {
            create: orderItemsData
          }
        },
        include: {
          supplier: true,
          items: {
            include: { product: true }
          }
        }
      });

      return purchaseOrder;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error creating purchase order:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'رقم فاتورة الشراء/التوريد مسجل بالفعل' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create purchase order' }, { status: 500 });
  }
}
