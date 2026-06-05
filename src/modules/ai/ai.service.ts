import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { getVoiceParseMessages } from './prompts/voice-parse.prompt';
import { getSuggestCategoryMessages } from './prompts/suggest-category.prompt';
import { getInsightMessages, type InsightContext } from './prompts/insight.prompt';
import {
  getForecastExplanationMessages,
  type ForecastExplanationContext,
} from './prompts/forecast-explanation.prompt';
import { getVoiceParseResponseSchema, type VoiceParseRawResult } from './schemas/voice-parse.schema';
import {
  SUGGEST_CATEGORY_RESPONSE_SCHEMA,
  type SuggestCategoryRawResult,
} from './schemas/suggest-category.schema';
import { getReceiptExtractResponseSchema, type ReceiptExtractRawResult } from './schemas/receipt-extract.schema';
import {
  MONTHLY_SUMMARY_RESPONSE_SCHEMA,
  type MonthlySummaryRawResult,
} from './schemas/monthly-summary.schema';
import { getReceiptExtractSystem } from './prompts/receipt-extract.prompt';
import {
  getMonthlySummaryMessages,
  getMonthNameRu,
  type MonthlySummaryContext,
} from './prompts/monthly-summary.prompt';
import { getStatementDetectMessages } from './prompts/statement-detect.prompt';
import { getStatementParseMessages } from './prompts/statement-parse.prompt';
import {
  STATEMENT_DETECT_RESPONSE_SCHEMA,
  type StatementDetectRawResult,
} from './schemas/statement-detect.schema';
import {
  getStatementParseResponseSchema,
  type StatementParseRawResult,
} from './schemas/statement-parse.schema';
import type { BankCode, ColumnMap } from '../../common/statement-parser.types';

function aiColumnMapToInternal(map: StatementDetectRawResult): ColumnMap {
  return {
    headerRowIndex: map.header_row_index,
    date: map.date_column,
    amount: map.amount_column ?? undefined,
    debit: map.debit_column ?? undefined,
    credit: map.credit_column ?? undefined,
    memo: map.memo_column,
  };
}

@Injectable()
export class AiService {
  private readonly client: OpenAI | null = null;
  private readonly enabled: boolean;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const ai = this.configService.get<{ apiKey?: string; enabled?: boolean; model?: string; timeoutMs?: number }>('ai');
    const apiKey = ai?.apiKey?.trim() ?? '';
    this.enabled = (ai?.enabled !== false && Boolean(apiKey)) ?? false;
    this.model = ai?.model ?? 'gpt-4o-mini';
    this.timeoutMs = ai?.timeoutMs ?? 12000;

