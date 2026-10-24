import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ceilings = await prisma.customerCeilingQuota.findMany({
      where: { customerId: id },
      include: {
        product: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(ceilings);
  } catch (error) {
    console.error('Error fetching ceilings:', error);
    return NextResponse.json({ error: 'Failed to fetch ceilings' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { productId, buildingsCount, floorsCount, quantityPerFloor } = body;

    if (!productId || buildingsCount === undefined || quantityPerFloor === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const totalQuantity = Number(buildingsCount) * Number(floorsCount || 6) * Number(quantityPerFloor);

    // Ensure we don't duplicate product ceilings. Update if exists, or create.
    const existing = await prisma.customerCeilingQuota.findUnique({
      where: {
        customerId_productId: {
          customerId: id,
          productId
        }
      }
    });

    if (existing) {
      // Overwrite the quota settings but maintain deliveredQuantity?
      // Or just return error? The user said "لكل عميل حصر اسقف واحد" (one per customer).
      // If it exists, let's update the formula.
      const ceiling = await prisma.customerCeilingQuota.update({
        where: { id: existing.id },
        data: {
          buildingsCount: Number(buildingsCount),
          floorsCount: Number(floorsCount || 6),
          quantityPerFloor: Number(quantityPerFloor),
          totalQuantity
        },
        include: { product: true }
      });
      return NextResponse.json(ceiling);
    }

    const ceiling = await prisma.customerCeilingQuota.create({
      data: {
        customerId: id,
        productId,
        buildingsCount: Number(buildingsCount),
        floorsCount: Number(floorsCount || 6),
        quantityPerFloor: Number(quantityPerFloor),
        totalQuantity,
        deliveredQuantity: 0
      },
      include: { product: true }
    });

    return NextResponse.json(ceiling);
  } catch (error: any) {
    console.error('Error creating ceiling quota:', error);
    return NextResponse.json({ error: error.message || 'Failed to create ceiling quota' }, { status: 500 });
  }
}
