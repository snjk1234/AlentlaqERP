import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateZatcaQrCode } from '@/lib/zatca';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerName, isQuotation, items, userId } = body;

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
      const itemTax = Number((itemTotal * taxRate).toFixed(2));
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

    // Generate ZATCA compliant invoice details
    const sellerName = 'شركة الإنطلاق لتصنيع وتوريد الخراطيم والمواسير';
    const trn = '310122345600003'; // Mock Saudi ZATCA TRN
    const timestamp = new Date().toISOString();
    
    // Generate QR Code if it's a final invoice, not a quotation
    let qrCodeBase64: string | null = null;
    if (!isQuotation) {
      qrCodeBase64 = generateZatcaQrCode(
        sellerName,
        trn,
        timestamp,
        netAmount.toFixed(2),
        taxAmount.toFixed(2)
      );
    }

    // Generate Invoice/Receipt Number
    const count = await prisma.order.count();
    const prefix = isQuotation ? 'QT-' : 'INV-';
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Get a default user if none provided
    let dbUserId = userId;
    if (!dbUserId) {
      const defaultUser = await prisma.user.findFirst();
      dbUserId = defaultUser?.id;
    }

    // Execute in transaction: Create Order, create items, deduct stock
    const order = await prisma.$transaction(async (tx) => {
      // Create Order
      const newOrder = await tx.order.create({
        data: {
          invoiceNumber,
          isQuotation: !!isQuotation,
          customerName: customerName || 'عميل نقدي',
          totalAmount,
          taxAmount,
          netAmount,
          qrCode: qrCodeBase64,
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
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: {
                decrement: item.quantity
              }
            }
          });
        }
      }

      return newOrder;
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error('Error saving order:', error);
    return NextResponse.json({ error: error.message || 'Failed to save order' }, { status: 500 });
  }
}
