import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { invoiceQrText } from '@/lib/invoice-qr';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerName, customerId, isQuotation, items, userId, siteReceiptNumber, receiverName, purchaseOrderNumber, invoiceType, linkedQuotationId } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Invoice must contain items' }, { status: 400 });
    }

    // 1. Fetch product prices
    const productIds = items.map((item: any) => item.productId);
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    let totalAmount = 0;
    let taxAmount = 0;

    const orderItemsData = items.map((item: any) => {
      const product = dbProducts.find((p) => p.id === item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const quantity = item.quantity;
      const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : product.price;
      const taxRate = product.taxRate;
      
      const itemTotal = Number((unitPrice * quantity).toFixed(2));
      const itemTax = (invoiceType === 'فاتورة' || invoiceType === 'فاتورة مبسطة') ? 0 : Number((itemTotal * taxRate).toFixed(2));
      const lineTotal = Number((itemTotal + itemTax).toFixed(2));

      totalAmount += itemTotal;
      taxAmount += itemTax;

      return {
        productId: product.id,
        quantity,
        unitPrice,
        taxAmount: itemTax,
        total: lineTotal
      };
    });

    const netAmount = Number((totalAmount + taxAmount).toFixed(2));

    const timestamp = new Date().toISOString();

    // Generate Invoice/Receipt Number
    const count = await prisma.order.count();
    const prefix = isQuotation ? 'QT-' : 'INV-';
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const qrCode = !isQuotation ? invoiceQrText({
      invoiceNumber, issuedAt: timestamp, totalAmount: netAmount.toFixed(2), taxAmount: taxAmount.toFixed(2)
    }) : null;

    // Get a default user if none provided
    let dbUserId = userId;
    if (!dbUserId) {
      let defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            username: 'admin',
            name: 'مدير النظام',
            password: 'admin',
            role: 'ADMIN'
          }
        });
      }
      dbUserId = defaultUser.id;
    }

    // Execute in transaction: Create Order, create items, deduct stock
    const order = await prisma.$transaction(async (tx) => {
      // Create Order
      const newOrder = await tx.order.create({
        data: {
          invoiceNumber,
          isQuotation: !!isQuotation,
          customerName: customerName || 'عميل نقدي',
          customerId: customerId || null,
          totalAmount,
          taxAmount,
          netAmount,
          qrCode,
          siteReceiptNumber: siteReceiptNumber || null,
          receiverName: receiverName || null,
          purchaseOrderNumber: purchaseOrderNumber || null,
          invoiceType: invoiceType || 'فاتورة ضريبية',
          userId: dbUserId || '',
          items: {
            create: orderItemsData
          }
        },
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      });

      // Deduct stock for final invoices (not for quotations)
      if (!isQuotation) {
        for (const item of items) {
          // Re-read stock inside the transaction to block concurrent overselling.
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          const available = product ? Number(product.stockQty) - Number(product.reservedQty || 0) : 0;
          if (!product || available < Number(item.quantity)) {
            throw new Error(`المخزون المتاح من الصنف ${product?.name || item.productId} لا يكفي (المتاح ${Math.max(0, available)}). يمكن حفظ عرض سعر أو تعديل الكمية.`);
          }
        }
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: {
                decrement: item.quantity
              }
            }
          });

          if (customerId) {
            const quota = await tx.customerCeilingQuota.findUnique({
              where: { customerId_productId: { customerId, productId: item.productId } }
            });
            if (quota) {
              await tx.customerCeilingQuota.update({
                where: { id: quota.id },
                data: { deliveredQuantity: { increment: item.quantity } }
              });
            }
          }
        }
      }

      // Mark the quotation as converted if this invoice was generated from one
      if (linkedQuotationId && !isQuotation) {
        await tx.order.update({
          where: { id: linkedQuotationId },
          data: { status: 'CONVERTED' }
        });
      }

      return newOrder;
    }, { timeout: 20000, maxWait: 20000 });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error('Error saving order:', error);
    return NextResponse.json({ error: error.message || 'Failed to save order' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: {
        customer: true,
        orderReturns: { include: { bank: true, items: { include: { product: true } } } },
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
