import type { ColumnMap, ParsedRow } from './parser.types';
import {
  majorToSignedMinorFromDebitCredit,
  normalizeMemo,
  parseSignedAmountCell,
  parseStatementDate,
} from './amount-date.util';

export function parseTabularRows(
  rows: string[][],
  columnMap: ColumnMap,
  currency: string,
): ParsedRow[] {
  const result: ParsedRow[] = [];
  const start = columnMap.headerRowIndex + 1;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;

    const dateRaw = row[columnMap.date] ?? '';
    const date = parseStatementDate(dateRaw);
    if (!date) continue;

    let amountMinor: number | null = null;
    if (columnMap.amount !== undefined) {
      amountMinor = parseSignedAmountCell(row[columnMap.amount] ?? '', currency);
    } else {
      amountMinor = majorToSignedMinorFromDebitCredit(
        row[columnMap.debit ?? -1] ?? '',
        row[columnMap.credit ?? -1] ?? '',
        currency,
      );
    }
    if (amountMinor == null || amountMinor === 0) continue;

    const memo = normalizeMemo(row[columnMap.memo] ?? '');
    if (!memo) continue;

    result.push({
      date,
      amountMinor,
      memo,
      raw: { cells: row, rowIndex: i },
    });
  }

  return result;
}

export function aiColumnMapToInternal(
  map: {
    header_row_index: number;
    date_column: number;
    amount_column?: number | null;
    debit_column?: number | null;
    credit_column?: number | null;
    memo_column: number;
  },
): ColumnMap {
  return {
    headerRowIndex: map.header_row_index,
    date: map.date_column,
    amount: map.amount_column ?? undefined,
    debit: map.debit_column ?? undefined,
    credit: map.credit_column ?? undefined,
    memo: map.memo_column,
  };
}
