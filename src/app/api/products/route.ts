import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: { supplier: true }
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.code || !body.name || body.price === undefined) {
      return NextResponse.json({ error: 'كود الصنف والاسم مطلوبين' }, { status: 400 });
    }

    // Check for uniqueness based on (code, size, color, gauge, weight, supplierId)
    const existingProducts = await prisma.product.findMany({
      where: { code: body.code }
    });
    
    if (existingProducts.length > 0) {
      const isDuplicate = existingProducts.some(p => 
        (p.supplierId || null) === (body.supplierId || null) &&
        (p.size || null) === (body.size || null) &&
        (p.color || null) === (body.color || null) &&
        (p.gauge || null) === (body.gauge || null) &&
        (p.weight || null) === (body.weight || null)
      );
      if (isDuplicate) {
        return NextResponse.json({ error: 'هذا الكود مسجل مسبقاً بنفس المواصفات لنفس المورد. قم بتغيير المواصفات أو المورد أو تغيير الكود.' }, { status: 400 });
      }
    }

    const product = await prisma.product.create({
      data: {
        code: body.code,
        barcode: (body.barcode && body.barcode.trim() !== '') ? body.barcode.trim() : null,
        name: body.name,
        type: body.type,
        gauge: body.gauge || null,
        size: body.size,
        color: body.color || null,
        length: body.length || null,
        weight: body.weight || null,
        pricePerKilo: isNaN(Number(body.pricePerKilo)) ? 0 : Number(body.pricePerKilo),
        supplierId: body.supplierId || null,
        costPrice: isNaN(Number(body.costPrice)) ? 0 : Number(body.costPrice),
        markup: isNaN(Number(body.markup)) ? 1.3 : Number(body.markup),
        price: isNaN(Number(body.price)) ? 0 : Number(body.price),
        taxRate: (body.taxRate !== undefined && body.taxRate !== null && !isNaN(Number(body.taxRate))) ? Number(body.taxRate) : 0.14,
        stockQty: isNaN(Number(body.stockQty)) ? 0 : Number(body.stockQty),
        minStockQty: isNaN(Number(body.minStockQty)) ? 10 : Number(body.minStockQty),
        maxStockQty: isNaN(Number(body.maxStockQty)) ? 1000 : Number(body.maxStockQty),
        imageUrl: body.imageUrl || null,
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
    if (Object.keys(body).length === 2 && body.imageUrl !== undefined) {
      if (typeof body.imageUrl !== 'string' || body.imageUrl.length > 2800000
        || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(body.imageUrl)) {
        return NextResponse.json({ error: 'ملف الصورة غير صالح أو يتجاوز الحجم المسموح' }, { status: 400 });
      }
      const product = await prisma.product.update({ where: { id: body.id }, data: { imageUrl: body.imageUrl } });
      return NextResponse.json(product);
    }

    if (body.code) {
      const existingProducts = await prisma.product.findMany({
        where: { code: body.code, id: { not: body.id } }
      });
      
      if (existingProducts.length > 0) {
        const isDuplicate = existingProducts.some(p => 
          (p.supplierId || null) === (body.supplierId || null) &&
          (p.size || null) === (body.size || null) &&
          (p.color || null) === (body.color || null) &&
          (p.gauge || null) === (body.gauge || null) &&
          (p.weight || null) === (body.weight || null)
        );
        if (isDuplicate) {
          return NextResponse.json({ error: 'هذا الكود مسجل مسبقاً بنفس المواصفات لنفس المورد. قم بتغيير المواصفات أو تغيير المورد أو الكود.' }, { status: 400 });
        }
      }
    }

    const product = await prisma.product.update({
      where: { id: body.id },
      data: {
        code: body.code,
        barcode: (body.barcode && body.barcode.trim() !== '') ? body.barcode.trim() : null,
        name: body.name,
        type: body.type,
        gauge: body.gauge || null,
        size: body.size,
        color: body.color || null,
        length: body.length || null,
        weight: body.weight || null,
        pricePerKilo: isNaN(Number(body.pricePerKilo)) ? 0 : Number(body.pricePerKilo),
        supplierId: body.supplierId || null,
        costPrice: isNaN(Number(body.costPrice)) ? 0 : Number(body.costPrice),
        markup: isNaN(Number(body.markup)) ? 1.3 : Number(body.markup),
        price: isNaN(Number(body.price)) ? 0 : Number(body.price),
        taxRate: (body.taxRate !== undefined && body.taxRate !== null && !isNaN(Number(body.taxRate))) ? Number(body.taxRate) : 0.14,
        stockQty: isNaN(Number(body.stockQty)) ? 0 : Number(body.stockQty),
        minStockQty: isNaN(Number(body.minStockQty)) ? 10 : Number(body.minStockQty),
        maxStockQty: isNaN(Number(body.maxStockQty)) ? 1000 : Number(body.maxStockQty),
        imageUrl: body.imageUrl !== undefined ? body.imageUrl : undefined,
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
