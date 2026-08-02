import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через DeepInfra
// ==========================================
// Ключ (DEEPINFRA_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает data-URL картинки.
@Injectable()
export class ImageService {
  // Модель text-to-image на DeepInfra.
  private readonly model = 'black-forest-labs/FLUX-1-schnell';
  // ВАЖНО: используем именно OpenAI-совместимый эндпоинт DeepInfra.
  // Прежний /v1/inference/... с телом { num_images } не соответствовал
  // формату ответа — из-за этого картинка не парсилась, срабатывал
  // фолбэк на заглушку, и пользователь видел «случайные» абстрактные
  // изображения вместо запрошенного. Формат ответа здесь:
  //   { data: [{ b64_json, url, revised_prompt }], created }
  private readonly apiUrl = 'https://api.deepinfra.com/v1/openai/images/generations';

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.DEEPINFRA_API_KEY;
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
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[ImageService] HTTP ${response.status}:`, errorBody.slice(0, 500));
      throw new ServiceUnavailableException(`Ошибка генерации: HTTP ${response.status}`);
    }

    const data: any = await response.json();
    // OpenAI-совместимый формат: data[0].b64_json или data[0].url.
    const first = data.data?.[0];
    if (!first) throw new ServiceUnavailableException('Пустой ответ генератора');
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    throw new ServiceUnavailableException('Неожиданный формат ответа генератора');
  }
}
