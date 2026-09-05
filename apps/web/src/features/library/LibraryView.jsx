import { useState } from 'react';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';
import { PressButton } from '@/shared/ui/PressButton';

// ==========================================
// БИБЛИОТЕКА (изображения, видео и документы/код)
// ==========================================
// Пункт 1 (жалоба: оплаченное видео нельзя было открыть): картинки и
// видео теперь в ОДНОЙ вкладке «Медиа» — раньше видео вообще не попадали
// в библиотеку, только в сетку внутри самого инструмента «Изображения»,
// и если пользователь уходил со страницы, найти готовый ролик было
// негде. Плюс полноэкранный просмотр с скачиванием и «поделиться
// ссылкой» — раньше у карточек была только маленькая кнопка скачивания
// поверх превью, увеличить или переслать ссылку было нельзя.
export function LibraryView({ state, updateState }) {
    const [tab, setTab] = useState('media');
    const [copiedId, setCopiedId] = useState(null);
    const [shareCopiedId, setShareCopiedId] = useState(null);
    const [viewerItem, setViewerItem] = useState(null);
    const images = state.generatedImages || [];
    const videos = state.generatedVideos || [];
    const documents = state.generatedDocuments || [];

    // Только реально готовые видео (у «генерируется…»/«ошибка» нет url,
    // открывать в библиотеке нечего).
    const media = [
        ...images.map(i => ({ ...i, kind: 'image' })),
        ...videos.filter(v => v.status === 'completed' && v.url).map(v => ({ ...v, kind: 'video' })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    const formatDate = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const openChat = (chatId) => {
        const exists = state.chatSessions.some(c => c.id === chatId);
        if (exists) updateState({ activeChatId: chatId, currentView: 'chat' });
        else updateState({ currentView: 'chat' });
    };

    const handleCopy = (doc) => {
        navigator.clipboard.writeText(doc.content).then(() => {
            setCopiedId(doc.id);
            setTimeout(() => setCopiedId(null), 1500);
        }).catch(() => {});
    };

    // «Поделиться ссылкой» — на телефоне открывает системный шаринг
    // (Web Share API), на десктопе (или если API недоступен) просто
    // копирует прямую ссылку в буфер обмена с коротким подтверждением.
    const handleShare = async (item) => {
        const shareData = { title: item.prompt || 'Void Code AI', url: item.url };
        if (navigator.share) {
            try { await navigator.share(shareData); return; } catch { /* пользователь отменил — не ошибка */ }
        }
        try {
            await navigator.clipboard.writeText(item.url);
            setShareCopiedId(item.id);
            setTimeout(() => setShareCopiedId(null), 1500);
        } catch { /* буфер обмена недоступен без HTTPS/разрешения — молча игнорируем */ }
    };

    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Библиотека</h2>
                </div>

                <div className="flex gap-2 mb-8 bg-gray-100 dark:bg-gray-800/60 p-1.5 rounded-2xl w-full md:w-fit">
                    <button onClick={() => setTab('media')} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm flex-1 md:flex-none transition-colors ${tab === 'media' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                        <Icons.Image className="w-4 h-4" /> Медиа <span className="text-xs opacity-60">({media.length})</span>
                    </button>
                    <button onClick={() => setTab('documents')} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm flex-1 md:flex-none transition-colors ${tab === 'documents' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                        <Icons.Library className="w-4 h-4" /> Документы <span className="text-xs opacity-60">({documents.length})</span>
                    </button>
                </div>

                {tab === 'media' && (
                    media.length === 0 ? (
                        <div className="text-center py-20 fade-in">
                            <Icons.Image className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                            <p className="text-gray-400 dark:text-gray-600 font-medium">Пока нет сгенерированных изображений и видео</p>
                            <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">Создайте первое во вкладке «Изображения»</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 fade-in">
                            {media.map(item => (
                                <div key={`${item.kind}-${item.id}`} className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden group">
                                    <div className="aspect-square overflow-hidden cursor-pointer relative" onClick={() => setViewerItem(item)}>
                                        {item.kind === 'image' ? (
                                            <img src={item.url} alt={item.prompt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                        ) : (
                                            <>
                                                <video src={item.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" muted />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                                    <div className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
                                                        <Icons.Play className="w-4 h-4 text-white" />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Icons.Maximize className="w-3 h-3 text-white" />
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 line-clamp-2 mb-1.5">{item.prompt}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-gray-400">{formatDate(item.timestamp)}</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); handleShare(item); }} className="p-1.5 rounded-lg text-gray-400 hover:text-[#5b32d4] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Поделиться ссылкой">
                                                    {shareCopiedId === item.id ? <Icons.Check className="w-3.5 h-3.5 text-green-500" /> : <Icons.Share className="w-3.5 h-3.5" />}
                                                </button>
                                                <a onClick={(e) => e.stopPropagation()} href={item.url} download={`void-${item.kind}-${item.id}.${item.kind === 'image' ? 'svg' : 'mp4'}`} className="p-1.5 rounded-lg text-[#5b32d4] dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Скачать"><Icons.Download className="w-3.5 h-3.5" /></a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {tab === 'documents' && (
                    documents.length === 0 ? (
                        <div className="text-center py-20 fade-in">
                            <Icons.Library className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                            <p className="text-gray-400 dark:text-gray-600 font-medium">Пока нет сохранённых документов</p>
                            <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">Код из ответов ассистента будет появляться здесь автоматически</p>
                        </div>
                    ) : (
                        <div className="space-y-3 fade-in">
                            {documents.map(doc => (
                                <div key={doc.id} className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm p-4 cursor-pointer" onClick={() => openChat(doc.chatId)}>
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="flex-shrink-0 text-[11px] font-bold uppercase px-2 py-0.5 rounded-md bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300">{doc.language}</span>
                                            <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">{doc.title}</span>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); handleCopy(doc); }} className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                                            {copiedId === doc.id ? 'Скопировано ✓' : 'Копировать'}
                                        </button>
                                    </div>
                                    <pre className="text-xs bg-gray-50 dark:bg-[#17141f] rounded-xl p-3 overflow-x-auto text-gray-600 dark:text-gray-400 max-h-24 overflow-y-hidden"><code>{doc.content.slice(0, 240)}{doc.content.length > 240 ? '...' : ''}</code></pre>
                                    <span className="text-[11px] text-gray-400 mt-2 block">{formatDate(doc.timestamp)}</span>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* Полноэкранный просмотр (пункт 1): открыть картинку/видео на
                весь экран, скачать, поделиться ссылкой — прямо отсюда, без
                необходимости искать чат, в котором это было сгенерировано. */}
            {viewerItem && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setViewerItem(null)}>
                    <PressButton
                        onClick={() => setViewerItem(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                        title="Закрыть"
                    >
                        <Icons.X className="w-5 h-5" />
                    </PressButton>
                    <div className="max-w-4xl max-h-[80vh] w-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
                        {viewerItem.kind === 'image' ? (
                            <img src={viewerItem.url} alt={viewerItem.prompt} className="max-w-full max-h-[70vh] rounded-xl object-contain" />
                        ) : (
                            <video src={viewerItem.url} controls autoPlay className="max-w-full max-h-[70vh] rounded-xl object-contain" />
                        )}
                        <div className="flex items-center gap-3">
                            <a
                                href={viewerItem.url}
                                download={`void-${viewerItem.kind}-${viewerItem.id}.${viewerItem.kind === 'image' ? 'svg' : 'mp4'}`}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors"
                            >
                                <Icons.Download className="w-4 h-4" /> Скачать
                            </a>
                            <PressButton
                                onClick={() => handleShare(viewerItem)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-colors border border-white/20"
                            >
                                {shareCopiedId === viewerItem.id ? <><Icons.Check className="w-4 h-4 text-green-400" /> Скопировано</> : <><Icons.Share className="w-4 h-4" /> Поделиться</>}
                            </PressButton>
                        </div>
                        <p className="text-white/70 text-sm text-center max-w-xl">{viewerItem.prompt}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
