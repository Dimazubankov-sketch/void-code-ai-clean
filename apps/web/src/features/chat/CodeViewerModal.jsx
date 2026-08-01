import { useState, useRef } from 'react';
import { buildCodePreviewDoc } from '@/shared/lib/documents';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// ОКНО ПРОСМОТРА КОДА (Код / Результат)
// ==========================================
// Открывается из карточки в чате вместо того, чтобы печатать код прямо
// в переписку — так диалог остаётся читаемым, а с кодом удобно работать
// отдельно: смотреть исходник или живой результат.
export function CodeViewerModal({ block, siblings = [], onClose }) {
    const [tab, setTab] = useState('code');
    const [copied, setCopied] = useState(false);
    // Полноэкранный режим — только для ПК (на телефоне окно и так занимает
    // почти весь экран, кнопка не показывается).
    const [fullscreen, setFullscreen] = useState(false);
    const preview = buildCodePreviewDoc(block.content, block.language, siblings);
    const iframeRef = useRef(null);
    const codeRef = useRef(null);

    // ==========================================
    // Блокировка оси прокрутки кода на телефоне
    // ==========================================
    // CSS touch-action не умеет разрешить "вертикаль ИЛИ горизонталь, но не
    // одновременно" — pan-x + pan-y вместе фактически разрешают свободное
    // диагональное перемещение. Поэтому определяем направление жеста вручную:
    // на touchstart запоминаем точку и текущий scrollLeft/scrollTop, на
    // touchmove после небольшого порога решаем, какая ось доминирует, и до
    // конца жеста двигаем ТОЛЬКО её — руками, через scrollLeft/scrollTop,
    // с preventDefault, чтобы браузер не пытался скроллить сам по обеим осям.
    const touchState = useRef(null);
    const handleTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        touchState.current = {
            startX: t.clientX,
            startY: t.clientY,
            startScrollLeft: e.currentTarget.scrollLeft,
            startScrollTop: e.currentTarget.scrollTop,
            axis: null, // 'x' | 'y' — определяется после первых ~8px движения
        };
    };
    const handleTouchMove = (e) => {
        const st = touchState.current;
        if (!st || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - st.startX;
        const dy = t.clientY - st.startY;
        if (!st.axis) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // ждём чёткого направления
            st.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        const el = e.currentTarget;
        if (st.axis === 'x') {
            el.scrollLeft = st.startScrollLeft - dx;
        } else {
            el.scrollTop = st.startScrollTop - dy;
        }
        e.preventDefault();
    };
    const handleTouchEnd = () => { touchState.current = null; };

    // Скрипт для вкладки "Результат" добавляется в iframe уже ПОСЛЕ его
    // загрузки, через нативный DOM API (createElement('script') + textContent) —
    // а не строкой внутри HTML. Это гарантированно безопасно: здесь нет
    // текста, который мог бы быть распознан как открывающий/закрывающий тег.
    const handleIframeLoad = () => {
        if (!preview || !preview.jsCode || !iframeRef.current) return;
        try {
            const doc = iframeRef.current.contentDocument;
            if (!doc) return;
            const scriptEl = doc.createElement('script');
            scriptEl.textContent = preview.jsCode;
            doc.body.appendChild(scriptEl);
        } catch (e) { /* iframe в песочнице — просто не покажем результат */ }
    };

    // Копируем ВЫДЕЛЕННЫЙ пользователем участок кода, если он есть, иначе —
    // весь блок целиком. Работает и на ПК (выделение мышью), и на телефоне
    // (выделение долгим нажатием — маркеры выделения).
    const handleCopy = () => {
        const sel = window.getSelection ? window.getSelection() : null;
        const selectedText = sel ? sel.toString() : '';
        const textToCopy = (selectedText && codeRef.current && sel.anchorNode && codeRef.current.contains(sel.anchorNode))
            ? selectedText
            : block.content;
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    };

    return (
        <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4 fade-in ${fullscreen ? 'sm:p-0' : ''}`}>
            <div className={`bg-white dark:bg-darkCard w-full shadow-2xl border border-gray-100 dark:border-darkBorder flex flex-col overflow-hidden overscroll-contain transition-all ${fullscreen ? 'sm:max-w-full sm:h-screen sm:rounded-none code-modal-h rounded-t-[2rem]' : 'sm:max-w-3xl code-modal-h rounded-t-[2rem] sm:rounded-[2rem]'}`}>
                {/* Шапка с кнопкой закрытия — всегда видна, вне скроллящейся
                    области, чтобы выход был доступен в любой момент. */}
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-darkBorder flex-shrink-0 relative z-10 bg-white dark:bg-darkCard">
                    <div className="flex items-center gap-3 min-w-0">
                        <button onClick={onClose} className="void-tap-target sm:hidden flex items-center gap-1 p-2 -ml-2 pr-3 text-[#5b32d4] dark:text-purple-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors justify-center flex-shrink-0" title="Назад"><Icons.ChevronLeft className="w-5 h-5" /> <span className="text-sm">Назад</span></button>
                        <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.Code className="w-4 h-4" /></div>
                        <div className="min-w-0">
                            <p className="font-bold text-sm dark:text-white truncate">{block.title}</p>
                            <p className="text-xs text-gray-400 uppercase font-semibold">{block.language}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Полноэкранный режим — только для ПК (скрыт на телефоне классом hidden sm:flex) */}
                        <button onClick={() => setFullscreen(v => !v)} title={fullscreen ? 'Свернуть' : 'Развернуть на весь экран'} className="void-tap-target hidden sm:flex p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors items-center justify-center">
                            {fullscreen ? <Icons.Minimize className="w-5 h-5" /> : <Icons.Maximize className="w-5 h-5" />}
                        </button>
                        <button onClick={onClose} className="void-tap-target hidden sm:flex p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors items-center justify-center"><Icons.X /></button>
                    </div>
                </div>

                <div className="flex gap-2 px-4 sm:px-5 pt-3 flex-shrink-0">
                    <button onClick={() => setTab('code')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'code' ? 'bg-[#5b32d4] text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <Icons.Code className="w-4 h-4" /> Код
                    </button>
                    <button onClick={() => setTab('result')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'result' ? 'bg-[#5b32d4] text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <Icons.Eye className="w-4 h-4" /> Результат
                    </button>
                </div>

                <div className="flex-1 overflow-hidden mt-3">
                    {tab === 'code' && (
                        <div className="h-full flex flex-col">
                            <div className="flex justify-end px-4 sm:px-5 pb-2 flex-shrink-0">
                                <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                                    {copied ? 'Скопировано ✓' : 'Копировать'}
                                </button>
                            </div>
                            {/* void-selectable — разрешает выделение текста (в т.ч. долгим
                                нажатием на телефоне). touchAction: none — полностью берём
                                прокрутку под ручное управление (см. handleTouch* выше), чтобы
                                жёстко ограничить её строго вертикалью ИЛИ горизонталью. */}
                            <pre
                                ref={codeRef}
                                style={{ touchAction: 'none' }}
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                className="void-selectable flex-1 overflow-auto overscroll-contain mx-4 sm:mx-5 mb-4 sm:mb-5 p-4 bg-[#1a1a2e] rounded-2xl text-[13px] leading-relaxed text-gray-100 font-mono"
                            ><code>{block.content}</code></pre>
                        </div>
                    )}
                    {tab === 'result' && (
                        <div className="h-full px-4 sm:px-5 pb-4 sm:pb-5">
                            {preview ? (
                                <iframe ref={iframeRef} onLoad={handleIframeLoad} title="Результат" srcDoc={preview.html} sandbox="allow-scripts" className="w-full h-full rounded-2xl border border-gray-100 dark:border-darkBorder bg-white"></iframe>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-darkBorder">
                                    <Icons.Eye className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                    <p className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Живой предпросмотр недоступен для «{block.language}»</p>
                                    <p className="text-gray-400 dark:text-gray-600 text-xs mt-1">Предпросмотр работает для HTML, CSS и JavaScript</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
