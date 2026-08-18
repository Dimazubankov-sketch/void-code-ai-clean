import { useState, useRef, useEffect } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { AgentComposer } from '@/features/cockpit/AgentComposer';
import { AgentPlusMenu } from '@/features/cockpit/AgentPlusMenu';
import { ThinkingIndicator } from '@/features/chat/ThinkingIndicator';
import { TypewriterMessage } from '@/features/chat/TypewriterMessage';
import { useOpenAiTts } from '@/shared/lib/useOpenAiTts';
import { createBackendChat, sendBackendMessage } from '@/shared/api/chat';
import { buildAgentSystemPrompt } from '@/shared/lib/agentPrompt';
import { buildAgentSkillsInstruction } from '@/features/cockpit/AgentSkillsPanel';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AgentChatView — чат с обычным агентом
// ==========================================
// Открывается поверх Cockpit. Композер — тот же ChatInputBar, что и в
// основном чате (см. onPlusClick/onVoiceMode там же), только меню «+»
// своё — AgentPlusMenu (камера/фото/файлы + скиллы/скиллы агента/голос/
// коннекторы). Агент работает строго по промту — все «профессии» и
// пресеты убраны.
//
// Озвучка переведена с браузерного Web Speech (useTextToSpeech) на тот же
// бэкенд-TTS (Fish Audio), что и весь остальной проект — у каждого агента
// свой голос (agent.voicePresetFish, выбирается в меню «+» → «Голос»),
// но система голосов одна на всё приложение, как и требовалось.
//
// Полноценный разговорный Voice Mode (барж-ин, потоковая озвучка, камера
// в реальном времени) сюда НЕ перенесён: он завязан на модель данных
// основного чата (state.chatSessions/activeChatId) в App.jsx, а у агентов
// отдельная модель — agentThreads по agent.id. Переносить его означало бы
// делать useVoiceMode источник-агностичным — отдельная, более рискованная
// задача, которую лучше не смешивать с переносом остального интерфейса.

