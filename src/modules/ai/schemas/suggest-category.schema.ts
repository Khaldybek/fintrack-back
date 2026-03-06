/**
 * JSON Schema for suggest-category: memo → category name + canonical merchant.
 */
export const SUGGEST_CATEGORY_RESPONSE_SCHEMA: {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} = {
  name: 'suggest_category_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      category_name: {
        type: 'string',
        description: 'Exact category name from the provided list (expense categories preferred for positive amount).',
      },
      merchant_canonical: {
        type: 'string',
        description: 'Normalized merchant name, e.g. Yandex*Go -> Яндекс Такси.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence 0-1.',
      },
    },
    required: ['category_name', 'merchant_canonical', 'confidence'],
    additionalProperties: false,
  },
};

export type SuggestCategoryRawResult = {
  category_name: string;
  merchant_canonical: string;
  confidence: number;
};
