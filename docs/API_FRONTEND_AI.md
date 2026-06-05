# API для фронтенда — только AI-эндпоинты

Базовый URL: **`/v1`**. Все запросы с **JWT** (cookie или `Authorization: Bearer <token>`), с фронта — `credentials: 'include'` / `withCredentials: true`.

**Деньги:** суммы в **amount_minor**. **KZT:** целые тенге (545 ₸ расход → `-545`). **USD/EUR:** центы (×100). Расход — отрицательное число.

---

## 1. Текст/голос → транзакция

**`POST /v1/transactions/voice-parse`**

Парсит фразу («1500 на такси вчера») в поля транзакции. Без AI — только сумма и дата «сегодня».

| Передаём | Тип | Описание |
|----------|-----|----------|
| **body** | | |
| text | string | Фраза пользователя |

| Получаем | Тип | Описание |
|----------|-----|----------|
| amountMinor | number | Сумма в минорах (расход &lt; 0). KZT: 1500 ₸ → `-1500` |
| categoryId | string \| null | UUID категории |
| date | string | YYYY-MM-DD |
| memo | string \| null | Описание/мерчант |
| accountId | string \| null | UUID счёта |
| confidence | number | 0–1; при &lt; 0.7 показать «Проверьте» |

**Пример запроса:** `{ "text": "1500 на такси вчера" }`

---

## 2. Подсказка категории по memo

**`POST /v1/transactions/suggest-category`**

По тексту операции (из банка/приложения) — категория и нормализованное имя мерчанта.

| Передаём | Тип | Описание |
|----------|-----|----------|
| memo | string | Текст операции (до 500 символов) |
| amountMinor | number | Опционально |

| Получаем | Тип | Описание |
|----------|-----|----------|
| categoryId | string \| null | UUID категории |
| categoryName | string | Название категории |
| merchantCanonical | string | Нормализованное имя (напр. «Яндекс Такси») |
| confidence | number | 0–1 |

**Пример запроса:** `{ "memo": "Yandex*Go Taxi" }`

---

## 3. Чек по фото

**`POST /v1/transactions/receipt-ocr`**

Загрузка фото чека → сумма, дата, магазин, подсказка категории.

| Передаём | Описание |
|----------|----------|
| **body** | `multipart/form-data`, поле **`file`** — изображение |
| Форматы | image/jpeg, image/png, image/webp |
| Размер | макс. 10 MB |

| Получаем | Тип | Описание |
|----------|-----|----------|
| amountMinor | number | Сумма (расход &lt; 0), 0 если не распознано |
| date | string \| null | YYYY-MM-DD или null |
| memo | string \| null | Магазин |
| categoryId | string \| null | Подсказка категории |
| items | [] | Всегда пустой массив |

При нечитаемом фото/ошибке — нули и null, без 4xx.

---

## 4. Инсайт дня

**`GET /v1/dashboard/insight`**

Один персонализированный совет (по балансу и прогнозу). Кеш на бэке ~6 ч.

| Передаём | — |
|----------|---|
| Query/body | ничего |

| Получаем | Тип | Описание |
|----------|-----|----------|
| text | string | Текст совета (1–2 предложения) |
| severity | string | "good" \| "attention" \| "risk" |
| status | string | "stable" \| "attention" \| "risk" |

---

## 5. Прогноз (с AI-объяснением)

**`GET /v1/dashboard/forecast`**

Те же данные, что и раньше, плюс поле от AI.

| Получаем (дополнительно к обычному forecast) | Тип | Описание |
|----------------------------------------------|-----|----------|
| explanation | string | Всегда: шаблонное объяснение |
| **explanationAi** | string | Опционально: короткое объяснение от AI (1–2 предложения) |

Если AI выключен или ошибка — **explanationAi** в ответе нет.

---

## 6. AI-резюме месячного отчёта

**`GET /v1/analytics/monthly-report/summary`**

Текстовое резюме месяца для отчёта и шаринга.

| Передаём | Тип | Описание |
|----------|-----|----------|
| year | query, string | Год (напр. 2025). По умолчанию — текущий |
| month | query, string | Месяц 1–12. По умолчанию — текущий |

| Получаем | Тип | Описание |
|----------|-----|----------|
| summaryText | string | Абзац: доход, расход, категории, накопления |
| shareReadyText | string | Короткая строка для соцсетей (можно с эмодзи) |

Без данных за месяц: оба поля = `"Нет данных за период."`

**Пример:** `GET /v1/analytics/monthly-report/summary?year=2025&month=3`

---

## Сводная таблица (только AI)

| Метод | Путь | Передаём | Получаем |
|-------|------|----------|----------|
| POST | `/v1/transactions/voice-parse` | `{ text }` | amountMinor, date, memo, categoryId?, accountId?, confidence |
| POST | `/v1/transactions/suggest-category` | `{ memo, amountMinor? }` | categoryId, categoryName, merchantCanonical, confidence |
| POST | `/v1/transactions/receipt-ocr` | multipart **file** (image) | amountMinor, date, memo, categoryId, items |
| GET | `/v1/dashboard/insight` | — | text, severity, status |
| GET | `/v1/dashboard/forecast` | — | … + **explanationAi**? |
| GET | `/v1/analytics/monthly-report/summary` | ?year=&month= | summaryText, shareReadyText |
