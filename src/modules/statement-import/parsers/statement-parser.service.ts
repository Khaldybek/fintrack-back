import { Injectable } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { detectFileFormat } from './format-detector';
import { detectBankFromTabular, detectBankFromText } from './bank-detector';
import { readTabularFile, tabularToSampleText } from './tabular.reader';
import { parseTabularRows, aiColumnMapToInternal } from './tabular.parser';
import { extractPdfText, chunkText } from './pdf-text.parser';
import type { BankDetection, ParsedRow, ParseResult } from './parser.types';
import { MAX_STATEMENT_ROWS as MAX_ROWS } from './parser.types';

@Injectable()
export class StatementParserService {
  constructor(private readonly aiService: AiService) {}

  async parseFile(
    buffer: Buffer,
    fileName: string,
    mime: string,
    currency: string,
  ): Promise<ParseResult> {
    const format = detectFileFormat(fileName, mime);
    if (!format) {
      throw new Error('Unsupported file format');
    }

    if (format === 'pdf') {
      return this.parsePdf(buffer, currency);
    }
    return this.parseTabularFile(buffer, format, currency);
  }

  private async parseTabularFile(
    buffer: Buffer,
    format: 'csv' | 'xlsx',
    currency: string,
  ): Promise<ParseResult> {
    const rows = await readTabularFile(buffer, format);
    if (rows.length === 0) {
      return {
        rows: [],
        bank: { bankCode: 'generic', confidence: 0 },
        format,
      };
    }

    let bank = detectBankFromTabular(rows);
    let parsed: ParsedRow[] = [];

    if (bank.columnMap) {
      parsed = parseTabularRows(rows, bank.columnMap, currency);
    }

    if (parsed.length === 0 && this.aiService.isEnabled()) {
      const sample = tabularToSampleText(rows);
      const aiDetect = await this.aiService.detectStatementStructure(sample);
      if (aiDetect?.columnMap) {
        bank = {
          bankCode: aiDetect.bankCode,
          confidence: aiDetect.confidence,
          columnMap: aiDetect.columnMap,
        };
        parsed = parseTabularRows(rows, aiDetect.columnMap, currency);
      }
    }

    if (parsed.length === 0 && this.aiService.isEnabled()) {
      const flat = rows.map((r) => r.join('\t')).join('\n').slice(0, 12000);
      const fromText = await this.aiService.parseStatementFromText(flat, currency);
      parsed = fromText;
      const textBank = detectBankFromText(flat);
      if (textBank) {
        bank = { bankCode: textBank, confidence: 0.65 };
      }
    }

    return {
      rows: this.limitRows(parsed),
      bank,
      format,
    };
  }

  private async parsePdf(buffer: Buffer, currency: string): Promise<ParseResult> {
    const text = await extractPdfText(buffer);
    const bankCode = detectBankFromText(text) ?? 'generic';
    const bank: BankDetection = {
      bankCode,
      confidence: bankCode === 'generic' ? 0.5 : 0.75,
    };

    let parsed: ParsedRow[] = [];
    if (this.aiService.isEnabled() && text.length > 0) {
      const chunks = chunkText(text);
      const all: ParsedRow[] = [];
      for (const chunk of chunks) {
        const part = await this.aiService.parseStatementFromText(chunk, currency);
        all.push(...part);
        if (all.length >= MAX_ROWS) break;
      }
      parsed = this.dedupeRows(all);
    }

    return {
      rows: this.limitRows(parsed),
      bank,
      format: 'pdf',
    };
  }

  private limitRows(rows: ParsedRow[]): ParsedRow[] {
    return rows.slice(0, MAX_ROWS);
  }

  private dedupeRows(rows: ParsedRow[]): ParsedRow[] {
    const seen = new Set<string>();
    const out: ParsedRow[] = [];
    for (const r of rows) {
      const key = `${r.date}|${r.amountMinor}|${r.memo.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }
}
