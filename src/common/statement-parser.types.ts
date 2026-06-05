export type BankCode = 'kaspi' | 'halyk' | 'generic';

export type ColumnMap = {
  date: number;
  amount?: number;
  debit?: number;
  credit?: number;
  memo: number;
  headerRowIndex: number;
};

export const BANK_NAMES: Record<BankCode, string> = {
  kaspi: 'Kaspi Bank',
  halyk: 'Halyk Bank',
  generic: 'Другой банк',
};
