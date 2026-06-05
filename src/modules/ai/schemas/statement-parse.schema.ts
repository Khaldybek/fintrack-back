export type StatementParseRowRaw = {
  date: string;
  amount_minor: number;
  memo: string;
};

export type StatementParseRawResult = {
  transactions: StatementParseRowRaw[];
};

export function getStatementParseResponseSchema(currency: string) {
  return {
    name: 'statement_parse',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              amount_minor: {
                type: 'integer',
                description: `Signed amount in minor units for ${currency}. Expense negative, income positive.`,
              },
              memo: { type: 'string' },
            },
            required: ['date', 'amount_minor', 'memo'],
            additionalProperties: false,
          },
        },
      },
      required: ['transactions'],
      additionalProperties: false,
    },
  };
}
