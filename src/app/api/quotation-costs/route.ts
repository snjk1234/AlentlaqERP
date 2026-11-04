import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQuotationCosts } from '@/lib/document-edits';
import { verifyUserSessionToken } from '@/lib/user-session-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!process.env.POS_API_TOKEN) return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  const authorization = request.headers.get('authorization') || '';
  const session = verifyUserSessionToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  if (!session) return NextResponse.json({ error: 'انتهت الجلسة. سجّل الدخول مجددًا.' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'تحليل أرباح عرض السعر متاح للمدير فقط.' }, { status: 403 });
  let input;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: 'بيانات تحليل الربح غير صالحة.' }, { status: 400 }); }
  try {
    return NextResponse.json(await getQuotationCosts(prisma, session.userId, input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Quotation cost lookup failed:', error);
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تحميل تكاليف الأصناف.' }, { status });
  }
}
