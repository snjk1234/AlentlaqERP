import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createUserSessionToken } from '@/lib/user-session-token';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user || user.password !== password) {
      return NextResponse.json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, { status: 401 });
    }

    // In a real app, you'd return a JWT token here.
    // For this simple POS, we just return the user object (excluding password).
    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      sessionToken: createUserSessionToken(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تسجيل الدخول' },
      { status: 500 }
    );
  }
}
