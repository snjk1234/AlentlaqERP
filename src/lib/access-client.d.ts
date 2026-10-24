import type { PrismaClient } from '../generated/client';

type AccessModelName =
  | 'user'
  | 'product'
  | 'category'
  | 'order'
  | 'customer'
  | 'customerPrice'
  | 'orderItem'
  | 'orderReturn'
  | 'orderReturnItem'
  | 'bank'
  | 'customerCeilingQuota'
  | 'payment'
  | 'supplier'
  | 'purchaseOrder'
  | 'purchaseOrderItem'
  | 'expensePayment'
  | 'expenseCategory'
  | 'generalExpense'
  | 'stocktake'
  | 'stocktakeItem'
  | 'stocktakeSetting';

type AccessOperation = 'findMany' | 'findFirst' | 'findUnique' | 'count' | 'create' | 'update' | 'delete' | 'upsert';
type AccessDelegate<ModelName extends AccessModelName> = Pick<PrismaClient[ModelName], AccessOperation>;

export type AccessTransactionClient = {
  [ModelName in AccessModelName]: AccessDelegate<ModelName>;
};

export type AccessClient = AccessTransactionClient & {
  $transaction<Result>(
    callback: (transaction: AccessTransactionClient) => Promise<Result>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<Result>;
  $disconnect(): Promise<void>;
};

export function createAccessClient(): AccessClient;
export function initializeAccessDatabase(): Promise<void>;
export function beginRemoteTransaction(): Promise<string>;
export function commitRemoteTransaction(transactionId: string): Promise<void>;
export function rollbackRemoteTransaction(transactionId: string): Promise<void>;
export function runRemoteOperation(
  modelName: string,
  operation: string,
  args?: unknown,
  transactionId?: string
): Promise<unknown>;
export const modelNames: string[];
export const models: Record<string, { table: string }>;
export function encodeText(value: unknown): string;
export function encodeValue(value: unknown, fieldDefinition: { type: string; size?: number; memo?: boolean }): string;
