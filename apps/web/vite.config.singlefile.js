// ==========================================
// СБОРКА В ОДИН ФАЙЛ (монолит для быстрого просмотра)
// ==========================================
// Собирает ВЕСЬ модульный проект в единственный index.html: JS и CSS
// инлайнятся внутрь. Открываешь двойным кликом — сразу работает, без сервера.
// Это НЕ замена модульному проекту, а его автоматическая упаковка:
// монолит всегда 1:1 повторяет модульный код, ничего не расходится.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

export default defineConfig({
    plugins: [react(), viteSingleFile()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
        extensions: ['.js', '.jsx'],
    },
    build: {
        outDir: 'dist-single',
        // Всё в один файл: без разбивки на чанки
        assetsInlineLimit: 100000000,
        cssCodeSplit: false,
        reportCompressedSize: false,
    },
});
