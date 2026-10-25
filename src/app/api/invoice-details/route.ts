import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { editInvoiceDetails } from '@/lib/document-edits';
import { verifyUserSessionToken } from '@/lib/user-session-token';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  if (!process.env.POS_API_TOKEN) return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  const authorization = request.headers.get('authorization') || '';
  const session = verifyUserSessionToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  if (!session) return NextResponse.json({ error: 'انتهت الجلسة. سجّل الدخول مجددًا.' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'تعديل بيانات الفاتورة متاح للمدير فقط.' }, { status: 403 });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'بيانات الفاتورة غير صالحة.' }, { status: 400 }); }
  try {
    return NextResponse.json(await editInvoiceDetails(prisma, { ...body, userId: session.userId }));
  } catch (error) {
    console.error('Invoice detail correction failed:', error);
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تعديل بيانات الفاتورة.' }, { status });
  }
}
