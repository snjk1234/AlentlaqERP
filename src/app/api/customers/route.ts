import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        payments: {
          include: {
            bank: true
          },
          orderBy: {
            date: 'desc'
          }
        },
        orders: {
          include: {
            items: {
              include: {
                product: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        location: body.location || body.email || null,
        buildingsCount: Number(body.buildingsCount) || 0,
        trn: body.trn || null,
        customerType: body.customerType || 'CASH',
        discount: Number(body.discount) || 0
      }
    });

    return NextResponse.json(customer);
  } catch (error: any) {
    console.error('Error creating customer:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'اسم العميل مسجل بالفعل' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const customer = await prisma.customer.update({
      where: { id: body.id },
      data: {
        name: body.name,
        phone: body.phone || null,
        location: body.location || body.email || null,
        buildingsCount: Number(body.buildingsCount) || 0,
        trn: body.trn || null,
        customerType: body.customerType || 'CASH',
        discount: Number(body.discount) || 0
      }
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

