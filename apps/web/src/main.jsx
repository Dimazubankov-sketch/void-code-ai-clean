import React from 'react';
import ReactDOM from 'react-dom/client';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { App } from '@/app/App';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { RequisitesPage } from '@/features/legal/RequisitesPage';
import { initTheme } from '@/shared/lib/theme';
import '@/styles/index.css';

// Регистрируем useGSAP один раз на уровне всего приложения (как требует
// официальный GSAP React skill) — плагин нужен до первого вызова хука.
// Заодно задаём общие дефолты тайминга/сглаживания, чтобы все анимации
// в Void Code выглядели единым «почерком».
gsap.registerPlugin(useGSAP);
gsap.defaults({ ease: 'power2.out', duration: 0.5 });

initTheme();

// /requisites — полностью публичная страница (реквизиты самозанятого),
// без авторизации и без state основного приложения. Проверяем путь ДО
// монтирования <App />, чтобы не тянуть за собой сессию/сплэш/тему —
// страница должна открываться мгновенно и работать для кого угодно,
// в том числе до регистрации (см. ссылку в AuthModal и в Настройках).
const isRequisitesRoute = window.location.pathname.replace(/\/+$/, '') === '/requisites';

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        {isRequisitesRoute ? <RequisitesPage /> : <App />}
    </ErrorBoundary>
);
