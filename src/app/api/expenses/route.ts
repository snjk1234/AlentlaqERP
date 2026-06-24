import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET all expense payments (سندات الصرف)
export async function GET() {
  try {
    const expenses = await prisma.expensePayment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        bank: true
      }
    });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

// POST create expense payment (سند صرف مورد)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supplierId, bankId, amount, notes, reference } = body;

    if (!supplierId || !bankId || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Missing required expense fields' }, { status: 400 });
    }

    const payAmount = Number(amount);

    // Run within a transaction to maintain audit consistency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify Bank exists and has sufficient balance (optional, but good practice)
      const bank = await tx.bank.findUnique({
        where: { id: bankId }
      });

      if (!bank) {
        throw new Error('Bank account/cash tier not found');
      }

      // Generate incremental sequence number for Expense
      const count = await tx.expensePayment.count();
      const expenseNumber = `EXP-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

      // 2. Decrement bank balance
      await tx.bank.update({
        where: { id: bankId },
        data: {
          balance: { decrement: payAmount }
        }
      });

      // 3. Decrement supplier debt balance
      await tx.supplier.update({
        where: { id: supplierId },
        data: {
          balance: { decrement: payAmount }
        }
      });

      // 4. Create expense record
      const expense = await tx.expensePayment.create({
        data: {
          expenseNumber,
          supplierId,
          bankId,
          amount: payAmount,
          reference: reference || null,
          notes: notes || 'سند صرف نقدي لمورد',
        },
        include: {
          supplier: true,
          bank: true
        }
      });

      return expense;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: error.message || 'Failed to create expense' }, { status: 500 });
  }
}
