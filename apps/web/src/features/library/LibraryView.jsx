import { useState, useRef } from 'react';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';
import { PressButton } from '@/shared/ui/PressButton';
import { AnchoredMenu } from '@/shared/ui/AnchoredMenu';

// ==========================================
// БИБЛИОТЕКА (переработка #7 — как в ChatGPT / Файлах iOS)
// ==========================================
// Табы «Все / Изображения / Документы», переключатель вида «Сетка / Список»
// в «...»-меню (по умолчанию — сетка), поиск снизу. Медиа открываются в
// полноэкранном просмотре, документы — в чате, где были созданы.
export function LibraryView({ state, updateState }) {
    const [tab, setTab] = useState('all');       // all | images | documents
    const [view, setView] = useState('grid');    // grid | list (по умолчанию сетка)
    const [query, setQuery] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [shareCopiedId, setShareCopiedId] = useState(null);
    const [viewerItem, setViewerItem] = useState(null);
    const menuAnchorRef = useRef(null);

    const images = (state.generatedImages || []).map(i => ({ ...i, kind: 'image' }));
    const videos = (state.generatedVideos || []).filter(v => v.status === 'completed' && v.url).map(v => ({ ...v, kind: 'video' }));
    const documents = (state.generatedDocuments || []).map(d => ({ ...d, kind: 'document' }));
    const media = [...images, ...videos];

    // Что показываем по текущему табу.
    let list = tab === 'images' ? media : tab === 'documents' ? documents : [...media, ...documents];
    list = list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    // Поиск по названию/промпту/содержимому.
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(it => `${it.prompt || ''} ${it.title || ''} ${it.content || ''}`.toLowerCase().includes(q));

    const mediaExt = (item) => {
        if (item.kind === 'video') return 'mp4';
        const m = /\.(png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.exec(item.url || '');
        return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
    };
    const relTime = (ts) => {
        if (!ts) return '';
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'только что';
        if (m < 60) return `${m} мин назад`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} ч назад`;
        const d = Math.floor(h / 24);
        return `${d} дн назад`;
    };
    const itemTitle = (it) => it.kind === 'document' ? (it.title || 'Документ') : (it.prompt || (it.kind === 'video' ? 'Видео' : 'Изображение'));

    const openItem = (it) => {
        if (it.kind === 'document') {
            const exists = state.chatSessions.some(c => c.id === it.chatId);
            updateState({ currentView: 'chat', ...(exists ? { activeChatId: it.chatId } : {}) });
        } else {
            setViewerItem(it);
        }
    };

    const handleCopy = (doc) => {
        navigator.clipboard.writeText(doc.content).then(() => {
            setCopiedId(doc.id);
            setTimeout(() => setCopiedId(null), 1500);
        }).catch(() => {});
    };
    const handleShare = async (item) => {
        if (navigator.share) {
            try { await navigator.share({ title: item.prompt || 'Void Code AI', url: item.url }); return; } catch { /* отменено */ }
        }
        try {
            await navigator.clipboard.writeText(item.url);
            setShareCopiedId(item.id);
            setTimeout(() => setShareCopiedId(null), 1500);
        } catch { /* нет доступа к буферу */ }
    };

    // Квадратная превьюшка медиа (для сетки и списка).
    const Thumb = ({ it, className = '' }) => (
        it.kind === 'image' ? (
            <img src={it.url} alt={itemTitle(it)} className={`object-cover ${className}`} />
        ) : it.kind === 'video' ? (
            <div className={`relative ${className}`}>
                <video src={`${it.url}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"><Icons.Play className="w-3.5 h-3.5 text-white" /></div>
                </div>
            </div>
        ) : (
            <div className={`flex items-center justify-center bg-[#efecf9] dark:bg-purple-900/20 ${className}`}>
                <Icons.Code className="w-6 h-6 text-[#5b32d4] dark:text-purple-300" />
            </div>
        )
    );

    const TABS = [{ id: 'all', label: 'Все' }, { id: 'images', label: 'Изображения' }, { id: 'documents', label: 'Документы' }];

    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            {/* Шапка: назад / заголовок по центру / «...»-меню */}
            <div className="shrink-0 h-16 grid grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-4 md:px-8">
                <button onClick={() => goBack(state, updateState, 'home')} className="justify-self-start w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200"><Icons.ChevronLeft /></button>
                <h2 className="justify-self-center text-lg font-extrabold dark:text-white">Библиотека</h2>
                <div className="justify-self-end" ref={menuAnchorRef}>
                    <PressButton onClick={() => setShowMenu(v => !v)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200" title="Вид">
                        <Icons.Dots className="w-5 h-5" />
                    </PressButton>
                </div>
                <AnchoredMenu open={showMenu} onClose={() => setShowMenu(false)} anchorRef={menuAnchorRef} width={200}>
                    <PressButton onClick={() => { setView('grid'); setShowMenu(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${view === 'grid' ? 'text-[#5b32d4] dark:text-purple-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <Icons.LayoutDashboard className="w-4 h-4" /> Сетка {view === 'grid' && <Icons.Check className="w-4 h-4 ml-auto text-[#5b32d4] dark:text-purple-300" />}
                    </PressButton>
                    <PressButton onClick={() => { setView('list'); setShowMenu(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${view === 'list' ? 'text-[#5b32d4] dark:text-purple-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <Icons.Dots className="w-4 h-4 rotate-90" /> Список {view === 'list' && <Icons.Check className="w-4 h-4 ml-auto text-[#5b32d4] dark:text-purple-300" />}
                    </PressButton>
                </AnchoredMenu>
            </div>

            {/* Табы */}
            <div className="shrink-0 px-3 sm:px-4 md:px-8 pb-3">
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-2xl w-full sm:w-fit">
                    {TABS.map(tb => (
                        <button key={tb.id} onClick={() => setTab(tb.id)} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === tb.id ? 'bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                            {tb.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Контент */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-8 pb-4">
                {list.length === 0 ? (
                    <div className="text-center py-20 fade-in">
                        <Icons.Library className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                        <p className="text-gray-400 dark:text-gray-600 font-medium">{q ? 'Ничего не найдено' : 'Здесь пока пусто'}</p>
                        {!q && <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">Создайте изображение или видео во вкладке «Изображения»</p>}
                    </div>
                ) : view === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 fade-in">
                        {list.map(it => (
                            <button key={`${it.kind}-${it.id}`} onClick={() => openItem(it)} className="group text-left">
                                <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder">
                                    <Thumb it={it} className="w-full h-full group-hover:scale-105 transition-transform duration-300" />
                                </div>
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate mt-1.5">{itemTitle(it)}</p>
                                <p className="text-[11px] text-gray-400">Изменено {relTime(it.timestamp)}</p>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-0.5 fade-in">
                        {list.map(it => (
                            <div key={`${it.kind}-${it.id}`} className="group flex items-center gap-3 p-2 rounded-2xl hover:bg-white dark:hover:bg-darkCard transition-colors cursor-pointer" onClick={() => openItem(it)}>
                                <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder">
                                    <Thumb it={it} className="w-full h-full" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">{itemTitle(it)}</p>
                                    <p className="text-xs text-gray-400">Изменено {relTime(it.timestamp)}</p>
                                </div>
                                {it.kind === 'document' ? (
                                    <button onClick={(e) => { e.stopPropagation(); handleCopy(it); }} className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                                        {copiedId === it.id ? 'Скопировано ✓' : 'Копировать'}
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); handleShare(it); }} className="p-1.5 rounded-lg text-gray-400 hover:text-[#5b32d4] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Поделиться">
                                            {shareCopiedId === it.id ? <Icons.Check className="w-4 h-4 text-green-500" /> : <Icons.Share className="w-4 h-4" />}
                                        </button>
                                        <a onClick={(e) => e.stopPropagation()} href={it.url} download={`void-${it.kind}-${it.id}.${mediaExt(it)}`} className="p-1.5 rounded-lg text-[#5b32d4] dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Скачать"><Icons.Download className="w-4 h-4" /></a>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Поиск снизу */}
            <div className="shrink-0 px-3 sm:px-4 md:px-8 pb-4 pt-1">
                <div className="max-w-2xl mx-auto flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-4 h-11 rounded-full bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder">
                        <Icons.Search className="w-4 h-4 text-gray-400 shrink-0" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск в библиотеке" className="flex-1 bg-transparent outline-none text-sm dark:text-white placeholder-gray-400" />
                    </div>
                    <PressButton onClick={() => updateState({ currentView: 'images' })} title="Создать" className="w-11 h-11 shrink-0 rounded-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white flex items-center justify-center shadow-md transition-colors">
                        <Icons.Plus className="w-[18px] h-[18px]" />
                    </PressButton>
                </div>
            </div>

            {/* Полноэкранный просмотр медиа */}
            {viewerItem && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setViewerItem(null)}>
                    <PressButton onClick={() => setViewerItem(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" title="Закрыть"><Icons.X className="w-5 h-5" /></PressButton>
                    <div className="max-w-4xl max-h-[80vh] w-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
                        {viewerItem.kind === 'image' ? (
                            <img src={viewerItem.url} alt={viewerItem.prompt} className="max-w-full max-h-[70vh] rounded-xl object-contain" />
                        ) : (
                            <video src={viewerItem.url} controls autoPlay playsInline className="max-w-full max-h-[78vh] w-auto h-auto rounded-xl object-contain bg-black" />
                        )}
                        <div className="flex items-center gap-3">
                            <a href={viewerItem.url} download={`void-${viewerItem.kind}-${viewerItem.id}.${mediaExt(viewerItem)}`} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors">
                                <Icons.Download className="w-4 h-4" /> Скачать
                            </a>
                            <PressButton onClick={() => handleShare(viewerItem)} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-colors border border-white/20">
                                {shareCopiedId === viewerItem.id ? <><Icons.Check className="w-4 h-4 text-green-400" /> Скопировано</> : <><Icons.Share className="w-4 h-4" /> Поделиться</>}
                            </PressButton>
                        </div>
                        {viewerItem.prompt && <p className="text-white/70 text-sm text-center max-w-xl">{viewerItem.prompt}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
