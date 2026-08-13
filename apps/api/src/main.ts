import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';

// ==========================================
// Диагностика окружения при старте (задачи по багам с Void Mini / TTS)
// ==========================================
// Раньше отсутствие/неверность любого из этих ключей проявлялось только
// косвенно — как ошибка глубоко внутри конкретного провайдера при первом
// реальном запросе пользователя (например «Void Mini не отвечает» или
// «озвучка не воспроизводится»), и разобраться, что именно не так на
// сервере, можно было только гадая. Теперь при каждом старте/рестарте
// (pm2 restart void-code-api) сразу в лог выводится чёткий чек-лист:
// какие переменные заданы, а какие — нет. Ничего не блокирует запуск
// (сервер всё равно поднимется — часть функций может работать без
// какого-то одного провайдера), это только диагностика.
function logEnvChecklist() {
  const checks: Array<{ name: string; required: boolean; note: string }> = [
    { name: 'JWT_SECRET', required: true, note: 'без него ВСЕ запросы к API будут получать 401 (в т.ч. видимое как "сессия истекла")' },
    { name: 'DATABASE_URL', required: true, note: 'подключение к PostgreSQL' },
    { name: 'GROQ_API_KEY', required: false, note: 'Void Mini — без него Mini падает на OpenRouter (если он тоже не настроен — Mini не отвечает вообще)' },
    { name: 'OPENROUTER_API_KEY', required: false, note: 'Void Plus/Pro + fallback для Mini + основной провайдер генерации картинок' },
    { name: 'OPENAI_API_KEY', required: false, note: 'озвучка (TTS) + fallback генерации картинок' },
    { name: 'DEEPINFRA_API_KEY', required: false, note: 'доп. провайдер картинок' },
    { name: 'RESEND_API_KEY', required: false, note: 'почта @voidops.ru — без него отправка писем недоступна' },
    { name: 'RESEND_WEBHOOK_SECRET', required: false, note: 'приём ВХОДЯЩИХ писем @voidops.ru — без него вебхук отклоняет запросы (см. mail-webhook.controller.ts)' },
  ];
  // eslint-disable-next-line no-console
  console.log('\n[ENV CHECK] ================================================');
  for (const c of checks) {
    const val = process.env[c.name];
    const set = typeof val === 'string' && val.trim().length > 0;
    const mark = set ? '✅' : (c.required ? '❌ ОТСУТСТВУЕТ (обязательно)' : '⚠️  отсутствует (опционально)');
    // eslint-disable-next-line no-console
    console.log(`[ENV CHECK] ${c.name.padEnd(20)} ${mark}${!set ? ` — ${c.note}` : ''}`);
  }
  console.log('[ENV CHECK] ================================================\n');
}

async function bootstrap() {
  logEnvChecklist();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Дефолтный лимит body-parser у Express — 100kb. Этого категорически не
  // хватает для запросов с приложенными фото (Vision): изображение,
  // закодированное в base64 data-URL, весит примерно на треть больше
  // исходного файла, и даже одно фото среднего размера с телефона легко
  // превышает 100kb, что раньше давало клиенту HTTP 413 «Payload Too
  // Large» прямо на входе в NestJS — до того как запрос вообще доходил
  // до контроллера/валидации. Поднимаем лимит на JSON и
  // urlencoded-парсеры до 50mb — с большим запасом под несколько
  // приложенных фото в одном сообщении (клиент дополнительно сжимает
  // изображения перед отправкой, см. features/chat/imageCompress.jsx).
  // verify: сохраняем СЫРОЕ тело запроса в req.rawBody ДО того, как
  // express его распарсит в объект — нужно для проверки подписи вебхука
  // Resend (mail-webhook.controller.ts): Svix подписывает именно сырые
  // байты тела, повторная JSON.stringify() распарсенного объекта не
  // гарантированно даёт побайтово тот же результат (порядок ключей,
  // пробелы), поэтому подпись должна проверяться по оригиналу.
  app.use(express.json({ limit: '50mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  // Валидация DTO на входе: лишние поля отрезаются, неверные типы — ошибка 400
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true });
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
