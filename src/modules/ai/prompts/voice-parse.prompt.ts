const SYSTEM = `Ты парсишь короткие фразы о тратах или доходах в структурированные поля.
- Язык: русский или казахский.
- Сумма: всегда в минорных единицах (для тенге: 1 тенге = 100 минорных единиц). Например: 1500 тенге = 150000, 50 000 тенге = 5000000.
- Расход: amount_minor отрицательный. Доход: положительный.
- Дата: только YYYY-MM-DD. Для "вчера", "сегодня", "позавчера" используй reference_date.
- category_name и account_name: только точные значения из списков ниже. Если неясно — пустая строка.
- confidence: 1 если всё однозначно, 0.5-0.9 если есть сомнения, <0.5 если фраза непонятна.`;

function buildUserPrompt(
  text: string,
  referenceDate: string,
  categoryNames: string[],
  accountNames: string[],
): string {
  const categories = categoryNames.length ? categoryNames.join(', ') : '—';
  const accounts = accountNames.length ? accountNames.join(', ') : '—';
  return `reference_date: ${referenceDate}
Категории (выбери одну или оставь пусто): ${categories}
Счета (выбери один или оставь пусто): ${accounts}

Фраза пользователя: "${text}"

Верни JSON по схеме.`;
}

export function getVoiceParseMessages(
  text: string,
  referenceDate: string,
  categoryNames: string[],
  accountNames: string[],
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUserPrompt(text, referenceDate, categoryNames, accountNames) },
  ];
}
