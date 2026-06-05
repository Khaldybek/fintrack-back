# API для фронтенда (FinTrack Backend)

Базовый URL: `/v1` (например `https://api.example.com/v1`).

**Авторизация:** все перечисленные эндпоинты требуют JWT (cookie `access_token` или заголовок `Authorization: Bearer <token>`), кроме логина, регистрации, forgot-password и reset-password. Запросы с фронта — `credentials: 'include'` (fetch) или `withCredentials: true` (axios).

---

## 0. Восстановление пароля (забыл пароль)

Сценарий: пользователь нажимает «Забыл пароль», вводит email, получает письмо со ссылкой, переходит на страницу сброса, вводит новый пароль.

### Шаг 1 — Запрос ссылки на почту

**`POST /v1/auth/forgot-password`** (без JWT)

| Передаём | Тип   | Описание |
|----------|-------|----------|
| email    | string| Email пользователя (валидный, 5–255 символов) |

**Ответ (200):** всегда `{ "success": true }` (даже если email не найден — чтобы не раскрывать наличие аккаунта).

**Поведение бэкенда:** если пользователь с таким email есть, создаётся одноразовая ссылка (срок 1 ч), старые ссылки отзываются, на email уходит письмо со ссылкой `{FRONTEND_URL}/reset-password?token=...`. Для тех, кто заходил только через Google (пароля не было), письмо с темой «Задать пароль» — по ссылке они зададут пароль и смогут входить по email+паролю. Ограничение: не более 3 запросов на один email за 15 минут.

**Фронт:** после 200 показать сообщение вроде: «Если этот email зарегистрирован, вы получите письмо со ссылкой для сброса пароля».

**Проверка запроса с фронта:**
- Метод: **POST**
- URL: **`/v1/auth/forgot-password`** (к базовому хосту бэкенда)
- Заголовок: **`Content-Type: application/json`**
- Тело: **ровно** `{ "email": "адрес@example.com" }` — поле обязательно называется **`email`**
- Без авторизации (JWT не нужен)

Пример (curl):  
`curl -X POST http://localhost:3000/v1/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"user@example.com"}'`

Если письмо не приходит: в консоли сервера (терминал бэкенда) в development появятся подсказки: «user not found», «rate limit exceeded», «email sent to …» или «SMTP not configured».

### Шаг 2 — Переход по ссылке и сброс пароля

Пользователь переходит по ссылке из письма на страницу фронта, например `/reset-password?token=...`. Фронт забирает `token` из query и показывает форму: «Новый пароль» + «Повторите пароль». По кнопке «Сохранить» отправляется запрос:

**`POST /v1/auth/reset-password`** (без JWT)

| Передаём   | Тип   | Описание |
|------------|-------|----------|
| token      | string| Токен из ссылки (ровно 64 символа) |
| newPassword| string| Новый пароль (не менее 8 символов) |

**Ответ (200):** `{ "success": true, "message": "Пароль успешно изменён. Войдите с новым паролем." }`

**Ошибки (401):**
- «Ссылка недействительна или уже использована» — неверный или уже использованный token.
- «Срок действия ссылки истёк. Запросите сброс пароля снова.» — ссылка старше 1 часа.

**Фронт:** при 200 — редирект на страницу входа и показать успех; при 401 — показать текст ошибки и ссылку «Запросить ссылку снова» (на шаг 1).

---

### Отличие forgot-password и reset-password (для фронта)

