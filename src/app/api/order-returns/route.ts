import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOrderReturn } from '@/lib/order-returns';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderReturn = await createOrderReturn(prisma, body);
    return NextResponse.json({ data: orderReturn }, { status: 201 });
  } catch (error) {
    console.error('Error creating order return:', error);
    if (error instanceof Error && 'code' in error && error.code === 'ORDER_RETURN_INVALID') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create order return.' },
      { status: 500 }
    );
  }
}
