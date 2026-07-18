import { useState, useEffect, useRef } from 'react';
import { SITE_BLOCK_TYPES, SITE_LIMIT_LABEL, getSiteBlockType, getSiteLimit } from '@/shared/config/sites';
import { todayKey } from '@/shared/lib/date';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// ЧАТ-МАСТЕР СБОРКИ САЙТА («для ленивых»)
// Альтернатива ручной сборке макета: шаблонный бот по шагам спрашивает,
// какие блоки нужны и что в них разместить, а затем собирает такой же
// сайт, что и обычный конструктор — с теми же 3 правками до оплаты.
// ==========================================
export function SiteChatBuilderView({ state, updateState }) {
    const messagesEndRef = useRef(null);
    const [messages, setMessages] = useState([
        { id: 'm0', role: 'bot', text: 'Привет! Я соберу сайт вместе с вами — не нужно вручную перетаскивать блоки, просто отвечайте на вопросы. Как назовём сайт?' }
    ]);
    const [phase, setPhase] = useState('ask_name'); // ask_name -> ask_blocks -> describe_blocks -> summary -> done
    const [siteName, setSiteName] = useState('');
    const [selectedTypes, setSelectedTypes] = useState(['hero', 'about', 'form']);
    const [queue, setQueue] = useState([]);
    const [collected, setCollected] = useState([]); // [{type, title, desc}]
    const [inputValue, setInputValue] = useState('');
    const [createdSiteId, setCreatedSiteId] = useState(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, phase]);

    const tk = todayKey();
    const usedToday = state.sitesCreatedDate === tk ? (state.sitesCreatedCount || 0) : 0;
    const dailyLimit = getSiteLimit(state.userPlan);

    const addBotMessage = (text) => setMessages(prev => [...prev, { id: 'm' + Date.now() + Math.random(), role: 'bot', text }]);
    const addUserMessage = (text) => setMessages(prev => [...prev, { id: 'm' + Date.now() + Math.random(), role: 'user', text }]);

    // ---------- Шаг 1: имя сайта ----------
    const submitName = (value) => {
        const name = value.trim();
        if (!name) return;
        addUserMessage(name);
        setSiteName(name);
        setInputValue('');
        setTimeout(() => {
            addBotMessage('Отлично, «' + name + '»! Какие блоки нужны на сайте? Выберите всё подходящее и нажмите «Готово».');
            setPhase('ask_blocks');
        }, 300);
    };

    // ---------- Шаг 2: какие блоки нужны (мультивыбор) ----------
    const toggleType = (id) => setSelectedTypes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const confirmBlocks = () => {
        if (selectedTypes.length === 0) return;
        const labels = selectedTypes.map(id => getSiteBlockType(id).label);
        addUserMessage(labels.join(', '));
        const q = [...selectedTypes];
        setQueue(q);
        setCollected([]);
        setTimeout(() => {
            const first = getSiteBlockType(q[0]);
            addBotMessage('Начнём с блока «' + first.label + '» — ' + first.hint.toLowerCase() + '. Опишите, что в нём разместить:');
            setPhase('describe_blocks');
        }, 300);
    };

    // ---------- Шаг 3: описание каждого блока по очереди ----------
    const submitBlockDescription = (value) => {
        const text = value.trim();
        if (!text) return;
        addUserMessage(text);
        setInputValue('');
        const [current, ...rest] = queue;
        const newCollected = [...collected, { type: current, title: '', desc: text }];
        setCollected(newCollected);
        setQueue(rest);
        setTimeout(() => {
            if (rest.length > 0) {
                const next = getSiteBlockType(rest[0]);
                addBotMessage('Дальше — «' + next.label + '» (' + next.hint.toLowerCase() + '). Опишите блок:');
            } else {
                addBotMessage('Все блоки описаны — вот что получилось. Нажмите «Собрать сайт», чтобы ИИ подготовил макет.');
                setPhase('summary');
            }
        }, 300);
    };

    // ---------- Сборка сайта из собранных ответов ----------
    const handleCreateSite = () => {
        if (usedToday >= dailyLimit) {
            alert('На сегодня лимит на создание сайтов исчерпан (' + usedToday + ' из ' + SITE_LIMIT_LABEL[state.userPlan] + '). Лимит обновится завтра — либо перейдите на более высокий тариф.');
            return;
        }
        const now = Date.now();
        const makeIds = () => collected.map(b => ({ id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6), type: b.type, title: b.title, desc: b.desc }));
        const layoutDesktop = makeIds();
        const layoutMobile = makeIds();
        const newSite = {
            id: 'site_' + now,
            name: siteName || 'Мой сайт',
            createdAt: now,
            layoutDesktop, layoutMobile,
            status: 'awaiting_payment',
            editApplied: 0, editsLeft: 3, editsLeftPaid: 0, paidEditsApplied: 0,
            paid: false, generated: false,
            chat: [{ role: 'bot', text: 'Привет! Я ИИ, который ведёт ваш сайт «' + (siteName || 'Мой сайт') + '». Собрал макет по нашему диалогу в чате — один и тот же макет установлен и под ПК, и под телефон, при желании их можно развести по-разному. Опишите правки текстом — я обновлю смету. До оплаты доступно 3 правки, каждая влияет на итоговую стоимость. Когда будете готовы — нажмите «Сгенерировать превью», а затем оплатите, чтобы забрать код и права.' }]
        };
        const countToday = state.sitesCreatedDate === tk ? (state.sitesCreatedCount || 0) : 0;
        updateState({
            sites: [newSite, ...(state.sites || [])],
            activeSiteId: newSite.id,
            sitesCreatedCount: countToday + 1,
            sitesCreatedDate: tk,
            currentView: 'site-builder',
            siteBuilderStartInChat: true
        });
        setCreatedSiteId(newSite.id);
        addBotMessage('Готово! Открываю сайт в конструкторе — там же чат с ИИ и 3 правки до оплаты.');
        setPhase('done');
    };

    const isTextPhase = phase === 'ask_name' || phase === 'describe_blocks';
    const inputPlaceholder = phase === 'ask_name' ? 'Например: Лендинг для кофейни' : 'Опишите, что разместить в блоке...';
    const submitTextInput = () => {
        if (phase === 'ask_name') submitName(inputValue);
        else if (phase === 'describe_blocks') submitBlockDescription(inputValue);
    };

    return (
        <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden relative">
            <div className="flex items-center gap-3 px-3 sm:px-4 md:px-6 py-3 bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder flex-shrink-0 z-30">
                <button onClick={() => goBack(state, updateState, 'site-builder')} title="Назад в конструктор сайтов" className="void-tap-target p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
                    <Icons.ChevronLeft className="w-6 h-6" />
                </button>
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0"><Icons.Globe className="w-5 h-5" /></div>
                <div className="min-w-0">
                    <h1 className="font-extrabold text-[13px] sm:text-base dark:text-white truncate">Сайт в чате</h1>
                    <p className="text-xs text-gray-400 truncate">Соберём сайт вместе, по шагам</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-8 py-6 pb-32 sm:pb-28">
                <div className="max-w-2xl mx-auto space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            {msg.role === 'bot' && <div className="w-8 h-8 rounded-full bg-[#efecf9] dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-0.5 border border-purple-100 dark:border-purple-900/50 text-[#5b32d4] dark:text-purple-400"><Icons.Robot className="w-5 h-5" /></div>}
                            <div className={`p-3.5 rounded-3xl shadow-sm text-sm leading-relaxed max-w-[85%] ${msg.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm' : 'bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-gray-800 dark:text-gray-100 rounded-tl-sm'}`}>{msg.text}</div>
                        </div>
                    ))}

                    {phase === 'ask_blocks' && (
                        <div className="pl-0 sm:pl-11 fade-in space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {SITE_BLOCK_TYPES.map(t => {
                                    const active = selectedTypes.includes(t.id);
                                    const IconComp = Icons[t.icon] || Icons.Code;
                                    return (
                                        <button key={t.id} onClick={() => toggleType(t.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-semibold transition-colors ${active ? 'bg-[#efecf9] dark:bg-purple-900/30 border-[#5b32d4] text-[#5b32d4] dark:text-purple-300' : 'bg-white dark:bg-darkCard border-gray-200 dark:border-darkBorder text-gray-700 dark:text-gray-200 hover:border-[#5b32d4] hover:text-[#5b32d4]'}`}>
                                            <IconComp className="w-3.5 h-3.5" /> {t.label}
                                            {active && <Icons.Check className="w-3.5 h-3.5" />}
                                        </button>
                                    );
                                })}
                            </div>
                            <button onClick={confirmBlocks} disabled={selectedTypes.length === 0} className="px-5 py-2.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm shadow-md transition-colors">
                                Готово, дальше →
                            </button>
                        </div>
                    )}

                    {phase === 'summary' && (
                        <div className="pl-0 sm:pl-11 fade-in">
                            <div className="bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-sm p-5 space-y-3">
                                <h3 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.Globe className="w-5 h-5 text-[#5b32d4]" /> {siteName || 'Мой сайт'}</h3>
                                <div className="text-sm space-y-2 text-gray-600 dark:text-gray-300">
                                    {collected.map((b, i) => {
                                        const t = getSiteBlockType(b.type);
                                        return <p key={i}><span className="font-bold text-gray-400">{t.label}:</span> {b.desc}</p>;
                                    })}
                                </div>
                                <button onClick={handleCreateSite} className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold shadow-md transition-colors">
                                    <Icons.Sparkles /> Собрать сайт
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'done' && (
                        <div className="pl-0 sm:pl-11 fade-in">
                            <button onClick={() => updateState({ currentView: 'site-builder', activeSiteId: createdSiteId, siteBuilderStartInChat: true })} className="px-5 py-2.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm shadow-md transition-colors">Открыть сайт</button>
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
                            onFocus={(e) => { setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'end' }); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 300); }}
                            placeholder={inputPlaceholder}
                            rows={1}
                            className="w-full pl-5 pr-16 py-4 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-28 min-h-[56px] text-[16px]"
                        />
                        <button onClick={submitTextInput} disabled={!inputValue.trim()} className="void-tap-target absolute right-2.5 top-2 bottom-2 aspect-square bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl flex items-center justify-center transition-all shadow-md"><Icons.ArrowUp /></button>
                    </div>
                </div>
            )}
        </div>
    );
}
