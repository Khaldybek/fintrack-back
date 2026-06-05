# План поэтапной реализации AI-функциональности

> Документ описывает этапы внедрения OpenAI API в fintrack-back, учтённые риски и порядок разработки.

---

## 1. Общие принципы

### 1.1 Что делает OpenAI, что нет

| OpenAI делает | Backend делает |
|---------------|----------------|
| Парсинг текста/голоса в структуру | Валидация, сохранение, расчёт баланса |
| Классификация (категория, мерчант) | Выбор categoryId из списка пользователя |
| Генерация текста (инсайт, объяснение, резюме) | Расчёт чисел, прогноз, агрегаты |
| Извлечение данных из изображения (чек) | Бизнес-правила, guardrails |

### 1.2 Принципы разработки

- **Fallback**: при ошибке OpenAI — regex/пустые значения, без падения.
- **Безопасность**: не передавать PII; только агрегаты и ID категорий/счетов.
- **Стоимость**: gpt-4o-mini по умолчанию; gpt-4o только для Vision.
- **Время ответа**: таймаут 10–15 сек; при превышении — fallback.
- **Feature flag**: возможность отключить AI через env (для тестов/отладки).

---

## 2. Подготовительный этап (Этап 0)

### 2.1 Задачи

- [x] Установить `openai` npm-пакет
- [x] Добавить `OPENAI_API_KEY` в `.env` и `.env.example`
- [x] Опционально: `OPENAI_MODEL=gpt-4o-mini`, `AI_ENABLED=true`
- [x] Создать модуль `src/modules/ai/`
- [x] Реализовать `AiService` — обёртка над OpenAI client с таймаутом и error handling

### 2.2 Что учесть

- **API key**: хранить только в env, не коммитить. В CI — секрет.
- **Rate limits**: OpenAI имеет лимиты; при 429 — exponential backoff или fallback.
- **Версионирование API**: зафиксировать версию `openai` в package.json.
- **Тесты**: мокировать OpenAI в unit-тестах; e2e — опционально с реальным ключом.

### 2.3 Структура модуля AI

```
src/modules/ai/
├── ai.module.ts
├── ai.service.ts          # OpenAI client wrapper
├── ai.config.ts           # ConfigModule config
├── prompts/
│   └── (промпты вынесены в константы/функции)
└── schemas/
    └── (JSON Schema для structured output)
```

### 2.4 Импорты

- `AiModule` будет импортироваться в `TransactionsModule`, `DashboardModule`, `AnalyticsModule`.
- `AiService` — injectable, не singleton по смыслу, но Nest создаёт один инстанс.

---

## 3. Этап 1: Текст/голос → транзакция

### 3.1 Цель

Расширить `POST /v1/transactions/voice-parse`: вместо regex — полноценный парсинг через OpenAI.

### 3.2 Задачи

- [x] Создать `prompts/voice-parse.prompt.ts` — системный + user промпт
- [x] Создать JSON schema для ответа: `amountMinor`, `date`, `memo`, `categoryName`, `accountName?`
- [x] В `AiService`: метод `parseTransactionFromText(text, context)`
- [x] В `TransactionsService.voiceParse()`:
  - Получить категории и счета пользователя
  - Вызвать `AiService.parseTransactionFromText()`
  - Маппить `categoryName` → `categoryId`, `accountName` → `accountId`
  - При ошибке — fallback на текущий regex
- [x] Расширить response DTO: `categoryId`, `date`, `accountId`, `confidence?`

### 3.3 Что учесть

- **Контекст**: передавать только id + name категорий/счетов, без лишних данных.
- **Формат даты**: выход — YYYY-MM-DD; относительные ("вчера", "позавчера") — приводить к дате на основе `user.timezone`.
- **Кодировка**: `amount_minor` как в `money.util` / счетах: **KZT — целые тенге (1:1)**, USD/EUR — центы (×100). Расход — отрицательный.
- **Язык**: промпт на русском; примеры на казахском/русском.
- **confidence**: если < 0.7 — возвращать с флагом, чтобы UI мог показать "проверьте".
- **Структурированный вывод**: `response_format: { type: "json_schema", json_schema: {...} }`.

