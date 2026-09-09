import { useState, useRef, useEffect } from 'react';
import { AI_MODELS } from '@/shared/config/models';
import { PLUGIN_TOOLS } from '@/features/plugins/PluginsView';
import { listFishVoices } from '@/shared/api/chat';
import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// CallAgentSettings — настройки агента-профессии «Звонки» (#4)
// ==========================================
// Открывается из чата агента звонков по кнопке «⋮». Настройки живут в
// самом агенте: state.aiAgents[].callSettings = { phone, modelId, voiceURI,
// voicePresetFish, instructions: [{id,title,text}], connectors: [ids] }.
// Коннекторы агента ОТДЕЛЬНЫ от профильных (state.connectedPlugins): по
// умолчанию выключены, но подключённый в профиле можно «взять из профиля».
export function CallAgentSettings({ agent, state, updateState, onClose }) {
    useLockBodyScroll(true);
    const cs = agent.callSettings || {};
    const [tab, setTab] = useState('number'); // number | model | voice | instructions | connectors
    const [voices, setVoices] = useState([]);
    const [voicesLoading, setVoicesLoading] = useState(false);
    const fileRef = useRef(null);

    const patch = (p) => updateState({
        aiAgents: (state.aiAgents || []).map(a => a.id === agent.id ? { ...a, callSettings: { ...(a.callSettings || {}), ...p }, updatedAt: Date.now() } : a),
    });

    useEffect(() => {
        if (tab === 'voice' && voices.length === 0 && !voicesLoading) {
            setVoicesLoading(true);
            listFishVoices().then(setVoices).catch(() => setVoices([])).finally(() => setVoicesLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const profileConnectors = state.connectedPlugins || [];
    const agentConnectors = cs.connectors || [];
    const toggleConnector = (id) => {
        patch({ connectors: agentConnectors.includes(id) ? agentConnectors.filter(x => x !== id) : [...agentConnectors, id] });
    };

    const addInstruction = (title = 'Инструкция', text = '') => {
        const list = cs.instructions || [];
        patch({ instructions: [...list, { id: 'ins_' + Date.now() + Math.random().toString(36).slice(2, 6), title, text }] });
    };
    const updateInstruction = (id, p) => patch({ instructions: (cs.instructions || []).map(i => i.id === id ? { ...i, ...p } : i) });
    const removeInstruction = (id) => patch({ instructions: (cs.instructions || []).filter(i => i.id !== id) });
    const onUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => addInstruction(file.name.replace(/\.[^.]+$/, ''), String(r.result || ''));
        r.readAsText(file);
        e.target.value = '';
    };

    const TABS = [
        { id: 'number', label: 'Номер', icon: Icons.Phone },
        { id: 'model', label: 'Модель', icon: Icons.Sparkles },
        { id: 'voice', label: 'Голос', icon: Icons.Volume2 },
        { id: 'instructions', label: 'Инструкции', icon: Icons.Library },
        { id: 'connectors', label: 'Коннекторы', icon: Icons.Plug },
    ];

    return (
        <div className="fixed inset-0 z-[120] bg-black/40 flex justify-end sm:items-center sm:justify-center fade-in" onClick={onClose}>
            <div className="w-full sm:w-[520px] h-full sm:h-auto sm:max-h-[88vh] bg-white dark:bg-darkCard shadow-2xl slide-in-right sm:rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                    <h4 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.Phone className="w-5 h-5 text-emerald-500" /> Настройки: {agent.name}</h4>
                </div>

                {/* Табы */}
                <div className="flex gap-1 px-3 pt-3 overflow-x-auto void-cli-scroll shrink-0">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {tab === 'number' && (
                        <div>
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 block">Номер, с которого звонит агент</label>
                            <input value={cs.phone || ''} onChange={e => patch({ phone: e.target.value })} placeholder="+7 900 000-00-00" className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-[15px] dark:text-white outline-none focus:border-[#5b32d4] transition-colors" />
                            <p className="text-xs text-gray-400 mt-2 leading-relaxed">Номер подключается через телефонного провайдера (Voximplant). Пока сохраняется как настройка — приём/совершение звонков включится после подключения провайдера на сервере.</p>
                        </div>
                    )}

                    {tab === 'model' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">Модель-«мозг» диалога</label>
                            {AI_MODELS.map(m => (
                                <button key={m.id} onClick={() => patch({ modelId: m.id })} className={`w-full text-left p-3 rounded-2xl border transition-colors ${cs.modelId === m.id ? 'border-[#5b32d4] bg-[#efecf9]/60 dark:bg-purple-900/20' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-[15px] dark:text-white">{m.short || m.name}</span>
                                        {cs.modelId === m.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" />}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {tab === 'voice' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">Голос агента</label>
                            <button onClick={() => patch({ voicePresetFish: null })} className={`w-full text-left p-3 rounded-2xl border transition-colors ${!cs.voicePresetFish ? 'border-[#5b32d4] bg-[#efecf9]/60 dark:bg-purple-900/20' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                <span className="font-bold text-[15px] dark:text-white">Голос по умолчанию</span>
                            </button>
                            {voicesLoading && <p className="text-sm text-gray-400 py-2">Загрузка голосов…</p>}
                            {voices.map(v => (
                                <button key={v.id} onClick={() => patch({ voicePresetFish: v.id })} className={`w-full text-left p-3 rounded-2xl border transition-colors ${cs.voicePresetFish === v.id ? 'border-[#5b32d4] bg-[#efecf9]/60 dark:bg-purple-900/20' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-[15px] dark:text-white">{v.title}</span>
                                        {cs.voicePresetFish === v.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" />}
                                    </div>
                                    {v.description && <p className="text-xs text-gray-500 dark:text-gray-400">{v.description}</p>}
                                </button>
                            ))}
                        </div>
                    )}

                    {tab === 'instructions' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400">Инструкции / методички</label>
                                <div className="flex gap-2">
                                    <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={onUpload} />
                                    <button onClick={() => fileRef.current?.click()} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Загрузить файл</button>
                                    <button onClick={() => addInstruction()} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#5b32d4] text-white">+ Добавить</button>
                                </div>
                            </div>
                            {(cs.instructions || []).length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Пока нет инструкций. Добавьте методичку, по которой агент будет вести диалог.</p>}
                            {(cs.instructions || []).map(ins => (
                                <div key={ins.id} className="rounded-2xl border border-gray-100 dark:border-darkBorder p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <input value={ins.title} onChange={e => updateInstruction(ins.id, { title: e.target.value })} className="flex-1 bg-transparent font-bold text-sm dark:text-white outline-none" />
                                        <button onClick={() => removeInstruction(ins.id)} className="p-1 rounded-lg text-gray-400 hover:text-red-500"><Icons.Trash className="w-4 h-4" /></button>
                                    </div>
                                    <textarea value={ins.text} onChange={e => updateInstruction(ins.id, { text: e.target.value })} rows={4} placeholder="Текст инструкции…" className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none resize-none" />
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'connectors' && (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-400 mb-2 leading-relaxed">Коннекторы агента отдельны от профиля. Подключённый в профиле можно «взять из профиля» — тогда агент сможет, например, внести данные в таблицу после звонка.</p>
                            {PLUGIN_TOOLS.map(tool => {
                                const on = agentConnectors.includes(tool.id);
                                const inProfile = profileConnectors.includes(tool.id);
                                const Ico = Icons[tool.icon] || Icons.Plug;
                                return (
                                    <div key={tool.id} className="flex items-center gap-3 p-2.5 rounded-2xl border border-gray-100 dark:border-darkBorder">
                                        <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0"><Ico className="w-[18px] h-[18px]" /></div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-sm dark:text-white truncate">{tool.name}</p>
                                            <p className="text-[11px] text-gray-400">{inProfile ? 'Подключён в профиле' : 'Не подключён в профиле'}</p>
                                        </div>
                                        {!on && inProfile && (
                                            <button onClick={() => toggleConnector(tool.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 shrink-0">Взять из профиля</button>
                                        )}
                                        <button onClick={() => toggleConnector(tool.id)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
