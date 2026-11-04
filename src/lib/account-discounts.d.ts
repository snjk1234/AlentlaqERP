import type { AccountDiscount } from '../generated/client';
import type { AccessClient } from './access-client';

export function createAccountDiscount(prisma: AccessClient, userId: string, input: unknown): Promise<AccountDiscount>;
export function discountLimit(balance: number): number;
