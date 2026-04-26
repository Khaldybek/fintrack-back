import { getMinorPerUnit } from '../../../common/money.util';

function buildSystem(currency: string): string {
  const per = getMinorPerUnit(currency);
  const scaleRule =
    per === 1
      ? `Валюта ${currency}: amount_minor — целые единицы валюты (как на ценнике). 545 тенге расход → amount_minor -545. 1500 тенге → -1500.`
      : `Валюта ${currency}: умножь сумму в «основных» единицах на ${per} (например 12.50 USD → -1250).`;

  return `Ты парсишь короткие фразы о тратах или доходах в структурированные поля.
- Язык: русский или казахский.
- ${scaleRule}
- Расход: amount_minor отрицательный. Доход: положительный.
- Дата: только YYYY-MM-DD. Для "вчера", "сегодня", "позавчера" используй reference_date.
- category_name и account_name: только точные значения из списков ниже. Если неясно — пустая строка.
- confidence: 1 если всё однозначно, 0.5-0.9 если есть сомнения, <0.5 если фраза непонятна.`;
}

function buildUserPrompt(
  text: string,
  referenceDate: string,
  categoryNames: string[],
  accountNames: string[],
  currency: string,
): string {
  const categories = categoryNames.length ? categoryNames.join(', ') : '—';
  const accounts = accountNames.length ? accountNames.join(', ') : '—';
  return `reference_date: ${referenceDate}
Валюта пользователя (счета): ${currency}
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
  currency: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: buildSystem(currency) },
    {
      role: 'user',
      content: buildUserPrompt(text, referenceDate, categoryNames, accountNames, currency),
    },
  ];
}
