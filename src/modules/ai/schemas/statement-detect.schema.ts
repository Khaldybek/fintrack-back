export type StatementDetectRawResult = {
  bank_code: 'kaspi' | 'halyk' | 'generic';
  confidence: number;
  header_row_index: number;
  date_column: number;
  amount_column: number | null;
  debit_column: number | null;
  credit_column: number | null;
  memo_column: number;
};

export const STATEMENT_DETECT_RESPONSE_SCHEMA = {
  name: 'statement_detect',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      bank_code: { type: 'string', enum: ['kaspi', 'halyk', 'generic'] },
      confidence: { type: 'number' },
      header_row_index: { type: 'integer' },
      date_column: { type: 'integer' },
      amount_column: { type: ['integer', 'null'] },
      debit_column: { type: ['integer', 'null'] },
      credit_column: { type: ['integer', 'null'] },
      memo_column: { type: 'integer' },
    },
    required: [
      'bank_code',
      'confidence',
      'header_row_index',
      'date_column',
      'amount_column',
      'debit_column',
      'credit_column',
      'memo_column',
    ],
    additionalProperties: false,
  },
};
