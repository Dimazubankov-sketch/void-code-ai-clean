import { useState, useRef } from 'react';
import { buildCodePreviewDoc } from '@/shared/lib/documents';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// ОКНО ПРОСМОТРА КОДА (Код / Результат / Тесты)
// ==========================================
// Открывается из карточки в чате вместо того, чтобы печатать код прямо
// в переписку — так диалог остаётся читаемым, а с кодом удобно работать
// отдельно: смотреть исходник, живой результат или (в будущем) тесты.
export function CodeViewerModal({ block, onClose }) {
    const [tab, setTab] = useState('code');
    const [copied, setCopied] = useState(false);
    const preview = buildCodePreviewDoc(block.content, block.language);
    const iframeRef = useRef(null);

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

    const handleCopy = () => {
        navigator.clipboard.writeText(block.content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4 fade-in">
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-3xl h-[88vh] sm:h-[80vh] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl border border-gray-100 dark:border-darkBorder flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-darkBorder flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.Code className="w-4 h-4" /></div>
                        <div className="min-w-0">
                            <p className="font-bold text-sm dark:text-white truncate">{block.title}</p>
                            <p className="text-xs text-gray-400 uppercase font-semibold">{block.language}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="void-tap-target p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center flex-shrink-0"><Icons.X /></button>
                </div>

                <div className="flex gap-2 px-4 sm:px-5 pt-3 flex-shrink-0">
                    <button onClick={() => setTab('code')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'code' ? 'bg-[#5b32d4] text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <Icons.Code className="w-4 h-4" /> Код
                    </button>
                    <button onClick={() => setTab('result')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'result' ? 'bg-[#5b32d4] text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <Icons.Eye className="w-4 h-4" /> Результат
                    </button>
                    <button onClick={() => setTab('tests')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'tests' ? 'bg-[#5b32d4] text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        <Icons.Flask className="w-4 h-4" /> Тесты
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
                            <pre className="flex-1 overflow-auto mx-4 sm:mx-5 mb-4 sm:mb-5 p-4 bg-[#1a1a2e] rounded-2xl text-[13px] leading-relaxed text-gray-100 font-mono"><code>{block.content}</code></pre>
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
                    {tab === 'tests' && (
                        <div className="h-full px-4 sm:px-5 pb-4 sm:pb-5">
                            <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                                <Icons.Flask className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                <p className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Раздел тестов в разработке</p>
                                <p className="text-gray-400 dark:text-gray-600 text-xs mt-1 max-w-xs">Здесь появятся автоматические проверки для сгенерированного кода — заготовка уже готова к подключению</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
