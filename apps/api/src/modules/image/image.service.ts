import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через DeepInfra
// ==========================================
// Ключ (DEEPINFRA_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает data-URL картинки.
@Injectable()
export class ImageService {
  // Модель text-to-image на DeepInfra (OpenAI-совместимый images-эндпоинт).
  private readonly model = 'black-forest-labs/FLUX-1-schnell';
  private readonly apiUrl =
    'https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-schnell';

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
        prompt,
        num_images: 1,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Ошибка генерации: HTTP ${response.status}`);
    }

    const data: any = await response.json();
    // DeepInfra возвращает массив images (data-URL или base64) в разных
    // форматах в зависимости от модели — нормализуем к data-URL.
    const img = data.images?.[0] ?? data.image ?? data.output?.[0];
    if (!img) throw new ServiceUnavailableException('Пустой ответ генератора');
    if (typeof img === 'string' && img.startsWith('data:')) return img;
    if (typeof img === 'string' && img.startsWith('http')) return img;
    return `data:image/png;base64,${img}`;
  }
}
