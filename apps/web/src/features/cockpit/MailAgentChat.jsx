import { useState, useRef, useEffect } from 'react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { getProfession, professionStatusLabel } from '@/shared/config/agents';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { useVoiceInput } from '@/shared/lib/useVoiceInput';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// MailAgentChat — чат с агентами внутри почты («Оповещения агентов»)
// ==========================================
// Тот же функционал, что и чат агента в Cockpit, но встроен прямо в панель
// почты (не всплывающее окно). Сверху список агентов и оркестраторов, по клику
// открывается инлайн-чат с историей, вводом, голосом и озвучкой.

function buildAgentReply(agent, text) {
    if (agent.kind === 'orchestrator') {
        return `Принял: «${text}». Распределю задачу между привязанными агентами и пришлю план на подтверждение.`;
    }
    const prof = getProfession(agent.profession || 'mail');
    const active = (agent.activePresets || []);
    if (active.length === 0) {
        return `Принял: «${text}». Сейчас у меня не включено ни одного действия — включите пресеты в Cockpit, и я возьму задачу в работу.`;
    }
    const labels = prof.presets.filter(p => active.includes(p.id)).map(p => p.label.toLowerCase());
    return `Принял задачу: «${text}». Работаю в режиме ${prof.name.toLowerCase()} (${labels.join(', ')}). Отчёт пришлю по готовности.`;
}

export function MailAgentChat({ state, updateState }) {
    const agents = state.aiAgents || [];
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const workers = agents.filter(a => a.kind !== 'orchestrator');

    const [openId, setOpenId] = useState(null);
    const [input, setInput] = useState('');
    const endRef = useRef(null);

    const agent = agents.find(a => a.id === openId);
    const threads = state.agentThreads || {};
    const thread = agent ? (threads[agent.id] || []) : [];

    const voice = useVoiceInput((text) => setInput(prev => (prev ? prev + ' ' : '') + text));

    // Включить/выключить звук уведомлений оркестратора
    const toggleSound = (o) => {
        updateState({
            aiAgents: agents.map(a => a.id === o.id
                ? { ...a, orchestration: { ...(a.orchestration || {}), soundEnabled: !(a.orchestration?.soundEnabled !== false) } }
                : a),
        });
    };
    const tts = useTextToSpeech();
    const [ttsMsgId, setTtsMsgId] = useState(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.length]);

    const speakMsg = (m) => {
        if (ttsMsgId === m.id && tts.speaking) { tts.stop(); setTtsMsgId(null); return; }
        tts.stop(); setTtsMsgId(m.id);
        tts.speak(m.text, { lang: state.voiceLang || 'ru-RU', voiceURI: state.voiceURI || null, rate: state.voiceRate || 1, pitch: state.voicePitch || 1 });
    };

    const send = () => {
        const text = input.trim();
        if (!text || !agent) return;
        const now = Date.now();
        const reply = buildAgentReply(agent, text);
        updateState({
            agentThreads: {
                ...threads,
                [agent.id]: [
                    ...thread,
                    { id: `u_${now}`, role: 'user', text, at: now },
                    { id: `a_${now}`, role: 'agent', text: reply, at: now + 1 },
                ],
            },
        });
        setInput('');
    };

    // Список: в почте показываем только оркестраторов, с тумблером звука
    if (!agent) {
        if (orchestrators.length === 0) {
            return (
                <div className="text-center text-gray-400 py-16 px-6">
                    <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium mb-1">Оркестраторов пока нет</p>
                    <p className="text-xs">Купите оркестратора в магазине, и здесь появится чат с ним</p>
                </div>
            );
        }
        return (
            <div className="p-3 space-y-2">
                {orchestrators.map(o => {
                    const soundOn = o.orchestration?.soundEnabled !== false;
                    return (
                        <div key={o.id} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-[#efe9fb] to-[#f3ecfb] dark:from-purple-900/20 dark:to-indigo-900/20 hover:shadow-sm transition-all">
                            <button onClick={() => setOpenId(o.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#312a6b] to-[#a52fe0] text-white flex items-center justify-center shrink-0"><Icons.Robot className="w-5 h-5" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-sm dark:text-white truncate">{o.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">Оркестратор · {o.orchestration?.email || 'дирижёр агентов'}</p>
                                </div>
                            </button>
                            {/* Выключение звука уведомлений этого оркестратора */}
                            <button onClick={() => toggleSound(o)} title={soundOn ? 'Выключить звук' : 'Включить звук'} className={`p-2 rounded-lg shrink-0 transition-colors ${soundOn ? 'text-[#5b32d4] hover:bg-white/60 dark:hover:bg-gray-800' : 'text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800'}`}>
                                {soundOn ? <Icons.Volume2 className="w-5 h-5" /> : <Icons.VolumeX className="w-5 h-5" />}
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    }

    // Инлайн-чат выбранного агента
    const color = agent.color || '#5b32d4';
    const isOrch = agent.kind === 'orchestrator';
    return (
        <div className="flex flex-col h-full">
            {/* Шапка чата */}
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-darkBorder shrink-0">
                <button onClick={() => { setOpenId(null); tts.stop(); setTtsMsgId(null); }} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOrch ? 'bg-gradient-to-br from-[#312a6b] to-[#a52fe0] text-white' : ''}`} style={!isOrch ? { backgroundColor: color + '22', color } : {}}><Icons.Robot className="w-5 h-5" /></div>
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm dark:text-white truncate">{agent.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{isOrch ? 'Оркестратор' : professionStatusLabel(agent.profession || 'mail', agent.activePresets || [])}</p>
                </div>
            </div>

            {/* История */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {thread.length === 0 && (
                    <div className="text-center text-gray-300 dark:text-gray-600 py-10">
                        <Icons.MessageSquare className="w-9 h-9 mx-auto mb-2" />
                        <p className="text-sm">Напишите агенту задачу или вопрос</p>
                    </div>
                )}
                {thread.map(m => (
                    <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 dark:text-gray-100 rounded-tl-sm'}`}>{m.text}</div>
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

            {/* Ввод */}
            <div className="p-2.5 border-t border-gray-100 dark:border-darkBorder shrink-0">
                {/* Индикация записи — отдельной строкой НАД полем ввода */}
                {voice.listening && (
                    <div className="flex items-center gap-2.5 mb-2 px-3 py-2 rounded-xl bg-[#f3effd] dark:bg-purple-900/20 border border-[#e2d9fa] dark:border-purple-900/40 fade-in">
                        <span className="flex items-end gap-0.5 h-3.5 shrink-0">
                            <span className="voice-bar w-1 rounded-full bg-[#5b32d4]" style={{ animationDelay: '0ms' }} />
                            <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '150ms' }} />
                            <span className="voice-bar w-1 rounded-full bg-[#9d16e0]" style={{ animationDelay: '300ms' }} />
                        </span>
                        <span className="truncate text-sm text-gray-600 dark:text-gray-300">{voice.interim || 'Слушаю…'}</span>
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Сообщение агенту…" className="flex-1 px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none max-h-24" />
                    {voice.supported && (
                        <button onClick={voice.toggle} className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${voice.listening ? 'bg-[#5b32d4] text-white voice-pulse-purple' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Голосовой ввод"><Icons.Mic className="w-4 h-4" /></button>
                    )}
                    <button onClick={send} disabled={!input.trim()} className="w-10 h-10 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors"><Icons.Send className="w-4 h-4" /></button>
                </div>
            </div>
        </div>
    );
}
