import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

// ==========================================
// MediaCacheService — временное публичное хранилище байтов
// ==========================================
// OpenRouter (для audio-референса Seedance) и браузер пользователя (для
// финального видео после ffmpeg-дозвучки) должны СКАЧАТЬ файл по обычному
// HTTPS URL — им нельзя просто передать Buffer или base64 прямо в JSON.
// Полноценное файловое хранилище (S3 и т.п.) для этого избыточно: файлы
// нужны считанные минуты, пока OpenRouter обрабатывает job или пока
// пользователь не открыл готовое видео. Простая in-memory Map с TTL —
// тот же принцип, что и audioCache в FishAudioTtsService.
//
// ВАЖНО: раздаётся публично, БЕЗ JwtAuthGuard (см. MediaCacheController) —
// иначе внешний сервер OpenRouter не смог бы скачать audio_url. id —
// случайный UUID, файл живёт ограниченное время и без auth-заголовков,
// поэтому это не хуже практики «неугадываемая ссылка», принятой у всех
// провайдеров подписанных URL.
interface CacheEntry {
  buf: Buffer;
  mime: string;
  at: number;
}

@Injectable()
export class MediaCacheService {
  private readonly store = new Map<string, CacheEntry>();
  // 30 минут: с запасом покрывает и время генерации видео Seedance
  // (обычно единицы минут), и время, которое пользователь может провести
  // с открытой вкладкой до просмотра готового ролика.
  private readonly ttlMs = 30 * 60 * 1000;
  private readonly maxEntries = 300;

  put(buf: Buffer, mime: string): string {
    this.evictExpired();
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    const id = randomUUID();
    this.store.set(id, { buf, mime, at: Date.now() });
    return id;
  }

  get(id: string): { buf: Buffer; mime: string } | null {
    const hit = this.store.get(id);
    if (!hit) return null;
    if (Date.now() - hit.at > this.ttlMs) {
      this.store.delete(id);
      return null;
    }
    return { buf: hit.buf, mime: hit.mime };
  }

  private evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.at > this.ttlMs) this.store.delete(key);
    }
  }
}
