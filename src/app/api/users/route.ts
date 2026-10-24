import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' }
    });

    // Auto-seed a default admin if no users exist
    if (users.length === 0) {
      const defaultAdmin = await prisma.user.create({
        data: {
          username: 'admin',
          name: 'مدير النظام',
          password: '123', // Default simple password
          role: 'ADMIN'
        }
      });
      users = [defaultAdmin];
    }

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
