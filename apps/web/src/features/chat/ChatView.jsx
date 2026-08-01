import { useState, useEffect, useRef } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { ChatToolbar } from '@/features/chat/ChatToolbar';
import { CodeViewerModal } from '@/features/chat/CodeViewerModal';
import { FeedbackModal } from '@/features/chat/FeedbackModal';
import { MessageRenderer } from '@/features/chat/MessageRenderer';
import { TypewriterMessage } from '@/features/chat/TypewriterMessage';
import { ThinkingIndicator } from '@/features/chat/ThinkingIndicator';
import { TopHeader } from '@/features/home/TopHeader';
import { buildShareLink, dialogToText } from '@/shared/lib/shareDialog';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { defaultReasoningFor } from '@/shared/config/models';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';


export function ChatView({ state, updateState, handleSendMessage, handleGenerateImage, messagesEndRef, chatFileInputRef }) {
    const lang = state.lang || 'ru';
    const activeChat = state.chatSessions.find(c => c.id === state.activeChatId) || state.chatSessions[0];
    const messages = activeChat?.messages || [];
    const [activeCodeBlock, setActiveCodeBlock] = useState(null);
    const [expandedTraceIdx, setExpandedTraceIdx] = useState(null);
    const currentReasoningLevel = (state.reasoningByModel || {})[state.selectedModelId] || defaultReasoningFor(state.selectedModelId);

    // Голосовой ввод (новый UX): запись с анимацией на всём поле,
    // «+» → «×» (отмена), микрофон → квадрат (стоп) → индикатор загрузки,
    // затем «Преобразование в текст» и распознанное дописывается к тексту.
    const voice = useVoiceRecorder((text) => {
        updateState({ inputValue: ((state.inputValue || '') + (state.inputValue ? ' ' : '') + text).trim() });
    }, state.voiceLang || 'ru-RU');

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
    const [showScrollDown, setShowScrollDown] = useState(false);
    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            autoScrollRef.current = nearBottom;
            setShowScrollDown(!nearBottom);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        // Пересчитываем и при изменении размеров контейнера (например, когда
        // подгружаются изображения) — иначе кнопка «вниз» может не появиться
        // вовремя, если пользователь застрял в середине переписки.
        const ro = new ResizeObserver(onScroll);
        ro.observe(el);
        onScroll();
        return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
    }, []);
    const followScroll = () => {
        const el = messagesContainerRef.current;
        if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
    };
    // Принудительная прокрутка вниз по клику на плавающую кнопку — всегда
    // должна работать, даже если пользователь до этого прокрутил очень
    // далеко вверх. Делаем несколько повторных попыток, потому что во время
    // «печати» ответа контент ещё растёт — одиночный scrollTo не догонит
    // конец, и низ длинного ответа оставался недостижимым (баг долистывания).
    const scrollToBottomNow = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        autoScrollRef.current = true;
        setShowScrollDown(false);
        let tries = 0;
        const jump = () => {
            el.scrollTop = el.scrollHeight;
            tries += 1;
            if (tries < 12) requestAnimationFrame(jump);
        };
        jump();
    };
    // Новое сообщение — снова начинаем следить за низом переписки
    useEffect(() => { autoScrollRef.current = true; followScroll(); setShowScrollDown(false); }, [messages.length]);

    // Переход из поиска по истории — прокручиваем к конкретному сообщению
    // и на секунду подсвечиваем его, затем сбрасываем метку перехода.
    const [highlightMsgIdx, setHighlightMsgIdx] = useState(null);
    useEffect(() => {
        if (state.scrollToMessageIdx == null || state.scrollToMessageChatId !== activeChat?.id) return;
        const idx = state.scrollToMessageIdx;
        const timer = setTimeout(() => {
            const el = document.getElementById(`msg-${idx}`);
            if (el) {
                autoScrollRef.current = false;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightMsgIdx(idx);
                setTimeout(() => setHighlightMsgIdx(null), 2000);
            }
            updateState({ scrollToMessageIdx: null, scrollToMessageChatId: null });
        }, 150);
        return () => clearTimeout(timer);
    }, [state.scrollToMessageIdx, state.scrollToMessageChatId, activeChat?.id]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-darkBg relative w-full max-w-full fade-in">
            <TopHeader state={state} updateState={updateState} />
            
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 pb-44 scroll-smooth">
                <div className="max-w-4xl mx-auto space-y-6">
                    {messages.length === 0 && (
                        <div className="text-center mt-20 fade-in">
                            <Icons.VoidLogo className="w-16 h-16 mx-auto mb-6 text-[#5b32d4] dark:text-purple-400 opacity-20" />
                            <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-600 mb-2">{t(lang, 'chat.startDialog')}</h2>
                            <p className="text-gray-400 dark:text-gray-600 text-sm">{t(lang, 'chat.sendMessage')}</p>
                        </div>
                    )}
                    
                    {messages.map((msg, idx) => (
                        <div key={idx} id={`msg-${idx}`} className={`flex gap-3 max-w-3xl transition-colors rounded-2xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''} ${highlightMsgIdx === idx ? 'void-search-highlight' : ''}`}>
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
                                        {msg.role === 'assistant' && msg.reasoningTrace && msg.reasoningTrace.length > 0 && (
                                            <div className="mb-2.5">
                                                <button
                                                    onClick={() => setExpandedTraceIdx(expandedTraceIdx === idx ? null : idx)}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-400 transition-colors"
                                                >
                                                    <Icons.Sparkles className="w-3.5 h-3.5" />
                                                    {lang === 'en' ? 'Reasoning' : lang === 'zh' ? '推理过程' : 'Ход рассуждений'}
                                                    <Icons.ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedTraceIdx === idx ? 'rotate-180' : ''}`} />
                                                </button>
                                                {expandedTraceIdx === idx && (
                                                    <div className="mt-2 space-y-1.5 pl-1 fade-in">
                                                        {msg.reasoningTrace.map((step, sIdx) => {
                                                            const StepIcon = Icons[step.icon] || Icons.Sparkles;
                                                            return (
                                                                <div key={sIdx} className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                                                    <StepIcon className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                                                                    <span>{step.text}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {msg.isAnimated ? <TypewriterMessage content={msg.content} onProgress={followScroll} onDone={() => markAnimationDone(idx)} /> : <MessageRenderer content={msg.content} />}
                                        {msg.codeBlocks && msg.codeBlocks.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {msg.codeBlocks.map((block, bIdx) => (
                                                    <button key={bIdx} onClick={() => setActiveCodeBlock({ block, siblings: msg.codeBlocks })} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder hover:border-[#5b32d4] transition-colors text-left shadow-sm">
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
                        <ThinkingIndicator lang={lang} level={currentReasoningLevel} />
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            {/* Плавающая кнопка «прокрутить вниз» — всегда доступна, если чат
                отскроллен от самого низа переписки (в т.ч. после ответа ИИ). */}
            {showScrollDown && (
                <button
                    onClick={scrollToBottomNow}
                    title={t(lang, 'chat.scrollToBottom')}
                    className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 w-10 h-10 rounded-full bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder shadow-lg flex items-center justify-center text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors fade-in"
                >
                    <Icons.ChevronDown className="w-5 h-5" />
                </button>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white dark:from-darkBg via-white dark:via-darkBg to-transparent pt-14 px-3 sm:px-4 md:px-8 z-20 pointer-events-none pb-safe">
                <div className="relative max-w-4xl mx-auto pointer-events-auto">
                    <div className="flex gap-2 mb-2.5">
                        <button onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.preventDefault()} onClick={() => updateState({imageGenMode: false})} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${!state.imageGenMode ? 'bg-[#5b32d4] text-white shadow-sm' : 'bg-white dark:bg-darkCard text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <Icons.MessageSquare className="w-3.5 h-3.5" /> {t(lang, 'chat.text')}
                        </button>
                        <button onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.preventDefault()} onClick={() => updateState({imageGenMode: true})} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${state.imageGenMode ? 'bg-[#5b32d4] text-white shadow-sm' : 'bg-white dark:bg-darkCard text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <Icons.Image className="w-3.5 h-3.5" /> {t(lang, 'chat.image')}
                        </button>
                    </div>
                    {state.selectedImage && (
                        <div className="absolute -top-16 left-4 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder fade-in group z-10">
                            <img src={state.selectedImage} className="h-14 w-14 object-cover rounded-lg" />
                            <button onClick={() => updateState({selectedImage: null})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X /></button>
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
                        {/* «+» слева: при записи переворачивается в «×» (отмена записи) */}
                        <button
                            onClick={() => voice.recording ? voice.cancel() : chatFileInputRef.current?.click()}
                            title={voice.recording ? t(lang, 'chat.cancelRecording') : undefined}
                            className={`void-tap-target absolute left-3 sm:left-4 bottom-2.5 sm:bottom-3 p-2.5 sm:p-2 transition-colors rounded-full flex items-center justify-center z-20 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800`}
                        >
                            <Icons.Plus className={`w-6 h-6 void-plus-rotate ${voice.recording ? 'void-plus-to-x' : ''}`} />
                        </button>
                        {/* Анимация записи — на всё поле ввода */}
                        {voice.recording && (
                            <div className="absolute inset-0 z-10 rounded-3xl bg-[#f3effd]/95 dark:bg-purple-900/40 backdrop-blur-sm flex items-center pl-16 pr-32 pointer-events-none fade-in">
                                <span className="flex items-end gap-[3px] w-full h-6 overflow-hidden">
                                    {Array.from({ length: 42 }).map((_, i) => (
                                        <span key={i} className="void-rec-bar bg-[#5b32d4] dark:bg-purple-300" style={{ animationDelay: `${(i % 7) * 110}ms` }} />
                                    ))}
                                </span>
                            </div>
                        )}
                        {/* Плейсхолдер фазы «Преобразование в текст» */}
                        {voice.transcribing && !state.inputValue && (
                            <div className="void-transcribe-hint absolute left-14 right-32 top-0 py-5 pointer-events-none text-[#5b32d4] dark:text-purple-300 text-[16px] font-semibold truncate z-10">
                                {t(lang, 'chat.transcribing')}…
                            </div>
                        )}
                        <textarea 
                            className={`w-full pl-14 pr-28 py-5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32 min-h-[64px] text-[16px] ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && state.inputValue ? 'opacity-40' : ''}`}
                            placeholder={voice.busy ? '' : (state.imageGenMode ? t(lang, 'chat.imagePlaceholder') : t(lang, 'home.inputPlaceholder'))}
                            readOnly={voice.busy}
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
                            <button
                                onClick={() => voice.recording ? voice.stop() : (!voice.transcribing && voice.start())}
                                title={voice.recording ? t(lang, 'chat.stopRecording') : t(lang, 'home.voiceInput')}
                                disabled={voice.transcribing}
                                className={`void-tap-target absolute right-[4.25rem] sm:right-[4.5rem] bottom-2.5 sm:bottom-3 w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition-all z-20 ${voice.recording ? 'bg-[#5b32d4] text-white voice-pulse-purple' : voice.transcribing ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300' : 'text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                                {voice.recording ? <Icons.Square className="w-5 h-5" /> : voice.transcribing ? <Icons.Spinner className="w-5 h-5" /> : <Icons.Mic className="w-5 h-5" />}
                            </button>
                        )}
                        <button onClick={() => state.imageGenMode ? handleGenerateImage() : handleSendMessage()} disabled={(!state.inputValue.trim() && !state.selectedImage) || state.isGenerating || voice.busy} className="void-tap-target absolute right-2.5 sm:right-3 bottom-2.5 sm:bottom-3 w-10 h-10 sm:w-11 sm:h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl flex items-center justify-center transition-all shadow-md z-20"><Icons.ArrowUp /></button>
                    </div>
                </div>
            </div>

            {activeCodeBlock && <CodeViewerModal block={activeCodeBlock.block} siblings={activeCodeBlock.siblings} onClose={() => setActiveCodeBlock(null)} />}
            {feedback && (
                <FeedbackModal type={feedback.type} onSubmit={submitFeedback} onClose={() => setFeedback(null)} />
            )}
            {shareToast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold shadow-xl fade-in">{shareToast}</div>
            )}
        </div>
    );
}
