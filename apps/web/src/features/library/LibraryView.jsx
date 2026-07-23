import { useState } from 'react';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// БИБЛИОТЕКА (сгенерированные изображения и документы/код)
// ==========================================
export function LibraryView({ state, updateState }) {
    const [tab, setTab] = useState('images');
    const [copiedId, setCopiedId] = useState(null);
    const images = state.generatedImages || [];
    const documents = state.generatedDocuments || [];

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

    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Библиотека</h2>
                </div>

                <div className="flex gap-2 mb-8 bg-gray-100 dark:bg-gray-800/60 p-1.5 rounded-2xl w-full md:w-fit">
                    <button onClick={() => setTab('images')} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm flex-1 md:flex-none transition-colors ${tab === 'images' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                        <Icons.Image className="w-4 h-4" /> Изображения <span className="text-xs opacity-60">({images.length})</span>
                    </button>
                    <button onClick={() => setTab('documents')} className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm flex-1 md:flex-none transition-colors ${tab === 'documents' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                        <Icons.Library className="w-4 h-4" /> Документы <span className="text-xs opacity-60">({documents.length})</span>
                    </button>
                </div>

                {tab === 'images' && (
                    images.length === 0 ? (
                        <div className="text-center py-20 fade-in">
                            <Icons.Image className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                            <p className="text-gray-400 dark:text-gray-600 font-medium">Пока нет сгенерированных изображений</p>
                            <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">Создайте первое во вкладке «Изображение» в чате</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 fade-in">
                            {images.map(img => (
                                <div key={img.id} className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm overflow-hidden group">
                                    <div className="aspect-square overflow-hidden cursor-pointer" onClick={() => openChat(img.chatId)}>
                                        <img src={img.url} alt={img.prompt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    </div>
                                    <div className="p-3">
                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 line-clamp-2 mb-1.5">{img.prompt}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-gray-400">{formatDate(img.timestamp)}</span>
                                            <a href={img.url} download={`void-image-${img.id}.svg`} className="p-1.5 rounded-lg text-[#5b32d4] dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Скачать"><Icons.Download className="w-3.5 h-3.5" /></a>
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
        </div>
    );
}
