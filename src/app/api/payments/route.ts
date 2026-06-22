import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        customer: true,
        bank: true,
      },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, bankId, amount, reference, notes } = body;

    if (!customerId || !bankId || !amount) {
      return NextResponse.json({ error: 'Missing required payment fields' }, { status: 400 });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          customerId,
          bankId,
          amount: Number(amount),
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          customer: true,
          bank: true,
        },
      });

      // Update bank balance
      await tx.bank.update({
        where: { id: bankId },
        data: {
          balance: { increment: Number(amount) },
        },
      });

      return newPayment;
    });

    return NextResponse.json(payment);
  } catch (error: any) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ error: error.message || 'Failed to create payment' }, { status: 500 });
  }
}
