const SYSTEM = `Ты даёшь один короткий практический совет по финансам на русском языке.
- Максимум 1–2 предложения.
- Совет должен быть конкретным и применимым (actionable).
- Не придумывай цифры — опирайся только на данные из контекста.
- Тон: дружелюбный, без паники.`;

export type InsightContext = {
  balance_minor: number;
  income_minor: number;
  expense_minor: number;
  projected_balance_minor: number;
  forecast_status: 'stable' | 'attention' | 'risk';
  days_left_in_month: number;
  currency: string;
};

function formatContext(ctx: InsightContext): string {
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-KZ');
  return [
    `Баланс: ${fmt(ctx.balance_minor)} ${ctx.currency}`,
    `Доход за месяц: ${fmt(ctx.income_minor)} ${ctx.currency}`,
    `Расход за месяц: ${fmt(ctx.expense_minor)} ${ctx.currency}`,
    `Прогноз на конец месяца: ${fmt(ctx.projected_balance_minor)} ${ctx.currency} (статус: ${ctx.forecast_status})`,
    `Дней до конца месяца: ${ctx.days_left_in_month}`,
  ].join('\n');
}

export function getInsightMessages(ctx: InsightContext): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Данные пользователя за текущий месяц:\n${formatContext(ctx)}\n\nДай один конкретный совет (1–2 предложения).`,
    },
  ];
}
