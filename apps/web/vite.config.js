import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    // Раньше проект отдавался через GitHub Pages по адресу /void-code-ai-clean/,
    // отсюда был непустой base. Теперь сайт раздаёт nginx на VPS из корня
    // домена (root указывает прямо на apps/web/dist) — поэтому base должен
    // быть '/', иначе браузер ищет /void-code-ai-clean/assets/... и получает
    // вместо JS-файла запасной index.html (см. try_files в конфиге nginx).
    base: '/',
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
        extensions: ['.js', '.jsx'],
    },
    server: { port: 5173 },
});
