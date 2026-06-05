import { createHash } from 'crypto';

export function normalizeMemoForFingerprint(memo: string): string {
  return (memo || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

export function buildTransactionFingerprint(
  accountId: string,
  date: string,
  amountMinor: number,
  memo: string,
): string {
  const payload = [
    accountId,
    date,
    String(amountMinor),
    normalizeMemoForFingerprint(memo),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 64);
}
