import type { BankCode, BankDetection, ColumnMap } from './parser.types';

const KASPI_MARKERS = [/kaspi/i, /каспи/i, /kaspi\s*bank/i, /kaspi\s*gold/i];
const HALYK_MARKERS = [/halyk/i, /халык/i, /halykbank/i];

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}

function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    const joined = row.join(' ').toLowerCase();
    if (
      /дата|date/.test(joined) &&
      (/сумм|amount|дебет|кредит|операц|description|назначен/i.test(joined))
    ) {
      return i;
    }
  }
  return 0;
}

export function detectBankFromText(text: string): BankCode | null {
  if (KASPI_MARKERS.some((p) => p.test(text))) return 'kaspi';
  if (HALYK_MARKERS.some((p) => p.test(text))) return 'halyk';
  return null;
}

export function buildKaspiColumnMap(headers: string[]): ColumnMap | null {
  const dateIdx = findColumnIndex(headers, [/^дата$/, /^date$/i, /дата операции/i]);
  const amountIdx = findColumnIndex(headers, [/^сумма$/i, /^amount$/i, /сумма операции/i]);
  const debitIdx = findColumnIndex(headers, [/дебет/i, /расход/i, /списан/i]);
  const creditIdx = findColumnIndex(headers, [/кредит/i, /приход/i, /зачислен/i]);
  const memoIdx = findColumnIndex(headers, [
    /операция/i,
    /описание/i,
    /детали/i,
    /назначение/i,
    /description/i,
    /merchant/i,
    /контрагент/i,
  ]);

  if (dateIdx < 0) return null;
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) return null;
  if (memoIdx < 0) return null;

  return {
    headerRowIndex: 0,
    date: dateIdx,
    amount: amountIdx >= 0 ? amountIdx : undefined,
    debit: debitIdx >= 0 ? debitIdx : undefined,
    credit: creditIdx >= 0 ? creditIdx : undefined,
    memo: memoIdx,
  };
}

export function buildHalykColumnMap(headers: string[]): ColumnMap | null {
  const dateIdx = findColumnIndex(headers, [/^дата$/i, /^date$/i, /дата проводки/i]);
  const amountIdx = findColumnIndex(headers, [/^сумма$/i, /^amount$/i]);
  const debitIdx = findColumnIndex(headers, [/дебет/i, /dt/i, /расход/i]);
  const creditIdx = findColumnIndex(headers, [/кредит/i, /kt/i, /приход/i]);
  const memoIdx = findColumnIndex(headers, [
    /назначение/i,
    /описание/i,
    /детали/i,
    /description/i,
    /операция/i,
  ]);

  if (dateIdx < 0) return null;
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) return null;
  if (memoIdx < 0) return null;

  return {
    headerRowIndex: 0,
    date: dateIdx,
    amount: amountIdx >= 0 ? amountIdx : undefined,
    debit: debitIdx >= 0 ? debitIdx : undefined,
    credit: creditIdx >= 0 ? creditIdx : undefined,
    memo: memoIdx,
  };
}

export function detectBankFromTabular(rows: string[][]): BankDetection {
  const flatText = rows.slice(0, 25).map((r) => r.join(' ')).join('\n');
  const bankFromText = detectBankFromText(flatText);

  const headerRowIndex = detectHeaderRow(rows);
  const headers = rows[headerRowIndex] ?? [];

  let columnMap: ColumnMap | undefined;
  let bankCode: BankCode = 'generic';
  let confidence = 0.5;

  if (bankFromText === 'kaspi') {
    const map = buildKaspiColumnMap(headers);
    if (map) {
      columnMap = { ...map, headerRowIndex };
      bankCode = 'kaspi';
      confidence = 0.9;
    } else {
      bankCode = 'kaspi';
      confidence = 0.6;
    }
  } else if (bankFromText === 'halyk') {
    const map = buildHalykColumnMap(headers);
    if (map) {
      columnMap = { ...map, headerRowIndex };
      bankCode = 'halyk';
      confidence = 0.9;
    } else {
      bankCode = 'halyk';
      confidence = 0.6;
    }
  } else {
    const kaspiMap = buildKaspiColumnMap(headers);
    const halykMap = buildHalykColumnMap(headers);
    if (kaspiMap) {
      columnMap = { ...kaspiMap, headerRowIndex };
      bankCode = 'generic';
      confidence = 0.7;
    } else if (halykMap) {
      columnMap = { ...halykMap, headerRowIndex };
      bankCode = 'generic';
      confidence = 0.7;
    }
  }

  return { bankCode, confidence, columnMap };
}
