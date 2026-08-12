import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';

// ==========================================
// Синтез речи через OpenAI TTS-1 со стримингом
// ==========================================
// Один эндпоинт, шесть официальных голосов (alloy, echo, fable, onyx, nova,
// shimmer). Возвращает MP3-байты, которые контроллер отдаёт как audio/mpeg.
//
// Раньше отдавали единым буфером — воспроизведение начиналось только после
// полной генерации файла (2–5 секунд ожидания на длинный текст). Теперь
// стримим: чанки от OpenAI сразу пробрасываются в браузер через
// pipeToResponse(), и <audio> начинает играть буквально с первого килобайта.
// Ощутимо снижает time-to-first-audio.
//
// Ключ (OPENAI_API_KEY) — только в окружении сервера, тот же, что и для
// DALL-E 3. Тарифицируется по количеству символов входного текста
// (примерно $15 за 1M символов).
const ALLOWED_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

@Injectable()
export class TtsService {
  private readonly apiUrl = 'https://api.openai.com/v1/audio/speech';
  // tts-1 — более быстрый и дешёвый вариант. tts-1-hd качественнее, но
  // на 2× медленнее — стриминг проседает, поэтому оставляем tts-1.
  private readonly model = 'tts-1';
  // Было 30с — при полном сетевом сбое (например, недоступен исходящий
  // трафик до api.openai.com с сервера) это означало полминуты
  // «бесконечной загрузки» на клиенте перед тем как сработает фолбэк.
  // 15с — с запасом на реальную генерацию (обычно 1-3с даже для
  // длинного текста), но заметно короче для случая полного отказа сети.
  private readonly timeoutMs = 15_000;

  // Валидация параметров общий для обоих режимов (стрим и буфер).
  private validate(text: string, voice: string, speed: number) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('TTS не сконфигурирован');
    if (!text || text.length === 0) throw new BadRequestException('Пустой текст');
    if (text.length > 4096) throw new BadRequestException('Текст слишком длинный (макс 4096 символов на один запрос)');
    return {
      apiKey,
      voice: ALLOWED_VOICES.has(voice) ? voice : 'nova',
      speed: Math.max(0.25, Math.min(4.0, speed)),
    };
  }

  private buildRequestBody(text: string, voice: string, speed: number) {
    return JSON.stringify({
      model: this.model,
      input: text,
      voice,
      speed,
      response_format: 'mp3',
    });
  }

  private async requestOpenAi(text: string, voice: string, speed: number): Promise<Response> {
    const v = this.validate(text, voice, speed);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${v.apiKey}`,
        },
        body: this.buildRequestBody(text, v.voice, v.speed),
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        throw new ServiceUnavailableException('OpenAI TTS не ответил вовремя');
      }
      throw new ServiceUnavailableException('Сбой сети при обращении к TTS');
    }
    clearTimeout(timer);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[TtsService/OpenAI] HTTP ${response.status}:`, errorBody.slice(0, 500));
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов TTS. Попробуй через минуту.');
      throw new ServiceUnavailableException(`Ошибка TTS: HTTP ${response.status}`);
    }
    return response;
  }

  // Прежний API: возвращает полный Buffer. Оставлен для совместимости
  // (например, для генерации сэмплов «Проверить голос» на маленьких строках).
  async synthesize(text: string, voice: string = 'nova', speed: number = 1.0): Promise<Buffer> {
    const response = await this.requestOpenAi(text, voice, speed);
    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // Новый API для стриминга. Прокидывает тело ответа OpenAI напрямую
  // в Express Response — браузер получает первые чанки MP3 за 200-400мс
  // вместо ожидания полного файла (2-5с на длинный текст).
  async streamTo(res: ExpressResponse, text: string, voice: string = 'nova', speed: number = 1.0) {
    const response = await this.requestOpenAi(text, voice, speed);
    if (!response.body) {
      // На всякий случай — если fetch не отдал stream (маловероятно в node18+)
      const arrayBuf = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
      return;
    }
    // Читаем ReadableStream (web-стандарт) и пробрасываем в Express Response.
    // Не выставляем Content-Length (стрим неизвестной длины), браузер это
    // спокойно переваривает и играет по мере получения.
    const reader = response.body.getReader();
    try {
      // Первое чтение — как только пришли байты, шлём их сразу. flushHeaders
      // (если поддерживается) заставляет отправить header пакет клиенту сейчас,
      // а не буферизовать до первого write.
      if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) {
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (e: any) {
      console.error('[TtsService/stream] чтение сломалось:', e?.message || e);
      try { reader.cancel(); } catch { /* ignore */ }
      if (!res.headersSent) {
        res.status(502);
        res.end();
      } else {
        res.end();
      }
    }
  }
}
