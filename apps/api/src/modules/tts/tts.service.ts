import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';

// ==========================================
// Синтез речи через OpenAI TTS-1
// ==========================================
// Один эндпоинт, шесть официальных голосов (alloy, echo, fable, onyx, nova,
// shimmer). Возвращает MP3-байты, которые контроллер отдаёт как audio/mpeg
// напрямую в браузер — фронтенд играет через <audio>.
//
// Ключ (OPENAI_API_KEY) — только в окружении сервера, тот же, что и для
// DALL-E 3. Тарифицируется по количеству символов входного текста
// (примерно $15 за 1M символов).
const ALLOWED_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

@Injectable()
export class TtsService {
  private readonly apiUrl = 'https://api.openai.com/v1/audio/speech';
  private readonly model = 'tts-1';

  async synthesize(text: string, voice: string = 'nova', speed: number = 1.0): Promise<Buffer> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('TTS не сконфигурирован');

    if (!text || text.length === 0) throw new BadRequestException('Пустой текст');
    // Ограничение OpenAI на один запрос — 4096 символов. Больше режем,
    // фронтенд склеит несколько кусков.
    if (text.length > 4096) throw new BadRequestException('Текст слишком длинный (макс 4096 символов на один запрос)');

    const chosenVoice = ALLOWED_VOICES.has(voice) ? voice : 'nova';
    const safeSpeed = Math.max(0.25, Math.min(4.0, speed));

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: chosenVoice,
        speed: safeSpeed,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[TtsService/OpenAI] HTTP ${response.status}:`, errorBody.slice(0, 500));
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов TTS. Попробуй через минуту.');
      throw new ServiceUnavailableException(`Ошибка TTS: HTTP ${response.status}`);
    }

    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
}
