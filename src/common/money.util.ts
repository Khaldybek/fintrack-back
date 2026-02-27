/** Minor units per unit (e.g. 100 for KZT/RUB, 100 for USD cents) */
const MINOR_PER_UNIT: Record<string, number> = {
  KZT: 1,   // KZT: 1 tiyn = 1/100 tenge, but often stored as integer tenge
  RUB: 100,
  USD: 100,
  EUR: 100,
};

const DEFAULT_MINOR = 100;

/**
 * Format amount_minor for API response (spec: amount_minor, currency, formatted).
 * KZT: no decimals in practice, space as thousand sep.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  const minorPerUnit = MINOR_PER_UNIT[currency] ?? DEFAULT_MINOR;
  const value = amountMinor / minorPerUnit;
  const hasDecimals = (minorPerUnit > 1 && amountMinor % minorPerUnit !== 0) || minorPerUnit === 1;
  const formatted = hasDecimals
    ? value.toLocaleString('ru-KZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : Math.round(value).toLocaleString('ru-KZ');
  const symbol = currency === 'KZT' ? '₸' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  return `${formatted} ${symbol}`.trim();
}

export function toMoneyDto(amountMinor: number, currency: string) {
  return {
    amount_minor: amountMinor,
    currency,
    formatted: formatMoney(amountMinor, currency),
  };
}