| | **forgot-password** | **reset-password** |
|---|----------------------|---------------------|
| **Когда вызывать** | Пользователь на странице «Забыл пароль» ввёл email и нажал «Отправить ссылку». | Пользователь перешёл по ссылке из письма на страницу «Новый пароль» и ввёл новый пароль + подтверждение. |
| **Что передаём** | Только **email** (тот, что пользователь ввёл). | **token** (из URL: `?token=...`) и **newPassword** (новый пароль из формы). |
| **Откуда token** | Токена ещё нет — он создаётся на бэке и уходит в письме. | Токен приходит в ссылке из письма (query-параметр `token`). Фронт читает его из URL и кладёт в тело запроса. |
| **Что делает бэкенд** | Ищет пользователя по email, создаёт одноразовую ссылку, отправляет письмо на этот email. | Проверяет token, ставит пользователю новый пароль, токен после этого недействителен. |
| **Нужен ли JWT** | Нет. | Нет. |
| **Типичный ответ** | `{ "success": true }` | `{ "success": true, "message": "..." }` или 401 с текстом ошибки. |

**Цепочка:**  
1) Пользователь на фронте → «Забыл пароль» → вводит email → фронт вызывает **forgot-password** с этим email.  
2) Пользователь открывает почту, переходит по ссылке → попадает на фронт, например `/reset-password?token=abc123...`.  
3) Фронт показывает форму «Новый пароль» / «Повторите пароль» → по отправке формы вызывает **reset-password** с `token` из URL и выбранным паролем.

---

## Счета (`/v1/accounts`)

JWT обязателен.

### Создать счёт

**`POST /v1/accounts`**

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| name | string | да | Название (1–100 символов) |
| currency | string | нет | ISO 4217, 3 буквы (`KZT`, `USD`). По умолчанию `KZT` |
| balanceMinor | number | нет | **Начальный баланс** в `amount_minor`. По умолчанию `0`. Для KZT — целые тенге (50 000 ₸ → `50000`) |

**Пример:** `{ "name": "Карта", "currency": "KZT", "balanceMinor": 150000 }`

**Ответ (201):** объект счёта с полем `balance` (`amount_minor`, `currency`, `formatted`).

На Free — не более **2** счетов; при превышении **403** `FEATURE_GATED` (`accounts_limit`).

### Остальные методы

- **`GET /v1/accounts`** — список счетов
- **`GET /v1/accounts/:id`** — один счёт
- **`PATCH /v1/accounts/:id`** — изменить `name` / `currency` (баланс через транзакции, не здесь)
- **`DELETE /v1/accounts/:id`** — удалить (soft)

---

## Импорт банковских выписок (`/v1/statement-imports`)

**Только Pro / Family.** На Free — **403** `FEATURE_GATED` с кодом `bank_statement_import`.

Двухэтапный flow: загрузка файла → preview → подтверждение. Поддерживаются **CSV, XLSX, PDF** (Kaspi, Halyk, другие — с AI-fallback).

### UX на фронте

1. Кнопка «Добавить выписку из банка» на странице финансов.
2. Модалка: выбор счёта + файл (drag-and-drop).
3. `POST /statement-imports` — спиннер «Анализируем выписку…».
4. Таблица preview: дата, сумма, описание, категория (редактируемая), чекбокс, badge «дубликат».
5. «Импортировать N операций» → `POST .../confirm`; «Отмена» → `DELETE`.

### 1. Загрузить и распарсить

**`POST /v1/statement-imports`** — `multipart/form-data`

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| file | file | да | CSV, XLSX или PDF, до 10 MB |
| accountId | string (uuid) | да | Счёт, на который импортируются операции |

**Ответ (201):** preview-сессия:

```json
{
  "id": "import-uuid",
  "status": "preview",
  "bank": { "code": "kaspi", "name": "Kaspi Bank", "confidence": 0.9 },
  "file": { "name": "statement.xlsx", "format": "xlsx" },
  "accountId": "uuid",
  "period": { "from": "2026-01-01", "to": "2026-03-31" },
  "stats": { "total": 42, "expense": 30, "income": 12, "duplicates": 3, "parseErrors": 0 },
  "rows": [
    {
      "id": "row-uuid",
      "date": "2026-02-15",
      "amountMinor": -15000,
      "amount": { "amount_minor": -15000, "currency": "KZT", "formatted": "-15 000 ₸" },
      "memo": "Magnum",
      "direction": "expense",
      "categoryId": "uuid",
      "categoryName": "Еда",
      "selected": true,
      "duplicate": false,
      "parseWarning": null
    }
  ]
}
```