export function AgentChatView({ state, updateState }) {
    const agent = (state.aiAgents || []).find((a) => a.id === state.activeAgentId && a.kind !== 'orchestrator');
    const [input, setInput] = useState('');
    const [image, setImage] = useState(null);
    const [thinking, setThinking] = useState(false);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const endRef = useRef(null);
    const chatFileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const anyFileInputRef = useRef(null);

    const openFilePicker = (ref) => {
        setShowPlusMenu(false);
        // На следующий кадр — иначе системный пикер иногда не успевает
        // открыться до того, как меню уйдёт из DOM (тот же приём, что и
        // в основном чате).
        requestAnimationFrame(() => ref.current?.click());
    };
    const addImageFile = (files) => {
        const file = files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onloadend = () => setImage(r.result);
        r.readAsDataURL(file);
    };

    // Возврат в Cockpit без засорения истории: снимаем со стека верхнюю
    // запись, которую добавили при открытии чата, чтобы кнопка «Назад» в
    // Cockpit вела в Хаб, а не обратно в этот чат.
    // ВАЖНО: эта запись может быть 'cockpit' ИЛИ 'agent-store' — оба
    // значения рендерят один и тот же AgentStoreApp (см. App.jsx), но
    // именно 'agent-store' пушится, когда пользователь попал в Cockpit
    // через плитку «Агенты» на Хабе (см. HomeView.jsx). Раньше здесь
    // проверялось только 'cockpit', поэтому запись 'agent-store' никогда
    // не снималась — лишний шаг оставался в истории, и первое нажатие
    // «Назад» в Cockpit просто переключало currentView между 'cockpit' и
    // 'agent-store' (тот же экран, никакой видимой навигации), и только
    // ВТОРОЕ нажатие реально уводило в Хаб.
    const close = () => {
        const hist = state.viewHistory || [];
        const last = hist[hist.length - 1];
        const trimmed = (last === 'cockpit' || last === 'agent-store') ? hist.slice(0, -1) : hist;
        updateState({ currentView: 'cockpit', activeAgentId: null, viewHistory: trimmed });
    };

    const threads = state.agentThreads || {};
    const thread = agent ? (threads[agent.id] || []) : [];

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length, thinking]);

    // Озвучка ответов агента — Fish Audio, голос выбирается на самом
    // агенте (см. AgentPlusMenu → «Голос»), а не глобально.
    const tts = useOpenAiTts();
    const [ttsMsgId, setTtsMsgId] = useState(null);
    const speakMsg = (m) => {
        if (ttsMsgId === m.id && tts.speaking) { tts.stop(); setTtsMsgId(null); return; }
        tts.stop(); setTtsMsgId(m.id);
        tts.speak(m.text, { provider: 'fish', voice: agent?.voicePresetFish || undefined, speed: state.voiceRate || 1, lang: state.voiceLang || 'ru-RU' });
    };

    if (!agent) {
        return (
            <div className="fixed inset-x-0 top-0 h-app-screen z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={close}>
                <button onClick={close} className="text-white font-bold">← В Cockpit</button>
            </div>
        );
    }

    const color = agent.color || '#5b32d4';

    const send = (textOverride) => {
        const text = (textOverride ?? input).trim();
        if (!text && !image) return;
        const now = Date.now();
        // Сначала показываем сообщение пользователя, включаем индикатор
        // размышления, затем запрашиваем ответ у ИИ с агентским системным
        // промптом (краткий исполнитель, действия, коннекторы, токены,
        // + скиллы этого агента).
        const withUser = {
            ...threads,
            [agent.id]: [...thread, { id: `u_${now}`, role: 'user', text, image, at: now }],
        };
        updateState({ agentThreads: withUser });
        setInput('');
        setImage(null);
        setThinking(true);

        const userThread = withUser[agent.id];
        const finish = (replyText) => {
            setThinking(false);
            updateState({
                agentThreads: {
                    ...withUser,
                    [agent.id]: [...userThread, { id: `a_${now}`, role: 'agent', text: replyText, at: now + 1, isAnimated: true }],
                },
            });
        };

        (async () => {
            try {
                // Отдельная backend-сессия на каждого агента (лениво).
                let backendChatId = agent.backendChatId;
                if (!backendChatId) {
                    backendChatId = await createBackendChat();
                    updateState({
                        aiAgents: (state.aiAgents || []).map(a => a.id === agent.id ? { ...a, backendChatId } : a),
                    });
                }
                const baseSysPrompt = buildAgentSystemPrompt(agent, state.connectedPlugins || []);
                const skillsNote = buildAgentSkillsInstruction(agent);
                const sysPrompt = skillsNote ? `${baseSysPrompt}\n\n${skillsNote}` : baseSysPrompt;
                // Агенты пишут код уровня Plus/Pro — используем pro-модель.
                const reply = await sendBackendMessage(backendChatId, text, 'pro', sysPrompt);
                finish(reply || 'Готово.');
            } catch (e) {
                finish('Не удалось связаться с ИИ. Проверьте подключение и попробуйте ещё раз.');
            }
        })();
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
                            {m.role === 'agent' && (
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

                {/* Скрытые инпуты для камеры/фото/файлов — тот же паттерн,
                    что и в основном чате. */}
                <input type="file" ref={chatFileInputRef} accept="image/jpeg, image/png, image/webp, image/heic" className="hidden" onChange={(e) => { addImageFile(e.target.files); e.target.value = ''; }} />
                <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={(e) => { addImageFile(e.target.files); e.target.value = ''; }} />
                <input type="file" ref={anyFileInputRef} accept=".pdf,.doc,.docx,.txt,.csv,.json" className="hidden" onChange={(e) => { addImageFile(e.target.files); e.target.value = ''; }} />

                {/* Поле ввода — точная копия основного чата по размеру и
                    поведению (AgentComposer, см. файл), без Voice Mode.
                    Разделительная полоса над полем убрана: border-t
                    только визуально дублировал границу самого поля ввода
                    и смотрелся лишней линией на скриншотах. */}
                <div className="p-3 shrink-0 relative">
                    {image && (
                        <div className="absolute -top-16 left-4 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder group fade-in">
                            <img src={image} className="h-14 w-14 object-cover rounded-lg" alt="" />
                            <button onClick={() => setImage(null)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md">
                                <Icons.X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    <AgentComposer
                        value={input}
                        onChange={setInput}
                        onSend={send}
                        lang={state.lang || 'ru'}
                        voiceLang={state.voiceLang || 'ru-RU'}
                        placeholder="Сообщение агенту…"
                        onPlusClick={() => setShowPlusMenu(true)}
                    />
                    {showPlusMenu && (
                        <AgentPlusMenu
                            state={state}
                            updateState={updateState}
                            agentId={agent.id}
                            onClose={() => setShowPlusMenu(false)}
                            onPickCamera={() => openFilePicker(cameraInputRef)}
                            onPickPhoto={() => openFilePicker(chatFileInputRef)}
                            onPickFile={() => openFilePicker(anyFileInputRef)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
