import { CodeViewerModal } from '@/features/chat/CodeViewerModal';


// Достаёт из ответа ассистента блоки кода — они автоматически попадают
// в "Библиотеку" как отдельные документы.
export const extractCodeDocuments = (content) => {
    if (!content) return [];
    const docs = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const lang = (match[1] || 'text').trim() || 'text';
        const code = match[2].trim();
        if (code.length >= 25) {
            const firstLine = code.split('\n')[0].slice(0, 48);
            docs.push({ language: lang, content: code, title: firstLine || `Фрагмент кода (${lang})` });
        }
    }
    return docs;
};


// Разбивает ответ ассистента на "видимый текст" и блоки кода: в чат идёт
// только текстовый комментарий, а сам код открывается в отдельном окне
// просмотра (см. CodeViewerModal), чтобы не загромождать переписку.
export const splitMessageContent = (content) => {
    if (!content) return { text: '', blocks: [] };
    const blocks = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    let lastIndex = 0;
    let text = '';
    while ((match = regex.exec(content)) !== null) {
        text += content.slice(lastIndex, match.index);
        const lang = (match[1] || 'text').trim() || 'text';
        const code = match[2].trim();
        if (code.length > 0) {
            const firstLine = code.split('\n')[0].slice(0, 48);
            blocks.push({ language: lang, content: code, title: firstLine || `Код (${lang})` });
        }
        lastIndex = regex.lastIndex;
    }
    text += content.slice(lastIndex);
    return { text: text.trim(), blocks };
};


// Строит HTML-документ для вкладки "Результат" — реальный живой предпросмотр
// для HTML/CSS/JS. Для JS/TS скрипт-раннер НЕ встраивается строкой внутрь
// HTML (чтобы в исходном коде страницы в принципе не могло быть текста,
// способного запутать браузерный парсер) — вместо этого возвращается
// отдельно и добавляется в iframe уже после его загрузки через DOM API
// (document.createElement('script')) в CodeViewerModal ниже.
export const buildCodePreviewDoc = (code, language) => {
    const lang = (language || '').toLowerCase();
    if (lang === 'html' || /<!doctype/i.test(code) || /<html[\s>]/i.test(code)) {
        return { html: code, jsCode: null };
    }
    if (lang === 'css') {
        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:24px;color:#1a1a2e}' + code + '</style></head><body><div class="preview-demo"><h1>Пример заголовка</h1><p>Демонстрационный текст для проверки стилей.</p><button>Кнопка</button></div>';
        return { html, jsCode: null };
    }
    if (lang === 'javascript' || lang === 'js' || lang === 'jsx' || lang === 'typescript' || lang === 'ts') {
        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:ui-monospace,monospace;padding:16px;font-size:13px;white-space:pre-wrap;color:#1a1a2e;"><div id="void-console-out"></div>';
        const jsCode = `
            const out = document.getElementById('void-console-out');
            const render = (color) => (...args) => {
                const p = document.createElement('div');
                p.style.color = color;
                p.style.marginBottom = '4px';
                p.textContent = args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ');
                out.appendChild(p);
            };
            console.log = render('#1a1a2e');
            console.warn = render('#b45309');
            console.error = render('#dc2626');
            try {
                ${code}
            } catch (e) { console.error('Ошибка выполнения: ' + e.message); }
            if (!out.children.length) { out.textContent = 'Код выполнен без вывода в консоль.'; out.style.color = '#9ca3af'; }
        `;
        return { html, jsCode };
    }
    return null;
};