- `amountMinor` — signed: расход `< 0`, доход `> 0`. KZT = целые тенге.
- `duplicate: true` — операция уже есть на счёте; по умолчанию `selected: false`.
- Preview живёт **48 часов** (`expires_at`).

**Ошибки:** `400` — неподдерживаемый формат, пустая выписка, > 1000 строк.

### 2. Получить preview

**`GET /v1/statement-imports/:id`** — тот же формат ответа.

### 3. Править строки перед импортом

**`PATCH /v1/statement-imports/:id/rows`**

```json
{
  "rows": [
    { "rowId": "uuid", "selected": false },
    { "rowId": "uuid", "categoryId": "uuid", "memo": "Уточнённое описание" }
  ]
}
```

### 4. Подтвердить импорт

**`POST /v1/statement-imports/:id/confirm`**

```json
{ "rowIds": ["uuid1", "uuid2"] }
```

`rowIds` опционально — по умолчанию все `selected: true` и не `duplicate`.

**Ответ:**

```json
{
  "created": 39,
  "skippedDuplicates": 3,
  "importId": "uuid",
  "transactionIds": ["..."]
}
```

После успеха обновить список транзакций и баланс счёта.

### 5. Отменить черновик

**`DELETE /v1/statement-imports/:id`** → `{ "success": true }`

---

## 1. Транзакции (`/v1/transactions`)

### 1.1 Умный ввод из текста/голоса (AI)

**`POST /v1/transactions/voice-parse`**

Парсит фразу пользователя («1500 на такси вчера») в поля транзакции. При отключённом AI возвращается только сумма (и дата «сегодня») по fallback.

**Тело запроса (JSON):**

| Поле | Тип   | Обязательный | Описание        |
|------|--------|--------------|-----------------|
| text | string | да           | Фраза пользователя |

**Пример:** `{ "text": "1500 на такси вчера" }`

**Ответ (200):**

| Поле        | Тип    | Описание |
|-------------|--------|----------|
| amountMinor | number | Сумма в минорных единицах (расход — отрицательное). **KZT:** хранение 1:1 с тенге (1500 ₸ расход → `-1500`). **USD/EUR:** центы (×100). |
| categoryId  | string \| null | UUID категории, если определена |
| date        | string | Дата в формате YYYY-MM-DD |
| memo        | string \| null | Описание/мерчант |
| accountId   | string \| null | UUID счёта, если указан |
| confidence  | number | 0–1; при &lt; 0.7 лучше показать «Проверьте» |

Фронт может подставить эти поля в форму создания транзакции и отправить **`POST /v1/transactions`** (см. ниже).

---

### 1.2 Подсказка категории по memo (AI)

**`POST /v1/transactions/suggest-category`**

По тексту операции (например из банка) возвращает предлагаемую категорию и нормализованное имя мерчанта.

**Тело запроса (JSON):**

| Поле        | Тип    | Обязательный | Описание      |
|-------------|--------|--------------|---------------|
| memo        | string | да           | Текст операции (до 500 символов) |
| amountMinor | number | нет          | Сумма в минорах (опционально)    |

**Пример:** `{ "memo": "Yandex*Go Taxi" }`

**Ответ (200):**

| Поле             | Тип    | Описание |
|------------------|--------|----------|
| categoryId       | string \| null | UUID категории |
| categoryName     | string | Название категории |
| merchantCanonical| string | Нормализованное имя (например «Яндекс Такси») |
| confidence       | number | 0–1 |

---

### 1.3 Чек по фото (AI)

**`POST /v1/transactions/receipt-ocr`**

