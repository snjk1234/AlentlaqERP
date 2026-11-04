import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  beginRemoteTransaction,
  commitRemoteTransaction,
  modelNames,
  rollbackRemoteTransaction,
  runRemoteOperation
} from '@/lib/access-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: Request) {
  const expectedToken = process.env.POS_API_TOKEN;
  const authorization = request.headers.get('authorization') || '';
  const providedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expectedToken || !providedToken) return false;
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function POST(request: Request) {
  if (!process.env.POS_API_TOKEN) {
    return NextResponse.json({ error: 'POS_API_TOKEN is not configured on the server.' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized POS client.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  try {
    if (body.action === 'begin') {
      return NextResponse.json({ data: await beginRemoteTransaction() });
    }
    if (body.action === 'commit' || body.action === 'rollback') {
      if (typeof body.transactionId !== 'string') {
        return NextResponse.json({ error: 'A transaction ID is required.' }, { status: 400 });
      }
      if (body.action === 'commit') await commitRemoteTransaction(body.transactionId);
      else await rollbackRemoteTransaction(body.transactionId);
      return NextResponse.json({ data: null });
    }
    if (body.action !== 'operation') {
      return NextResponse.json({ error: 'Unsupported database action.' }, { status: 400 });
    }
    if (typeof body.modelName !== 'string' || !modelNames.includes(body.modelName)) {
      return NextResponse.json({ error: 'Unknown database model.' }, { status: 400 });
    }
    if (['stocktake', 'stocktakeItem', 'stocktakeSetting'].includes(body.modelName)) {
      return NextResponse.json({ error: 'استخدم واجهة الجرد المصرح بها.' }, { status: 403 });
    }
    if (body.modelName === 'productOption') {
      return NextResponse.json({ error: 'استخدم واجهة خيارات الأصناف المصرح بها.' }, { status: 403 });
    }
    if (body.modelName === 'bankTransfer') {
      return NextResponse.json({ error: 'استخدم واجهة التحويلات المصرح بها.' }, { status: 403 });
    }
    if (body.modelName === 'accountDiscount') {
      return NextResponse.json({ error: 'استخدم واجهة الخصومات المصرح بها.' }, { status: 403 });
    }
    if (typeof body.operation !== 'string') {
      return NextResponse.json({ error: 'A database operation is required.' }, { status: 400 });
    }
    if (body.transactionId !== undefined && typeof body.transactionId !== 'string') {
      return NextResponse.json({ error: 'Invalid transaction ID.' }, { status: 400 });
    }

    const data = await runRemoteOperation(
      body.modelName,
      body.operation,
      body.args,
      body.transactionId as string | undefined
    );
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Access API operation failed:', error);
    const message = error instanceof Error ? error.message : 'Access database operation failed.';
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
    return NextResponse.json({ error: message, code }, { status: 500 });
  }
}
