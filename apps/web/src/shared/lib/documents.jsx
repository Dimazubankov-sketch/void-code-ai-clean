import { CodeViewerModal } from '@/features/chat/CodeViewerModal';


// Достаёт из ответа ассистента блоки кода — они автоматически попадают
// в "Библиотеку" как отдельные документы. Виджет-блоки (bash/chart)
// сюда не попадают — это данные для инлайн-рендера, а не «код», который
// имеет смысл сохранять как файл.
const LIBRARY_EXCLUDE_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'cmd', 'terminal', 'powershell', 'ps1', 'chart', 'graph', 'plot', 'json-chart', 'linechart', 'barchart', 'chartjs', 'recharts']);
export const extractCodeDocuments = (content) => {
    if (!content) return [];
    const docs = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const lang = (match[1] || 'text').trim().toLowerCase() || 'text';
        if (LIBRARY_EXCLUDE_LANGS.has(lang)) continue;
        const code = match[2].trim();
        if (code.length >= 25) {
            const firstLine = code.split('\n')[0].slice(0, 48);
            docs.push({ language: lang, content: code, title: firstLine || `Фрагмент кода (${lang})` });
        }
    }
    return docs;
};


// Языки, которые рендерятся ИНЛАЙНОМ в чате как CLI-виджет терминала —
// команды bash/sh коротки и удобнее видеть их прямо в диалоге, а не
// открывать через модалку.
const INLINE_CLI_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'cmd', 'terminal', 'powershell', 'ps1']);
// Языки-виджеты для графиков — тоже остаются в тексте (их отрисует
// ChartBlock в MessageRenderer), не попадают в «Библиотеку кода» и не
// открываются в CodeViewerModal.
const INLINE_CHART_LANGS = new Set(['chart', 'graph', 'plot', 'json-chart', 'linechart', 'barchart', 'chartjs', 'recharts']);

// Разбивает ответ ассистента на "видимый текст" и блоки кода: полноценный
// код (HTML/CSS/JS/Python...) выносится в отдельные блоки для окна просмотра,
// а CLI-команды (bash/sh) остаются в тексте — их рендерит MessageRenderer
// как компактный виджет терминала с кнопкой копирования.
export const splitMessageContent = (content) => {
    if (!content) return { text: '', blocks: [] };
    const blocks = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    let lastIndex = 0;
    let text = '';
    while ((match = regex.exec(content)) !== null) {
        const lang = (match[1] || 'text').trim().toLowerCase() || 'text';
        const code = match[2].trim();
        const rawFragment = content.slice(match.index, regex.lastIndex);

        // CLI-блок и Chart-блок оставляем в тексте как есть, чтобы MessageRenderer
        // нарисовал их соответствующим виджетом (терминал / SVG-график) прямо в чате.
        if (INLINE_CLI_LANGS.has(lang) || INLINE_CHART_LANGS.has(lang)) {
            text += content.slice(lastIndex, match.index) + rawFragment;
        } else {
            text += content.slice(lastIndex, match.index);
            if (code.length > 0) {
                const firstLine = code.split('\n')[0].slice(0, 48);
                blocks.push({ language: lang, content: code, title: firstLine || `Код (${lang})` });
            }
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
export const buildCodePreviewDoc = (code, language, siblings = []) => {
    const lang = (language || '').toLowerCase();
    if (lang === 'html' || /<!doctype/i.test(code) || /<html[\s>]/i.test(code)) {
        let html = code;
        // Если ИИ прислал HTML отдельным блоком, а CSS/JS — соседними блоками
        // в том же ответе (типичный случай для многофайлового кода), сама
        // разметка часто ссылается на внешние файлы (style.css, script.js),
        // которых в песочнице iframe физически нет — предпросмотр выходил
        // белым, без оформления. Подмешиваем соседние блоки прямо в документ.
        const cssSiblings = siblings.filter(b => b.content !== code && ['css'].includes((b.language || '').toLowerCase()));
        const jsSiblings = siblings.filter(b => b.content !== code && ['javascript', 'js'].includes((b.language || '').toLowerCase()));
        if (cssSiblings.length) {
            const styleTag = `<style>${cssSiblings.map(b => b.content).join('\n')}</style>`;
            html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${styleTag}</head>`) : styleTag + html;
        }
        if (jsSiblings.length) {
            const scriptTag = `<script>${jsSiblings.map(b => b.content).join('\n')}</script>`;
            html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scriptTag}</body>`) : html + scriptTag;
        }
        return { html, jsCode: null };
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
