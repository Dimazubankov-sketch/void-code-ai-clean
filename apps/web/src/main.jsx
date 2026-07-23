import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { initTheme } from '@/shared/lib/theme';
import '@/styles/index.css';

initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
