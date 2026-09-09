import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { BANKS, getBanks, getCurrency, formatCurrency, convertPrice } from '@/shared/config/banks';
import { formatMoney, formatPrice } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { createBackendPayment } from '@/shared/api/billing';
import { Icons } from '@/shared/ui/Icons';
import { ShaderCard } from '@/shared/ui/ShaderCard';


export function PricingView({ state, updateState }) {
    const lang = state.lang || 'ru';
    const currency = getCurrency(lang);
    const banks = getBanks(lang);
    // Цена в валюте выбранного языка (для отображения).
    const money = (rub) => formatCurrency(rub, lang);
    // GSAP: вход на экран «Тарифы» — каскадное появление header → tabs →
    // body → footer. Живёт в одном scope, чистится автоматически (useGSAP).
    const plansScope = useRef(null);
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !plansScope.current) return;
        // Только для нового экрана тарифов (не для checkout — там своя верстка).
        if (!plansScope.current.querySelector('.void-pv-head')) return;
        gsap.fromTo(
            ['.void-pv-head', '.void-pv-body', '.void-pv-foot'],
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08 });
    }, { scope: plansScope, dependencies: [] });

    // GSAP: смена тарифа (Free/Pro/Ultra) или периода — плавный crossfade
    // содержимого панели + мягкий stagger по пунктам, без резкого jump.
    // Зависит от viewedPlan+billingCycle: React пересобирает тело по key,
    // а GSAP анимирует его новое появление.
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !plansScope.current) return;
        const body = plansScope.current.querySelector('.void-pv-body');
        if (!body) return;
        const tl = gsap.timeline();
        tl.fromTo(body, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.34, ease: 'power2.out' });
        tl.fromTo(body.querySelectorAll('.void-pv-feat'),
            { autoAlpha: 0, x: -10 },
            { autoAlpha: 1, x: 0, duration: 0.28, ease: 'power2.out', stagger: 0.035 }, '-=0.2');
    }, { scope: plansScope, dependencies: [state.viewedPlan, state.userPlan, state.billingCycle, lang] });
    // Локальные поля формы оплаты. Пока пользователь не заполнит их
    // корректно, кнопка "Оплатить" не пускает его дальше — тариф
    // не активируется и currentView не переключается.
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [paymentErrors, setPaymentErrors] = useState({});
    // Состояние создания платежа ЮKassa (редирект на страницу оплаты).
    const [payBusy, setPayBusy] = useState(false);
    const [payError, setPayError] = useState(null);

    // ==========================================
    // СКАНЕР КАРТЫ ЧЕРЕЗ КАМЕРУ
    // ==========================================
    const [showScanner, setShowScanner] = useState(false);
    const [scanStatus, setScanStatus] = useState('requesting'); // requesting -> scanning -> done
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanTimeoutRef = useRef(null);

    const stopCameraStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (scanTimeoutRef.current) {
            clearTimeout(scanTimeoutRef.current);
            scanTimeoutRef.current = null;
        }
    };

    const closeScanner = () => {
        stopCameraStream();
        setShowScanner(false);
        setScanStatus('requesting');
    };

    // Отключаем камеру, если пользователь уходит с экрана оплаты
    useEffect(() => () => stopCameraStream(), []);

    const openCardScanner = async () => {
        if (state.selectedMethod !== 'card') return;
        setShowScanner(true);
        setScanStatus('requesting');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            setScanStatus('scanning');
            // Даём React отрендерить <video>, затем подключаем поток
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            }, 50);

            // Имитируем распознавание карты камерой (в реальном сервисе здесь
            // работал бы OCR по видеопотоку) — через ~2.5с "находим" карту.
            scanTimeoutRef.current = setTimeout(() => {
                const digits = Array.from({ length: 16 }, (_, i) => i === 0 ? '4' : Math.floor(Math.random() * 10)).join('');
                const formatted = digits.match(/.{1,4}/g).join(' ');
                const now = new Date();
                const expMonth = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
                const expYear = String((now.getFullYear() + 2 + Math.floor(Math.random() * 3)) % 100).padStart(2, '0');

                setCardNumber(formatted);
                setCardExpiry(`${expMonth}/${expYear}`);
                setPaymentErrors(prev => ({ ...prev, cardNumber: null, cardExpiry: null }));
                setScanStatus('done');
                scanTimeoutRef.current = setTimeout(() => closeScanner(), 900);
            }, 2500);
        } catch (err) {
            setShowScanner(false);
            alert('Не удалось получить доступ к камере. Проверьте разрешения браузера или введите данные карты вручную.');
        }
    };

    const validateCard = () => {
        const errors = {};
        const digits = cardNumber.replace(/\s+/g, '');
        if (!/^\d{16,19}$/.test(digits)) errors.cardNumber = 'Введите корректный номер карты (16 цифр)';
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry.trim())) errors.cardExpiry = 'Формат ММ/ГГ';
        if (!/^\d{3,4}$/.test(cardCvc.trim())) errors.cardCvc = 'Введите CVC (3-4 цифры)';
        return errors;
    };

    // Оплата через ЮKassa: создаём платёж на сервере и перенаправляем на
    // защищённую страницу оплаты. Активация подписки произойдёт после
    // возврата (App.jsx опросит статус) или по вебхуку — здесь мы НЕ трогаем
    // userPlan (никаких фейковых активаций).
    const startPayment = async () => {
        if (!state.user) { updateState({ showAuthModal: true, authTab: 'register' }); return; }
        setPayBusy(true);
        setPayError(null);
        try {
            const { confirmationUrl, paymentId } = await createBackendPayment(
                state.checkoutPlan.id,
                state.billingCycle === 'year' ? 'YEAR' : 'MONTH',
            );
            if (confirmationUrl) {
                // Запоминаем платёж, чтобы после возврата с ЮKassa опросить
                // его статус и активировать подписку (см. App.jsx).
                try { localStorage.setItem('void_pending_payment', paymentId || ''); } catch { /* noop */ }
                window.location.href = confirmationUrl;
                return;
            }
            setPayError('Не удалось получить ссылку на оплату. Попробуйте ещё раз.');
        } catch (e) {
            setPayError(e?.message || 'Не удалось создать платёж. Попробуйте ещё раз.');
        } finally {
            setPayBusy(false);
        }
    };

    // Множитель лимитов относительно базового (free): чем выше тариф,
    // тем больше запросов в день/неделю (см. PLAN_LIMITS в models.jsx).
    //   Plus  ×2   (500₽/мес)
    //   Pro   ×5   (1500₽/мес)
    //   Ultra ×10  (8000₽/мес)
    const PRICING_PLANS = [
        { id: 'free', title: 'Free', subtitle: 'Бесплатный доступ. Идеально для знакомства с Void Code AI и базовых задач.', priceMonth: 0, priceYear: 0, multiplier: 1, features: ["Умный чат с AI", "Обучающие материалы", "Генератор кода", "Генератор картинок", "Стандартная скорость", "Базовые модели AI", "Голосовой режим: быстрая модель", "Создание своего голоса: недоступно", "Агентский режим: 1 агент"] },
        { id: 'pro', title: 'Pro', subtitle: 'Максимум возможностей для разработчиков, фрилансеров и команд.', priceMonth: 1200, oldPriceMonth: 1500, priceYear: 15000, multiplier: 5, features: ["Множитель лимитов ×5 (в 5 раз больше запросов)", "Генератор кода - увелич. лимит", "Генератор картинок - увелич. лимит", "Генератор видео", "Максимальная скорость ответов", "Приоритетная поддержка", "Доступ к самым мощным моделям", "Голосовой режим: премиальные модели повышенного качества", "Создание своего голоса: до 3 в день", "Уровень рассуждений Max", "Агентский режим: до 10 агентов и 1 оркестратор"] },
        { id: 'pro_plus', title: 'Ultra', subtitle: 'Максимальные мощности для компаний и масштабных проектов.', priceMonth: 8000, priceYear: 80000, multiplier: 10, features: ["Множитель лимитов ×10 (в 10 раз больше запросов)", "Всё из тарифа Pro", "Максимальные лимиты на код и картинки", "Генератор видео", "Доступ к самым мощным моделям", "Приоритетная поддержка", "Максимальная скорость", "Голосовой режим: премиальные модели, углублённые рассуждения на сложных темах", "Создание своего голоса: до 6 в день", "Уровень рассуждений Max", "Агентский режим: до 20 агентов и 3 оркестратора"] }
    ];

    if (state.checkoutPlan) {
        const price = state.billingCycle === 'month' ? state.checkoutPlan.priceMonth : state.checkoutPlan.priceYear;
        const period = state.billingCycle === 'month' ? 'в месяц' : 'в год';
        const feats = (state.checkoutPlan.features || []).slice(0, 6);
        return (
            <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
                <div className="px-4 py-8 max-w-lg mx-auto">
                    <div className="flex items-center mb-8 gap-3">
                        <button onClick={() => updateState({ checkoutPlan: null })} className="w-10 h-10 flex items-center justify-center -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                        <h2 className="text-2xl font-extrabold dark:text-white">Оформление подписки</h2>
                    </div>
                    <div className="bg-white dark:bg-darkCard rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm p-6 mb-5">
                        <div className="flex items-center justify-between gap-4 pb-5 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-2xl bg-[#5b32d4]/10 text-[#5b32d4] flex items-center justify-center shrink-0"><Icons.Sparkles className="w-5 h-5" /></div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-extrabold dark:text-white truncate">{state.checkoutPlan.title}</h3>
                                    <p className="text-xs text-gray-400">{period === 'в месяц' ? 'Ежемесячно' : 'Годовая подписка'}</p>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-2xl font-extrabold text-[#5b32d4] dark:text-purple-400">{money(price)}</p>
                                <p className="text-xs text-gray-500">/ {period.replace('в ', '')}</p>
                            </div>
                        </div>
                        <div className="pt-5 space-y-2.5">
                            {feats.map((f, i) => (
                                <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                                    <Icons.Check className="w-4 h-4 mt-0.5 shrink-0 text-[#5b32d4] dark:text-purple-400" /> <span>{f}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={startPayment} disabled={payBusy} className="w-full py-4 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-60 text-white font-bold rounded-2xl shadow-lg transition-colors text-lg flex items-center justify-center gap-2">
                        {payBusy ? <><Icons.Spinner className="w-5 h-5 animate-spin" /> Создаём платёж…</> : `Оплатить ${money(price)}`}
                    </button>
                    {payError && <p className="text-sm text-red-500 font-semibold mt-3 text-center">{payError}</p>}
                    <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed">
                        Оплата на защищённой странице ЮKassa (карта, СБП и другие способы). Данные карты вводятся на стороне ЮKassa - мы их не видим и не храним.
                    </p>
                </div>
            </div>
        );
    }

    // ==========================================
    // НОВЫЙ ЭКРАН «ТАРИФЫ» (single-plan view с табами Free|Pro|Ultra)
    // ==========================================
    // Показываем ОДИН тариф за раз, переключаемый сегмент-табами сверху —
    // как на присланных макетах. Какой тариф сейчас просматривается,
    // держим в state.viewedPlan (по умолчанию — текущий тариф юзера, чтобы
    // человек сразу видел «свой» экран). Отдельно от userPlan: viewedPlan —
    // это «на что смотрю», userPlan — «что оплачено».
    const TAB_ORDER = ['free', 'pro', 'pro_plus'];
    const viewedId = TAB_ORDER.includes(state.viewedPlan) ? state.viewedPlan : (state.userPlan || 'free');
    const viewed = PRICING_PLANS.find(p => p.id === viewedId) || PRICING_PLANS[0];

    // Ранги для логики доступности: понизиться нельзя.
    const rank = { free: 0, pro: 2, pro_plus: 3 };
    const currentRank = rank[state.userPlan] ?? 0;

    // Метаданные конкретного тарифа (цена, состояние CTA) — вычисляются
    // на лету для КАЖДОЙ карточки, чтобы один и тот же рендер работал и
    // в мобильном одиночном виде, и в десктопной таблице из трёх колонок.
    const planMeta = (plan) => {
        const price = state.billingCycle === 'month' ? plan.priceMonth : plan.priceYear;
        const isCurrent = plan.id === state.userPlan;
        const isLower = (rank[plan.id] ?? 0) < currentRank;
        const isFree = plan.id === 'free';
        let ctaLabel, ctaDisabled, ctaKind;
        if (isCurrent) { ctaLabel = '✓ Текущий тариф'; ctaDisabled = true; ctaKind = 'current'; }
        else if (isLower || isFree) { ctaLabel = 'Недоступно'; ctaDisabled = true; ctaKind = 'muted'; }
        else { ctaLabel = `Перейти на ${plan.title}`; ctaDisabled = false; ctaKind = 'primary'; }
        return { price, isCurrent, isLower, isFree, ctaLabel, ctaDisabled, ctaKind };
    };

    const startCheckout = (plan) => {
        if (!state.user) { updateState({ showAuthModal: true, authTab: 'register' }); return; }
        updateState({ checkoutPlan: plan, paymentStep: 'select', selectedMethod: 'card', selectedBank: 'sber' });
    };

    // Иконка-стикер слева от каждого пункта. Требование: в пределах ОДНОЙ
    // карточки иконки НЕ повторяются (в разных карточках — могут). Поэтому
    // это не чистая функция text→icon (она давала бы одинаковые галочки
    // Icons.Check для непонятных пунктов), а построитель, который ведёт
    // множество уже занятых иконок и при коллизии берёт следующую
    // свободную из запасного пула. Цвет у всех стикеров карточки один
    // (задаётся в разметке), меняется только сам глиф.
    const buildFeatureIcons = (features) => {
        const used = new Set();
        const pool = [Icons.Check, Icons.Star, Icons.Sparkles, Icons.Bolt, Icons.TrendingUp, Icons.Grip, Icons.LayoutDashboard, Icons.Compass, Icons.Flask, Icons.Tag, Icons.Palette, Icons.Send, Icons.Eye, Icons.Clock, Icons.Card];
        const pick = (preferred) => {
            for (const ic of preferred) {
                if (ic && !used.has(ic)) { used.add(ic); return ic; }
            }
            for (const ic of pool) {
                if (ic && !used.has(ic)) { used.add(ic); return ic; }
            }
            return Icons.Check;
        };
        return features.map((text) => {
            const t = text.toLowerCase();
            if (t.includes('видео')) return pick([Icons.Camera, Icons.Play]);
            if (t.includes('голос')) return pick([Icons.Mic, Icons.Waveform, Icons.Volume2]);
            if (t.includes('картин') || t.includes('изображ')) return pick([Icons.Image, Icons.Palette]);
            if (t.includes('код')) return pick([Icons.Code, Icons.PenTool]);
            if (t.includes('скорост')) return pick([Icons.TrendingUp, Icons.Bolt]);
            if (t.includes('поддержк')) return pick([Icons.Headset, Icons.Bell]);
            if (t.includes('множител') || t.includes('лимит')) return pick([Icons.BarChart, Icons.Star]);
            if (t.includes('модел')) return pick([Icons.Sparkles, Icons.Flask]);
            if (t.includes('рассужд')) return pick([Icons.Compass, Icons.Sparkles]);
            if (t.includes('агент') || t.includes('оркестр')) return pick([Icons.Robot, Icons.RobotArmy, Icons.Bot]);
            if (t.includes('чат')) return pick([Icons.MessageSquare]);
            if (t.includes('обучающ')) return pick([Icons.GraduationCap, Icons.Library]);
            if (t.includes('всё из')) return pick([Icons.Check, Icons.Star]);
            return pick([]);
        });
    };

    // Единый общий переключатель периода (месяц/год). Раньше он жил внутри
    // каждой карточки — в десктопной таблице из трёх колонок это выглядело
    // бы как три одинаковых переключателя. Теперь один, в шапке.
    const BillingToggle = ({ className = '' }) => (
        <div className={`bg-gray-100 dark:bg-darkBorder p-1 flex rounded-2xl relative w-[280px] max-w-full ${className}`}>
            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-darkCard rounded-xl shadow-sm transition-transform duration-300 ease-out ${state.billingCycle === 'year' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`} />
            <button onClick={() => updateState({ billingCycle: 'month' })} className={`relative z-10 flex-1 py-2 text-sm font-bold whitespace-nowrap transition-colors ${state.billingCycle === 'month' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>Ежемесячно</button>
            <button onClick={() => updateState({ billingCycle: 'year' })} className={`relative z-10 flex-1 py-2 text-sm font-bold whitespace-nowrap transition-colors ${state.billingCycle === 'year' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>В год -20%</button>
        </div>
    );

    // Единая карточка тарифа — используется и на мобильном (одна, по табам),
    // и на десктопе (три в ряд). featured подсвечивает рекомендуемый тариф.
    const PlanCard = ({ plan, featured = false }) => {
        const { price, ctaLabel, ctaDisabled, ctaKind } = planMeta(plan);
        const icons = buildFeatureIcons(plan.features);
        return (
            <ShaderCard
                light
                bgColor="#ffffff"
                color="#7c4dff"
                color2="#5b32d4"
                opacity={featured ? 0.6 : 0.4}
                className={`h-full flex flex-col p-5 sm:p-6 ${featured ? 'ring-2 ring-[#5b32d4] shadow-xl' : ''}`}
            >
                <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#5b32d4]/20 bg-[#5b32d4]/[0.08] text-[#5b32d4] text-[11px] font-extrabold tracking-wide uppercase">
                        <Icons.Sparkles className="w-3.5 h-3.5" /> Void Code AI
                    </span>
                    {featured && (
                        <span className="bg-[#5b32d4] text-white text-[10px] font-extrabold px-2 py-1 rounded-md uppercase tracking-wide">Популярный</span>
                    )}
                </div>

                <h3 className="text-2xl font-extrabold text-gray-900">{plan.title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{plan.subtitle}</p>

                <div className="h-px bg-[#5b32d4]/12 my-5" />

                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-4xl font-extrabold text-gray-900">{money(price)}</span>
                    {state.billingCycle === 'month' && plan.oldPriceMonth && (
                        <span className="text-xl font-bold text-gray-400 line-through">{money(plan.oldPriceMonth)}</span>
                    )}
                    {price > 0 && (
                        <span className="text-sm text-gray-500 self-end mb-1.5">/ {state.billingCycle === 'month' ? 'мес' : 'год'}</span>
                    )}
                </div>
                {plan.multiplier > 1 && (
                    <div className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#5b32d4]/10 border border-[#5b32d4]/20 text-[#5b32d4] text-xs font-extrabold w-fit">
                        ×{plan.multiplier} лимитов
                    </div>
                )}

                <h4 className="text-sm font-bold mt-6 mb-4 text-gray-900">Что входит:</h4>
                <div className="space-y-3">
                    {plan.features.map((f, i) => {
                        const IconComp = icons[i] || Icons.Check;
                        return (
                            <div key={i} className="void-pv-feat flex items-start gap-3">
                                <div className="mt-0.5 w-7 h-7 rounded-xl bg-[#5b32d4]/10 text-[#5b32d4] flex items-center justify-center flex-shrink-0">
                                    <IconComp className="w-4 h-4" />
                                </div>
                                <div className="text-sm font-medium text-gray-700 leading-snug pt-1">{f}</div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-auto pt-6">
                    <button
                        onClick={() => !ctaDisabled && startCheckout(plan)}
                        disabled={ctaDisabled}
                        onMouseDown={(e) => !ctaDisabled && gsap.to(e.currentTarget, { scale: 0.97, duration: 0.12 })}
                        onMouseUp={(e) => !ctaDisabled && gsap.to(e.currentTarget, { scale: 1, duration: 0.18 })}
                        onMouseLeave={(e) => !ctaDisabled && gsap.to(e.currentTarget, { scale: 1, duration: 0.18 })}
                        className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-colors ${
                            ctaKind === 'primary' ? 'bg-[#5b32d4] text-white hover:bg-[#4a26b0] shadow-lg'
                            : ctaKind === 'current' ? 'bg-green-50 text-green-600 cursor-default'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {ctaLabel}
                    </button>
                </div>
            </ShaderCard>
        );
    };

    return (
        <div ref={plansScope} className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            {/* Шапка: назад + заголовок + общий переключатель периода.
                Табы Free|Pro|Ultra - только на мобильном (md:hidden), на
                десктопе показываем все три тарифа сразу таблицей. */}
            <div className="void-pv-head shrink-0 px-4 pt-4 pb-2 w-full mx-auto max-w-2xl md:max-w-6xl">
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={() => goBack(state, updateState, 'settings')}
                        aria-label="Назад"
                        className="void-pv-x p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                    >
                        <Icons.ChevronLeft className="w-6 h-6" />
                    </button>
                    <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">Тарифы</h2>
                </div>

                {/* Десктоп: переключатель периода по центру над таблицей тарифов */}
                <div className="hidden md:flex justify-center mb-1">
                    <BillingToggle />
                </div>

                {/* Мобильные табы */}
                <div className="md:hidden flex bg-gray-100 dark:bg-darkBorder p-1 rounded-2xl relative">
                    <div
                        className="absolute top-1 bottom-1 bg-white dark:bg-darkCard rounded-xl shadow-sm transition-transform duration-300 ease-out"
                        style={{ width: 'calc(33.333% - 3px)', transform: `translateX(calc(${TAB_ORDER.indexOf(viewedId)} * (100% + 4px)))` }}
                    />
                    {[{ id: 'free', label: 'Free' }, { id: 'pro', label: 'Pro' }, { id: 'pro_plus', label: 'Ultra' }].map(tb => (
                        <button
                            key={tb.id}
                            onClick={() => updateState({ viewedPlan: tb.id })}
                            className={`relative z-10 flex-1 py-2 text-sm font-bold transition-colors ${viewedId === tb.id ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}
                        >
                            {tb.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Мобильный вид: одна карточка по выбранному табу ── */}
            <div className="md:hidden flex-1 overflow-y-auto void-no-scrollbar px-4 pb-5 max-w-2xl w-full mx-auto">
                <div key={`${viewedId}-${state.billingCycle}`} className="void-pv-body h-full flex flex-col gap-4">
                    {!viewed.id.includes('free') && <BillingToggle className="mx-auto" />}
                    <div className="flex-1"><PlanCard plan={viewed} featured={viewed.id === 'pro'} /></div>
                </div>
            </div>

            {/* ── Десктопный вид: три тарифа в ряд ── */}
            <div className="hidden md:block flex-1 overflow-y-auto void-no-scrollbar px-4 pb-8 max-w-6xl w-full mx-auto">
                <div className="void-pv-body grid grid-cols-3 gap-5 items-stretch pt-2">
                    {PRICING_PLANS.map(plan => (
                        <PlanCard key={plan.id} plan={plan} featured={plan.id === 'pro'} />
                    ))}
                </div>
            </div>
        </div>
    );
}