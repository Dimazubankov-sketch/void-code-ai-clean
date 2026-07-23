import { useState, useEffect, useRef } from 'react';
import { SiteBuilderMenu } from '@/features/sites/SiteBuilderMenu';
import { LOW_BALANCE_THRESHOLD } from '@/shared/config/agents';
import { PLAN_LABEL, SITE_BLOCK_TYPES, SITE_LIMIT_LABEL, computeSiteEditFee, computeSitePrice, getSiteBlockType, getSiteLimit } from '@/shared/config/sites';
import { todayKey } from '@/shared/lib/date';
import { formatMoney, formatPrice } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function SiteBuilderView({ state, updateState }) {
    // Хаб выбора способа сборки убран: вход в конструктор сайтов сразу открывает
    // конструктор макета (editor). Чат-режим доступен из меню внутри редактора.
    const [screen, setScreen] = useState(() => state.siteBuilderStartInChat ? 'chat' : 'editor'); // editor | chat | preview | menu
    const [showSiteMenu, setShowSiteMenu] = useState(false);
    const [device, setDevice] = useState('desktop');    // вкладка макета в редакторе
    const [draft, setDraft] = useState(() => state.siteBuilderStartInChat ? null : newDraft());           // черновик до сохранения
    const [showSaveWarn, setShowSaveWarn] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [generating, setGenerating] = useState(false);
    const [editingBlockId, setEditingBlockId] = useState(null); // блок, который сейчас редактируется в макете
    const [dragType, setDragType] = useState(null);      // тип блока, который тащат из библиотеки слева
    const [dragIndex, setDragIndex] = useState(null);    // индекс существующего блока, который переставляют
    const [dropHintIndex, setDropHintIndex] = useState(null);
    const [showMobileBlockPicker, setShowMobileBlockPicker] = useState(false);
    const [blockSearch, setBlockSearch] = useState('');
    const chatEndRef = useRef(null);

    // Пришли из чата-мастера («для ленивых») с уже созданным сайтом —
    // разово открываем чат правок и гасим флаг, чтобы не мешал в будущем.
    useEffect(() => {
        if (state.siteBuilderStartInChat) updateState({ siteBuilderStartInChat: false });
    }, []);

    const sites = state.sites || [];
    const activeSite = sites.find(s => s.id === state.activeSiteId) || null;
    const tk = todayKey();
    const usedToday = state.sitesCreatedDate === tk ? (state.sitesCreatedCount || 0) : 0;
    const dailyLimit = getSiteLimit(state.userPlan);

    const patchSite = (id, patch) => updateState({
        sites: (state.sites || []).map(s => s.id === id ? { ...s, ...patch } : s)
    });

    useEffect(() => {
        if (screen === 'chat' && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [screen, activeSite && activeSite.chat && activeSite.chat.length, generating]);

    // ---------- helpers ----------
    function newDraft() {
        return {
        id: 'site_' + Date.now(),
        name: 'Мой сайт',
        createdAt: Date.now(),
        layoutDesktop: [
            { id: 'b' + Date.now(), type: 'hero', title: 'Первый экран', desc: '' }
        ],
        layoutMobile: [
            { id: 'bm' + Date.now(), type: 'hero', title: 'Первый экран', desc: '' }
        ],
        status: 'awaiting_payment',
        editApplied: 0,
        editsLeft: 3,
        editsLeftPaid: 0,
        paidEditsApplied: 0,
        paid: false,
        generated: false,
        chat: []
        };
    }

    const currentLayoutKey = device === 'desktop' ? 'layoutDesktop' : 'layoutMobile';

    const updateDraftLayout = (mutator) => setDraft(d => {
        const list = mutator([...(d[currentLayoutKey] || [])]);
        return { ...d, [currentLayoutKey]: list };
    });

    const addBlock = (type = 'about', atIndex = null) => {
        const newBlock = { id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6), type, title: '', desc: '' };
        updateDraftLayout(list => {
            const copy = [...list];
            const idx = (atIndex === null || atIndex === undefined) ? copy.length : Math.max(0, Math.min(atIndex, copy.length));
            copy.splice(idx, 0, newBlock);
            return copy;
        });
        setEditingBlockId(newBlock.id);
        return newBlock.id;
    };
    const removeBlock = (id) => { updateDraftLayout(list => list.filter(b => b.id !== id)); if (editingBlockId === id) setEditingBlockId(null); };
    const moveBlock = (idx, dir) => updateDraftLayout(list => {
        const j = idx + dir;
        if (j < 0 || j >= list.length) return list;
        const copy = [...list];
        [copy[idx], copy[j]] = [copy[j], copy[idx]];
        return copy;
    });
    const reorderBlock = (fromIdx, toIdx) => updateDraftLayout(list => {
        if (fromIdx === toIdx || fromIdx == null || toIdx == null) return list;
        const copy = [...list];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, moved);
        return copy;
    });
    const setBlockField = (id, field, value) => updateDraftLayout(list =>
        list.map(b => b.id === id ? { ...b, [field]: value } : b));

    // Отзеркалить макет: скопировать блоки с одного устройства на другое —
    // чтобы не собирать одинаковый макет дважды. Если пользователь всё же
    // хочет разные макеты — можно продолжить редактировать их отдельно
    // после копирования, сама возможность вести два разных макета никуда
    // не пропадает.
    const mirrorLayout = (fromKey, toKey) => {
        const source = draft[fromKey] || [];
        if (source.length === 0) return;
        const fromLabel = fromKey === 'layoutDesktop' ? 'ПК' : 'телефона';
        const toLabel = toKey === 'layoutDesktop' ? 'ПК' : 'телефона';
        if (!confirm(`Скопировать макет с ${fromLabel} на макет для ${toLabel}? Текущий макет для ${toLabel} будет заменён.`)) return;
        const cloned = source.map(b => ({ ...b, id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6) }));
        setDraft(d => ({ ...d, [toKey]: cloned }));
        setEditingBlockId(null);
    };

    const draftPrice = draft ? computeSitePrice(draft) : 0;

    const startNewSite = () => {
        if (usedToday >= dailyLimit) {
            alert('На сегодня лимит на создание сайтов исчерпан (' + usedToday + ' из ' + SITE_LIMIT_LABEL[state.userPlan] + '). Лимит обновится завтра — либо перейдите на более высокий тариф.');
            return;
        }
        setDraft(newDraft());
        setDevice('desktop');
        setEditingBlockId(null);
        setScreen('editor');
    };

    const confirmSave = () => {
        const site = {
            ...draft,
            price: computeSitePrice(draft),
            chat: [{ role: 'bot', text: 'Привет! Я ИИ, который ведёт ваш сайт «' + (draft.name || 'Мой сайт') + '». Макет получил. Опишите правки текстом — я обновлю смету. До оплаты доступно 3 правки, каждая влияет на итоговую стоимость. Когда будете готовы — нажмите «Сгенерировать превью», а затем оплатите, чтобы забрать код и права.' }]
        };
        const count = state.sitesCreatedDate === tk ? (state.sitesCreatedCount || 0) : 0;
        updateState({
            sites: [site, ...(state.sites || [])],
            activeSiteId: site.id,
            sitesCreatedCount: count + 1,
            sitesCreatedDate: tk
        });
        setShowSaveWarn(false);
        setScreen('chat');
    };

    const sendEdit = () => {
        const txt = chatInput.trim();
        if (!txt || !activeSite) return;
        const isPaidSession = activeSite.paid;
        const attemptsLeft = isPaidSession ? (activeSite.editsLeftPaid || 0) : (activeSite.editsLeft || 0);
        if (attemptsLeft <= 0) return;
        const nextEditApplied = (activeSite.editApplied || 0) + 1;
        const patch = {
            editApplied: nextEditApplied,
            generated: false,
            chat: [...(activeSite.chat || []), { role: 'user', text: txt }]
        };
        if (isPaidSession) {
            patch.editsLeftPaid = attemptsLeft - 1;
            patch.paidEditsApplied = (activeSite.paidEditsApplied || 0) + 1;
        } else {
            patch.editsLeft = attemptsLeft - 1;
        }
        const newSite = { ...activeSite, ...patch };
        const newPrice = isPaidSession ? computeSiteEditFee(newSite) : computeSitePrice(newSite);
        patch.price = newPrice;
        const leftAfter = attemptsLeft - 1;
        const ack = isPaidSession
            ? ('Правку принял и учёл в макете. Стоимость правок этой сессии: ' + formatPrice(newPrice) + ' ₽. Осталось правок: ' + leftAfter + (leftAfter === 0 ? '. Правки закончились — оплатите их, чтобы забрать обновлённый сайт.' : '.'))
            : ('Готово, учёл правку и обновил смету. Текущий счёт: ' + formatPrice(newPrice) + ' ₽. Осталось бесплатных правок: ' + leftAfter + (leftAfter === 0 ? '. Дальнейшие изменения — после оплаты.' : '.'));
        patch.chat = [...patch.chat, { role: 'bot', text: ack }];
        patchSite(activeSite.id, patch);
        setChatInput('');
    };

    const generatePreview = () => {
        if (!activeSite || generating) return;
        setGenerating(true);
        setTimeout(() => {
            patchSite(activeSite.id, {
                generated: true,
                chat: [...(activeSite.chat || []), { role: 'bot', text: 'Готово — превью сайта собрано. Откройте его кнопкой «Смотреть превью». Внешний вид доступен сразу, а код и полные права откроются после оплаты.' }]
            });
            setGenerating(false);
        }, 1800);
    };

    const paySite = () => {
        if (!activeSite) return;
        const price = computeSitePrice(activeSite);
        const balance = state.walletBalance || 0;
        if (balance < price) {
            if (confirm('На балансе кошелька ' + formatMoney(balance) + ' ₽, а нужно ' + formatPrice(price) + ' ₽. Перейти в кошелёк, чтобы пополнить баланс?')) {
                updateState({ currentView: 'wallet' });
            }
            return;
        }
        const now = Date.now();
        updateState({
            walletBalance: balance - price,
            walletTransactions: [{ id: 'tx' + now, type: 'purchase', amount: -price, description: 'Покупка сайта «' + (activeSite.name || 'Мой сайт') + '»', timestamp: now }, ...(state.walletTransactions || [])],
            sites: (state.sites || []).map(s => s.id === activeSite.id ? {
                ...s, paid: true, status: 'paid', price, editsLeftPaid: 3, paidEditsApplied: 0, generated: true,
                chat: [...(s.chat || []), { role: 'bot', text: 'Оплата прошла ✓ Права на сайт и весь код теперь ваши — код открыт в превью, его можно скачать. Нужны доработки? В истории у сайта появилась иконка карандаша: 3 правки за сессию, дешевле создания.' }]
            } : s)
        });
        setScreen('preview');
    };

    const applyPaidEdits = () => {
        if (!activeSite) return;
        const fee = computeSiteEditFee(activeSite);
        const balance = state.walletBalance || 0;
        if (balance < fee) {
            if (confirm('Стоимость правок ' + formatPrice(fee) + ' ₽, на балансе ' + formatMoney(balance) + ' ₽. Перейти в кошелёк?')) {
                updateState({ currentView: 'wallet' });
            }
            return;
        }
        const now = Date.now();
        updateState({
            walletBalance: balance - fee,
            walletTransactions: [{ id: 'tx' + now, type: 'purchase', amount: -fee, description: 'Правки сайта «' + (activeSite.name || 'Мой сайт') + '»', timestamp: now }, ...(state.walletTransactions || [])],
            sites: (state.sites || []).map(s => s.id === activeSite.id ? {
                ...s, generated: true, paidEditsApplied: 0,
                chat: [...(s.chat || []), { role: 'bot', text: 'Правки оплачены и внесены ✓ Обновлённый сайт готов — смотрите превью и скачивайте код. Хотите продолжить редактирование — откройте сайт по значку карандаша, чтобы получить ещё 3 правки.' }]
            } : s)
        });
        setScreen('preview');
    };

    const openEditSession = (site) => {
        patchSite(site.id, { editsLeftPaid: 3, paidEditsApplied: 0 });
        updateState({ activeSiteId: site.id });
        setScreen('chat');
    };

    const deleteSite = (id) => {
        if (!confirm('Удалить этот сайт из истории? Действие необратимо.')) return;
        updateState({ sites: (state.sites || []).filter(s => s.id !== id), activeSiteId: state.activeSiteId === id ? null : state.activeSiteId });
    };

    const downloadSiteCode = (site) => {
        const sections = (site.layoutDesktop || []).map(b => {
            const t = getSiteBlockType(b.type);
            return '  <section class="' + b.type + '">\n    <!-- ' + t.label + (b.title ? ' — ' + b.title : '') + ' -->\n    <h2>' + (b.title || t.label) + '</h2>\n' + (b.desc ? '    <p>' + b.desc + '</p>\n' : '') + '  </section>';
        }).join('\n\n');
        const html = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + (site.name || 'Сайт') + '</title>\n</head>\n<body>\n' + sections + '\n<' + '/body>\n<' + '/html>';
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (site.name || 'site').replace(/\s+/g, '-').toLowerCase() + '.html';
        a.click();
        URL.revokeObjectURL(url);
    };

    // ---------- маленькие UI-хелперы ----------
    const StatusBadge = ({ site }) => site.paid
        ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 whitespace-nowrap">Оплачен</span>
        : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 whitespace-nowrap">Ждёт оплаты</span>;

    const TopBar = ({ title, onBack, right }) => (
        <div className="flex items-center gap-2 pl-2 sm:pl-3 md:pl-4 pr-3 sm:pr-4 md:pr-6 py-2.5 sm:py-3 bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder flex-shrink-0 z-30">
            <button onClick={onBack} className="void-tap-target p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
                <Icons.ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0"><Icons.Globe className="w-5 h-5" /></div>
                <h1 className="font-extrabold text-sm sm:text-base md:text-lg dark:text-white truncate">{title}</h1>
            </div>
            {right}
        </div>
    );

    // ---------- экран: главное меню ----------
    const renderMenu = () => (
        <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden">
            <TopBar title="Конструктор сайтов" onBack={() => goBack(state, updateState, 'home')} right={
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <button onClick={() => updateState({ currentView: 'wallet' })} title="Кошелёк" className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${(state.walletBalance || 0) < LOW_BALANCE_THRESHOLD ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                        <Icons.Wallet className="w-3.5 h-3.5" /> {formatMoney(state.walletBalance || 0)} ₽
                    </button>
                    <button onClick={() => updateState({ currentView: 'wallet' })} title="Кошелёк" className={`sm:hidden void-tap-target p-2.5 rounded-xl transition-colors ${(state.walletBalance || 0) < LOW_BALANCE_THRESHOLD ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                        <Icons.Wallet className="w-4.5 h-4.5" />
                    </button>
                    <button onClick={() => setShowSiteMenu(true)} className="void-tap-target p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder transition-colors"><Icons.TwoLines className="w-5 h-5" /></button>
                </div>
            } />
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
                <div className="max-w-3xl mx-auto space-y-6">
                    <div className="text-center pt-1 pb-1">
                        <h2 className="text-2xl sm:text-3xl font-extrabold dark:text-white tracking-tight mb-2">Соберите сайт — а ИИ его напишет</h2>
                        <p className="text-sm sm:text-base text-gray-400 max-w-lg mx-auto leading-relaxed">Выберите, как удобнее: собрать макет из блоков самому или ответить на вопросы бота в чате.</p>
                        <p className="text-xs text-gray-400 mt-2 font-medium">Сегодня создано {usedToday} из {SITE_LIMIT_LABEL[state.userPlan]} на тарифе {PLAN_LABEL[state.userPlan] || 'Free'}</p>
                    </div>

                    {/* Хаб выбора способа сборки — вместо пустой фиолетовой рамки */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div onClick={startNewSite} className="void-tap-target bg-white dark:bg-darkCard p-5 sm:p-6 rounded-[1.75rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                            <div style={{ animationDelay: '0ms' }} className="void-icon-pop w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center mb-4"><Icons.LayoutDashboard className="w-6 h-6 sm:w-7 sm:h-7" /></div>
                            <h3 className="font-extrabold text-base sm:text-lg dark:text-white mb-1">Конструктор макета</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">Соберите сайт из блоков сами: перетаскивайте их на реальный макет и описывайте, что где разместить.</p>
                            <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-[#5b32d4] dark:text-purple-400">Создать макет <Icons.ChevronRight className="w-4 h-4" /></span>
                        </div>
                        <div onClick={() => updateState({ currentView: 'site-chat-builder' })} className="void-tap-target bg-white dark:bg-darkCard p-5 sm:p-6 rounded-[1.75rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                            <div style={{ animationDelay: '80ms' }} className="void-icon-pop w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4"><Icons.MessageSquare className="w-6 h-6 sm:w-7 sm:h-7" /></div>
                            <h3 className="font-extrabold text-base sm:text-lg dark:text-white mb-1">Сайт в чате</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">Не хочется собирать блоки — бот спросит, что нужно, а макет соберётся по вашим ответам.</p>
                            <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-teal-600 dark:text-teal-400">Собрать в чате <Icons.ChevronRight className="w-4 h-4" /></span>
                        </div>
                    </div>

                    {sites.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-extrabold text-lg dark:text-white">Недавние сайты</h3>
                                <button onClick={() => setShowSiteMenu(true)} className="text-sm font-bold text-[#5b32d4] dark:text-purple-400 hover:underline">Вся история</button>
                            </div>
                            <div className="space-y-2.5">
                                {sites.slice(0, 3).map(s => (
                                    <div key={s.id} onClick={() => { updateState({ activeSiteId: s.id }); setScreen('chat'); }} className="void-tap-target flex items-center gap-3 bg-white dark:bg-darkCard p-4 rounded-2xl border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                                        <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0"><Icons.Globe className="w-5 h-5" /></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-sm dark:text-white truncate">{s.name || 'Мой сайт'}</div>
                                            <div className="text-xs text-gray-400">{(s.layoutDesktop || []).length} блоков · {formatPrice(s.paid ? (s.price || computeSitePrice(s)) : computeSitePrice(s))} ₽</div>
                                        </div>
                                        <StatusBadge site={s} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // ---------- экран: редактор макета ----------
    const renderEditor = () => {
        if (!draft) { setScreen('menu'); return null; }
        const list = draft[currentLayoutKey] || [];
        const filteredBlockTypes = SITE_BLOCK_TYPES.filter(t => t.label.toLowerCase().includes(blockSearch.trim().toLowerCase()));

        const clearDrag = () => { setDragType(null); setDragIndex(null); setDropHintIndex(null); };
        const dropAt = (targetIdx) => (e) => {
            e.preventDefault();
            if (dragType) addBlock(dragType, targetIdx);
            else if (dragIndex !== null && dragIndex !== undefined) reorderBlock(dragIndex, targetIdx);
            clearDrag();
        };

        const BlockLibraryList = ({ isMobile }) => (
            <div className="space-y-1.5">
                {filteredBlockTypes.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Ничего не найдено</p>}
                {filteredBlockTypes.map(t => {
                    const IconComp = Icons[t.icon] || Icons.Code;
                    return (
                        <div
                            key={t.id}
                            draggable={!isMobile}
                            onDragStart={(e) => { setDragType(t.id); e.dataTransfer.effectAllowed = 'copy'; }}
                            onDragEnd={clearDrag}
                            onClick={() => { addBlock(t.id); if (isMobile) setShowMobileBlockPicker(false); }}
                            title={t.hint}
                            className="void-tap-target group flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-[#5b32d4]/30 hover:bg-[#efecf9] dark:hover:bg-purple-900/20 cursor-grab active:cursor-grabbing transition-colors"
                        >
                            <div className="w-9 h-9 rounded-lg bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><IconComp className="w-5 h-5" /></div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold dark:text-white truncate">{t.label}</div>
                                <div className="text-[11px] text-gray-400 truncate">{t.hint}</div>
                            </div>
                            <Icons.Plus className="w-4 h-4 text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    );
                })}
            </div>
        );

        const renderBlockCard = (b, idx) => {
            const t = getSiteBlockType(b.type);
            const IconComp = Icons[t.icon] || Icons.Code;
            const isHero = b.type === 'hero';
            const isEditing = editingBlockId === b.id;
            const showDropHint = dropHintIndex === idx && (dragType || (dragIndex !== null && dragIndex !== idx));
            return (
                <div key={b.id}>
                    {showDropHint && <div className="h-1.5 rounded-full bg-[#5b32d4] mx-3 my-1 fade-in" />}
                    <div
                        draggable
                        onDragStart={(e) => { setDragIndex(idx); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={clearDrag}
                        onDragOver={(e) => { e.preventDefault(); setDropHintIndex(idx); }}
                        onDrop={dropAt(idx)}
                        className={`group relative overflow-hidden border-b last:border-0 border-gray-100 dark:border-darkBorder transition-shadow ${isEditing ? 'ring-4 ring-[#5b32d4]/15 ring-inset z-10' : ''}`}
                    >
                        {/* controls overlay */}
                        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button onClick={() => setEditingBlockId(isEditing ? null : b.id)} className="void-tap-target p-1.5 rounded-lg bg-white/95 dark:bg-darkCard/95 backdrop-blur border border-gray-200 dark:border-darkBorder text-gray-600 dark:text-gray-300 hover:text-[#5b32d4] shadow-sm"><Icons.Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0} className="void-tap-target p-1.5 rounded-lg bg-white/95 dark:bg-darkCard/95 backdrop-blur border border-gray-200 dark:border-darkBorder text-gray-600 dark:text-gray-300 disabled:opacity-30 shadow-sm"><Icons.ChevronDown className="w-3.5 h-3.5 rotate-180" /></button>
                            <button onClick={() => moveBlock(idx, 1)} disabled={idx === list.length - 1} className="void-tap-target p-1.5 rounded-lg bg-white/95 dark:bg-darkCard/95 backdrop-blur border border-gray-200 dark:border-darkBorder text-gray-600 dark:text-gray-300 disabled:opacity-30 shadow-sm"><Icons.ChevronDown className="w-3.5 h-3.5" /></button>
                            <button onClick={() => removeBlock(b.id)} disabled={list.length <= 1} className="void-tap-target p-1.5 rounded-lg bg-white/95 dark:bg-darkCard/95 backdrop-blur border border-gray-200 dark:border-darkBorder text-red-400 disabled:opacity-30 shadow-sm"><Icons.Trash className="w-3.5 h-3.5" /></button>
                        </div>
                        {/* индекс + ручка перетаскивания */}
                        <div className={`absolute top-2.5 left-2.5 z-10 flex items-center gap-1 cursor-grab active:cursor-grabbing ${isHero ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}`}>
                            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold ${isHero ? 'bg-white/15' : 'bg-black/5 dark:bg-white/10'}`}>{idx + 1}</span>
                            <Icons.Grip className="w-4 h-4 opacity-60" />
                        </div>

                        {/* визуальный блок — реальный вид сайта */}
                        <div onClick={() => setEditingBlockId(isEditing ? null : b.id)} className={`cursor-pointer px-5 sm:px-8 py-9 sm:py-11 text-center transition-colors ${isHero ? 'bg-gradient-to-br from-[#1a0b38] to-[#4a26b0] text-white' : (idx % 2 ? 'bg-gray-50 dark:bg-[#181820]' : 'bg-white dark:bg-darkCard')} ${isEditing ? '' : 'hover:brightness-[0.98]'}`}>
                            <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2 ${isHero ? 'text-purple-300' : 'text-[#5b32d4] dark:text-purple-400'}`}><IconComp className="w-3 h-3" /> {t.label}</div>
                            <div className={`font-extrabold ${isHero ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg text-gray-900 dark:text-white'}`}>{b.title || t.label}</div>
                            {b.desc ? (
                                <div className={`text-sm mt-1.5 max-w-md mx-auto ${isHero ? 'text-purple-100' : 'text-gray-500 dark:text-gray-400'}`}>{b.desc}</div>
                            ) : (
                                <div className={`text-xs mt-1.5 italic ${isHero ? 'text-purple-300/70' : 'text-gray-300 dark:text-gray-600'}`}>Нажмите, чтобы описать блок</div>
                            )}
                            {b.type === 'services' && <div className="grid grid-cols-3 gap-2 mt-4 max-w-sm mx-auto">{[0, 1, 2].map(k => <div key={k} className="h-10 rounded-xl bg-gray-200/70 dark:bg-gray-700/40" />)}</div>}
                            {b.type === 'gallery' && <div className="grid grid-cols-4 gap-2 mt-4 max-w-sm mx-auto">{[0, 1, 2, 3].map(k => <div key={k} className="h-9 rounded-lg bg-gray-200/70 dark:bg-gray-700/40" />)}</div>}
                            {b.type === 'form' && <div className="mt-4 space-y-2 max-w-xs mx-auto">{[0, 1].map(k => <div key={k} className="h-8 rounded-lg bg-gray-200/70 dark:bg-gray-700/40" />)}<div className="h-8 rounded-lg bg-[#5b32d4]/70" /></div>}
                            {isHero && <div className="inline-block mt-4 px-5 py-2 rounded-xl bg-white/90 text-[#1a0b38] text-xs sm:text-sm font-bold">Кнопка</div>}
                        </div>

                        {/* инлайн-редактирование блока */}
                        {isEditing && (
                            <div className="p-4 sm:p-5 bg-white dark:bg-darkCard border-t border-gray-100 dark:border-darkBorder space-y-2.5 fade-in">
                                <select value={b.type} onChange={e => setBlockField(b.id, 'type', e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm font-semibold dark:text-white focus:outline-none focus:border-[#5b32d4]">
                                    {SITE_BLOCK_TYPES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                                <input value={b.title} onChange={e => setBlockField(b.id, 'title', e.target.value)} placeholder="Заголовок блока (необязательно)" className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                                <textarea value={b.desc} onChange={e => setBlockField(b.id, 'desc', e.target.value)} placeholder={'Опишите блок: ' + t.hint} rows={2} className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4] resize-none" />
                                <button onClick={() => setEditingBlockId(null)} className="void-tap-target w-full py-2.5 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 font-bold text-sm hover:bg-[#e0dbf4] transition-colors flex items-center justify-center gap-1.5"><Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-300" /> Готово</button>
                            </div>
                        )}
                    </div>
                </div>
            );
        };

        return (
            <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden">
                <TopBar title="Макет сайта" onBack={() => goBack(state, updateState, 'home')} right={
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <div className="flex items-center gap-0.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            {[['desktop', Icons.Monitor, 'Макет для ПК'], ['mobile', Icons.Smartphone, 'Макет для телефона']].map(([key, Ic, label]) => (
                                <button key={key} onClick={() => setDevice(key)} title={label} className={`void-tap-target p-2 rounded-lg transition-colors ${device === key ? 'bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400 shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}>
                                    <Ic className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => mirrorLayout(device === 'desktop' ? 'layoutMobile' : 'layoutDesktop', currentLayoutKey)}
                            title={device === 'desktop' ? 'Скопировать макет с телефона на ПК' : 'Скопировать макет с ПК на телефон'}
                            className="void-tap-target p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                        >
                            <Icons.Mirror className="w-4 h-4" />
                        </button>
                        <div className="hidden sm:flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-[#5b32d4] dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-3 py-1.5 rounded-xl whitespace-nowrap">
                            <Icons.Wallet className="w-4 h-4" /> {formatPrice(draftPrice)} ₽
                        </div>
                    </div>
                } />

                <div className="flex-1 flex overflow-hidden">
                    {/* Библиотека блоков — перетаскиваются на макет (десктоп) */}
                    <div className="hidden md:flex w-72 flex-shrink-0 bg-white dark:bg-darkCard border-r border-gray-100 dark:border-darkBorder flex-col overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-darkBorder flex-shrink-0">
                            <div className="font-extrabold text-sm dark:text-white mb-1">Блоки</div>
                            <p className="text-xs text-gray-400 mb-3 leading-relaxed">Перетащите блок на макет справа или нажмите, чтобы добавить в конец.</p>
                            <div className="relative">
                                <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>
                                <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)} placeholder="Поиск блоков..." className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 scrollbar-hide"><BlockLibraryList isMobile={false} /></div>
                    </div>

                    {/* Канва — реальный макет сайта */}
                    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                        <div className="max-w-2xl mx-auto space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">Название сайта</label>
                                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Например: Лендинг для кофейни" className="w-full p-3.5 bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder rounded-2xl text-sm font-semibold dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                            </div>

                            {/* Вкладки: два макета — под ПК и под телефон (мобильная версия шапки) */}
                            <div className="flex gap-2 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl md:hidden">
                                {[['desktop', 'ПК', Icons.Monitor], ['mobile', 'Телефон', Icons.Smartphone]].map(([key, label, Ic]) => (
                                    <button key={key} onClick={() => setDevice(key)} className={`void-tap-target flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${device === key ? 'bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                                        <Ic className="w-4 h-4" /> {label}
                                        <span className="text-[10px] font-bold opacity-70">{(draft[key === 'desktop' ? 'layoutDesktop' : 'layoutMobile'] || []).length}</span>
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => mirrorLayout(device === 'desktop' ? 'layoutMobile' : 'layoutDesktop', currentLayoutKey)} className="md:hidden void-tap-target w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">
                                <Icons.Mirror className="w-3.5 h-3.5" /> {device === 'desktop' ? 'Скопировать макет с телефона' : 'Скопировать макет с ПК'}
                            </button>
                            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed ml-1">Это реальный макет сайта — так он будет устроен. Нажмите на блок, чтобы описать его; блоки можно перетаскивать из библиотеки и менять местами прямо на макете. Не хотите собирать два разных макета — отзеркальте один из них кнопкой выше.</p>

                            {/* Реальный визуальный макет */}
                            <div className="rounded-[1.75rem] overflow-hidden border border-gray-200 dark:border-darkBorder shadow-lg bg-white dark:bg-darkCard">
                                {list.map((b, idx) => renderBlockCard(b, idx))}
                            </div>

                            {/* Зона добавления блока в конец макета */}
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDropHintIndex(list.length); }}
                                onDrop={dropAt(list.length)}
                                className={`rounded-2xl border-2 border-dashed transition-colors ${dropHintIndex === list.length && (dragType || dragIndex !== null) ? 'border-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/10' : 'border-gray-200 dark:border-gray-700'}`}
                            >
                                <button onClick={() => setShowMobileBlockPicker(true)} className="md:hidden void-tap-target w-full py-3.5 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-[#5b32d4] transition-colors flex items-center justify-center gap-2">
                                    <Icons.Plus className="w-5 h-5" /> Добавить блок
                                </button>
                                <div className="hidden md:flex items-center justify-center gap-2 py-4 text-xs font-semibold text-gray-400">
                                    <Icons.Plus className="w-4 h-4" /> Перетащите блок сюда, чтобы добавить в конец
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Нижняя панель: счёт + сохранить */}
                <div className="flex-shrink-0 border-t border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard px-4 sm:px-6 py-3.5 flex items-center gap-3">
                    <div className="min-w-0">
                        <div className="text-[11px] text-gray-400 font-semibold">Счёт за сайт</div>
                        <div className="font-extrabold text-lg dark:text-white leading-none">{formatPrice(draftPrice)} ₽</div>
                    </div>
                    <button onClick={() => setShowSaveWarn(true)} className="void-tap-target ml-auto bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold px-6 py-3 rounded-2xl transition-colors shadow-md text-sm whitespace-nowrap">Сохранить макет</button>
                </div>

                {showSaveWarn && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in" onClick={() => setShowSaveWarn(false)}>
                        <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-[2rem] p-6 sm:p-7 shadow-2xl border border-gray-100 dark:border-darkBorder" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-2xl flex items-center justify-center mb-4"><Icons.Info className="w-6 h-6" /></div>
                            <h3 className="text-xl font-extrabold mb-2 dark:text-white">Перед сохранением</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">После сохранения дальнейшие правки вносятся через чат с ИИ, который будет вести ваш сайт. До оплаты доступно <b className="dark:text-gray-200">3 правки</b>, и каждая влияет на итоговую стоимость. Продолжить?</p>
                            <div className="flex gap-2.5">
                                <button onClick={() => setShowSaveWarn(false)} className="void-tap-target flex-1 py-3 rounded-2xl font-bold text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Отмена</button>
                                <button onClick={confirmSave} className="void-tap-target flex-1 py-3 rounded-2xl font-bold text-sm bg-[#5b32d4] text-white hover:bg-[#4a26b0] transition-colors">Сохранить</button>
                            </div>
                        </div>
                    </div>
                )}

                {showMobileBlockPicker && (
                    <div className="md:hidden fixed inset-0 z-50 flex items-end">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileBlockPicker(false)}></div>
                        <div className="relative bg-white dark:bg-darkCard w-full max-h-[75vh] rounded-t-3xl overflow-hidden flex flex-col fade-in pb-safe">
                            <div className="p-4 border-b border-gray-100 dark:border-darkBorder flex items-center justify-between flex-shrink-0">
                                <h3 className="font-extrabold dark:text-white">Добавить блок</h3>
                                <button onClick={() => setShowMobileBlockPicker(false)} className="void-tap-target p-2 text-gray-400"><Icons.X /></button>
                            </div>
                            <div className="p-4 border-b border-gray-100 dark:border-darkBorder flex-shrink-0">
                                <div className="relative">
                                    <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>
                                    <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)} placeholder="Поиск блоков..." className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4"><BlockLibraryList isMobile={true} /></div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ---------- экран: чат с ИИ (правки) ----------
    const renderChat = () => {
        if (!activeSite) { setScreen('menu'); return null; }
        const isPaid = activeSite.paid;
        const attemptsLeft = isPaid ? (activeSite.editsLeftPaid || 0) : (activeSite.editsLeft || 0);
        const price = isPaid ? computeSiteEditFee(activeSite) : computeSitePrice(activeSite);
        const attemptsExhausted = attemptsLeft <= 0;
        return (
            <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden relative">
                <TopBar title={activeSite.name || 'Мой сайт'} onBack={() => setScreen('menu')} right={
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge site={activeSite} />
                    </div>
                } />
                {/* Строка со сметой и попытками */}
                <div className="flex-shrink-0 px-4 sm:px-6 py-2.5 bg-white/70 dark:bg-darkCard/70 border-b border-gray-100 dark:border-darkBorder flex items-center gap-3 text-xs sm:text-sm">
                    <span className="font-bold text-gray-500 dark:text-gray-400">{isPaid ? 'Правки:' : 'Счёт:'}</span>
                    <span className="font-extrabold text-[#5b32d4] dark:text-purple-400">{formatPrice(price)} ₽</span>
                    <span className="ml-auto font-semibold text-gray-400">Осталось правок: {attemptsLeft}/3</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 pb-40 sm:pb-36">
                    <div className="max-w-2xl mx-auto space-y-4">
                        {(activeSite.chat || []).map((m, i) => (
                            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse ml-auto' : ''}`} style={{ maxWidth: '90%', marginLeft: m.role === 'user' ? 'auto' : 0 }}>
                                {m.role === 'bot' && <div className="w-8 h-8 rounded-full bg-[#efecf9] dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-0.5 border border-purple-100 dark:border-purple-900/50 text-[#5b32d4] dark:text-purple-400"><Icons.Robot className="w-5 h-5" /></div>}
                                <div className={`p-3.5 rounded-3xl shadow-sm text-sm leading-relaxed ${m.role === 'user' ? 'bg-[#5b32d4] text-white rounded-tr-sm' : 'bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-gray-800 dark:text-gray-100 rounded-tl-sm'}`}>{m.text}</div>
                            </div>
                        ))}

                        {generating && (
                            <div className="flex gap-2.5" style={{ maxWidth: '90%' }}>
                                <div className="w-8 h-8 rounded-full bg-[#efecf9] dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-0.5 border border-purple-100 dark:border-purple-900/50 text-[#5b32d4] dark:text-purple-400"><Icons.Robot className="w-5 h-5" /></div>
                                <div className="p-3.5 rounded-3xl rounded-tl-sm bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#5b32d4] animate-pulse" /> Собираю превью сайта…
                                </div>
                            </div>
                        )}

                        {/* Кнопки действий */}
                        <div className="flex flex-wrap gap-2.5 pt-1">
                            <button onClick={generatePreview} disabled={generating} className="void-tap-target bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 font-bold py-2.5 px-4 rounded-2xl text-sm hover:bg-[#e0dbf4] transition-colors flex items-center gap-2 disabled:opacity-50">
                                <Icons.Sparkles /> {activeSite.generated ? 'Пересобрать превью' : 'Сгенерировать превью'}
                            </button>
                            {activeSite.generated && (
                                <button onClick={() => setScreen('preview')} className="void-tap-target bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-gray-700 dark:text-gray-200 font-bold py-2.5 px-4 rounded-2xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2">
                                    <Icons.Eye className="w-4 h-4" /> Смотреть превью
                                </button>
                            )}
                        </div>
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* Ввод правки — закреплён внизу и плавно уезжает вместе с клавиатурой */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#f8f9fc] dark:from-darkBg via-[#f8f9fc]/95 dark:via-darkBg/95 to-transparent pt-8 border-t border-gray-100 dark:border-darkBorder px-4 sm:px-6 pb-safe z-20">
                    <div className="max-w-2xl mx-auto">
                        {attemptsExhausted ? (
                            <div className="flex items-center gap-2.5 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl mb-3">
                                <Icons.Lock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 font-semibold leading-relaxed">{isPaid ? 'Правки закончились — все 3 доступные правки этой сессии использованы. Оплатите их, чтобы забрать обновлённый сайт с внесёнными изменениями.' : 'Бесплатные правки закончились и не восстанавливаются. Дальнейшие изменения — только после оплаты сайта.'}</p>
                            </div>
                        ) : (
                            <div className="flex items-end gap-2 mb-3">
                                <textarea
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEdit(); } }}
                                    onFocus={(e) => { setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'end' }); chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 300); }}
                                    placeholder="Опишите правку: что изменить в сайте…"
                                    rows={1}
                                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-darkBorder rounded-2xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4] resize-none max-h-28"
                                />
                                <button onClick={sendEdit} disabled={!chatInput.trim()} className="void-tap-target aspect-square p-3 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-2xl transition-colors flex items-center justify-center"><Icons.Send /></button>
                            </div>
                        )}
                        {isPaid ? (
                            <button onClick={applyPaidEdits} className="void-tap-target w-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-3.5 rounded-2xl transition-colors shadow-md text-sm flex items-center justify-center gap-2">
                                <Icons.Wallet className="w-5 h-5" /> {attemptsExhausted ? 'Оплатить и забрать результат' : 'Применить правки'} за {formatPrice(price)} ₽
                            </button>
                        ) : (
                            <button onClick={paySite} className="void-tap-target w-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-3.5 rounded-2xl transition-colors shadow-md text-sm flex items-center justify-center gap-2">
                                <Icons.Wallet className="w-5 h-5" /> Оплатить и забрать сайт — {formatPrice(price)} ₽
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ---------- экран: превью ----------
    const renderPreview = () => {
        if (!activeSite) { setScreen('menu'); return null; }
        const paid = activeSite.paid;
        const blocks = activeSite.layoutDesktop || [];
        const price = computeSitePrice(activeSite);
        return (
            <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden">
                <TopBar title={'Превью — ' + (activeSite.name || 'Мой сайт')} onBack={() => setScreen('chat')} right={<StatusBadge site={activeSite} />} />
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                    <div className="max-w-2xl mx-auto space-y-5">
                        {/* Визуальное превью — макет виден всегда */}
                        <div className="rounded-[1.5rem] overflow-hidden border border-gray-200 dark:border-darkBorder shadow-lg bg-white">
                            {blocks.map((b, i) => {
                                const t = getSiteBlockType(b.type);
                                const isHero = b.type === 'hero';
                                return (
                                    <div key={b.id} className={`px-5 py-8 border-b border-gray-100 last:border-0 ${isHero ? 'bg-gradient-to-br from-[#1a0b38] to-[#4a26b0] text-white text-center py-12' : (i % 2 ? 'bg-gray-50' : 'bg-white')}`}>
                                        <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isHero ? 'text-purple-300' : 'text-[#5b32d4]'}`}>{t.label}</div>
                                        <div className={`font-extrabold ${isHero ? 'text-2xl' : 'text-lg text-gray-900'}`}>{b.title || t.label}</div>
                                        {b.desc && <div className={`text-sm mt-1.5 ${isHero ? 'text-purple-100' : 'text-gray-500'}`}>{b.desc}</div>}
                                        {b.type === 'services' && <div className="grid grid-cols-3 gap-2 mt-4">{[0, 1, 2].map(k => <div key={k} className="h-14 rounded-xl bg-gray-200/70" />)}</div>}
                                        {b.type === 'gallery' && <div className="grid grid-cols-4 gap-2 mt-4">{[0, 1, 2, 3].map(k => <div key={k} className="h-12 rounded-lg bg-gray-200/70" />)}</div>}
                                        {b.type === 'form' && <div className="mt-4 space-y-2 max-w-xs mx-auto">{[0, 1].map(k => <div key={k} className="h-9 rounded-lg bg-gray-200/70" />)}<div className="h-9 rounded-lg bg-[#5b32d4]/70" /></div>}
                                        {isHero && <div className="inline-block mt-4 px-5 py-2 rounded-xl bg-white/90 text-[#1a0b38] text-sm font-bold">Кнопка</div>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Код и права — под замком до оплаты */}
                        {paid ? (
                            <div className="bg-white dark:bg-darkCard border border-green-200 dark:border-green-900/40 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400 font-extrabold"><Icons.Check className="w-5 h-5" /> Права на сайт и код переданы вам</div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">Сайт полностью ваш — скачайте исходный код и используйте как угодно.</p>
                                <button onClick={() => downloadSiteCode(activeSite)} className="void-tap-target w-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-3.5 rounded-2xl transition-colors shadow-md text-sm flex items-center justify-center gap-2"><Icons.Download className="w-5 h-5" /> Скачать код сайта</button>
                            </div>
                        ) : (
                            <div className="relative bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder rounded-2xl p-5 overflow-hidden">
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-white/60 dark:bg-darkCard/60 backdrop-blur-md z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center mb-3"><Icons.Lock className="w-6 h-6" /></div>
                                    <p className="font-bold dark:text-white mb-1">Код и права под замком</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-xs leading-relaxed">Внешний вид можно смотреть свободно. Исходный код и полные права на сайт открываются после оплаты.</p>
                                    <button onClick={paySite} className="void-tap-target bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-3 px-6 rounded-2xl transition-colors shadow-md text-sm flex items-center gap-2"><Icons.Wallet className="w-5 h-5" /> Оплатить {formatPrice(price)} ₽</button>
                                </div>
                                <pre className="text-xs text-gray-400 leading-relaxed select-none blur-[3px] font-mono overflow-hidden max-h-48">{'<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <title>' + (activeSite.name || 'Сайт') + '</title>\n</head>\n<body>\n  <section class="hero"> … </section>\n  <section class="content"> … </section>\n  <footer> … </footer>\n<' + '/body>\n<' + '/html>'}</pre>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ---------- экран: история ----------
    if (screen === 'editor') return renderEditor();
    if (screen === 'chat') return renderChat();
    if (screen === 'preview') return renderPreview();
    return (
        <>
            {renderMenu()}
            <SiteBuilderMenu
                open={showSiteMenu}
                onClose={() => setShowSiteMenu(false)}
                sites={sites}
                usedToday={usedToday}
                dailyLimit={dailyLimit}
                userPlan={state.userPlan}
                onNewSite={() => { setShowSiteMenu(false); startNewSite(); }}
                onOpenSite={(s) => { updateState({ activeSiteId: s.id }); setScreen('chat'); setShowSiteMenu(false); }}
                onEditSite={(s) => { openEditSession(s); setShowSiteMenu(false); }}
                onDeleteSite={deleteSite}
                onRenameSite={(id, name) => patchSite(id, { name })}
                onOpenSettings={() => updateState({ currentView: 'settings' })}
            />
        </>
    );
}
