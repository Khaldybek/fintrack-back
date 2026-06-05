import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { FileFormat } from './parser.types';

export type TabularData = string[][];

export async function readTabularFile(
  buffer: Buffer,
  format: 'csv' | 'xlsx',
): Promise<TabularData> {
  if (format === 'csv') {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const records = parse(text, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
    return records.map((row) => row.map((c) => String(c ?? '').trim()));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (cells.length < colNumber - 1) cells.push('');
      const v = cell.value;
      if (v == null) {
        cells.push('');
      } else if (typeof v === 'object' && 'result' in v) {
        cells.push(String((v as { result?: unknown }).result ?? ''));
      } else if (v instanceof Date) {
        cells.push(v.toISOString().slice(0, 10));
      } else {
        cells.push(String(v).trim());
      }
    });
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  });
  return rows;
}

export function tabularToSampleText(rows: TabularData, maxRows = 15): string {
  return rows
    .slice(0, maxRows)
    .map((r) => r.join('\t'))
    .join('\n');
}

export function flattenTabularText(rows: TabularData): string {
  return rows.map((r) => r.join(' ')).join('\n');
}
