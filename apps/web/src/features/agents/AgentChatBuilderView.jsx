import { useState, useEffect, useRef } from 'react';
import { AgentInvoiceModal } from '@/features/agents/AgentInvoiceModal';
import { AGENT_NODE_W, BLOCK_COLORS, BLOCK_LIBRARY, getBlockDef } from '@/shared/config/agents';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОНСТРУКТОР AI-АГЕНТОВ ЧЕРЕЗ ЧАТ — "Кастомные агенты"
// ==========================================
// Данные для пошагового диалога-мастера: помогает собрать агента,
// не трогая канвас — отвечаешь на вопросы, а в конце получаешь
// готовый, полностью рабочий агент (тот же формат, что и в конструкторе блоков).
export const AGENT_WIZARD_PURPOSES = [
    { id: 'support', label: 'Поддержка клиентов' },
    { id: 'content', label: 'Публикация контента' },
    { id: 'data', label: 'Обработка заявок и данных' },
    { id: 'assistant', label: 'Личный помощник' },
    { id: 'custom', label: 'Свой вариант' },
];


export function AgentChatBuilderView({ state, updateState }) {
    const messagesEndRef = useRef(null);
    const [messages, setMessages] = useState([
        { id: 'm0', role: 'bot', text: 'Привет! Я помогу собрать личного AI-агента под твою задачу — просто отвечай на вопросы, и через пару минут агент будет готов. 🙂' },
        { id: 'm1', role: 'bot', text: 'Как назовём агента?' }
    ]);
    const [phase, setPhase] = useState('ask_name'); // ask_name -> ask_purpose -> ask_purpose_custom? -> ask_trigger -> ask_actions -> ask_memory -> ask_prompt -> summary -> done
    const [answers, setAnswers] = useState({ name: '', purposeLabel: '', triggerBlockId: '', actionBlockIds: [], memory: true, systemPrompt: '' });
    const [inputValue, setInputValue] = useState('');
    const [pendingActions, setPendingActions] = useState([]);
    const [createdAgentId, setCreatedAgentId] = useState(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, phase]);

    const addBotMessage = (text, extra = {}) => {
        setMessages(prev => [...prev, { id: 'm' + Date.now() + Math.random(), role: 'bot', text, ...extra }]);
    };
    const addUserMessage = (text) => {
        setMessages(prev => [...prev, { id: 'm' + Date.now() + Math.random(), role: 'user', text }]);
    };

    // ---------- Шаг 1: имя ----------
    const submitName = (value) => {
        const name = value.trim();
        if (!name) return;
        addUserMessage(name);
        setAnswers(prev => ({ ...prev, name }));
        setInputValue('');
        setTimeout(() => {
            addBotMessage(`Отлично, «${name}»! Чем этот агент будет заниматься?`);
            setPhase('ask_purpose');
        }, 300);
    };

    // ---------- Шаг 2: цель ----------
    const submitPurpose = (opt) => {
        addUserMessage(opt.label);
        if (opt.id === 'custom') {
            setTimeout(() => { addBotMessage('Опиши в паре слов, чем он будет заниматься:'); setPhase('ask_purpose_custom'); }, 300);
            return;
        }
        setAnswers(prev => ({ ...prev, purposeLabel: opt.label }));
        setTimeout(() => {
            addBotMessage('С чего агент должен начинать работу — что будет его запускать?');
            setPhase('ask_trigger');
        }, 300);
    };
    const submitCustomPurpose = (value) => {
        const text = value.trim();
        if (!text) return;
        addUserMessage(text);
        setAnswers(prev => ({ ...prev, purposeLabel: text }));
        setInputValue('');
        setTimeout(() => {
            addBotMessage('С чего агент должен начинать работу — что будет его запускать?');
            setPhase('ask_trigger');
        }, 300);
    };

    // ---------- Шаг 3: триггер ----------
    const submitTrigger = (block) => {
        addUserMessage(block.name);
        setAnswers(prev => ({ ...prev, triggerBlockId: block.id }));
        setPendingActions([]);
        setTimeout(() => {
            addBotMessage('Какие действия нужны после того, как AI обработает запрос? Можно выбрать несколько, а можно оставить пустым — тогда агент просто ответит.');
            setPhase('ask_actions');
        }, 300);
    };

    // ---------- Шаг 4: действия (мультивыбор) ----------
    const toggleAction = (blockId) => {
        setPendingActions(prev => prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]);
    };
    const confirmActions = () => {
        const labels = pendingActions.map(id => getBlockDef(id)?.name).filter(Boolean);
        addUserMessage(labels.length > 0 ? labels.join(', ') : 'Без дополнительных действий — просто ответить');
        setAnswers(prev => ({ ...prev, actionBlockIds: pendingActions }));
        setTimeout(() => {
            addBotMessage('Агенту нужна память о предыдущих сообщениях в разговоре?');
            setPhase('ask_memory');
        }, 300);
    };

    // ---------- Шаг 5: память ----------
    const submitMemory = (value) => {
        addUserMessage(value ? 'Да, нужна память' : 'Нет, каждый раз с чистого листа');
        setAnswers(prev => ({ ...prev, memory: value }));
        setTimeout(() => {
            addBotMessage('И последнее: опиши в свободной форме, как агент должен себя вести и общаться — это станет его системным промптом.');
            setPhase('ask_prompt');
        }, 300);
    };

    // ---------- Шаг 6: системный промпт ----------
    const submitPrompt = (value) => {
        const text = value.trim();
        if (!text) return;
        addUserMessage(text);
        setAnswers(prev => ({ ...prev, systemPrompt: text }));
        setInputValue('');
        setTimeout(() => { setPhase('summary'); }, 300);
    };

    // ---------- Сборка агента ----------
    const buildAgentFromAnswers = () => {
        const nodes = [];
        const edges = [];
        let x = 80, y = 220;

        const triggerBlock = getBlockDef(answers.triggerBlockId) || BLOCK_LIBRARY.find(b => b.id === 'webhook');
        const triggerNode = { id: 'n' + Date.now() + '_t', blockId: triggerBlock.id, x, y, name: triggerBlock.name, description: triggerBlock.subtitle, config: {} };
        nodes.push(triggerNode);
        x += AGENT_NODE_W + 90;

        const aiNode = {
            id: 'n' + Date.now() + '_ai', blockId: 'ai_agent', x, y,
            name: 'AI Agent', description: answers.purposeLabel || 'Главный агент',
            config: { model: 'GPT-4o', temperature: 0.7, maxTokens: 1024, memory: answers.memory, systemPrompt: answers.systemPrompt || 'Вы — полезный AI-агент.' }
        };
        nodes.push(aiNode);
        edges.push({ id: 'e' + Date.now() + '_1', from: triggerNode.id, to: aiNode.id });
        x += AGENT_NODE_W + 90;

        const actionBlocks = answers.actionBlockIds.map(id => getBlockDef(id)).filter(Boolean);
        const startY = y - ((actionBlocks.length - 1) * 65);
        actionBlocks.forEach((block, i) => {
            const node = { id: 'n' + Date.now() + '_a' + i, blockId: block.id, x, y: startY + i * 130, name: block.name, description: block.subtitle, config: {} };
            nodes.push(node);
            edges.push({ id: 'e' + Date.now() + '_a' + i, from: aiNode.id, to: node.id });
        });

        return { nodes, edges };
    };

    const [showInvoice, setShowInvoice] = useState(false);

    const handleCreateAgent = () => {
        const { nodes, edges } = buildAgentFromAnswers();
        const now = Date.now();
        const newId = 'agent_' + now;
        const newAgent = { id: newId, name: answers.name || 'Мой агент', nodes, edges, createdAt: now, updatedAt: now, isPaid: false, status: 'unpaid' };
        updateState({ aiAgents: [...state.aiAgents, newAgent], activeAgentId: newId });
        setCreatedAgentId(newId);
        addBotMessage(`Агент «${answers.name}» собран! Осталось оплатить разовую услугу сборки, чтобы забрать его в работу.`);
        setPhase('invoice');
        setShowInvoice(true);
    };

    const handleInvoicePaid = () => {
        setShowInvoice(false);
        addBotMessage(`Оплата прошла — агент «${answers.name}» активен 🎉 Можно открыть его в конструкторе блоков, чтобы донастроить детали, или сразу собрать ещё одного.`);
        setPhase('done');
    };

    const handleInvoiceClose = () => {
        setShowInvoice(false);
        addBotMessage('Хорошо, агент сохранён как черновик — оплатить сборку можно в любой момент в конструкторе блоков или в разделе «Кошелёк».');
        setPhase('done');
    };

    const restartWizard = () => {
        setAnswers({ name: '', purposeLabel: '', triggerBlockId: '', actionBlockIds: [], memory: true, systemPrompt: '' });
        setPendingActions([]);
        setCreatedAgentId(null);
        setInputValue('');
        setShowInvoice(false);
        setMessages([
            { id: 'r0' + Date.now(), role: 'bot', text: 'Отлично, соберём ещё одного! Как назовём нового агента?' }
        ]);
        setPhase('ask_name');
    };

    const isTextPhase = phase === 'ask_name' || phase === 'ask_purpose_custom' || phase === 'ask_prompt';
    const inputPlaceholder = phase === 'ask_name' ? 'Например: Помощник поддержки' : phase === 'ask_purpose_custom' ? 'Опиши задачу агента...' : 'Опиши поведение агента...';

    const submitTextInput = () => {
        if (phase === 'ask_name') submitName(inputValue);
        else if (phase === 'ask_purpose_custom') submitCustomPurpose(inputValue);
        else if (phase === 'ask_prompt') submitPrompt(inputValue);
    };

    return (
        <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden relative">
            <div className="flex items-center gap-3 px-3 sm:px-4 md:px-6 py-3 bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder flex-shrink-0 z-30">
                <button onClick={() => goBack(state, updateState, 'agent-builder')} title="Назад в конструктор" className="void-tap-target p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
                    <Icons.ChevronLeft className="w-6 h-6" />
                </button>
                <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.Robot className="w-5 h-5" /></div>
                <div className="min-w-0">
                    <h1 className="font-extrabold text-[13px] sm:text-base dark:text-white truncate">Кастомные агенты</h1>
                    <p className="text-xs text-gray-400 truncate">Соберём агента вместе, по шагам</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-8 py-6 pb-32 sm:pb-28">
                <div className="max-w-2xl mx-auto space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex gap-2.5 max-w-full ${msg.role === 'user' ? 'flex-row-reverse ml-auto' : ''}`} style={{ maxWidth: '88%', marginLeft: msg.role === 'user' ? 'auto' : 0 }}>
                            {msg.role === 'bot' && <div className="w-8 h-8 rounded-full bg-[#efecf9] dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-0.5 border border-purple-100 dark:border-purple-900/50 text-[#5b32d4] dark:text-purple-400"><Icons.Robot className="w-5 h-5" /></div>}
                            <div className={`p-4 rounded-3xl shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm' : 'bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-gray-800 dark:text-gray-100 rounded-tl-sm'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}

                    {/* Быстрые ответы для соответствующих шагов — отображаются как часть диалога */}
                    {phase === 'ask_purpose' && (
                        <div className="flex flex-wrap gap-2 pl-10 fade-in">
                            {AGENT_WIZARD_PURPOSES.map(opt => (
                                <button key={opt.id} onClick={() => submitPurpose(opt)} className="px-4 py-2.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">{opt.label}</button>
                            ))}
                        </div>
                    )}

                    {phase === 'ask_trigger' && (
                        <div className="flex flex-wrap gap-2 pl-10 fade-in">
                            {BLOCK_LIBRARY.filter(b => b.isTrigger).map(b => {
                                const c = BLOCK_COLORS[b.color] || BLOCK_COLORS.gray;
                                const IconComp = Icons[b.icon] || Icons.Robot;
                                return (
                                    <button key={b.id} onClick={() => submitTrigger(b)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${c.bg} ${c.text}`}><IconComp className="w-3.5 h-3.5" /></div> {b.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {phase === 'ask_actions' && (
                        <div className="pl-10 fade-in space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {BLOCK_LIBRARY.filter(b => b.category === 'Действия').map(b => {
                                    const c = BLOCK_COLORS[b.color] || BLOCK_COLORS.gray;
                                    const IconComp = Icons[b.icon] || Icons.Robot;
                                    const active = pendingActions.includes(b.id);
                                    return (
                                        <button key={b.id} onClick={() => toggleAction(b.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-semibold transition-colors ${active ? 'bg-[#efecf9] dark:bg-purple-900/30 border-[#5b32d4] text-[#5b32d4] dark:text-purple-300' : 'bg-white dark:bg-darkCard border-gray-200 dark:border-darkBorder text-gray-700 dark:text-gray-200 hover:border-[#5b32d4] hover:text-[#5b32d4]'}`}>
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${c.bg} ${c.text}`}><IconComp className="w-3.5 h-3.5" /></div> {b.name}
                                            {active && <Icons.Check className="w-3.5 h-3.5" />}
                                        </button>
                                    );
                                })}
                            </div>
                            <button onClick={confirmActions} className="px-5 py-2.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm shadow-md transition-colors">
                                Готово, дальше →
                            </button>
                        </div>
                    )}

                    {phase === 'ask_memory' && (
                        <div className="flex flex-wrap gap-2 pl-10 fade-in">
                            <button onClick={() => submitMemory(true)} className="px-4 py-2.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">Да, нужна память</button>
                            <button onClick={() => submitMemory(false)} className="px-4 py-2.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">Нет, не нужна</button>
                        </div>
                    )}

                    {phase === 'summary' && (
                        <div className="pl-0 sm:pl-10 fade-in">
                            <div className="bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-sm p-5 space-y-3">
                                <h3 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.Robot className="w-5 h-5 text-[#5b32d4]" /> {answers.name}</h3>
                                <div className="text-sm space-y-1.5 text-gray-600 dark:text-gray-300">
                                    <p><span className="font-bold text-gray-400">Задача:</span> {answers.purposeLabel}</p>
                                    <p><span className="font-bold text-gray-400">Запуск:</span> {getBlockDef(answers.triggerBlockId)?.name}</p>
                                    <p><span className="font-bold text-gray-400">Действия:</span> {answers.actionBlockIds.length > 0 ? answers.actionBlockIds.map(id => getBlockDef(id)?.name).join(', ') : 'только ответ'}</p>
                                    <p><span className="font-bold text-gray-400">Память:</span> {answers.memory ? 'включена' : 'выключена'}</p>
                                    <p><span className="font-bold text-gray-400">Промпт:</span> {answers.systemPrompt}</p>
                                </div>
                                <button onClick={handleCreateAgent} className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold shadow-md transition-colors">
                                    <Icons.Check className="w-4 h-4" /> Собрать агента
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'done' && (
                        <div className="pl-0 sm:pl-10 fade-in flex flex-wrap gap-2">
                            <button onClick={() => updateState({ currentView: 'agent-builder', activeAgentId: createdAgentId })} className="px-5 py-2.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm shadow-md transition-colors">Открыть в конструкторе</button>
                            <button onClick={restartWizard} className="px-5 py-2.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Создать ещё одного</button>
                        </div>
                    )}

                    <div ref={messagesEndRef}></div>
                </div>
            </div>

            {isTextPhase && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#f8f9fc] dark:from-darkBg via-[#f8f9fc] dark:via-darkBg to-transparent pt-10 px-3 sm:px-4 md:px-8 pb-safe z-20">
                    <div className="max-w-2xl mx-auto flex items-end bg-white dark:bg-darkCard rounded-3xl border border-gray-200 dark:border-darkBorder shadow-lg focus-within:ring-4 focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4] transition-all relative">
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTextInput(); } }}
                            onFocus={(e) => {
                                // Даём клавиатуре доанимироваться, затем аккуратно подскролливаем
                                // поле и последнее сообщение в поле зрения — без резкого скачка.
                                setTimeout(() => {
                                    e.target.scrollIntoView({ behavior: 'smooth', block: 'end' });
                                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                                }, 300);
                            }}
                            placeholder={inputPlaceholder}
                            rows={1}
                            className="w-full pl-5 pr-16 py-4 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-28 min-h-[56px] text-[16px]"
                        />
                        <button onClick={submitTextInput} disabled={!inputValue.trim()} className="void-tap-target absolute right-2.5 top-2 bottom-2 aspect-square bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl flex items-center justify-center transition-all shadow-md"><Icons.ArrowUp /></button>
                    </div>
                </div>
            )}

            {showInvoice && createdAgentId && (() => {
                const agentRecord = state.aiAgents.find(a => a.id === createdAgentId);
                if (!agentRecord) return null;
                return (
                    <AgentInvoiceModal
                        state={state}
                        updateState={updateState}
                        agent={agentRecord}
                        onClose={handleInvoiceClose}
                        onPaid={handleInvoicePaid}
                    />
                );
            })()}
        </div>
    );
}
