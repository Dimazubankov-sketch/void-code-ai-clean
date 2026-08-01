import { MOCK_MODE, generateMockReply } from '@/shared/api/mock';

// API-ключ НИКОГДА не хранится в коде. Для локальной разработки положите его
// в apps/web/.env.local (VITE_GEMINI_API_KEY=...), для продакшена ключ должен
// жить только на бэкенде (NestJS-прокси), а не в браузере.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";


export const callGeminiAI = async (messages, systemPrompt, modelId) => {
    if (MOCK_MODE) {
        // Небольшая пауза "на размышление", чтобы интерфейс выглядел живо,
        // но без долгих реальных сетевых задержек.
        await new Promise(resolve => setTimeout(resolve, 700 + Math.random() * 700));
        return generateMockReply(messages, systemPrompt, modelId);
    }

    const delays = [1000, 2000, 4000, 8000, 16000];
    const contents = messages.map(msg => {
        const parts = [{ text: msg.content }];
        if (msg.image) {
            const base64Data = msg.image.split(',')[1];
            const mimeType = msg.image.match(/data:(.*?);base64/)[1] || 'image/jpeg';
            parts.push({ inlineData: { mimeType: mimeType, data: base64Data } });
        }
        return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
    });

    const payload = { contents, systemInstruction: { parts: [{ text: systemPrompt }] } };

    for (let i = 0; i < 5; i++) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "Ошибка генерации ответа.";
        } catch (error) {
            if (i === 4) return "⚠️ Произошла ошибка при подключении к серверам ИИ. Пожалуйста, убедитесь, что вы ввели корректный API-ключ от Google Gemini.";
            await new Promise(resolve => setTimeout(resolve, delays[i]));
        }
    }
};
