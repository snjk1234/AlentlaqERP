import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const products = await prisma.product.findMany();
    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.code || !body.name || !body.price) {
      return NextResponse.json({ error: 'كود الصنف والاسم والسعر مطلوبين' }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        code: body.code,
        barcode: body.barcode || null,
        name: body.name,
        type: body.type,
        gauge: body.gauge || null,
        size: body.size,
        color: body.color || null,
        length: body.length || null,
        weight: body.weight || null,
        costPrice: Number(body.costPrice) || 0,
        markup: Number(body.markup) || 1.3,
        price: Number(body.price),
        taxRate: Number(body.taxRate) ?? 0.14,
        stockQty: Number(body.stockQty) || 0,
        minStockQty: Number(body.minStockQty) ?? 10,
        maxStockQty: Number(body.maxStockQty) ?? 1000,
      }
    });

    return NextResponse.json(product);
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'كود الصنف أو الباركود مسجل بالفعل لصنف آخر' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'معرف الصنف مطلوب للتعديل' }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id: body.id },
      data: {
        code: body.code,
        barcode: body.barcode || null,
        name: body.name,
        type: body.type,
        gauge: body.gauge || null,
        size: body.size,
        color: body.color || null,
        length: body.length || null,
        weight: body.weight || null,
        costPrice: Number(body.costPrice) || 0,
        markup: Number(body.markup) || 1.3,
        price: Number(body.price),
        taxRate: Number(body.taxRate) ?? 0.14,
        stockQty: Number(body.stockQty) || 0,
        minStockQty: Number(body.minStockQty) ?? 10,
        maxStockQty: Number(body.maxStockQty) ?? 1000,
      }
    });

    return NextResponse.json(product);
  } catch (error: any) {
    console.error('Error updating product:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'كود الصنف أو الباركود مسجل بالفعل لصنف آخر' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

