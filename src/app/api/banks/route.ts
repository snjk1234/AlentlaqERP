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
    const { name, accountNumber, balance } = body;

    if (!name) {
      return NextResponse.json({ error: 'Bank name is required' }, { status: 400 });
    }

    const bank = await prisma.bank.create({
      data: {
        name,
        accountNumber: accountNumber || null,
        balance: Number(balance) || 0,
      },
    });

    return NextResponse.json(bank);
  } catch (error: any) {
    console.error('Error creating bank:', error);
    return NextResponse.json({ error: error.message || 'Failed to create bank' }, { status: 500 });
  }
}
