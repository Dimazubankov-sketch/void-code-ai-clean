import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmProvider, LlmRequest } from './llm-provider.interface';

// ==========================================
// Адаптер OpenRouter (OpenAI-совместимый чат-эндпоинт)
// ==========================================
// Ключ живёт ТОЛЬКО в переменных окружения сервера (OPENROUTER_API_KEY) —
// браузер пользователя его никогда не видит.
//
// Внутренние ID моделей фронтенда (mini/flash/plus/pro и т.п.) — это НЕ
// настоящие имена моделей. Пользователь и ИИ не должны знать реальную
// модель: наружу существуют только «Void Mini/Plus/Pro». Здесь мы
// сопоставляем внутренние ID с реальными моделями OpenRouter.
//
// Изменения после инцидента с HTTP 504:
// - Void Pro теперь смотрит на qwen3-coder (специализирован на коде,
//   значительно быстрее qwen-2.5-72b, при этом сильнее в программировании).
//   Прежняя связка «Pro → qwen-2.5-72b-instruct» давала ответы 60-90 сек
//   на нетривиальном коде, что упирается в дефолтный nginx proxy_read_timeout
//   и возвращает клиенту 504.
// - Явный AbortController + таймаут 90с внутри провайдера — если модель
//   зависла, мы вернём осмысленную ошибку до того как nginx оборвёт
//   соединение.
// - Увеличен max_tokens по умолчанию до 16384 — для сайтов/больших файлов
//   8192 обрезало вывод посередине (пользователь жаловался «маленькими
//   кусками»). Модели Qwen поддерживают куда бо́льше output tokens.
@Injectable()
export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter';

  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  // Держим таймаут в 60с. Раньше стоял 90с как страховка от медленного
  // upstream'а — но теперь мы явно просим OpenRouter выбирать самого
  // быстрого провайдера через provider.sort='throughput', поэтому нормальный
  // ответ приходит за 10-30 сек даже на больших запросах. Если что-то не
  // укладывается в 60с — почти наверняка проблема на стороне upstream, и
  // лучше упасть быстро с внятной ошибкой, чем висеть 90с ради одного из
  // ста случаев, когда медленный ответ всё же дойдёт.
  private readonly timeoutMs = 60_000;

  // Void Plus → qwen-2.5-coder-32b-instruct: специализирована на коде,
  // очень стабильный throughput у большинства upstream-провайдеров.
  // Void Pro → qwen3-coder: новое поколение Qwen для кода, качественнее
  // 2.5-72b-instruct на многофайловых задачах. РАНЬШЕ время генерации
  // лендинга доходило до 5–10 минут — виноват был не сам qwen3-coder,
  // а то, что OpenRouter по умолчанию мог маршрутизировать запрос на
  // дешёвого, но крайне медленного upstream-провайдера (~5–15 tok/s
  // вместо возможных 100+). Теперь мы явно указываем provider.sort =
  // 'throughput' в теле запроса — OpenRouter выбирает upstream по
  // скорости, а не по цене. Плюс max_tokens 16384 → 6144: этого хватает
  // на полный лендинг (~3000 строк HTML+CSS+JS), но не даёт модели
  // размывать ответ на 15000 токенов «на всякий случай», что и было
  // главным источником 5-минутного ожидания.
  private readonly modelMap: Record<string, string> = {
    mini: 'qwen/qwen-2.5-coder-32b-instruct',
    flash: 'qwen/qwen-2.5-coder-32b-instruct',
    flash_ext: 'qwen/qwen-2.5-coder-32b-instruct',
    plus: 'qwen/qwen-2.5-coder-32b-instruct',
    pro: 'qwen/qwen3-coder',
  };

  private readonly fallbackModel = 'qwen/qwen-2.5-coder-32b-instruct';

  async generate(req: LlmRequest): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('LLM-провайдер не сконфигурирован');

    const messages = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const chosenModel = this.modelMap[req.model] || this.fallbackModel;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          // OpenRouter рекомендует указывать источник запроса.
          'HTTP-Referer': process.env.APP_URL || 'https://void-code.ru',
          'X-Title': 'Void Code AI',
        },
        body: JSON.stringify({
          model: chosenModel,
          messages,
          // 6144 токенов — золотая середина: хватает на полноценный лендинг,
          // компонент со всеми состояниями, скрипт с обработкой ошибок; но
          // модель НЕ пытается размыть ответ до 15000 токенов «для запаса»,
          // что раньше давало 5–10 мин ожидания на Void Pro. Если запрос
          // явно передаёт больший maxTokens — уважаем.
          max_tokens: req.maxTokens ?? 6144,
          temperature: req.temperature ?? 0.7,
          // Ключевая оптимизация скорости: заставляем OpenRouter выбирать
          // upstream-провайдера по throughput (токенов в секунду), а не по
          // дефолтной цене. Для одной и той же модели разные upstream дают
          // разброс от 5 до 150 tok/s; без этой настройки OpenRouter мог
          // отправить запрос на самого медленного и дешёвого поставщика.
          // allow_fallbacks оставляем true — если самый быстрый провайдер
          // перегружен, автоматически уйдём на следующего по throughput.
          provider: {
            sort: 'throughput',
            allow_fallbacks: true,
          },
        }),
      });
    } catch (e: any) {
      clearTimeout(timer);
      const isAbort = e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
      if (isAbort) {
        console.error(`[OpenRouterProvider/${chosenModel}] таймаут ${this.timeoutMs}мс`);
        throw new ServiceUnavailableException(
          `Модель отвечает слишком долго (>${Math.round(this.timeoutMs / 1000)}с). Попробуй укоротить запрос или повторить.`
        );
      }
      console.error(`[OpenRouterProvider/${chosenModel}] сетевая ошибка:`, e?.message || e);
      throw new ServiceUnavailableException('Сбой сети при обращении к провайдеру');
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(
        `[OpenRouterProvider/${chosenModel}] HTTP ${response.status} за ${Date.now() - started}мс:`,
        errorBody.slice(0, 1000),
      );
      // Пробуем распарсить JSON — OpenRouter возвращает { error: { message, code } }.
      let parsedMessage: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed?.error?.message || null;
      } catch { /* not json */ }

      // Специальные кейсы: 402 (нет баланса), 429 (rate limit), 5xx.
      if (response.status === 402) throw new ServiceUnavailableException('Нет баланса на OpenRouter — пополни аккаунт');
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenRouter недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов, попробуй через минуту');
      if (response.status >= 500) throw new ServiceUnavailableException('Провайдер временно недоступен');
      if (parsedMessage) throw new ServiceUnavailableException(`Провайдер: ${parsedMessage.slice(0, 200)}`);
      throw new ServiceUnavailableException(`Ошибка провайдера: HTTP ${response.status}`);
    }
    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    console.log(
      `[OpenRouterProvider/${chosenModel}] ок за ${Date.now() - started}мс, ${content.length} симв`,
    );
    return content;
  }
}
