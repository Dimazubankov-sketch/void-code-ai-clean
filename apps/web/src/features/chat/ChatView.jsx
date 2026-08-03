import { useState, useEffect, useRef } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { ChatToolbar } from '@/features/chat/ChatToolbar';
import { CodeViewerModal } from '@/features/chat/CodeViewerModal';
import { FeedbackModal } from '@/features/chat/FeedbackModal';
import { MessageRenderer } from '@/features/chat/MessageRenderer';
import { TypewriterMessage } from '@/features/chat/TypewriterMessage';
import { ThinkingIndicator } from '@/features/chat/ThinkingIndicator';
import { ImageGenLoader } from '@/features/chat/ImageGenLoader';
import { GeneratedImage } from '@/features/chat/GeneratedImage';
import { ChatPlusMenu } from '@/features/chat/ChatPlusMenu';
import { TopHeader } from '@/features/home/TopHeader';
import { buildShareLink, dialogToText } from '@/shared/lib/shareDialog';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { useOpenAiTts } from '@/shared/lib/useOpenAiTts';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { defaultReasoningFor } from '@/shared/config/models';
import { getPlanLimits } from '@/shared/config/models';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';


export function ChatView({ state, updateState, handleSendMessage, handleGenerateImage, messagesEndRef, chatFileInputRef }) {
    const lang = state.lang || 'ru';
    const activeChat = state.chatSessions.find(c => c.id === state.activeChatId) || state.chatSessions[0];
    const messages = activeChat?.messages || [];
    const [activeCodeBlock, setActiveCodeBlock] = useState(null);
    const [expandedTraceIdx, setExpandedTraceIdx] = useState(null);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const cameraInputRef = useRef(null);
    const currentReasoningLevel = (state.reasoningByModel || {})[state.selectedModelId] || defaultReasoningFor(state.selectedModelId);

    // Голосовой ввод (новый UX): запись с анимацией на всём поле,
    // «+» → «×» (отмена), микрофон → квадрат (стоп) → индикатор загрузки,
    // затем «Преобразование в текст» и распознанное дописывается к тексту.
    const voice = useVoiceRecorder((text) => {
        updateState({ inputValue: ((state.inputValue || '') + (state.inputValue ? ' ' : '') + text).trim() });
    }, state.voiceLang || 'ru-RU');

    // Озвучка, фидбэк, шеринг. Приоритетно — через бэкенд (OpenAI TTS-1)
    // с фолбэком на Web Speech при ошибке.
    const tts = useOpenAiTts();
    const [ttsMsgIdx, setTtsMsgIdx] = useState(null);       // индекс озвучиваемого сообщения
    const [feedback, setFeedback] = useState(null);          // { idx, type }
    const [feedbackMap, setFeedbackMap] = useState({});      // idx -> 'like'|'dislike'
    const [shareToast, setShareToast] = useState('');

    const voiceOpts = () => ({
        // OpenAI TTS: голос по имени (alloy/echo/fable/onyx/nova/shimmer),
        // скорость 0.25-4.0. Пресеты голосов теперь мапятся 1:1 на голоса OpenAI —
        // см. VoiceSettings.
        voice: state.voicePreset || 'nova',
        speed: state.voiceRate || 1.0,
        // Оставляем lang для Web Speech-фолбэка.
        lang: state.voiceLang || 'ru-RU',
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

    // Динамический нижний отступ контейнера сообщений = фактическая высота
    // плавающего инпут-бара + запас. Фиксированный pb-44 не спасал: реальная
    // высота бара меняется (превью картинки, многострочный ввод, режимы), и
    // низ длинного ответа мог прятаться под ним — отсюда баг «не долистать».
    const inputWrapRef = useRef(null);
    const [bottomPad, setBottomPad] = useState(120);
    useEffect(() => {
        const el = inputWrapRef.current;
        if (!el) return;
        const measure = () => setBottomPad(el.offsetHeight + 32);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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

    // Warning-баннер при 90%+ дневного лимита. Показывается над инпутом
    // до тех пор, пока пользователь не закроет его крестиком (тогда баннер
    // не появится снова до следующего сеанса — хранится в localStorage).
    const planLimits = getPlanLimits(state.userPlan);
    const dailyLimit = planLimits.daily;
    const dailyUsed = state.usedDailyLimits || 0;
    const dailyPercent = (dailyLimit === Infinity || dailyLimit === 'Infinity' || dailyLimit === 0)
        ? 0
        : Math.min(100, Math.round((dailyUsed / dailyLimit) * 100));
    const [warningDismissed, setWarningDismissed] = useState(() => {
        try { return localStorage.getItem('void_limit_warning_dismissed_at') === new Date().toISOString().slice(0, 10); } catch { return false; }
    });
    const showLimitWarning = dailyPercent >= 90 && dailyPercent < 100 && !warningDismissed;
    const dismissLimitWarning = () => {
        try { localStorage.setItem('void_limit_warning_dismissed_at', new Date().toISOString().slice(0, 10)); } catch {}
        setWarningDismissed(true);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-darkBg relative w-full max-w-full fade-in">
            <TopHeader state={state} updateState={updateState} />
            
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth" style={{ paddingBottom: bottomPad }}>
                <div className="max-w-4xl mx-auto space-y-6">
                    {messages.length === 0 && (
                        <div className="text-center mt-20 fade-in">
                            <Icons.VoidLogo className="w-16 h-16 mx-auto mb-6 text-[#5b32d4] dark:text-purple-400 opacity-20" />
                            <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-600 mb-2">{t(lang, 'chat.startDialog')}</h2>
                            <p className="text-gray-400 dark:text-gray-600 text-sm">{t(lang, 'chat.sendMessage')}</p>
                        </div>
                    )}
                    
                    {messages.map((msg, idx) => (
                        <div key={idx} id={`msg-${idx}`} className={`flex gap-3 max-w-4xl transition-colors rounded-2xl min-w-0 ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''} ${highlightMsgIdx === idx ? 'void-search-highlight' : ''}`}>
                            <div className={`p-4 md:p-5 rounded-3xl void-selectable min-w-0 max-w-full overflow-hidden break-words ${msg.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm shadow-sm' : 'bg-white dark:bg-darkBg text-gray-900 dark:text-gray-100 rounded-tl-sm'}`}>
                                {msg.image && <img src={msg.image} alt="Upload" className="max-w-full md:max-w-sm rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-800" />}
                                {msg.generatedImage ? (
                                    <div className="void-img-fadein">
                                        {/* Текст-описание сверху */}
                                        {msg.content && (
                                            <div className="mb-3">
                                                <MessageRenderer content={msg.content} />
                                            </div>
                                        )}
                                        {/* Крупный превью + иконка скачать в углу + long-press меню */}
                                        <GeneratedImage
                                            url={msg.generatedImage}
                                            prompt={msg.imagePrompt || msg.content}
                                            idx={idx}
                                        />
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
                        <ImageGenLoader lang={lang} />
                    )}
                    {state.isGenerating && !state.isGeneratingImage && (
                        <ThinkingIndicator lang={lang} level={currentReasoningLevel} />
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            {/* Плавающая кнопка «прокрутить вниз» — всегда доступна, если чат
                отскроллен от самого низа переписки (в т.ч. после ответа ИИ).
                Позиция считается от РЕАЛЬНОЙ высоты инпут-бара (bottomPad),
                поэтому при росте многострочного ввода стрелка плавно уходит
                выше и никогда не наезжает на поле. Прозрачность opacity-80 —
                чтобы кнопка не отвлекала, а на hover становилась контрастнее. */}
            {showScrollDown && (
                <button
                    onClick={scrollToBottomNow}
                    title={t(lang, 'chat.scrollToBottom')}
                    style={{ bottom: `${bottomPad + 8}px`, transition: 'bottom 180ms ease-out' }}
                    className="absolute left-1/2 -translate-x-1/2 z-30 w-10 h-10 rounded-full bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder shadow-lg flex items-center justify-center text-[#5b32d4] dark:text-purple-400 opacity-80 hover:opacity-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all fade-in"
                >
                    <Icons.ChevronDown className="w-5 h-5" />
                </button>
            )}

            <div ref={inputWrapRef} className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white dark:from-darkBg via-white dark:via-darkBg to-transparent pt-14 px-3 sm:px-4 md:px-8 z-20 pointer-events-none pb-safe">
                <div className="relative max-w-4xl mx-auto pointer-events-auto">
                    {/* Warning-баннер: показывается когда дневной лимит чата
                        превышает 90%. Пользователь может закрыть крестиком —
                        тогда баннер не появится до следующего дня (сброс по
                        календарной дате в localStorage). */}
                    {showLimitWarning && (
                        <div className="flex items-center gap-2.5 mb-2.5 px-3.5 py-2.5 rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 fade-in">
                            <Icons.Alert className="w-4 h-4 shrink-0 text-orange-500" />
                            <p className="flex-1 text-xs font-semibold text-orange-700 dark:text-orange-300 leading-tight">
                                Использовано {dailyPercent}% дневного лимита. Скоро запросы закончатся —
                                <button
                                    onClick={() => updateState({ currentView: 'pricing' })}
                                    className="ml-1 underline hover:no-underline"
                                >сменить тариф</button>.
                            </p>
                            <button
                                onClick={dismissLimitWarning}
                                className="w-5 h-5 shrink-0 rounded-full hover:bg-orange-200/50 dark:hover:bg-orange-800/50 flex items-center justify-center text-orange-600 dark:text-orange-400 transition-colors"
                                title="Скрыть до завтра"
                            >
                                <Icons.X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    {/* Активный режим: генерация изображения или работа через агента.
                        Показываем иконку + подпись + крестик для отключения. */}
                    {(state.imageGenMode || state.activeAgentId) && (
                        <div className="flex items-center gap-2 mb-2.5 fade-in">
                            {state.imageGenMode && (
                                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 text-xs font-bold">
                                    <Icons.Image className="w-3.5 h-3.5" /> Режим изображения
                                    <button onClick={() => updateState({ imageGenMode: false })} className="ml-0.5 w-4 h-4 rounded-full bg-white/60 dark:bg-black/20 hover:bg-white flex items-center justify-center"><Icons.X className="w-2.5 h-2.5" /></button>
                                </span>
                            )}
                            {state.activeAgentId && (() => {
                                const ag = (state.aiAgents || []).find(a => a.id === state.activeAgentId);
                                if (!ag) return null;
                                return (
                                    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-bold" style={{ background: (ag.color || '#5b32d4') + '22', color: ag.color || '#5b32d4' }}>
                                        <Icons.Robot className="w-3.5 h-3.5" /> {ag.name}
                                        <button onClick={() => updateState({ activeAgentId: null })} className="ml-0.5 w-4 h-4 rounded-full bg-white/60 dark:bg-black/20 hover:bg-white flex items-center justify-center"><Icons.X className="w-2.5 h-2.5" /></button>
                                    </span>
                                );
                            })()}
                        </div>
                    )}
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
                        <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                            if(e.target.files[0]) {
                                const r = new FileReader();
                                r.onloadend = () => updateState({selectedImage: r.result});
                                r.readAsDataURL(e.target.files[0]);
                            }
                        }} />
                        {/* «+» слева: при записи переворачивается в «×» (отмена записи),
                            иначе открывает меню действий (проект/изображение/агенты/…) */}
                        <button
                            onClick={() => voice.recording ? voice.cancel() : setShowPlusMenu(true)}
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
                            className={`w-full pl-14 pr-28 py-5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none overflow-y-auto max-h-[220px] min-h-[64px] text-[16px] void-input-scroll ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && state.inputValue ? 'opacity-40' : ''}`}
                            placeholder={voice.busy ? '' : (state.imageGenMode ? t(lang, 'chat.imagePlaceholder') : t(lang, 'home.inputPlaceholder'))}
                            readOnly={voice.busy}
                            value={state.inputValue}
                            onChange={(e) => {
                                updateState({inputValue: e.target.value});
                                // Плавно анимируем высоту через GSAP: считаем target
                                // с учётом max-h 220px, а gsap.to() создаёт мягкий
                                // переход вместо резкого прыжка на каждое нажатие.
                                const target = e.target;
                                const prev = parseFloat(target.style.height || '0') || target.offsetHeight;
                                target.style.height = 'auto';
                                const nextH = Math.min(target.scrollHeight, 220);
                                target.style.height = prev + 'px';
                                import('gsap').then(({ gsap }) => {
                                    gsap.to(target, { height: nextH, duration: 0.18, ease: 'power2.out', overwrite: true });
                                });
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
            {showPlusMenu && (
                <ChatPlusMenu
                    state={state}
                    updateState={updateState}
                    onClose={() => setShowPlusMenu(false)}
                    onPickCamera={() => cameraInputRef.current?.click()}
                    onPickPhoto={() => chatFileInputRef.current?.click()}
                    onPickFile={() => chatFileInputRef.current?.click()}
                    onEnableImage={() => updateState({ imageGenMode: true, activeAgentId: null })}
                    onPickAgent={(agent) => updateState({ activeAgentId: agent.id, imageGenMode: false })}
                />
            )}
            {feedback && (
                <FeedbackModal type={feedback.type} onSubmit={submitFeedback} onClose={() => setFeedback(null)} />
            )}
            {shareToast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold shadow-xl fade-in">{shareToast}</div>
            )}
        </div>
    );
}