Загрузка изображения чека (multipart). Сервер возвращает сумму, дату, магазин и подсказку категории.

**Тело запроса:** `multipart/form-data`, поле **`file`** — файл изображения.

- Допустимые форматы: **image/jpeg**, **image/png**, **image/webp**
- Максимальный размер: **10 MB**

**Ответ (200):**

| Поле       | Тип    | Описание |
|------------|--------|----------|
| amountMinor| number | Сумма (расход отрицательный), 0 если не распознано |
| date       | string \| null | YYYY-MM-DD или null |
| memo       | string \| null | Название магазина |
| categoryId | string \| null | Подсказка категории |
| items      | []     | Пока всегда пустой массив |

При ошибке/нечитаемом фото поля приходят пустыми/нулевыми, без ошибки 4xx.

---

### 1.4 Создание транзакции

**`POST /v1/transactions`**

**Тело (JSON):**

| Поле       | Тип    | Обязательный | Описание |
|------------|--------|--------------|----------|
| accountId  | string | да           | UUID счёта |
| categoryId | string | да           | UUID категории |
| amountMinor| number | да           | Сумма в минорах (расход &lt; 0, доход &gt; 0) |
| date       | string | да           | YYYY-MM-DD |
| currency   | string | нет          | По умолчанию KZT |
| memo       | string | нет          | До 2000 символов |

**Ответ (201):** объект созданной транзакции (id, accountId, categoryId, amount, date, memo, category, account и т.д.).

---

### 1.5 Список транзакций

**`GET /v1/transactions`**

**Query-параметры:**

| Параметр   | Тип   | Описание |
|------------|-------|----------|
| accountId  | string| Фильтр по счёту |
| categoryId | string| Фильтр по категории |
| dateFrom   | string| YYYY-MM-DD |
| dateTo     | string| YYYY-MM-DD |
| search     | string| Поиск по memo |
| page       | number| Страница (по умолчанию 1) |
| limit      | number| На страницу (1–500, по умолчанию 20) |

**Ответ (200):** `{ "items": [...], "total": number }`.

---

### 1.6 Остальные эндпоинты транзакций

- **`GET /v1/transactions/:id`** — одна транзакция
- **`PATCH /v1/transactions/:id`** — обновление (частичное)
- **`DELETE /v1/transactions/:id`** — удаление (soft)
- **`POST /v1/transactions/:id/splits`** — разбивка по категориям (SetSplitsDto)
- **`GET /v1/transactions/templates`** — шаблоны
- **`POST /v1/transactions/templates`** — создание шаблона
- **`DELETE /v1/transactions/templates/:id`** — удаление шаблона

---

## 2. Дашборд (`/v1/dashboard`)

### 2.1 Сводка

**`GET /v1/dashboard/summary`**

**Ответ (200):** баланс, доход и расход за текущий месяц, валюта, границы месяца.

Пример полей: `balance`, `balance_total_minor`, `currency`, `month: { dateFrom, dateTo }`, `income`, `income_minor`, `expense`, `expense_minor`, `timezone_hint`.

---

### 2.2 Прогноз (с AI-объяснением)

**`GET /v1/dashboard/forecast`**

**Ответ (200):**

| Поле                  | Тип   | Описание |
|-----------------------|-------|----------|
| balance               | object| Текущий баланс (amount_minor, currency, formatted) |
| projected_balance     | object| Прогноз на конец месяца |
| projected_balance_minor | number | Числом |
| date_to               | string| Конец месяца YYYY-MM-DD |
| days_left             | number| Дней до конца месяца |
| status                | string| "stable" \| "attention" \| "risk" |
| severity              | string| "good" \| "attention" \| "risk" |
| explanation           | string| Текстовое объяснение (всегда) |
| explanationAi         | string| *(опционально)* Краткое объяснение от AI (1–2 предложения) |
| timezone_hint         | string| Таймзона пользователя |

