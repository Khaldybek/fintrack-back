# Деплой на Vercel

Бэкенд подготовлен к деплою на Vercel без изменений локальной работы: локально по‑прежнему `npm run start:dev` или `npm run start:prod`.

## Как устроено

- **Локально:** `src/main.ts` вызывает `createApp()` из `src/app-factory.ts` и делает `app.listen(PORT)`.
- **Vercel:** без `builds` — после `buildCommand` деплоится весь проект (в т.ч. `dist/`). Точка входа — **`api/index.js`**. Rewrite `/:path*` → `/api` (path попадает в query); handler восстанавливает path и передаёт запрос в Nest через `createApp()`. Так `dist/` доступен в рантайме (`process.cwd()/dist/app-factory.js`).

## Шаги деплоя

1. Подключите репозиторий к Vercel (Import Project).
2. **Project Settings → General**
   - **Framework Preset:** выберите **Other**.
3. **Build & Development** — в дашборде или в `vercel.json`: Build Command = `npm run build`, Output Directory пустой. После сборки в деплой попадает весь проект, включая `dist/`.
4. **Environment Variables** — задайте переменные из `.env.example` (см. ниже). Для БД обязательно используйте **Session pooler** (см. раздел про Supabase).
5. Деплой: после пуша или вручную Deploy.

## База данных: Supabase

БД в продакшене — Supabase (PostgreSQL). Подключение через одну переменную.

**Важно для Vercel:** прямое подключение (Direct connection, порт 5432) в Supabase часто **не совместимо с IPv4** (Vercel работает по IPv4). Нужно использовать **Session pooler** или **Transaction pooler** (порт 6543).

1. В [Supabase](https://supabase.com) откройте проект → **Project Settings** → **Database** (или раздел **Connect to your project**).
2. В блоке **Connection string** выберите **URI**, в **Method** выберите **Session pooler** или **Transaction pooler** (не Direct connection).
3. Скопируйте строку подключения (хост будет вида `...pooler.supabase.com`, порт **6543**). Подставьте пароль вместо `[YOUR-PASSWORD]`. Пароль можно сбросить в **Database Settings**.
4. В Vercel в **Environment Variables** добавьте:
   - **Name:** `DATABASE_URL`
   - **Value:** скопированная строка (из шага 3).

Локально можно оставить свой PostgreSQL или подключаться к Supabase через тот же pooler-URL.

**Если в логах Vercel:** `getaddrinfo ENOTFOUND db.xxxx.supabase.co` — в `DATABASE_URL` указано прямое подключение (Direct). Замените на строку **Session pooler** или **Transaction pooler** из Supabase (хост `...pooler.supabase.com`, порт 6543).

## Переменные окружения на Vercel

Обязательные:

- `DATABASE_URL` — строка подключения к Supabase (см. выше) или к любому PostgreSQL
- либо связка `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (длиной от 32 символов)
- `FRONTEND_URL` — URL фронтенда (для CORS и редиректа Google), напр. `https://fintrack-front-eta.vercel.app`
- **`COOKIE_SAME_SITE`** = **`none`** — обязательно, если фронт и бэк на разных доменах (иначе 401 на /v1/auth/refresh, cookie не отправляется)

По желанию (без них часть функций отключится):

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (callback должен указывать на ваш Vercel URL, например `https://your-app.vercel.app/v1/auth/google/callback`)
- Письма (forgot password): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, при необходимости `SMTP_SECURE`
- AI: `OPENAI_API_KEY`, `AI_ENABLED`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`

Остальные (cookie, JWT expires и т.д.) — по необходимости, иначе используются значения по умолчанию.

### Режим «как в dev» на Vercel

По умолчанию Vercel выставляет **`NODE_ENV=production`**. Если нужно вести себя как в разработке (логи, расширенные ошибки, тестовый email, CORS для localhost и т.д.):

- В **Environment Variables** добавь **`NODE_ENV`** = **`development`**.

Тогда включается:
- **TypeORM:** `synchronize: true` и `logging: true` (осторожно: на общей БД лучше не использовать, чтобы не менять схему с продакшена).
- **CORS:** добавляются origin’ы `http://localhost:3000`, `http://localhost:5173` и т.д.
- **Auth:** в ответах и логах — подробные ошибки; эндпоинт `POST /v1/auth/send-test-email` доступен.
- **Cookie:** `secure: false` (для тестов по HTTP).

Для продакшена оставь **`NODE_ENV=production`** (или не задавай — Vercel подставит сам).

## Частые ошибки

| Ошибка в логах | Причина | Что сделать |
|----------------|--------|-------------|
| `getaddrinfo ENOTFOUND db....supabase.co` | В DATABASE_URL указан Direct (IPv4 не поддерживается) | В Supabase взять URI с **Session pooler** / **Transaction pooler**, подставить пароль, прописать в Vercel в DATABASE_URL |
| `No exports found in module .../src/main.js` | Vercel запускает main.js как функцию (preset NestJS) | Project Settings → General → **Framework Preset** → **Other** |
| 404 на `/v1/...` на production-домене, а на deployment URL работает | Продакшен-домен привязан к старому деплою | Убедиться, что задеплоена последняя версия и Production Branch (Settings → Git) указывает на нужную ветку; при необходимости Redeploy из последнего коммита |

## После деплоя

- API доступно по адресу вида: `https://<project>.vercel.app/v1/...`
- В настройках фронта укажите этот URL как базовый для API.
- Миграция `runGoalsBigintMigration` выполняется при первом холодном старте; при отсутствии таблицы/колонок ошибка перехватывается и не ломает старт.
