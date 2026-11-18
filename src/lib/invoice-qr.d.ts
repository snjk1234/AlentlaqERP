export function invoiceQrText(details: {
  invoiceNumber: string;
  issuedAt: string;
  totalAmount: string;
  taxAmount: string;
}): string;

export function invoiceQrTextFromDocument(document: {
  invoiceNumber?: string | null;
  date?: string | Date | null;
  createdAt?: string | Date | null;
  netAmount?: number;
  taxAmount?: number;
}): string;
