import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { correctPayment } from '@/lib/payment-corrections';
import { verifyUserSessionToken } from '@/lib/user-session-token';

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
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!process.env.POS_API_TOKEN) {
    return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const session = verifyUserSessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'انتهت الجلسة أو لا تملك صلاحية تصويب الدفعات.' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'تصويب الدفعات متاح لمدير النظام فقط.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const payment = await correctPayment(prisma, { ...body, userId: session.userId });

    if (!payment) {
      return NextResponse.json({ error: 'سند القبض المطلوب غير موجود.' }, { status: 404 });
    }
    return NextResponse.json(payment);
  } catch (error) {
    console.error('Error correcting payment:', error);
    const errorStatus = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = errorStatus === 400 || errorStatus === 403 ? errorStatus : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to correct payment' },
      { status }
    );
  }
}
