/**
 * JSON Schema for receipt image extraction (Vision API).
 */
export const RECEIPT_EXTRACT_RESPONSE_SCHEMA: {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} = {
  name: 'receipt_extract_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      amount_minor: {
        type: 'integer',
        description: 'Total amount in minor units (expense = negative). KZT: 1 tenge = 100 minor.',
      },
      date: {
        type: 'string',
        description: 'Date from receipt in YYYY-MM-DD, or empty string if not found.',
      },
      memo: {
        type: 'string',
        description: 'Store or merchant name, short (e.g. "Магнум, Алматы").',
      },
    },
    required: ['amount_minor', 'date', 'memo'],
    additionalProperties: false,
  },
};

export type ReceiptExtractRawResult = {
  amount_minor: number;
  date: string;
  memo: string;
};
