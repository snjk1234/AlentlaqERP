import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { expenseCategoryOperation } from '@/lib/expense-categories';
import { verifyUserSessionToken } from '@/lib/user-session-token';

export const dynamic = 'force-dynamic';

// GET all expense categories
export async function GET() {
  try {
    const categories = await prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error fetching expense categories:', error);
    return NextResponse.json({ error: 'Failed to fetch expense categories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.POS_API_TOKEN) {
    return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  const session = verifyUserSessionToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  if (!session) return NextResponse.json({ error: 'انتهت الجلسة. سجّل الدخول مجددًا.' }, { status: 401 });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'بيانات التصنيف غير صالحة.' }, { status: 400 }); }
  try {
    return NextResponse.json({ data: await expenseCategoryOperation(prisma, session.userId, body) });
  } catch (error) {
    console.error('Expense category operation failed:', error);
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تنفيذ إجراء التصنيفات.' }, { status });
  }
}
