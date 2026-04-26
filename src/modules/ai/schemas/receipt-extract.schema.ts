import { getMinorPerUnit } from '../../../common/money.util';

export type ReceiptExtractRawResult = {
  amount_minor: number;
  date: string;
  memo: string;
};

function receiptAmountDescription(currency: string): string {
  const per = getMinorPerUnit(currency);
  if (per === 1) {
    return `Total on receipt in whole ${currency} units as signed integer; expense negative (e.g. 2500 on receipt → -2500).`;
  }
  return `Total in minor units (×${per} per major unit); expense negative.`;
}

export function getReceiptExtractResponseSchema(currency: string): {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} {
  return {
    name: 'receipt_extract_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        amount_minor: {
          type: 'integer',
          description: receiptAmountDescription(currency),
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
}
