const SYSTEM = `Объясни кратко (1–2 предложения) ситуацию с прогнозом баланса на конец месяца.
Тон: нейтральный, спокойный. При риске — короткая рекомендация без паники. На русском.`;

export type ForecastExplanationContext = {
  balance_minor: number;
  projected_balance_minor: number;
  status: 'stable' | 'attention' | 'risk';
  days_left: number;
  currency: string;
};

function formatContext(ctx: ForecastExplanationContext): string {
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-KZ');
  return [
    `Текущий баланс: ${fmt(ctx.balance_minor)} ${ctx.currency}`,
    `Прогноз на конец месяца: ${fmt(ctx.projected_balance_minor)} ${ctx.currency}`,
    `Статус: ${ctx.status}`,
    `Дней до конца месяца: ${ctx.days_left}`,
  ].join('\n');
}

export function getForecastExplanationMessages(
  ctx: ForecastExplanationContext,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Данные:\n${formatContext(ctx)}\n\nКраткое объяснение (1–2 предложения):`,
    },
  ];
}
