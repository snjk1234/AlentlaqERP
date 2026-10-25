import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyUserSessionToken } from '@/lib/user-session-token';

export function proxy(request: NextRequest) {
  const expectedToken = process.env.POS_API_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  }
  if ((request.method === 'PUT' && ['/api/purchases', '/api/expenses', '/api/general-expenses', '/api/quotations', '/api/invoice-details'].includes(request.nextUrl.pathname))
    || ['/api/stocktakes', '/api/bank-transfers', '/api/quotation-costs'].includes(request.nextUrl.pathname)) {
    const authorization = request.headers.get('authorization') || '';
    const session = verifyUserSessionToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
    if (!session) return NextResponse.json({ error: 'انتهت الجلسة. سجّل الدخول مجددًا.' }, { status: 401 });
    return NextResponse.next();
  }
  if (request.headers.get('authorization') !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized POS client.' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*'
};
