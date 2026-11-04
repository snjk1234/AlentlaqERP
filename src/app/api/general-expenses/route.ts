import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET all general expenses
export async function GET() {
  try {
    const expenses = await prisma.generalExpense.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        bank: true,
        category: true
      }
    });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error fetching general expenses:', error);
    return NextResponse.json({ error: 'Failed to fetch general expenses' }, { status: 500 });
  }
}

// POST create general expense
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { categoryId, bankId, amount, notes, reference } = body;

    if (!categoryId || !bankId || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const payAmount = Number(amount);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify Bank
      const bank = await tx.bank.findUnique({
        where: { id: bankId }
      });
      if (!bank) {
        throw new Error('Bank account/cash tier not found');
      }

      // Generate sequence number for General Expense
      const count = await tx.generalExpense.count();
      const expenseNumber = `GEX-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

      // 2. Decrement bank balance
      await tx.bank.update({
        where: { id: bankId },
        data: {
          balance: { decrement: payAmount }
        }
      });

      // 3. Create general expense
      const expense = await tx.generalExpense.create({
        data: {
          expenseNumber,
          categoryId,
          bankId,
          amount: payAmount,
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          bank: true,
          category: true
        }
      });

      return expense;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error creating general expense:', error);
    return NextResponse.json({ error: error.message || 'Failed to create general expense' }, { status: 500 });
  }
}
