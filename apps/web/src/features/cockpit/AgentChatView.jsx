import { useState, useRef, useEffect } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { ChatInputBar } from '@/features/chat/ChatInputBar';
import { ThinkingIndicator } from '@/features/chat/ThinkingIndicator';
import { TypewriterMessage } from '@/features/chat/TypewriterMessage';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AgentChatView — чат с обычным агентом
// ==========================================
// Открывается поверх Cockpit. Полноценный чат: шапка с агентом, история
// сообщений, единый инпут-бар (тот же ChatInputBar, что и в основном чате).
// Агент работает строго по промту — все «профессии» и пресеты убраны.

export function AgentChatView({ state, updateState }) {
    const agent = (state.aiAgents || []).find((a) => a.id === state.activeAgentId && a.kind !== 'orchestrator');
    const [input, setInput] = useState('');
    const [image, setImage] = useState(null);
    const [thinking, setThinking] = useState(false);
    const endRef = useRef(null);

    // Возврат в Cockpit без засорения истории: снимаем со стека запись
    // 'cockpit', которую добавили при открытии чата, чтобы кнопка «Назад»
    // в Cockpit вела в Хаб, а не обратно в этот чат.
    const close = () => {
        const hist = state.viewHistory || [];
        const trimmed = hist[hist.length - 1] === 'cockpit' ? hist.slice(0, -1) : hist;
        updateState({ currentView: 'cockpit', activeAgentId: null, viewHistory: trimmed });
    };

    const threads = state.agentThreads || {};
    const thread = agent ? (threads[agent.id] || []) : [];

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length, thinking]);

    // Озвучка ответов агента
    const tts = useTextToSpeech();
    const [ttsMsgId, setTtsMsgId] = useState(null);
    const speakMsg = (m) => {
        if (ttsMsgId === m.id && tts.speaking) { tts.stop(); setTtsMsgId(null); return; }
        tts.stop(); setTtsMsgId(m.id);
        tts.speak(m.text, { lang: state.voiceLang || 'ru-RU', voiceURI: state.voiceURI || null, rate: state.voiceRate || 1, pitch: state.voicePitch || 1 });
    };

    if (!agent) {
        return (
            <div className="fixed inset-x-0 top-0 h-app-screen z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={close}>
                <button onClick={close} className="text-white font-bold">← В Cockpit</button>
            </div>
        );
    }

    const color = agent.color || '#5b32d4';

    const send = () => {
        const text = input.trim();
        if (!text && !image) return;
        const now = Date.now();
        // Сначала показываем сообщение пользователя, включаем индикатор
        // размышления, и только после короткой «паузы на подумать» выдаём
        // ответ агента с анимацией печати — как в основном чате.
        const withUser = {
            ...threads,
            [agent.id]: [...thread, { id: `u_${now}`, role: 'user', text, image, at: now }],
        };
        updateState({ agentThreads: withUser });
        setInput('');
        setImage(null);
        setThinking(true);

        const reply = buildAgentReply(agent, text);
        const userThread = withUser[agent.id];
        setTimeout(() => {
            setThinking(false);
            updateState({
                agentThreads: {
                    ...withUser,
                    [agent.id]: [...userThread, { id: `a_${now}`, role: 'agent', text: reply, at: now + 1, isAnimated: true }],
                },
            });
        }, 1600);
    };

    return (
        <div className="fixed inset-x-0 top-0 h-app-screen z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm fade-in p-0 sm:p-4" onClick={close}>
            <div className="bg-white dark:bg-darkCard w-full h-full sm:h-[80vh] sm:max-w-md sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Шапка */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={close} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '22', color }}>
                        <Icons.Robot className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm dark:text-white truncate">{agent.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">Работает по промту в этом чате</p>
                    </div>
                </div>

                {/* История */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {thread.length === 0 && (
                        <div className="text-center text-gray-300 dark:text-gray-600 py-12">
                            <Icons.MessageSquare className="w-10 h-10 mx-auto mb-2" />
                            <p className="text-sm">Напишите агенту задачу или вопрос</p>
                        </div>
                    )}
                    {thread.map(m => (
                        <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 dark:text-gray-100 rounded-tl-sm'}`}>
                                {m.image && <img src={m.image} alt="" className="max-w-full rounded-xl mb-2" />}
                                {m.role === 'agent' && m.isAnimated
                                    ? <TypewriterMessage content={m.text} onProgress={() => endRef.current?.scrollIntoView({ behavior: 'auto' })} />
                                    : m.text}
                            </div>
                            {m.role === 'agent' && tts.supported && (
                                <>
                                    <button onClick={() => speakMsg(m)} className={`mt-1 p-1.5 rounded-lg transition-colors ${ttsMsgId === m.id && tts.speaking ? 'text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`} title="Озвучить"><Icons.Volume2 className="w-4 h-4" /></button>
                                    {ttsMsgId === m.id && <AudioPlayer tts={tts} onClose={() => { tts.stop(); setTtsMsgId(null); }} />}
                                </>
                            )}
                        </div>
                    ))}
                    {thinking && <ThinkingIndicator lang={state.lang || 'ru'} level="medium" />}
                    <div ref={endRef} />
                </div>

                {/* Поле ввода — в едином стиле с основным чатом */}
                <div className="p-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                    <ChatInputBar
                        value={input}
                        onChange={setInput}
                        onSend={send}
                        lang={state.lang || 'ru'}
                        voiceLang={state.voiceLang || 'ru-RU'}
                        placeholder="Сообщение агенту…"
                        selectedImage={image}
                        onSelectImage={setImage}
                        onClearImage={() => setImage(null)}
                    />
                </div>
            </div>
        </div>
    );
}

// Простой мок-ответ агента: работает строго по промту, без «профессий»
function buildAgentReply(agent, text) {
    return `Принял задачу: «${text}». Работаю по этому промту в чате — как только будет подключена реальная модель, здесь появится настоящий результат. Отчёт пришлю по готовности.`;
}
