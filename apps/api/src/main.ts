import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
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
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  // Валидация DTO на входе: лишние поля отрезаются, неверные типы — ошибка 400
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true });
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
