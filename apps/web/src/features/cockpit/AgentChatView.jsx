import { useState, useRef, useEffect } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { getProfession, professionStatusLabel } from '@/shared/config/agents';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { useVoiceInput } from '@/shared/lib/useVoiceInput';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AgentChatView — чат с обычным агентом
// ==========================================
// Открывается поверх Cockpit. Полноценный чат: шапка с агентом и статусом,
// история сообщений, поле ввода с кнопкой голосового ввода слева от «отправить».
// Ответы агента — простые подтверждения в рамках его профессии (визуальная
// логика, без реального бэкенда).

export function AgentChatView({ state, updateState }) {
    const agent = (state.aiAgents || []).find((a) => a.id === state.activeAgentId && a.kind !== 'orchestrator');
    const [input, setInput] = useState('');
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

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length]);

    const { listening, supported, interim, toggle } = useVoiceInput((text) => {
        setInput(prev => (prev ? prev + ' ' : '') + text);
    });

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
    const prof = getProfession(agent.profession || 'mail');
    const statusLabel = professionStatusLabel(agent.profession || 'mail', agent.activePresets || []);

    const send = () => {
        const text = input.trim();
        if (!text) return;
        const now = Date.now();
        const reply = buildAgentReply(agent, text);
        const next = {
            ...threads,
            [agent.id]: [
                ...thread,
                { id: `u_${now}`, role: 'user', text, at: now },
                { id: `a_${now}`, role: 'agent', text: reply, at: now + 1 },
            ],
        };
        updateState({ agentThreads: next });
        setInput('');
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
                        <p className="text-[11px] text-gray-400 truncate">{prof.name} · {statusLabel}</p>
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
                                {m.text}
                            </div>
                            {m.role === 'agent' && tts.supported && (
                                <>
                                    <button onClick={() => speakMsg(m)} className={`mt-1 p-1.5 rounded-lg transition-colors ${ttsMsgId === m.id && tts.speaking ? 'text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`} title="Озвучить"><Icons.Volume2 className="w-4 h-4" /></button>
                                    {ttsMsgId === m.id && <AudioPlayer tts={tts} onClose={() => { tts.stop(); setTtsMsgId(null); }} />}
                                </>
                            )}
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>

                {/* Поле ввода с голосом слева от «отправить» */}
                <div className="p-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                    {/* Индикация записи — отдельной строкой НАД полем ввода */}
                    {listening && (
                        <div className="flex items-center gap-2.5 mb-2 px-3 py-2 rounded-xl bg-[#f3effd] dark:bg-purple-900/20 border border-[#e2d9fa] dark:border-purple-900/40 fade-in">
                            <span className="flex items-end gap-0.5 h-3.5 shrink-0">
                                <span className="voice-bar w-1 rounded-full bg-[#5b32d4]" style={{ animationDelay: '0ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '150ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#9d16e0]" style={{ animationDelay: '300ms' }} />
                            </span>
                            <span className="truncate text-sm text-gray-600 dark:text-gray-300">{interim || 'Слушаю…'}</span>
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                            rows={1}
                            placeholder="Сообщение агенту…"
                            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none max-h-28"
                        />
                        {supported && (
                            <button onClick={toggle} className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${listening ? 'bg-[#5b32d4] text-white voice-pulse-purple' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Голосовой ввод">
                                <Icons.Mic className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={send} disabled={!input.trim()} className="w-10 h-10 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors"><Icons.Send className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Простой ответ агента в рамках его профессии (визуальная логика)
function buildAgentReply(agent, text) {
    const prof = getProfession(agent.profession || 'mail');
    const active = (agent.activePresets || []);
    if (active.length === 0) {
        return `Принял: «${text}». Сейчас у меня не включено ни одного действия — включите пресеты в Cockpit, и я возьму задачу в работу.`;
    }
    const labels = prof.presets.filter(p => active.includes(p.id)).map(p => p.label.toLowerCase());
    return `Принял задачу: «${text}». Работаю в режиме ${prof.name.toLowerCase()} (${labels.join(', ')}). Отчёт пришлю по готовности.`;
}
