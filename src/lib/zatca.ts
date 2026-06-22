export function generateZatcaQrCode(
  sellerName: string,
  trn: string,
  timestamp: string,
  totalAmount: string,
  vatAmount: string
): string {
  const getTlv = (tag: number, value: string): Buffer => {
    const valueBuffer = Buffer.from(value, 'utf-8');
    const tagBuffer = Buffer.from([tag]);
    const lengthBuffer = Buffer.from([valueBuffer.length]);
    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
  };

  const tag1 = getTlv(1, sellerName);
  const tag2 = getTlv(2, trn);
  const tag3 = getTlv(3, timestamp);
  const tag4 = getTlv(4, totalAmount);
  const tag5 = getTlv(5, vatAmount);

  const tlvBuffer = Buffer.concat([tag1, tag2, tag3, tag4, tag5]);
  return tlvBuffer.toString('base64');
}
