import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const banks = await prisma.bank.findMany({
      include: {
        payments: {
          orderBy: { date: 'desc' },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(banks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    return NextResponse.json({ error: 'Failed to fetch banks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountNumber, balance } = body;
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'يرجى إدخال اسم البنك / الخزينة.' }, { status: 400 });
    }

    const bank = await prisma.bank.create({
      data: {
        name,
        accountNumber: accountNumber || null,
        balance: Number(balance) || 0,
      },
    });

    return NextResponse.json(bank);
  } catch (error) {
    console.error('Error creating bank:', error);
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'يوجد بنك / خزينة مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create bank' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || !body.id.trim()) {
      return NextResponse.json({ error: 'Bank ID is required.' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'يرجى إدخال اسم البنك / الخزينة.' }, { status: 400 });
    }
    const bank = await prisma.bank.update({
      where: { id: body.id },
      data: {
        name,
        accountNumber: body.accountNumber || null,
        balance: Number(body.balance) || 0,
      },
    });
    return NextResponse.json(bank);
  } catch (error) {
    console.error('Error updating bank:', error);
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'يوجد بنك / خزينة مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update bank' },
      { status: 500 }
    );
  }
}
