# Void Code AI — модульная архитектура

Монорепозиторий проекта после рефакторинга монолитного `index.html` (5 563 строки → 40+ модулей).

## Структура

```
void-code-ai/
├── apps/
│   ├── web/                        # Фронтенд: React 18 + Vite + Tailwind
│   │   ├── index.html              # пре-пейнт скрипты темы и --vh
│   │   └── src/
│   │       ├── main.jsx            # точка входа
│   │       ├── app/                # App, ErrorBoundary, RightMenu
│   │       ├── features/           # экраны по фичам
│   │       │   ├── agents/         # конструктор AI-агентов
│   │       │   ├── auth/           # модалка входа
│   │       │   ├── billing/        # тарифы и оплата
│   │       │   ├── chat/           # чат, рендер сообщений
│   │       │   ├── guide/          # обучение
│   │       │   ├── home/           # главный экран
│   │       │   ├── library/        # библиотека изображений/кода
│   │       │   ├── settings/       # настройки, лимиты, промт
│   │       │   ├── sites/          # конструктор сайтов
│   │       │   └── wallet/         # кошелёк
│   │       ├── shared/
│   │       │   ├── api/            # llm.jsx (запросы), mock.jsx
│   │       │   ├── config/         # модели, тарифы, блоки агентов/сайтов
│   │       │   ├── lib/            # storage, theme, format, imagegen...
│   │       │   └── ui/             # Icons, Splash, ListItem
│   │       └── styles/             # index.css + splash-theme.css
│   └── api/                        # Бэкенд: NestJS + Prisma + PostgreSQL
│       ├── prisma/schema.prisma    # схема БД (деньги в копейках!)
│       └── src/
│           ├── prisma/             # PrismaService (глобальный)
│           ├── common/guards/      # JwtAuthGuard
│           └── modules/
│               ├── auth/           # регистрация/вход: bcrypt + JWT
│               ├── users/          # профиль
│               ├── chat/           # LLM-прокси + серверные лимиты
│               │   └── providers/  # адаптеры LLM (Gemini, далее любые)
│               ├── billing/        # тарифы, кошелёк (заглушка под ЮKassa)
│               └── agents/         # CRUD AI-агентов
└── packages/                       # (зарезервировано под общие DTO/типы)
```

## Запуск фронтенда

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
npm run build      # продакшен-сборка в dist/
```

Чат работает в MOCK-режиме (`src/shared/api/mock.jsx`). Для реальных ответов
Gemini на время разработки: скопируйте `.env.example` → `.env.local` и
вставьте ключ. В продакшене ключ должен уйти на бэкенд.

## Запуск бэкенда (каркас)

```bash
cd apps/api
npm install
cp .env.example .env               # заполните DATABASE_URL и JWT_SECRET
npx prisma migrate dev --name init # создаст таблицы в PostgreSQL
npm run start:dev                  # http://localhost:3000/api/v1
```

## Что изменилось при рефакторинге

1. **Удалён захардкоженный API-ключ** — конфигурация только через `.env`.
2. **Смена темы**: убран глобальный `* { transition }` (источник мерцания);
   тема применяется до первой отрисовки, переключение атомарное, в новых
   браузерах — плавный кроссфейд через View Transitions API.
3. **Новая заставка**: хореография в 3 такта, только GPU-свойства
   (transform/opacity/filter), плавный выход, поддержка reduced-motion.
4. **Сборка Vite** вместо Babel-in-browser: JSX компилируется заранее,
   Tailwind собирается с purge — страница загружается в разы быстрее.
5. **Бэкенд-каркас**: JWT-аутентификация, серверные лимиты тарифов,
   паттерн «адаптер» для LLM-провайдеров, схема БД для всего проекта.

## Правила

- Секреты — только в `.env` (в git не попадает).
- Деньги в БД — целые копейки, не float.
- Новый экран = новая папка в `features/`, общее — в `shared/`.