Если AI выключен или ошибка — приходит только `explanation`, `explanationAi` может отсутствовать.

---

### 2.3 Инсайт дня (AI)

**`GET /v1/dashboard/insight`**

Один персонализированный совет на основе баланса и прогноза. Кеш на бэкенде ~6 ч.

**Ответ (200):**

| Поле     | Тип   | Описание |
|----------|-------|----------|
| text     | string| Текст совета (1–2 предложения) |
| severity | string| "good" \| "attention" \| "risk" |
| status   | string| "stable" \| "attention" \| "risk" |

---

### 2.4 Остальные эндпоинты дашборда

- **`GET /v1/dashboard/alerts`** — алерты (минус баланс, низкий остаток, зарплата и т.д.)
- **`GET /v1/dashboard/index`** — финансовый индекс 0–100 и факторы
- **`GET /v1/dashboard/salary-schedules`** — расписание зарплат
- **`POST /v1/dashboard/salary-schedules`** — добавить (body: `dayOfMonth`, `label`)
- **`DELETE /v1/dashboard/salary-schedules/:id`** — удалить

---

## 3. Аналитика (`/v1/analytics`)

### 3.1 AI-резюме месячного отчёта

**`GET /v1/analytics/monthly-report/summary`**

**Query-параметры:**

| Параметр | Тип   | Описание |
|----------|-------|----------|
| year     | string| Год (например 2025). По умолчанию — текущий |
| month    | string| Месяц 1–12. По умолчанию — текущий |

**Ответ (200):**

| Поле          | Тип   | Описание |
|---------------|-------|----------|
| summaryText   | string| Короткий абзац: доход, расход, топ категорий, накопления |
| shareReadyText| string| Одна короткая строка для шаринга (можно с эмодзи) |

Если за месяц нет данных: оба поля — строка «Нет данных за период.»

---

### 3.2 Остальные эндпоинты аналитики

- **`GET /v1/analytics/monthly?year=`** — доход/расход по месяцам года
- **`GET /v1/analytics/categories?dateFrom=&dateTo=`** — расход по категориям за период
- **`GET /v1/analytics/trends?months=`** — динамика (по умолчанию 6 месяцев)
- **`GET /v1/analytics/heatmap?days=`** — интенсивность расходов по дням (по умолчанию 90)
- **`GET /v1/analytics/anomalies`** — аномалии по месяцам
- **`GET /v1/analytics/top-categories?dateFrom=&dateTo=&limit=`** — топ категорий
- **`GET /v1/analytics/savings-rate?months=`** — норма сбережений
- **`GET /v1/analytics/compare?aFrom=&aTo=&bFrom=&bTo=`** — сравнение двух периодов (все 4 параметра обязательны, YYYY-MM-DD)
- **`POST /v1/analytics/monthly-report/export`** — скачать PDF отчёта за месяц (body: `year`, `month`). Ответ — бинарный PDF.

---

## 4. Деньги (amount_minor)

Во всех суммах используется **amount_minor**:

- **KZT:** `amount_minor` — целые тенге (как в `money.util`: 1:1). Пример: 1500 ₸ расход → `amountMinor: -1500`
- **USD / EUR:** в центах (×100), например $12.50 расход → `-1250`
- Расходы задаются **отрицательным** числом, доходы — положительным.

В ответах часто есть объект **amount** с полями:
- `amount_minor` — число
- `currency` — строка
- `formatted` — строка для отображения (например `"1 500 ₸"`)

---

## 5. Billing — тарифы Pro / Family (mock, без реальной платёжки)

Модуль **`/v1/billing`** — оплата подписки **FinTrack** (не путать с **`/v1/subscriptions`** — учёт Netflix/Spotify у пользователя).

### 5.1 Тарифы

