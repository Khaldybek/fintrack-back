/** Minor units per major unit (KZT: 1 — храним целые тенге; USD/EUR: центы). */
const MINOR_PER_UNIT: Record<string, number> = {
  KZT: 1,
  RUB: 100,
  USD: 100,
  EUR: 100,
};

const DEFAULT_MINOR = 100;

/** Сколько минорных единиц в одной «основной» единице валюты (для парсинга / отображения). */
export function getMinorPerUnit(currency: string): number {
  return MINOR_PER_UNIT[currency] ?? DEFAULT_MINOR;
}

/**
 * Format amount_minor for API response (spec: amount_minor, currency, formatted).
 * KZT: no decimals in practice, space as thousand sep.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  const minorPerUnit = getMinorPerUnit(currency);
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

/** Сумма в «основных» единицах (как в фразе пользователя) → signed amount_minor. */
export function majorAmountToSignedMinor(
  signedMajor: number,
  currency: string,
): number {
  const per = getMinorPerUnit(currency);
  return Math.round(signedMajor * per);
}
