import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

// ==========================================
// VideoStorageService — постоянное файловое хранилище готовых видео
// ==========================================
// Баг (жалоба пользователя): готовое видео нельзя было открыть для
// просмотра и оно «не сохранялось» в библиотеке. Причина — ДВЕ отдельные
// проблемы:
//
// 1. OpenRouter возвращает в unsigned_urls ссылку вида
//    https://openrouter.ai/api/v1/videos/{id}/content — несмотря на
//    название поля, по документации OpenRouter эта ссылка НЕ является
//    полноценно публичной: её нужно скачивать с заголовком
//    `Authorization: Bearer <OPENROUTER_API_KEY>`, как и при опросе
//    статуса. Браузер не может добавить такой заголовок к <video src=...>
//    — просмотр всегда падал с 401, ролик выглядел «битым».
//
// 2. Даже там, где видео докачивалось на сервер (дозвучка/fallback B),
//    результат клался в MediaCacheService — ЭТО ВРЕМЕННЫЙ in-memory кэш
//    с TTL 30 минут, который к тому же полностью обнуляется при каждом
//    перезапуске/деплое (pm2 restart). Для «Библиотеки», где ролики
//    должны быть доступны спустя часы/дни, это в принципе не годится —
//    отсюда и «не сохраняется».
//
// Решение: сервер САМ скачивает готовое видео с авторизацией и кладёт
// его на диск в постоянное хранилище (без TTL, без очистки по возрасту),
// а клиенту отдаёт свою собственную стабильную ссылку на файл. Полноценное
// облачное хранилище (S3 и т.п.) здесь избыточно — на VPS с nginx перед
// NestJS обычный файл на диске полностью решает задачу и переживает
// перезапуски процесса (в отличие от in-memory Map).
@Injectable()
export class VideoStorageService {
  private readonly logger = new Logger(VideoStorageService.name);
  private readonly dir = path.join(process.cwd(), 'storage', 'videos');
  private ensured: Promise<void> | null = null;

  private async ensureDir(): Promise<void> {
    if (!this.ensured) {
      this.ensured = fs.mkdir(this.dir, { recursive: true }).then(() => undefined);
    }
    return this.ensured;
  }

  // Сохраняет буфер видео на диск, возвращает id (используется в
  // публичном URL). Расширение всегда .mp4 — Seedance отдаёт H.264/MP4.
  async save(buf: Buffer): Promise<string> {
    await this.ensureDir();
    const id = randomUUID();
    const filePath = path.join(this.dir, `${id}.mp4`);
    await fs.writeFile(filePath, buf);
    this.logger.log(`Видео сохранено на диск: ${id}.mp4 (${(buf.length / 1024 / 1024).toFixed(1)}МБ)`);
    return id;
  }

  // Отдаёт путь к файлу, если он существует. id всегда генерируется нами
  // через randomUUID (см. save) — но на всякий случай валидируем формат
  // перед сборкой пути, чтобы Param не мог вырваться за пределы каталога
  // (path traversal) даже теоретически.
  private static readonly ID_RE = /^[0-9a-f-]{36}$/i;

  async resolvePath(id: string): Promise<string | null> {
    if (!VideoStorageService.ID_RE.test(id)) return null;
    const filePath = path.join(this.dir, `${id}.mp4`);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }
}
