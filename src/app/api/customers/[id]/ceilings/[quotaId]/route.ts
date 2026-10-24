import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string, quotaId: string }> }) {
  try {
    const { quotaId } = await params;
    await prisma.customerCeilingQuota.delete({
      where: { id: quotaId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ceiling quota:', error);
    return NextResponse.json({ error: 'Failed to delete ceiling quota' }, { status: 500 });
  }
}
