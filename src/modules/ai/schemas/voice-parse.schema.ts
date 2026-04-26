import { getMinorPerUnit } from '../../../common/money.util';

export type VoiceParseRawResult = {
  amount_minor: number;
  date: string;
  memo: string;
  category_name: string;
  account_name: string;
  confidence: number;
};

function amountMinorDescription(currency: string): string {
  const per = getMinorPerUnit(currency);
  if (per === 1) {
    return `Signed integer: same as whole ${currency} units (545 ${currency} expense → -545). Income positive.`;
  }
  return `Signed integer: multiply major ${currency} units by ${per} (e.g. $12.50 expense → -1250). Income positive.`;
}

/**
 * JSON Schema for OpenAI structured output. `amount_minor` must match getMinorPerUnit(currency).
 */
export function getVoiceParseResponseSchema(currency: string): {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} {
  return {
    name: 'voice_parse_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        amount_minor: {
          type: 'integer',
          description: amountMinorDescription(currency),
        },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD. Use reference_date for relative words like yesterday, today.',
        },
        memo: {
          type: 'string',
          description: 'Short description: merchant, purpose, or empty if not mentioned.',
        },
        category_name: {
          type: 'string',
          description: 'Exact category name from the provided list, or empty string if unclear.',
        },
        account_name: {
          type: 'string',
          description: 'Exact account name from the provided list, or empty string if not mentioned.',
        },
        confidence: {
          type: 'number',
          description: 'Confidence 0-1. 1 = sure, <0.7 = user should verify.',
        },
      },
      required: ['amount_minor', 'date', 'memo', 'category_name', 'account_name', 'confidence'],
      additionalProperties: false,
    },
  };
}
