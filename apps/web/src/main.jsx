import React from 'react';
import ReactDOM from 'react-dom/client';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { App } from '@/app/App';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { initTheme } from '@/shared/lib/theme';
import '@/styles/index.css';

// Регистрируем useGSAP один раз на уровне всего приложения (как требует
// официальный GSAP React skill) — плагин нужен до первого вызова хука.
// Заодно задаём общие дефолты тайминга/сглаживания, чтобы все анимации
// в Void Code выглядели единым «почерком».
gsap.registerPlugin(useGSAP);
gsap.defaults({ ease: 'power2.out', duration: 0.5 });

initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
