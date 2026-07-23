import { useState, useEffect, useRef } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { ChatToolbar } from '@/features/chat/ChatToolbar';
import { CodeViewerModal } from '@/features/chat/CodeViewerModal';
import { FeedbackModal } from '@/features/chat/FeedbackModal';
import { MessageRenderer } from '@/features/chat/MessageRenderer';
import { TypewriterMessage } from '@/features/chat/TypewriterMessage';
import { TopHeader } from '@/features/home/TopHeader';
import { buildShareLink, dialogToText } from '@/shared/lib/shareDialog';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { useVoiceInput } from '@/shared/lib/useVoiceInput';
import { Icons } from '@/shared/ui/Icons';


export function ChatView({ state, updateState, handleSendMessage, handleGenerateImage, messagesEndRef, chatFileInputRef }) {
    const activeChat = state.chatSessions.find(c => c.id === state.activeChatId) || state.chatSessions[0];
    const messages = activeChat?.messages || [];
    const [activeCodeBlock, setActiveCodeBlock] = useState(null);

    // Голосовой ввод: распознанный текст подставляется в поле ввода
    const voice = useVoiceInput((text) => {
        updateState({ inputValue: ((state.inputValue || '') + (state.inputValue ? ' ' : '') + text).trim() });
    });

    // Озвучка, фидбэк, шеринг
    const tts = useTextToSpeech();
    const [ttsMsgIdx, setTtsMsgIdx] = useState(null);       // индекс озвучиваемого сообщения
    const [feedback, setFeedback] = useState(null);          // { idx, type }
    const [feedbackMap, setFeedbackMap] = useState({});      // idx -> 'like'|'dislike'
    const [shareToast, setShareToast] = useState('');

    const voiceOpts = () => ({
        lang: state.voiceLang || 'ru-RU',
        voiceURI: state.voiceURI || null,
        rate: state.voiceRate || 1,
        pitch: state.voicePitch || 1,
    });

    const speakMessage = (idx, text) => {
        if (ttsMsgIdx === idx && tts.speaking) { tts.stop(); setTtsMsgIdx(null); return; }
        tts.stop();
        setTtsMsgIdx(idx);
        tts.speak(text, voiceOpts());
    };
    const closePlayer = () => { tts.stop(); setTtsMsgIdx(null); };

    const shareDialog = async () => {
        const chat = state.chatSessions.find(c => c.id === state.activeChatId) || state.chatSessions[0];
        const { url, tooLong } = buildShareLink(chat);
        try {
            if (!tooLong && navigator.share) { await navigator.share({ title: chat.title, url }); return; }
            if (!tooLong) { await navigator.clipboard.writeText(url); setShareToast('Ссылка на диалог скопирована'); }
            else { await navigator.clipboard.writeText(dialogToText(chat)); setShareToast('Диалог длинный — скопирован текстом'); }
        } catch {
            await navigator.clipboard.writeText(tooLong ? dialogToText(chat) : url);
            setShareToast('Скопировано');
        }
        setTimeout(() => setShareToast(''), 2200);
    };

    const submitFeedback = ({ type }) => {
        if (feedback) setFeedbackMap(m => ({ ...m, [feedback.idx]: type }));
    };

    // Как только печать ответа завершилась — снимаем флаг isAnimated, чтобы под
    // сообщением появилась панель действий (копировать/поделиться/оценка/озвучка)
    const markAnimationDone = (idx) => {
        updateState({
            chatSessions: state.chatSessions.map(c => {
                if (c.id !== (activeChat?.id)) return c;
                return { ...c, messages: c.messages.map((m, i) => i === idx ? { ...m, isAnimated: false } : m) };
            }),
        });
    };

    // "Умный" автоскролл: пока идёт печать ответа, чат сам едет вниз вслед
    // за текстом — но как только пользователь прокрутил сам (например,
    // чтобы перечитать что-то выше), автоследование останавливается и не
    // мешает, пока пользователь сам не вернётся к низу переписки.
    const messagesContainerRef = useRef(null);
    const autoScrollRef = useRef(true);
    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);
    const followScroll = () => {
        const el = messagesContainerRef.current;
        if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
    };
    // Новое сообщение — снова начинаем следить за низом переписки
    useEffect(() => { autoScrollRef.current = true; followScroll(); }, [messages.length]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-darkBg relative w-full max-w-full fade-in">
            <TopHeader state={state} updateState={updateState} />
            
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 scroll-smooth">
                <div className="max-w-4xl mx-auto space-y-6">
                    {messages.length === 0 && (
                        <div className="text-center mt-20 fade-in">
                            <Icons.VoidLogo className="w-16 h-16 mx-auto mb-6 text-[#5b32d4] dark:text-purple-400 opacity-20" />
                            <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-600 mb-2">Начните диалог</h2>
                            <p className="text-gray-400 dark:text-gray-600 text-sm">Отправьте сообщение</p>
                        </div>
                    )}
                    
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
                            <div className={`p-4 md:p-5 rounded-3xl void-selectable ${msg.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm shadow-sm' : 'bg-white dark:bg-darkBg text-gray-900 dark:text-gray-100 rounded-tl-sm'}`}>
                                {msg.image && <img src={msg.image} alt="Upload" className="max-w-full md:max-w-sm rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-800" />}
                                {msg.generatedImage ? (
                                    <div className="void-img-fadein">
                                        {/* Текст — сверху, изображение — снизу */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <MessageRenderer content={msg.content} />
                                            <a href={msg.generatedImage} download={`void-code-ai-image-${idx}.svg`} className="flex-shrink-0 p-2 rounded-xl bg-gray-50 dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-[#5b32d4] dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Скачать изображение">
                                                <Icons.Download className="w-4 h-4" />
                                            </a>
                                        </div>
                                        <img src={msg.generatedImage} alt="Сгенерированное изображение" className="w-full max-w-[240px] rounded-2xl shadow-sm" />
                                    </div>
                                ) : (
                                    <>
                                        {msg.isAnimated ? <TypewriterMessage content={msg.content} onProgress={followScroll} onDone={() => markAnimationDone(idx)} /> : <MessageRenderer content={msg.content} />}
                                        {msg.codeBlocks && msg.codeBlocks.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {msg.codeBlocks.map((block, bIdx) => (
                                                    <button key={bIdx} onClick={() => setActiveCodeBlock(block)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder hover:border-[#5b32d4] transition-colors text-left shadow-sm">
                                                        <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.Code className="w-4 h-4" /></div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-sm dark:text-white truncate">{block.title}</p>
                                                            <p className="text-xs text-gray-400 uppercase font-semibold">{block.language} · открыть окно просмотра</p>
                                                        </div>
                                                        <Icons.ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                {/* Панель действий под ответом ИИ (копировать/поделиться/оценка/озвучка) */}
                                {msg.role === 'assistant' && !msg.isAnimated && !msg.generatedImage && msg.content && (
                                    <>
                                        <ChatToolbar
                                            text={msg.content}
                                            onShare={shareDialog}
                                            onFeedback={(type) => setFeedback({ idx, type })}
                                            onSpeak={() => speakMessage(idx, msg.content)}
                                            speaking={ttsMsgIdx === idx && tts.speaking}
                                            feedbackValue={feedbackMap[idx]}
                                        />
                                        {ttsMsgIdx === idx && tts.supported && (
                                            <AudioPlayer tts={tts} onClose={closePlayer} />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    {state.isGenerating && state.isGeneratingImage && (
                        <div className="flex gap-3 max-w-3xl fade-in">
                            <div className="bg-white dark:bg-darkBg p-4 rounded-3xl rounded-tl-sm">
                                <div className="flex items-center gap-1.5 mb-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 void-imggen-dot" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 void-imggen-dot" style={{ animationDelay: '0.2s' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 void-imggen-dot" style={{ animationDelay: '0.4s' }} />
                                    <span className="text-xs font-bold text-[#5b32d4] dark:text-purple-300 ml-1">Создаю изображение</span>
                                </div>
                                <div className="relative w-32 h-32 rounded-2xl overflow-hidden void-imggen-canvas flex items-center justify-center">
                                    <div className="void-imggen-sweep absolute inset-0" />
                                    <Icons.VoidLogo className="w-9 h-9 text-[#5b32d4] dark:text-purple-300 void-imggen-logo relative z-10" />
                                </div>
                            </div>
                        </div>
                    )}
                    {state.isGenerating && !state.isGeneratingImage && (
                        <div className="flex gap-3 max-w-3xl">
                            <div className="bg-white dark:bg-darkBg p-5 rounded-3xl rounded-tl-sm flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-[#5b32d4]/50 dark:bg-purple-400/50 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-[#5b32d4]/50 dark:bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                <div className="w-2 h-2 bg-[#5b32d4]/50 dark:bg-purple-400/50 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white dark:from-darkBg via-white dark:via-darkBg to-transparent pt-14 px-3 sm:px-4 md:px-8 z-20 pointer-events-none pb-safe">
                <div className="relative max-w-4xl mx-auto pointer-events-auto">
                    <div className="flex gap-2 mb-2.5">
                        <button onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.preventDefault()} onClick={() => updateState({imageGenMode: false})} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${!state.imageGenMode ? 'bg-[#5b32d4] text-white shadow-sm' : 'bg-white dark:bg-darkCard text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <Icons.MessageSquare className="w-3.5 h-3.5" /> Текст
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.preventDefault()} onClick={() => updateState({imageGenMode: true})} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${state.imageGenMode ? 'bg-[#5b32d4] text-white shadow-sm' : 'bg-white dark:bg-darkCard text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <Icons.Image className="w-3.5 h-3.5" /> Изображение
                        </button>
                    </div>
                    {state.selectedImage && (
                        <div className="absolute -top-16 left-4 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder fade-in group z-10">
                            <img src={state.selectedImage} className="h-14 w-14 object-cover rounded-lg" />
                            <button onClick={() => updateState({selectedImage: null})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X /></button>
                        </div>
                    )}
                    {/* Индикация записи — отдельной строкой НАД полем ввода */}
                    {voice.listening && (
                        <div className="flex items-center gap-2.5 mb-2 px-4 py-2 rounded-2xl bg-[#f3effd] dark:bg-purple-900/20 border border-[#e2d9fa] dark:border-purple-900/40 fade-in">
                            <span className="flex items-end gap-0.5 h-4 shrink-0">
                                <span className="voice-bar w-1 rounded-full bg-[#5b32d4]" style={{ animationDelay: '0ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '150ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#9d16e0]" style={{ animationDelay: '300ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '450ms' }} />
                            </span>
                            <span className="truncate text-sm text-gray-600 dark:text-gray-300">{voice.interim || 'Слушаю…'}</span>
                        </div>
                    )}
                    <div className={`flex items-end bg-white dark:bg-darkCard rounded-3xl border shadow-2xl focus-within:ring-4 transition-all relative ${state.imageGenMode ? 'border-[#5b32d4]/40 focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4]' : 'border-gray-200 dark:border-darkBorder focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4]'}`}>
                        <input type="file" ref={chatFileInputRef} onChange={(e) => {
                            if(e.target.files[0]) {
                                const r = new FileReader();
                                r.onloadend = () => updateState({selectedImage: r.result});
                                r.readAsDataURL(e.target.files[0]);
                            }
                        }} accept="image/*" className="hidden" />
                        <button onClick={() => chatFileInputRef.current?.click()} className="void-tap-target absolute left-3 sm:left-4 bottom-2.5 sm:bottom-3 p-2.5 sm:p-2 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-full flex items-center justify-center">
                            <Icons.Plus className="w-6 h-6" />
                        </button>
                        <textarea 
                            className="w-full pl-14 pr-28 py-5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32 min-h-[64px] text-[16px]"
                            placeholder={state.imageGenMode ? "Опишите изображение, которое хотите создать..." : "Написать запрос..."}
                            value={state.inputValue}
                            onChange={(e) => { 
                                updateState({inputValue: e.target.value}); 
                                e.target.style.height = 'auto'; 
                                e.target.style.height = (e.target.scrollHeight < 128 ? e.target.scrollHeight : 128) + 'px'; 
                            }}
                            onKeyDown={(e) => { 
                                if (e.key === 'Enter' && !e.shiftKey) { 
                                    e.preventDefault(); 
                                    state.imageGenMode ? handleGenerateImage() : handleSendMessage(); 
                                    e.target.style.height = 'auto'; 
                                } 
                            }}
                            onFocus={(e) => {
                                // На телефоне клавиатура может перекрыть поле ввода — после
                                // её открытия (с небольшой задержкой на анимацию) подскролливаем
                                // и само поле, и чат, чтобы переписка не пряталась за клавиатурой.
                                setTimeout(() => {
                                    e.target.scrollIntoView({ behavior: 'smooth', block: 'end' });
                                    followScroll();
                                }, 300);
                            }}
                            rows={1}
                        />
                        {voice.supported && (
                            <button onClick={voice.toggle} title="Голосовой ввод" className={`void-tap-target absolute right-[4.25rem] sm:right-[4.5rem] top-2.5 sm:top-3 bottom-2.5 sm:bottom-3 aspect-square rounded-2xl flex items-center justify-center transition-all ${voice.listening ? 'bg-[#5b32d4] text-white voice-pulse-purple' : 'text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}><Icons.Mic className="w-5 h-5" /></button>
                        )}
                        <button onClick={() => state.imageGenMode ? handleGenerateImage() : handleSendMessage()} disabled={(!state.inputValue.trim() && !state.selectedImage) || state.isGenerating} className="void-tap-target absolute right-2.5 sm:right-3 top-2.5 sm:top-3 bottom-2.5 sm:bottom-3 aspect-square bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl flex items-center justify-center transition-all shadow-md"><Icons.ArrowUp /></button>
                    </div>
                </div>
            </div>

            {activeCodeBlock && <CodeViewerModal block={activeCodeBlock} onClose={() => setActiveCodeBlock(null)} />}
            {feedback && (
                <FeedbackModal type={feedback.type} onSubmit={submitFeedback} onClose={() => setFeedback(null)} />
            )}
            {shareToast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold shadow-xl fade-in">{shareToast}</div>
            )}
        </div>
    );
}
