const SYSTEM = `Сгенерируй два текста по финансовым данным месяца на русском:
1. summary_text: короткий абзац (2-4 предложения) — доход, расход, основные категории, накопления.
2. share_ready_text: одно короткое предложение для соцсетей/шаринга, можно с эмодзи (до ~100 символов).`;

export type MonthlySummaryContext = {
  year: number;
  month: number;
  month_name_ru: string;
  income_minor: number;
  expense_minor: number;
  savings_minor: number;
  currency: string;
  top_categories: Array<{ name: string; expense_minor: number }>;
};

function formatContext(ctx: MonthlySummaryContext): string {
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-KZ');
  const lines = [
    `Период: ${ctx.month_name_ru} ${ctx.year}`,
    `Доход: ${fmt(ctx.income_minor)} ${ctx.currency}`,
    `Расход: ${fmt(ctx.expense_minor)} ${ctx.currency}`,
    `Накопления: ${fmt(ctx.savings_minor)} ${ctx.currency}`,
  ];
  if (ctx.top_categories.length > 0) {
    lines.push(
      'Топ категорий расходов: ' +
        ctx.top_categories.map((c) => `${c.name} (${fmt(c.expense_minor)})`).join(', '),
    );
  }
  return lines.join('\n');
}

export function getMonthlySummaryMessages(
  ctx: MonthlySummaryContext,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Данные:\n${formatContext(ctx)}\n\nВерни JSON: summary_text и share_ready_text.`,
    },
  ];
}

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function getMonthNameRu(month: number): string {
  return MONTHS_RU[Math.max(0, month - 1)] ?? 'Месяц';
}