| `planCode` | Период | Цена (KZT) | Особенности |
|------------|--------|------------|-------------|
| `free` | — | 0 | 2 счёта, 1 бюджет, 1 цель |
| `pro_monthly` | 30 дн. | 2 990 | безлимит счётов/бюджетов/целей, `dashboardIndex` |
| `pro_yearly` | 365 дн. | 29 900 | то же, год |
| `family_monthly` | 30 дн. | 4 990 | Pro + `familyMode` (household) |
| `family_yearly` | 365 дн. | 49 900 | Family, год |

### 5.2 Эндпоинты

**`GET /v1/billing/plans`** — каталог (без JWT)

**`GET /v1/me/plan`** — эффективный тариф, лимиты, фичи, кратко о подписке (JWT)

**`GET /v1/billing/subscription`** — то же + полная запись подписки (JWT)

**`POST /v1/billing/checkout`** — `{ "planCode": "pro_monthly" }` → `sessionId`, `amountMinor`, `expiresAt` (15 мин)

**`POST /v1/billing/checkout/:sessionId/confirm`** — mock-оплата (JWT)

```json
{ "cardNumber": "4242424242424242", "cardBrand": "visa" }
```

- Успех: PAN начинается с `4242` или `BILLING_MOCK_ALWAYS_SUCCEED=1` на сервере.
- Отказ: `decline: true` или PAN `4000000000000002` → **402** `{ "code": "PAYMENT_FAILED" }`.
- Сессия истекла → **410**.

**`POST /v1/billing/cancel`** — отмена в конце текущего периода (`cancelAtPeriodEnd: true`)

**`GET /v1/billing/invoices?limit=20`** — история инвойсов

**`POST /v1/billing/renew`** — симуляция автопродления (только dev или `BILLING_MOCK_RENEW=1`)

### 5.3 Гейтинг (403 FEATURE_GATED)

При превышении лимита Free или недоступной фиче:

```json
{
  "statusCode": 403,
  "code": "FEATURE_GATED",
  "feature_code": "accounts_limit",
  "upgrade_hint": "Upgrade to Pro to add more accounts."
}
```

Коды: `accounts_limit`, `budgets_limit`, `goals_limit`, `dashboard_index`, `family_mode`, `bank_statement_import`.

### 5.4 Сценарий фронта

1. `GET /me/plan` — показать лимиты.
2. При 403 `FEATURE_GATED` — модалка → `/pricing` → `GET /billing/plans`.
3. `POST /billing/checkout` → страница `/checkout/[sessionId]` → `confirm`.
4. `GET /me/plan` → редирект в приложение.

---

## 6. Коды ошибок

- **401** — не авторизован (нет/неверный JWT)
- **402** — mock-оплата отклонена (`PAYMENT_FAILED`)
- **403** — доступ запрещён; для лимитов тарифа — `FEATURE_GATED` (см. выше)
- **404** — ресурс не найден (например транзакция/счёт не принадлежит пользователю)
- **410** — checkout-сессия истекла
- **400** — невалидное тело или query (сообщение в теле ответа)

Валидация DTO возвращает **400** с массивом ошибок полей (формат NestJS/class-validator).

---

## 7. Краткий чеклист по AI-эндпоинтам

| Метод | Путь | Что передаём | Что получаем |
|-------|------|--------------|--------------|
| POST | `/v1/transactions/voice-parse` | `{ text }` | amountMinor, date, memo, categoryId?, accountId?, confidence |
| POST | `/v1/transactions/suggest-category` | `{ memo, amountMinor? }` | categoryId, categoryName, merchantCanonical, confidence |
| POST | `/v1/transactions/receipt-ocr` | multipart `file` (image) | amountMinor, date, memo, categoryId, items |
| GET  | `/v1/dashboard/insight` | — | text, severity, status |
| GET  | `/v1/dashboard/forecast` | — | … + explanationAi? |
| GET  | `/v1/analytics/monthly-report/summary` | ?year=&month= | summaryText, shareReadyText |

Все эти эндпоинты требуют авторизации (JWT).
