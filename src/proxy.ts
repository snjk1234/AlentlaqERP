import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const expectedToken = process.env.POS_API_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized POS client.' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*'
};
