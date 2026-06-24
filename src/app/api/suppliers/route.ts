import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET all suppliers
export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        purchaseOrders: true,
        expenses: {
          include: { bank: true }
        }
      }
    });
    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

// POST create supplier
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        address: body.address || null,
        cr: body.cr || null,
        trn: body.trn || null,
        balance: Number(body.balance) || 0
      }
    });

    return NextResponse.json(supplier);
  } catch (error: any) {
    console.error('Error creating supplier:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'اسم المورد مسجل بالفعل' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}

// PUT edit supplier
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 });
    }

    const supplier = await prisma.supplier.update({
      where: { id: body.id },
      data: {
        name: body.name,
        phone: body.phone || null,
        address: body.address || null,
        cr: body.cr || null,
        trn: body.trn || null,
        balance: Number(body.balance) || 0
      }
    });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}