### 3.4 Контракт API

**Request:** `POST /v1/transactions/voice-parse`  
**Body:** `{ text: string }` (как сейчас)

**Response:**
```json
{
  "amountMinor": -1500,
  "categoryId": "uuid" | null,
  "date": "2025-03-05",
  "memo": "Яндекс Такси",
  "accountId": "uuid" | null,
  "confidence": 0.95
}
```

---

## 4. Этап 2: Автокатегоризация + нормализация мерчанта

### 4.1 Цель

Создать `POST /v1/transactions/suggest-category` для подсказки категории и канонического имени мерчанта.

### 4.2 Задачи

- [x] Новый endpoint `POST /v1/transactions/suggest-category`
- [x] DTO: `{ memo: string, amountMinor?: number }`
- [x] Промпт: список категорий + примеры нормализации (Yandex*Go → Яндекс Такси)
- [x] Response: `{ categoryId, categoryName, merchantCanonical, confidence }`
- [x] Fallback: правило по ключевым словам (такси, еда, и т.п.) → категория "Прочее" или по правилам
- [x] Интеграция: вызывать в `voiceParse` после парсинга memo; опционально — при создании транзакции (если фронт захочет)

### 4.3 Что учесть

- **Мерчант**: пока только в `memo`. Отдельная таблица `merchants` — не в MVP.
- **Персонализация**: категории пользователя могут отличаться от дефолтных — всегда передавать актуальный список.
- **Повторяемость**: один и тот же memo должен давать стабильный результат (temperature=0).

### 4.4 Контракт API

**Request:** `POST /v1/transactions/suggest-category`  
**Body:** `{ memo: string, amountMinor?: number }`

**Response:**
```json
{
  "categoryId": "uuid",
  "categoryName": "Транспорт",
  "merchantCanonical": "Яндекс Такси",
  "confidence": 0.9
}
```

---

## 5. Этап 3: Инсайт дня

### 5.1 Цель

Заменить хардкод в `GET /v1/dashboard/insight` на персонализированный совет.

### 5.2 Задачи

- [x] Собрать контекст: `getSummary`, `getForecast` (без budgets/analytics в MVP)
- [x] Промпт: "Дай 1 actionable совет на русском, макс 2 предложения"
- [x] `AiService.generateInsight(context)`
- [x] Кеширование: TTL 6 ч на пользователя (in-memory)
- [x] Fallback: статичный текст по forecast
- [x] Определять severity по контексту (forecast.severity)

### 5.3 Что учесть

- **Объём данных**: не передавать транзакции целиком — только агрегаты.
- **Кеш-ключ**: `insight:${userId}` + дата (чтобы один раз в день).
- **Холодный старт**: если нет данных — нейтральный совет ("Добавьте транзакции для персонализированных советов").
- **Длина ответа**: max_tokens 150.

### 5.4 Контракт API

**Request:** `GET /v1/dashboard/insight` (без изменений)

**Response (расширенный):**
```json
{
  "text": "В марте вы тратите на транспорт на 23% больше среднего. Попробуйте объединять поездки.",
  "severity": "attention",
  "status": "attention"
}
```

---

## 6. Этап 4: Объяснение риска (forecast)

### 6.1 Цель

Дополнить `GET /v1/dashboard/forecast` человекочитаемым объяснением.

### 6.2 Задачи

- [x] В `getForecast()` после расчёта вызвать `AiService.explainForecast(forecastData)`
- [x] Промпт: "Объясни кратко (1–2 предложения) ситуацию по прогнозу баланса"
- [x] Добавить поле `explanationAi?: string` в ответ
- [x] Fallback: если AI недоступен — оставить текущий `explanation`
- [x] Без кеша

### 6.3 Что учесть

- **Расчёт не трогаем**: projected_balance, status — как есть, backend.
- **Краткость**: max_tokens 100.
- **Тон**: нейтральный, без паники; при risk — спокойная рекомендация.

