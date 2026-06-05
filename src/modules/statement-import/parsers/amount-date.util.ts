import { getMinorPerUnit } from '../../../common/money.util';

export function parseStatementDate(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmyDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmyDot) {
    const d = dmyDot[1].padStart(2, '0');
    const m = dmyDot[2].padStart(2, '0');
    return `${dmyDot[3]}-${m}-${d}`;
  }

  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmySlash) {
    const d = dmySlash[1].padStart(2, '0');
    const m = dmySlash[2].padStart(2, '0');
    return `${dmySlash[3]}-${m}-${d}`;
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function parseAmountToMinor(raw: string, currency: string): number | null {
  const cleaned = (raw || '')
    .replace(/\s/g, '')
    .replace(/₸|тг|kzt/gi, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num === 0) return null;
  const per = getMinorPerUnit(currency);
  return Math.round(Math.abs(num) * per);
}

export function signedAmountMinor(
  amount: number,
  direction: 'expense' | 'income',
  currency: string,
): number {
  const per = getMinorPerUnit(currency);
  const minor = Math.round(Math.abs(amount) * per);
  return direction === 'expense' ? -minor : minor;
}

export function parseSignedAmountCell(raw: string, currency: string): number | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const negative = /^-/.test(s) || /^\(.*\)$/.test(s);
  const minor = parseAmountToMinor(s, currency);
  if (minor == null) return null;
  return negative ? -minor : minor;
}

export function majorToSignedMinorFromDebitCredit(
  debitRaw: string,
  creditRaw: string,
  currency: string,
): number | null {
  const debit = parseAmountToMinor(debitRaw, currency);
  const credit = parseAmountToMinor(creditRaw, currency);
  if (credit && credit > 0) return credit;
  if (debit && debit > 0) return -debit;
  return null;
}

export function normalizeMemo(raw: string): string {
  return (raw || '').replace(/\s+/g, ' ').trim();
}
