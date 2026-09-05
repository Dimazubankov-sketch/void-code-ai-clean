import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { BANKS, getBanks, getCurrency, formatCurrency, convertPrice } from '@/shared/config/banks';
import { formatMoney, formatPrice } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { subscribeBackend } from '@/shared/api/billing';
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

    const handleConfirmPayment = async () => {
        // Защита: неавторизованный пользователь не может оформить подписку.
        // Просто на случай, если он как-то попал на этот экран без входа.
        if (!state.user) {
            updateState({ showAuthModal: true, authTab: 'register' });
            return;
        }

        const price = state.billingCycle === 'month' ? state.checkoutPlan.priceMonth : state.checkoutPlan.priceYear;

        if (state.selectedMethod === 'wallet') {
            const balance = state.walletBalance || 0;
            if (balance < price) {
                alert(`Недостаточно средств на балансе. Не хватает ${money(price - balance)} — пополните кошелёк и попробуйте снова.`);
                return;
            }
            // Фиксируем подписку на сервере ДО обновления интерфейса:
            // именно серверный user.plan открывает платные зоны.
            try {
                await subscribeBackend(state.checkoutPlan.id, state.billingCycle === 'year' ? 'YEAR' : 'MONTH');
            } catch (e) {
                alert(e?.message || 'Не удалось оформить подписку. Попробуйте ещё раз.');
                return;
            }
            const now = Date.now();
            const acctKey = (state.user?.email || '').trim().toLowerCase();
            updateState({
                walletBalance: balance - price,
                walletTransactions: [{ id: 'tx' + now, type: 'subscription', amount: -price, description: `Подписка ${state.checkoutPlan.title} (${state.billingCycle === 'month' ? 'месяц' : 'год'})`, timestamp: now }, ...(state.walletTransactions || [])],
                userPlan: state.checkoutPlan.id, checkoutPlan: null, currentView: 'settings', usedDailyLimits: 0,
                accountPlans: acctKey ? { ...(state.accountPlans || {}), [acctKey]: state.checkoutPlan.id } : state.accountPlans
            });
            alert('Подписка успешно оформлена и оплачена с баланса кошелька!');
            return;
        }

        let errors = {};
        if (state.selectedMethod === 'card') errors = validateCard();
        // Для СБП дополнительных полей не требуется — банк уже выбран заранее

        if (Object.keys(errors).length > 0) {
            setPaymentErrors(errors);
            return;
        }
        setPaymentErrors({});
        try {
            await subscribeBackend(state.checkoutPlan.id, state.billingCycle === 'year' ? 'YEAR' : 'MONTH');
        } catch (e) {
            alert(e?.message || 'Не удалось оформить подписку. Попробуйте ещё раз.');
            return;
        }
        const acctKey2 = (state.user?.email || '').trim().toLowerCase();
        updateState({
            userPlan: state.checkoutPlan.id, checkoutPlan: null, currentView: 'settings', usedDailyLimits: 0,
            accountPlans: acctKey2 ? { ...(state.accountPlans || {}), [acctKey2]: state.checkoutPlan.id } : state.accountPlans
        });
        alert('Подписка успешно оформлена!');
    };

    // Множитель лимитов относительно базового (free): чем выше тариф,
    // тем больше запросов в день/неделю (см. PLAN_LIMITS в models.jsx).
    //   Plus  ×2   (500₽/мес)
    //   Pro   ×5   (1500₽/мес)
    //   Ultra ×10  (8000₽/мес)
    const PRICING_PLANS = [
        { id: 'free', title: 'Free', subtitle: 'Бесплатный доступ. Идеально для знакомства с Void Code AI и базовых задач.', priceMonth: 0, priceYear: 0, multiplier: 1, features: ["Умный чат с AI", "Обучающие материалы", "Генератор кода", "Генератор картинок", "Стандартная скорость", "Базовые модели AI", "Голосовой режим: быстрая модель", "Создание своего голоса: недоступно", "Агенты: 1 агент"] },
        { id: 'pro', title: 'Pro', subtitle: 'Максимум возможностей для разработчиков, фрилансеров и команд.', priceMonth: 1200, oldPriceMonth: 1500, priceYear: 15000, multiplier: 5, features: ["Множитель лимитов ×5 (в 5 раз больше запросов)", "Генератор кода — увелич. лимит", "Генератор картинок — увелич. лимит", "Максимальная скорость ответов", "Приоритетная поддержка", "Доступ к самым мощным моделям", "Голосовой режим: премиальные модели повышенного качества", "Создание своего голоса: до 3 в день", "Уровень рассуждений Max", "Агенты: до 10 агентов", "Оркестраторы: 1", "Общение с оркестрами через почту"] },
        { id: 'pro_plus', title: 'Ultra', subtitle: 'Максимальные мощности для компаний и масштабных проектов.', priceMonth: 8000, priceYear: 80000, multiplier: 10, features: ["Множитель лимитов ×10 (в 10 раз больше запросов)", "Всё из тарифа Pro", "Максимальные лимиты на код и картинки", "Доступ к самым мощным моделям", "Приоритетная поддержка", "Максимальная скорость", "Голосовой режим: премиальные модели, углублённые рассуждения на сложных темах", "Создание своего голоса: до 6 в день", "Уровень рассуждений Max", "Агенты: до 20 агентов", "Оркестраторы: до 3", "Общение с оркестрами через почту"] }
    ];

    if (state.checkoutPlan) {
        const price = state.billingCycle === 'month' ? state.checkoutPlan.priceMonth : state.checkoutPlan.priceYear;
        const period = state.billingCycle === 'month' ? 'в месяц' : 'в год';

        if (state.paymentStep === 'form') {
            return (
                <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
                    <div className="px-4 py-8 max-w-2xl mx-auto">
                        <div className="flex items-center mb-8 gap-4">
                            <button onClick={() => updateState({paymentStep: 'select'})} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                            <h2 className="text-2xl font-bold dark:text-white">Данные для оплаты</h2>
                        </div>
                        <div className="bg-white dark:bg-darkCard p-8 rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-xl mb-6">
                            <div className="flex justify-between items-center mb-8 border-b border-gray-100 dark:border-gray-800 pb-4">
                                <div>
                                    <p className="text-sm font-bold text-gray-500">Сумма к оплате</p>
                                    <p className="text-3xl font-extrabold text-[#5b32d4] dark:text-purple-400 mt-1">{money(price)} <span className="text-sm text-gray-500 font-medium">/ {period.replace('в ', '')}</span></p>
                                </div>
                                <button
                                    type="button"
                                    onClick={openCardScanner}
                                    disabled={state.selectedMethod !== 'card'}
                                    title={state.selectedMethod === 'card' ? 'Отсканировать карту камерой' : ''}
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${state.selectedMethod === 'card' ? 'bg-purple-50 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 cursor-pointer' : 'bg-purple-50 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 cursor-default'}`}
                                >
                                    {state.selectedMethod === 'card' && <Icons.Card />}
                                    {state.selectedMethod === 'sbp' && <Icons.SBP />}
                                    {state.selectedMethod === 'wallet' && <Icons.Wallet />}
                                </button>
                            </div>

                            {state.selectedMethod === 'card' && (
                                <div className="space-y-4 fade-in">
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-xs font-bold text-gray-500 ml-1 block">Номер карты</label>
                                            <button type="button" onClick={openCardScanner} className="flex items-center gap-1 text-xs font-bold text-[#5b32d4] dark:text-purple-400 hover:underline mr-1">
                                                <Icons.Camera className="w-3.5 h-3.5" /> Сканировать камерой
                                            </button>
                                        </div>
                                        <input type="text" value={cardNumber} onChange={e => { setCardNumber(e.target.value); setPaymentErrors(prev => ({...prev, cardNumber: null})); }} placeholder="0000 0000 0000 0000" className={`w-full p-4 bg-gray-50 dark:bg-[#23232f] border rounded-xl dark:text-white font-mono focus:outline-none ${paymentErrors.cardNumber ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                        {paymentErrors.cardNumber && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{paymentErrors.cardNumber}</p>}
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Срок действия</label>
                                            <input type="text" value={cardExpiry} onChange={e => { setCardExpiry(e.target.value); setPaymentErrors(prev => ({...prev, cardExpiry: null})); }} placeholder="ММ/ГГ" className={`w-full p-4 bg-gray-50 dark:bg-[#23232f] border rounded-xl dark:text-white font-mono focus:outline-none ${paymentErrors.cardExpiry ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                            {paymentErrors.cardExpiry && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{paymentErrors.cardExpiry}</p>}
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">CVC</label>
                                            <input type="password" value={cardCvc} onChange={e => { setCardCvc(e.target.value); setPaymentErrors(prev => ({...prev, cardCvc: null})); }} placeholder="•••" className={`w-full p-4 bg-gray-50 dark:bg-[#23232f] border rounded-xl dark:text-white font-mono focus:outline-none ${paymentErrors.cardCvc ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                            {paymentErrors.cardCvc && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{paymentErrors.cardCvc}</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {state.selectedMethod === 'sbp' && (
                                <div className="fade-in space-y-4">
                                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Выберите банк для оплаты</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {banks.map(b => (
                                            <div key={b.id} onClick={() => updateState({selectedBank: b.id})} className={`p-3 border-2 rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${state.selectedBank === b.id ? 'border-[#5b32d4] bg-purple-50 dark:bg-purple-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{backgroundColor: b.bg, color: b.text}}>{b.initial}</div>
                                                <span className="text-xs font-bold dark:text-white text-center">{b.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {state.selectedMethod === 'wallet' && (
                                <div className="fade-in space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Баланс кошелька</span>
                                        <span className={`font-extrabold ${(state.walletBalance || 0) >= price ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{money(state.walletBalance || 0)}</span>
                                    </div>
                                    {(state.walletBalance || 0) < price ? (
                                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 flex gap-3 items-start">
                                            <Icons.Alert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" style={{width:'20px',height:'20px',minWidth:'20px'}} />
                                            <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold leading-relaxed flex-1 min-w-0">Не хватает {money(price - (state.walletBalance || 0))}. Пополните баланс в разделе «Кошелёк» и вернитесь для оплаты.</p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400">С баланса спишется {money(price)}, подписка активируется сразу.</p>
                                    )}
                                </div>
                            )}

                            <button onClick={handleConfirmPayment} className="w-full mt-8 py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors text-lg">
                                {state.selectedMethod === 'sbp' ? 'Оплатить через приложение банка' : state.selectedMethod === 'wallet' ? `Оплатить с баланса ${money(price)}` : `Оплатить ${money(price)}`}
                            </button>
                        </div>
                    </div>

                    {showScanner && (
                        <div className="fixed inset-0 bg-black z-[70] flex flex-col items-center justify-center fade-in">
                            <button onClick={closeScanner} className="void-tap-target absolute top-5 right-5 z-10 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>

                            {scanStatus === 'requesting' && (
                                <div className="text-center px-6">
                                    <Icons.Camera className="w-12 h-12 text-white/70 mx-auto mb-4" />
                                    <p className="text-white font-bold">Запрашиваем доступ к камере...</p>
                                    <p className="text-white/50 text-sm mt-1">Разрешите доступ во всплывающем окне браузера</p>
                                </div>
                            )}

                            {(scanStatus === 'scanning' || scanStatus === 'done') && (
                                <div className="relative w-full h-full flex items-center justify-center">
                                    <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40"></div>
                                    <div className="relative w-[88%] max-w-sm aspect-[1.586/1] rounded-2xl">
                                        <div className={`absolute inset-0 rounded-2xl border-4 transition-colors duration-300 ${scanStatus === 'done' ? 'border-green-400' : 'border-white/80'}`}></div>
                                        <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-[#5b32d4] rounded-tl-2xl"></div>
                                        <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-[#5b32d4] rounded-tr-2xl"></div>
                                        <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-[#5b32d4] rounded-bl-2xl"></div>
                                        <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-[#5b32d4] rounded-br-2xl"></div>
                                        {scanStatus === 'scanning' && <div className="void-img-shimmer absolute left-0 right-0 h-1 rounded-full" style={{ top: '50%' }}></div>}
                                        {scanStatus === 'done' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-2xl">
                                                <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center fade-in"><Icons.Check className="w-7 h-7 text-white" /></div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="absolute bottom-16 left-0 right-0 text-center text-white font-bold px-6">
                                        {scanStatus === 'scanning' ? 'Наведите камеру на карту...' : 'Карта распознана!'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
                <div className="px-4 py-8 max-w-2xl mx-auto">
                    <div className="flex items-center mb-8 gap-4">
                        <button onClick={() => updateState({checkoutPlan: null})} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                        <h2 className="text-2xl font-bold dark:text-white">Оформление подписки</h2>
                    </div>
                    
                    <div className="bg-white dark:bg-darkCard p-6 rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm mb-6 flex justify-between items-center">
                        <div className="flex gap-4 items-center">
                            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center"><Icons.VoidLogo className="w-6 h-6" /></div>
                            <div>
                                <h3 className="text-xl font-bold dark:text-white">{state.checkoutPlan.title}</h3>
                                <span className="bg-[#efecf9] text-[#5b32d4] text-[10px] font-bold px-2 py-1 rounded-md uppercase">Популярный</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-extrabold dark:text-white">{money(price)}</p>
                            <p className="text-xs text-gray-500">{period}</p>
                        </div>
                    </div>

                    <h3 className="text-xl font-bold mb-4 dark:text-white">Способ оплаты</h3>
                    <div className="space-y-3 mb-8">
                        <div onClick={() => updateState({selectedMethod: 'card'})} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${state.selectedMethod === 'card' ? 'border-[#5b32d4] bg-[#efecf9]/50 dark:bg-purple-900/10' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400"><Icons.Card /></div>
                            <div className="flex-1"><div className="font-bold text-[15px] dark:text-white">Банковская карта</div><div className="text-xs text-gray-500">Visa, Mastercard, МИР</div></div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.selectedMethod === 'card' ? 'border-[#5b32d4] bg-[#5b32d4]' : 'border-gray-300 dark:border-gray-600'}`}>{state.selectedMethod === 'card' && <Icons.Check className="w-3 h-3 text-white" />}</div>
                        </div>
                        <div onClick={() => updateState({selectedMethod: 'sbp'})} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${state.selectedMethod === 'sbp' ? 'border-[#5b32d4] bg-[#efecf9]/50 dark:bg-purple-900/10' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400"><Icons.SBP /></div>
                            <div className="flex-1"><div className="font-bold text-[15px] dark:text-white">СБП</div><div className="text-xs text-gray-500">Оплата через Систему быстрых платежей</div></div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.selectedMethod === 'sbp' ? 'border-[#5b32d4] bg-[#5b32d4]' : 'border-gray-300 dark:border-gray-600'}`}>{state.selectedMethod === 'sbp' && <Icons.Check className="w-3 h-3 text-white" />}</div>
                        </div>
                        <div onClick={() => updateState({selectedMethod: 'wallet'})} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${state.selectedMethod === 'wallet' ? 'border-[#5b32d4] bg-[#efecf9]/50 dark:bg-purple-900/10' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400"><Icons.Wallet /></div>
                            <div className="flex-1"><div className="font-bold text-[15px] dark:text-white">Баланс кошелька</div><div className={`text-xs ${(state.walletBalance || 0) >= price ? 'text-gray-500' : 'text-red-500 font-semibold'}`}>Доступно: {money(state.walletBalance || 0)}{(state.walletBalance || 0) < price ? ' — не хватает средств' : ''}</div></div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.selectedMethod === 'wallet' ? 'border-[#5b32d4] bg-[#5b32d4]' : 'border-gray-300 dark:border-gray-600'}`}>{state.selectedMethod === 'wallet' && <Icons.Check className="w-3 h-3 text-white" />}</div>
                        </div>
                    </div>
                    <button onClick={() => updateState({paymentStep: 'form'})} className="w-full py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors text-lg">Продолжить</button>
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
    const isCurrent = viewed.id === state.userPlan;
    const isLower = (rank[viewed.id] ?? 0) < currentRank; // тариф ниже текущего
    const isFree = viewed.id === 'free';

    const price = state.billingCycle === 'month' ? viewed.priceMonth : viewed.priceYear;

    // Текст и состояние главной CTA под смысл ТЗ.
    let ctaLabel, ctaDisabled, ctaKind;
    if (isCurrent) { ctaLabel = '✓ Текущий тариф'; ctaDisabled = true; ctaKind = 'current'; }
    else if (isLower) { ctaLabel = 'Недоступно'; ctaDisabled = true; ctaKind = 'muted'; }
    else if (isFree) { ctaLabel = 'Недоступно'; ctaDisabled = true; ctaKind = 'muted'; }
    else { ctaLabel = `Перейти на ${viewed.title}`; ctaDisabled = false; ctaKind = 'primary'; }

    const handleCta = () => {
        if (ctaDisabled) return;
        if (!state.user) { updateState({ showAuthModal: true, authTab: 'register' }); return; }
        updateState({ checkoutPlan: viewed, paymentStep: 'select', selectedMethod: 'card', selectedBank: 'sber' });
    };

    // Иконка-стикер слева от пункта: подбираем по ключевым словам, чтобы
    // список не был «одинаковыми галочками», а имел смысловые SVG-стикеры.
    const featureIcon = (text) => {
        const t = text.toLowerCase();
        if (t.includes('голос')) return Icons.Mic;
        if (t.includes('картин') || t.includes('изображ')) return Icons.Image;
        if (t.includes('код')) return Icons.Code;
        if (t.includes('скорост')) return Icons.Bolt || Icons.Sparkles;
        if (t.includes('поддержк')) return Icons.Headset;
        if (t.includes('множител') || t.includes('лимит')) return Icons.Star;
        if (t.includes('модел')) return Icons.Sparkles;
        if (t.includes('рассужд')) return Icons.Sparkles;
        if (t.includes('агент') || t.includes('оркестр')) return Icons.Bot || Icons.Sparkles;
        if (t.includes('почт')) return Icons.Mail || Icons.Sparkles;
        if (t.includes('обучающ')) return Icons.Book || Icons.Sparkles;
        return Icons.Check;
    };

    return (
        <div ref={plansScope} className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            {/* ── Шапка: стрелка назад + Void Code по центру / текущий тариф справа ── */}
            <div className="void-pv-head shrink-0 px-4 pt-5 pb-3 max-w-2xl w-full mx-auto">
                <div className="relative flex items-center justify-between h-10">
                    <button
                        onClick={() => goBack(state, updateState, 'settings')}
                        aria-label="Назад"
                        className="void-pv-x p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300 relative z-10"
                    >
                        <Icons.ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="absolute inset-x-0 text-center text-2xl font-extrabold dark:text-white pointer-events-none">Void Code</h1>
                    <span className="text-lg font-bold text-[#5b32d4] dark:text-purple-400 relative z-10">{viewed.title}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-snug text-center">{viewed.subtitle}</p>

                {/* ── Сегмент-табы Free | Pro | Ultra ── */}
                <div className="mt-4 bg-gray-100 dark:bg-darkBorder p-1 flex rounded-2xl relative">
                    <div
                        className="absolute top-1 bottom-1 bg-white dark:bg-darkCard rounded-xl shadow-sm transition-transform duration-300 ease-out"
                        style={{ width: 'calc(33.333% - 3px)', transform: `translateX(calc(${TAB_ORDER.indexOf(viewedId)} * (100% + 4px)))` }}
                    />
                    {[{ id: 'free', label: 'Free' }, { id: 'pro', label: 'Pro' }, { id: 'pro_plus', label: 'Ultra' }].map(t => (
                        <button
                            key={t.id}
                            onClick={() => updateState({ viewedPlan: t.id })}
                            className={`relative z-10 flex-1 py-2.5 text-sm font-bold transition-colors ${viewedId === t.id ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Скроллируемая панель описания тарифа ── */}
            <div className="flex-1 overflow-y-auto px-4 max-w-2xl w-full mx-auto">
                {/* key завязан на viewedId+billingCycle → пересборка = GSAP crossfade */}
                <div key={`${viewedId}-${state.billingCycle}`} className="void-pv-body pb-4">
                    {/* Задача 7: карточка тарифа в стиле ShaderCard — живой
                        WebGL-фон (плазма) в фирменной фиолетово-синей палитре
                        Void. Содержимое (цена, множитель, список фич) и вся
                        логика тарифов НЕ менялись — только визуальная оболочка. */}
                    <ShaderCard className="mt-1 p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/20 bg-white/10 text-white text-[11px] font-extrabold tracking-wide uppercase">
                                <Icons.Sparkles className="w-3.5 h-3.5" /> Void Code AI
                            </span>
                            <span className="text-white/50 text-xs font-bold tracking-widest">{viewed.title}</span>
                        </div>
                        <h3 className="text-2xl font-extrabold text-white">{viewed.title}</h3>
                        <p className="text-sm text-white/60 leading-snug mt-1">{viewed.subtitle}</p>
                        <div className="h-px bg-white/15 my-5" />
                    {/* Бейдж множителя + цена */}
                    <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-4xl font-extrabold text-white">{money(price)}</span>
                            {state.billingCycle === 'month' && viewed.oldPriceMonth && (
                                <span className="text-xl font-bold text-white/40 line-through">{money(viewed.oldPriceMonth)}</span>
                            )}
                            {price > 0 && (
                                <span className="text-sm text-white/50 self-end mb-1.5">/ {state.billingCycle === 'month' ? 'мес' : 'год'}</span>
                            )}
                        </div>
                        {viewed.multiplier > 1 && (
                            <div className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/12 border border-white/20 text-white text-xs font-extrabold">
                                ×{viewed.multiplier} лимитов
                            </div>
                        )}

                        <h4 className="text-sm font-bold mt-6 mb-4 text-white">Что входит:</h4>
                        <div className="space-y-3.5">
                            {viewed.features.map((f, i) => {
                                const IconComp = featureIcon(f);
                                return (
                                    <div key={i} className="void-pv-feat flex items-start gap-3">
                                        <div className="mt-0.5 w-7 h-7 rounded-xl bg-white/12 border border-white/20 text-white flex items-center justify-center flex-shrink-0">
                                            <IconComp className="w-4 h-4" />
                                        </div>
                                        <div className="text-sm font-medium text-white/85 leading-snug pt-1">{f}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </ShaderCard>
                </div>
            </div>

            {/* ── Низ: month/year toggle + CTA + «Условия использования» ── */}
            <div className="void-pv-foot shrink-0 px-4 pt-4 pb-5 max-w-2xl w-full mx-auto border-t border-gray-100 dark:border-darkBorder bg-[#f8f9fc] dark:bg-darkBg">
                {/* Переключатель периода — прячем на Free (там всегда 0 ₽).
                    Сдвинут чуть ниже (mt-1) относительно верхней границы блока. */}
                {!isFree && (
                    <div className="flex justify-center mt-1 mb-4">
                        <div className="bg-gray-100 dark:bg-darkBorder p-1 flex rounded-2xl relative w-full max-w-xs">
                            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-darkCard rounded-xl shadow-sm transition-transform duration-300 ease-out ${state.billingCycle === 'year' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`} />
                            <button onClick={() => updateState({ billingCycle: 'month' })} className={`relative z-10 flex-1 py-2 text-sm font-bold transition-colors ${state.billingCycle === 'month' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>Ежемесячно</button>
                            <button onClick={() => updateState({ billingCycle: 'year' })} className={`relative z-10 flex-1 py-2 text-sm font-bold transition-colors ${state.billingCycle === 'year' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>В год (-20%)</button>
                        </div>
                    </div>
                )}

                {/* CTA — уменьшен и сдвинут чуть ниже (mt-1), чтобы не доминировать над контентом */}
                <div className="flex justify-center mt-1">
                    <button
                        onClick={handleCta}
                        disabled={ctaDisabled}
                        onMouseDown={(e) => !ctaDisabled && gsap.to(e.currentTarget, { scale: 0.97, duration: 0.12 })}
                        onMouseUp={(e) => !ctaDisabled && gsap.to(e.currentTarget, { scale: 1, duration: 0.18 })}
                        onMouseLeave={(e) => !ctaDisabled && gsap.to(e.currentTarget, { scale: 1, duration: 0.18 })}
                        className={`w-full max-w-xs py-2.5 rounded-xl font-bold text-sm transition-colors ${
                            ctaKind === 'primary' ? 'bg-[#5b32d4] text-white hover:bg-[#4a26b0] shadow-lg'
                            : ctaKind === 'current' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 cursor-default'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {ctaLabel}
                    </button>
                </div>

                {/* Единственная ссылка — «Условия использования», по центру, компактно */}
                <div className="flex items-center justify-center mt-3">
                    <button
                        onClick={() => updateState({ currentView: 'info', infoSection: 'terms' })}
                        className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        Условия использования
                    </button>
                </div>
            </div>
        </div>
    );
}
