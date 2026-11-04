export type UserSessionClaims = {
  userId: string;
  role: string;
  expiresAt: number;
};

export function createUserSessionToken(user: { id: string; role: string }): string;
export function verifyUserSessionToken(token: string | null | undefined): UserSessionClaims | null;
