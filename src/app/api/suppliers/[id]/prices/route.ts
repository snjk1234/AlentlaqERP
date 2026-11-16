import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveSupplierPrices } from '@/lib/supplier-prices';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { prices } = await request.json();
    const { id } = await params;
    const savedPrices = await saveSupplierPrices(prisma, id, prices);
    return NextResponse.json({ success: true, prices: savedPrices, message: 'تم تحديث قائمة الأسعار بنجاح' });
  } catch (error) {
    console.error('Error updating supplier prices:', error);
    const invalid = error instanceof SyntaxError
      || (error instanceof Error && 'code' in error && error.code === 'INVALID_SUPPLIER_PRICES');
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'حدث خطأ أثناء تحديث الأسعار'
    }, { status: invalid ? 400 : 500 });
  }
}
