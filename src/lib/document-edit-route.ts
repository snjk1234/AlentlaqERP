import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { editDocument } from '@/lib/document-edits';
import { verifyUserSessionToken } from '@/lib/user-session-token';

export async function updateDocument(request: Request, kind: 'purchase' | 'generalExpense' | 'expense') {
  if (!process.env.POS_API_TOKEN) {
    return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  const session = verifyUserSessionToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  if (!session) return NextResponse.json({ error: 'انتهت الجلسة. سجّل الدخول مجددًا.' }, { status: 401 });
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'تعديل المستندات متاح لمدير النظام فقط.' }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات المستند غير صالحة.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await editDocument(prisma, kind, { ...body, userId: session.userId }));
  } catch (error) {
    console.error(`Error updating ${kind}:`, error);
    const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof statusCode === 'number' && [400, 403, 404, 409].includes(statusCode) ? statusCode : 500;
    const duplicate = error instanceof Error && 'code' in error && error.code === 'P2002';
    return NextResponse.json({
      error: duplicate ? 'رقم فاتورة الشراء/التوريد مسجل بالفعل.'
        : error instanceof Error ? error.message : 'تعذر حفظ تعديل المستند.'
    }, { status: duplicate ? 400 : status });
  }
}
