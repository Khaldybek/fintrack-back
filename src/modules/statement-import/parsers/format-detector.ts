import type { FileFormat } from './parser.types';

const EXT_MAP: Record<string, FileFormat> = {
  csv: 'csv',
  xlsx: 'xlsx',
  xls: 'xlsx',
  pdf: 'pdf',
};

const MIME_MAP: Record<string, FileFormat> = {
  'text/csv': 'csv',
  'text/plain': 'csv',
  'application/csv': 'csv',
  'application/vnd.ms-excel': 'xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/pdf': 'pdf',
};

export function detectFileFormat(
  fileName: string,
  mime: string,
): FileFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = EXT_MAP[ext];
  if (fromExt) return fromExt;

  const normalizedMime = (mime || '').toLowerCase().split(';')[0].trim();
  const fromMime = MIME_MAP[normalizedMime];
  if (fromMime) return fromMime;

  if (normalizedMime === 'application/octet-stream' && fromExt) return fromExt;
  return null;
}

export function isAllowedStatementMime(mime: string, fileName: string): boolean {
  return detectFileFormat(fileName, mime) !== null;
}
