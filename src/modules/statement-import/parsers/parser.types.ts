import type { BankCode, ColumnMap } from '../../../common/statement-parser.types';

export type { BankCode, ColumnMap };
export { BANK_NAMES } from '../../../common/statement-parser.types';

export type FileFormat = 'csv' | 'xlsx' | 'pdf';

export type ParsedRow = {
  date: string;
  amountMinor: number;
  memo: string;
  raw?: Record<string, unknown>;
  parseWarning?: string | null;
};

export type BankDetection = {
  bankCode: BankCode;
  confidence: number;
  columnMap?: ColumnMap;
};

export type ParseResult = {
  rows: ParsedRow[];
  bank: BankDetection;
  format: FileFormat;
};

export const MAX_STATEMENT_ROWS = 1000;
export const MAX_STATEMENT_FILE_SIZE = 10 * 1024 * 1024;
export const PREVIEW_TTL_HOURS = 48;
