import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    // GitHub Pages отдаёт проект по адресу /имя-репозитория/. Абсолютный путь
    // надёжнее относительного './' — тот ломается, если страницу открыли
    // без завершающего слэша (.../void-code-ai вместо .../void-code-ai/):
    // браузер в этом случае неверно разворачивает относительные пути и ищет
    // файлы в корне домена. Если переименуешь репозиторий — поменяй строку ниже.
    base: '/void-code-ai-clean/',
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
        extensions: ['.js', '.jsx'],
    },
    server: { port: 5173 },
});
