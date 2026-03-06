/**
 * JSON Schema for monthly report AI summary (two texts).
 */
export const MONTHLY_SUMMARY_RESPONSE_SCHEMA: {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} = {
  name: 'monthly_summary_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary_text: {
        type: 'string',
        description: 'Short paragraph: income, expense, main categories, savings. 2-4 sentences.',
      },
      share_ready_text: {
        type: 'string',
        description: 'One short sentence for social/share, can include emoji. Max ~100 chars.',
      },
    },
    required: ['summary_text', 'share_ready_text'],
    additionalProperties: false,
  },
};

export type MonthlySummaryRawResult = {
  summary_text: string;
  share_ready_text: string;
};