    if (this.enabled && apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Call OpenAI chat with optional timeout and structured output.
   * Returns null on error or when AI is disabled (caller should fallback).
   */
  async chat(params: {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    responseFormat?: { type: 'json_schema'; json_schema: { name: string; strict?: boolean; schema: object } };
    maxTokens?: number;
    temperature?: number;
  }): Promise<OpenAI.Chat.ChatCompletion | null> {
    if (!this.client) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: params.messages,
          max_tokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.2,
          response_format: params.responseFormat as OpenAI.Chat.ChatCompletionCreateParams['response_format'],
        },
        { signal: controller.signal },
      );
      return completion;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') return null;
        // Log but don't throw - caller will fallback
        console.warn('[AiService] OpenAI error:', err.message);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse user text (e.g. "1500 на такси вчера") into transaction fields.
   * Returns null if AI disabled or error (caller should use regex fallback).
   */
  async parseTransactionFromText(
    text: string,
    context: {
      referenceDate: string;
      categoryNames: string[];
      accountNames: string[];
      currency: string;
    },
  ): Promise<VoiceParseRawResult | null> {
    const currency = context.currency?.trim() || 'KZT';
    const messages = getVoiceParseMessages(
      text.trim(),
      context.referenceDate,
      context.categoryNames,
      context.accountNames,
      currency,
    );
    const completion = await this.chat({
      messages,
      responseFormat: {
        type: 'json_schema',
        json_schema: getVoiceParseResponseSchema(currency),
      },
      maxTokens: 200,
      temperature: 0.1,
    });
    if (!completion?.choices?.[0]?.message?.content) return null;
    try {
      const parsed = JSON.parse(completion.choices[0].message.content) as VoiceParseRawResult;
      if (typeof parsed.amount_minor !== 'number' || typeof parsed.confidence !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Suggest category and canonical merchant name for a memo.
   * Returns null if AI disabled or error (caller uses keyword fallback).
   */
  async suggestCategory(
    memo: string,
    categoryNames: string[],
  ): Promise<SuggestCategoryRawResult | null> {
    if (!memo?.trim() || categoryNames.length === 0) return null;
    const messages = getSuggestCategoryMessages(memo.trim(), categoryNames);
    const completion = await this.chat({
      messages,
      responseFormat: {
        type: 'json_schema',
        json_schema: SUGGEST_CATEGORY_RESPONSE_SCHEMA,
      },
      maxTokens: 150,
      temperature: 0,
    });
    if (!completion?.choices?.[0]?.message?.content) return null;
    try {
      const parsed = JSON.parse(completion.choices[0].message.content) as SuggestCategoryRawResult;
      if (typeof parsed.confidence !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Generate one short actionable insight from dashboard context.
   * Returns null if AI disabled or error (caller uses fallback text).
   */
  async generateInsight(context: InsightContext): Promise<string | null> {
    const messages = getInsightMessages(context);
    const completion = await this.chat({
      messages,
      maxTokens: 150,
      temperature: 0.5,
    });
    const text = completion?.choices?.[0]?.message?.content?.trim();
    return text || null;
  }

  /**
   * Explain forecast in 1–2 human-readable sentences.
   * Returns null if AI disabled or error (caller keeps template explanation).
   */
  async explainForecast(context: ForecastExplanationContext): Promise<string | null> {
    const messages = getForecastExplanationMessages(context);
    const completion = await this.chat({
      messages,
      maxTokens: 100,
      temperature: 0.3,
    });
    const text = completion?.choices?.[0]?.message?.content?.trim();
    return text || null;
  }

  /**
   * Extract amount, date, memo from receipt image (Vision).
   * Returns null if AI disabled or error.
   */
  async extractReceipt(
    imageBase64: string,
    mime: string,
    currency = 'KZT',
  ): Promise<ReceiptExtractRawResult | null> {
    if (!this.client || !imageBase64) return null;
    const cur = currency?.trim() || 'KZT';
    const dataUrl = `data:${mime};base64,${imageBase64}`;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: getReceiptExtractSystem(cur) },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];
    const completion = await this.chat({
      messages,
      responseFormat: {
        type: 'json_schema',
        json_schema: getReceiptExtractResponseSchema(cur),
      },
      maxTokens: 200,
      temperature: 0.1,
    });
    if (!completion?.choices?.[0]?.message?.content) return null;
    try {
      const parsed = JSON.parse(completion.choices[0].message.content) as ReceiptExtractRawResult;
      if (typeof parsed.amount_minor !== 'number') return null;
      if (parsed.amount_minor > 0) parsed.amount_minor = -parsed.amount_minor;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Generate monthly report summary and share-ready text.
   * Returns null if AI disabled or error.
   */
  /**
   * Detect bank and column mapping from tabular statement sample.
   */
  async detectStatementStructure(
    sampleText: string,
  ): Promise<{ bankCode: BankCode; confidence: number; columnMap: ColumnMap } | null> {
    if (!sampleText.trim()) return null;
    const completion = await this.chat({
      messages: getStatementDetectMessages(sampleText),
      responseFormat: {
        type: 'json_schema',
        json_schema: STATEMENT_DETECT_RESPONSE_SCHEMA,
      },
      maxTokens: 300,
      temperature: 0,
    });
    if (!completion?.choices?.[0]?.message?.content) return null;
    try {
      const parsed = JSON.parse(
        completion.choices[0].message.content,
      ) as StatementDetectRawResult;
      if (typeof parsed.confidence !== 'number') return null;
      const bankCode = ['kaspi', 'halyk', 'generic'].includes(parsed.bank_code)
        ? parsed.bank_code
        : 'generic';
      return {
        bankCode,
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        columnMap: aiColumnMapToInternal(parsed),
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract transactions from unstructured statement text (PDF chunks, fallback).
   */
  async parseStatementFromText(
    text: string,
    currency: string,
  ): Promise<Array<{ date: string; amountMinor: number; memo: string }>> {
    if (!text.trim()) return [];
    const cur = currency?.trim() || 'KZT';
    const completion = await this.chat({
      messages: getStatementParseMessages(text, cur),
      responseFormat: {
        type: 'json_schema',
        json_schema: getStatementParseResponseSchema(cur),
      },
      maxTokens: 4000,
      temperature: 0.1,
    });
    if (!completion?.choices?.[0]?.message?.content) return [];
    try {
      const parsed = JSON.parse(
        completion.choices[0].message.content,
      ) as StatementParseRawResult;
      if (!Array.isArray(parsed.transactions)) return [];
      return parsed.transactions
        .filter(
          (t) =>
            typeof t.amount_minor === 'number' &&
            t.amount_minor !== 0 &&
            typeof t.date === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
            typeof t.memo === 'string' &&
            t.memo.trim().length > 0,
        )
        .map((t) => ({
          date: t.date,
          amountMinor: t.amount_minor,
          memo: t.memo.trim(),
        }));
    } catch {
      return [];
    }
  }

  async generateMonthlySummary(
    context: MonthlySummaryContext,
  ): Promise<{ summaryText: string; shareReadyText: string } | null> {
    const messages = getMonthlySummaryMessages(context);
    const completion = await this.chat({
      messages,
      responseFormat: {
        type: 'json_schema',
        json_schema: MONTHLY_SUMMARY_RESPONSE_SCHEMA,
      },
      maxTokens: 300,
      temperature: 0.4,
    });
    if (!completion?.choices?.[0]?.message?.content) return null;
    try {
      const parsed = JSON.parse(completion.choices[0].message.content) as MonthlySummaryRawResult;
      if (!parsed.summary_text || !parsed.share_ready_text) return null;
      return {
        summaryText: parsed.summary_text.trim(),
        shareReadyText: parsed.share_ready_text.trim(),
      };
    } catch {
      return null;
    }
  }
}
