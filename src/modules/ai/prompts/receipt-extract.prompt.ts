import { getMinorPerUnit } from '../../../common/money.util';

export function getReceiptExtractSystem(currency: string): string {
  const per = getMinorPerUnit(currency);
  const scale =
    per === 1
      ? `Сумма на чеке в целых ${currency} (как напечатано). Итог 2500 → amount_minor -2500 (расход отрицательный).`
      : `Сумма: умножь итог в основных единицах на ${per} для amount_minor. Расход = отрицательное число.`;
  return `Извлеки из изображения чека данные. Язык чека: русский, казахский или английский.
Валюта: ${currency}.
- ${scale}
- Дата: YYYY-MM-DD. Если нет даты — пустая строка.
- Магазин: краткое название (например "Магнум, Алматы").`;
}
