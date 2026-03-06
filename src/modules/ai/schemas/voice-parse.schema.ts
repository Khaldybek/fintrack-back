/**
 * JSON Schema for OpenAI structured output: voice/text → transaction fields.
 * Amount in minor units (KZT: 1 tenge = 100 minor). Expense = negative.
 */
export const VOICE_PARSE_RESPONSE_SCHEMA: {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} = {
  name: 'voice_parse_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      amount_minor: {
        type: 'integer',
        description:
          'Amount in minor units (for KZT: 1500 tenge = 150000). Negative for expense, positive for income.',
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

export type VoiceParseRawResult = {
  amount_minor: number;
  date: string;
  memo: string;
  category_name: string;
  account_name: string;
  confidence: number;
};
