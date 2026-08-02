import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через OpenAI DALL-E 3
// ==========================================
// Ключ (OPENAI_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает URL картинки.
//
// Раньше здесь была DeepInfra/FLUX-schnell, но пользователю нужен именно
// DALL-E 3 (лучше следует детальным русскоязычным промптам, аккуратно
// отрабатывает композицию). API совместим с OpenAI Images.
@Injectable()
export class ImageService {
  private readonly model = 'dall-e-3';
  private readonly apiUrl = 'https://api.openai.com/v1/images/generations';

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('Генератор изображений не сконфигурирован');

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        size: '1024x1024',
        // "standard" дешевле "hd" примерно вдвое ($0.040 vs $0.080)
        // при почти неотличимом качестве для типовых кейсов чата.
        quality: 'standard',
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[ImageService/DALL-E3] HTTP ${response.status}:`, errorBody.slice(0, 500));
      // Пробрасываем внятную ошибку по типовым ситуациям.
      if (response.status === 400 && errorBody.includes('content_policy')) {
        throw new ServiceUnavailableException('Запрос отклонён политикой безопасности OpenAI. Переформулируй промпт.');
      }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов. Попробуй через минуту.');
      throw new ServiceUnavailableException(`Ошибка генерации: HTTP ${response.status}`);
    }

    const data: any = await response.json();
    // DALL-E 3 возвращает { data: [{ url, revised_prompt }] }.
    // URL действителен около часа — фронтенд сразу подтягивает картинку.
    const first = data.data?.[0];
    if (!first) throw new ServiceUnavailableException('Пустой ответ генератора');
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    throw new ServiceUnavailableException('Неожиданный формат ответа генератора');
  }
}
