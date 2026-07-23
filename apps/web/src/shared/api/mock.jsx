import { callGeminiAI } from '@/shared/api/llm';
import { hashPromptSeed } from '@/shared/lib/imagegen';



// ==========================================
// ТЕСТОВЫЙ РЕЖИМ ЧАТА (пока не подключены реальные AI-модели)
// ==========================================
// MOCK_MODE = true — чат отвечает заранее заготовленными правдоподобными
// ответами вместо обращения к реальному AI-провайдеру (ключ ниже ещё не
// настоящий, поэтому запросы к нему всё равно всегда падают с ошибкой).
// Как только появится рабочий ключ провайдера — переключите на false,
// и callGeminiAI начнёт использовать реальный API ниже как и раньше.
export const MOCK_MODE = true;


export const MOCK_GREETING_WORDS = ['привет', 'здравств', 'хай', 'добрый день', 'доброе утро', 'добрый вечер', 'ку', 'йо'];

export const MOCK_CODE_WORDS = ['код', 'функци', 'компонент', 'script', 'html', 'css', 'javascript', 'python', 'верстк', 'сверста', 'напиши код', 'алгоритм', 'программ'];


// Заготовка кода для модели Void Code Pro — карточка с живым HTML/CSS/JS,
// чтобы удобно проверить окно просмотра кода (вкладки "Код" и "Результат").
export const MOCK_PRO_CODE_EXAMPLE = "```html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\n  body { font-family: system-ui, sans-serif; margin: 0; padding: 40px; background: linear-gradient(135deg, #efecf9, #f8f9fc); display: flex; align-items: center; justify-content: center; min-height: 100vh; }\n  .card { background: white; border-radius: 24px; padding: 32px; box-shadow: 0 10px 40px rgba(91,50,212,0.15); max-width: 320px; text-align: center; }\n  .card h2 { color: #1a1a2e; margin: 0 0 8px; }\n  .card p { color: #6b7280; margin: 0 0 20px; font-size: 14px; }\n  .card button { background: #5b32d4; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; }\n  .card button:hover { background: #4a26b0; }\n</style>\n</head>\n<body>\n  <div class=\"card\">\n    <h2>Готово! \ud83c\udf89</h2>\n    <p>Пример карточки, собранной по вашему запросу</p>\n    <button onclick=\"alert('Привет от Void Code Pro!')\">Нажми меня</button>\n  </div>\n```";


export const generateMockReply = (messages, systemPrompt, modelId) => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const text = (lastUser?.content || '').toLowerCase();

    // Void Code Pro создан именно для кода — в тестовом режиме он всегда
    // отвечает готовым примером, чтобы удобно проверить окно просмотра кода.
    if (modelId === 'pro') {
        return `Собрал для вас карточку — открой окно просмотра ниже, там доступны и код, и живой результат.\n\n${MOCK_PRO_CODE_EXAMPLE}`;
    }

    if (MOCK_CODE_WORDS.some(w => text.includes(w))) {
        return "```javascript\nfunction greet(name) {\n  return `Привет, ${name}! Рад помочь.`;\n}\n\nconsole.log(greet('мир'));\n```\n\nЭто демонстрационный пример кода — реальные AI-модели ещё не подключены к Void Code AI, поэтому сейчас чат работает в тестовом режиме. Когда модель будет подключена, здесь появится настоящий код под ваш конкретный запрос.";
    }
    if (MOCK_GREETING_WORDS.some(w => text.includes(w))) {
        return 'Привет! 👋 Сейчас я отвечаю в тестовом режиме — реальные AI-модели ещё не подключены к серверу, поэтому это заготовленный ответ для проверки интерфейса. Диалог, анимация печати и вся логика чата уже полностью рабочие.';
    }

    const fallbacks = [
        'Это тестовый ответ: реальная AI-модель ещё не подключена к серверу, поэтому чат сейчас работает в демонстрационном режиме. Как только провайдер будет подключён, здесь появятся настоящие ответы.',
        `Понял ваш запрос: «${(lastUser?.content || '').slice(0, 70)}». Пока это заготовленный (тестовый) ответ для проверки интерфейса — сама модель ещё не подключена.`,
        'Хороший вопрос! Сейчас чат работает без подключённой модели, поэтому отвечаю заранее подготовленным текстом — но весь интерфейс, история сообщений и анимация уже рабочие и готовы к реальным ответам.'
    ];
    return fallbacks[hashPromptSeed(text || 'default') % fallbacks.length];
};
