const SYSTEM = `Ты определяешь категорию расхода/дохода и нормализуешь название мерчанта по тексту (memo из банка/приложения).
- Выбери ОДНУ категорию из списка ниже. Только точное название из списка.
- Нормализуй мерчанта: Yandex*Go, YGO, Yandex Taxi → "Яндекс Такси"; Магнум, MAGNUM → "Магнум"; и т.п. Кратко, без лишнего.
- confidence: 1 если уверен, 0.5-0.9 если сомневаешься.
- Язык: русский или казахский.`;

function buildUserPrompt(memo: string, categoryNames: string[]): string {
  const list = categoryNames.length ? categoryNames.join(', ') : 'Прочее';
  return `Категории (выбери одну): ${list}

Memo: "${memo}"

Верни JSON: category_name (из списка), merchant_canonical (нормализованное название), confidence.`;
}

export function getSuggestCategoryMessages(
  memo: string,
  categoryNames: string[],
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUserPrompt(memo.trim(), categoryNames) },
  ];
}