### 6.4 Контракт API

**Response:** добавление поля `explanationAi` в существующий объект forecast.

---

## 7. Этап 5: Чек из фото → транзакция

### 7.1 Цель

Реализовать `POST /v1/transactions/receipt-ocr` через Vision API.

### 7.2 Задачи

- [x] Валидация файла: размер (макс 10 MB), MIME (image/jpeg, image/png, image/webp)
- [x] Передать base64 в Vision API
- [x] Промпт: извлечь сумму, дату, магазин
- [x] Structured output: `{ amount_minor, date, memo }`
- [x] После извлечения — вызвать `suggestCategory` для categoryId
- [x] Fallback: вернуть пустые поля, не падать

### 7.3 Что учесть

- **Модель**: gpt-4o или gpt-4o-mini (mini поддерживает vision).
- **Размер**: большие фото — resize или сжать на клиенте.
- **Язык чека**: казахский, русский, английский — указать в промпте.
- **items**: опционально для MVP; можно отложить на потом.
- **Безопасность**: не сохранять изображение на сервере (или временно с удалением).

### 7.4 Контракт API

**Request:** `POST /v1/transactions/receipt-ocr` (уже есть, multipart)

**Response:**
```json
{
  "amountMinor": -2500,
  "date": "2025-03-05",
  "memo": "Магнум, Алматы",
  "categoryId": "uuid",
  "items": []
}
```

---

## 8. Этап 6: AI-резюме месячного отчёта

### 8.1 Цель

Добавить текстовое резюме к месячному отчёту (для PDF и share).

### 8.2 Задачи

- [x] Новый endpoint `GET /v1/analytics/monthly-report/summary?year=2025&month=3`
- [x] Собрать: income/expense за месяц, top categories
- [x] Промпт: summary_text + share_ready_text (JSON schema)
- [x] Кеш: по userId:year:month, TTL 24ч
- [ ] Интеграция в PdfReportService (опционально, не сделано)

### 8.3 Что учесть

- **Два текста**: `summaryText` (подробнее) и `shareReadyText` (короткий, для соцсетей).
- **Пустой месяц**: если нет транзакций — "Нет данных за период".

### 8.4 Контракт API

**Request:** `GET /v1/analytics/monthly-report/summary?year=2025&month=3`

**Response:**
```json
{
  "summaryText": "В марте вы заработали 450 000 ₸ и потратили 320 000 ₸...",
  "shareReadyText": "Мой март: +130 000 ₸ накоплений. 📊"
}
```

---

## 9. Чеклист перед каждым этапом

- [ ] Проверить, что OpenAI key настроен
- [ ] Добавить/обновить тесты (моки)
- [ ] Проверить fallback при отключённом AI (`AI_ENABLED=false`)
- [ ] Обновить OpenAPI/Swagger (если есть)
- [ ] Задокументировать новый env в README

---

## 10. Порядок разработки (сводка)

| Этап | Описание | Зависимости |
|------|----------|-------------|
| 0 | Подготовка: модуль AI, OpenAI client | — |
| 1 | Текст/голос → транзакция | Этап 0 |
| 2 | Автокатегоризация | Этап 0 |
| 3 | Инсайт дня | Этап 0 |
| 4 | Объяснение forecast | Этап 0 |
| 5 | Чек из фото | Этапы 0, 2 |
| 6 | AI-резюме отчёта | Этап 0 |

---

## 11. Риски и митигация

| Риск | Митигация |
|------|-----------|
| OpenAI недоступен | Fallback на regex/пустые значения; логировать ошибки |
| Высокая стоимость | Лимиты вызовов; кеш; gpt-4o-mini по умолчанию |
| Галлюцинации (неверный categoryId) | Валидация: categoryId должен быть в списке пользователя; confidence |
| Медленный ответ | Таймаут 15 сек; async UI (loading) |
| PII в промпте | Не передавать имена, детали транзакций — только агрегаты и id |

---

## 12. Следующий шаг

После утверждения плана — начать с **Этапа 0** (подготовка) и **Этапа 1** (voice-parse).
