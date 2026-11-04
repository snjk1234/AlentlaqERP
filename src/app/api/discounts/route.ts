import { NextResponse } from 'next/server';
import { createAccountDiscount } from '@/lib/account-discounts';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات طلب الخصم غير صالحة.' }, { status: 400 });
  }

  try {
    const discount = await createAccountDiscount(prisma, body);
    return NextResponse.json({ data: discount }, { status: 201 });
  } catch (error) {
    console.error('Error creating account discount:', error);
    if (error instanceof Error && 'code' in error && error.code === 'ACCOUNT_DISCOUNT_INVALID') {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'تعذر تسجيل سند الخصم.' },
      { status: 500 }
    );
  }
}
