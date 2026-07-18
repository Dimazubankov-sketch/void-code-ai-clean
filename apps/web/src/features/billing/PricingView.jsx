import { useState, useEffect, useRef } from 'react';
import { BANKS } from '@/shared/config/banks';
import { formatMoney, formatPrice } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function PricingView({ state, updateState }) {
    // Локальные поля формы оплаты. Пока пользователь не заполнит их
    // корректно, кнопка "Оплатить" не пускает его дальше — тариф
    // не активируется и currentView не переключается.
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [cryptoTxId, setCryptoTxId] = useState('');
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

    const validateCrypto = () => {
        const errors = {};
        if (!cryptoTxId.trim() || cryptoTxId.trim().length < 6) {
            errors.cryptoTxId = 'Укажите хэш транзакции или ID перевода после отправки средств';
        }
        return errors;
    };

    const handleConfirmPayment = () => {
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
                alert(`Недостаточно средств на балансе. Не хватает ${formatMoney(price - balance)} ₽ — пополните кошелёк и попробуйте снова.`);
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
        else if (state.selectedMethod === 'crypto') errors = validateCrypto();
        // Для СБП дополнительных полей не требуется — банк уже выбран заранее

        if (Object.keys(errors).length > 0) {
            setPaymentErrors(errors);
            return;
        }
        setPaymentErrors({});
        const acctKey2 = (state.user?.email || '').trim().toLowerCase();
        updateState({
            userPlan: state.checkoutPlan.id, checkoutPlan: null, currentView: 'settings', usedDailyLimits: 0,
            accountPlans: acctKey2 ? { ...(state.accountPlans || {}), [acctKey2]: state.checkoutPlan.id } : state.accountPlans
        });
        alert('Подписка успешно оформлена!');
    };

    const PRICING_PLANS = [
        { id: 'free', title: 'Free', subtitle: 'Бесплатный доступ. Идеально для знакомства с Void Code AI и базовых задач.', priceMonth: 0, priceYear: 0, features: ["Умный чат с AI", "Обучающие материалы", "Генератор кода — до 10 запросов", "Стандартная скорость", "Базовые модели AI", "Конструктор сайтов: 1 сайт/день", "Cockpit: до 3 оркестраторов"] },
        { id: 'plus', title: 'Plus', subtitle: 'Больше мощностей и меньше ограничений для работы с кодом.', priceMonth: 350, priceYear: 3500, features: ["Безлимитный чат", "Генератор кода — до 200 запросов", "Приоритетная скорость", "Доступ к мощным моделям", "Конструктор сайтов: 3 сайта/день", "Cockpit: до 5 оркестраторов"] },
        { id: 'pro', title: 'Pro', subtitle: 'Максимум возможностей для разработчиков, фрилансеров и команд.', priceMonth: 1000, priceYear: 12000, features: ["Безлимитно всё", "Максимальная скорость ответов", "Приоритетная поддержка", "Доступ к самым мощным моделям", "Конструктор сайтов: 5 сложных сайтов/день", "Cockpit: до 10 оркестраторов"] },
        { id: 'pro_plus', title: 'Ultra', subtitle: 'Максимальные мощности и конструктор сайтов на полную — для компаний и масштабных проектов.', priceMonth: 10000, priceYear: 100000, features: ["Всё из тарифа Pro", "Админ-панель и доступы", "Личный менеджер", "API интеграция", "Конструктор сайтов: 8–10 сложных сайтов/день", "Cockpit: до 15 оркестраторов"] }
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
                                    <p className="text-3xl font-extrabold text-[#5b32d4] dark:text-purple-400 mt-1">{formatPrice(price)}₽ <span className="text-sm text-gray-500 font-medium">/ {period.replace('в ', '')}</span></p>
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
                                    {state.selectedMethod === 'crypto' && <Icons.Crypto />}
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
                                        {BANKS.map(b => (
                                            <div key={b.id} onClick={() => updateState({selectedBank: b.id})} className={`p-3 border-2 rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 transition-all ${state.selectedBank === b.id ? 'border-[#5b32d4] bg-purple-50 dark:bg-purple-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{backgroundColor: b.bg, color: b.text}}>{b.initial}</div>
                                                <span className="text-xs font-bold dark:text-white text-center">{b.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {state.selectedMethod === 'crypto' && (
                                <div className="space-y-5 fade-in">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Выберите сеть</label>
                                        <select className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-xl dark:text-white font-bold focus:outline-none focus:border-[#5b32d4] appearance-none">
                                            <option>USDT (TRC-20)</option><option>USDT (ERC-20)</option><option>Bitcoin (BTC)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Адрес для перевода</label>
                                        <div className="flex items-center gap-2">
                                            <input type="text" readOnly value="TXYZ12345abcdefGHIJKLMNOP67890" className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-xl dark:text-white font-mono text-sm focus:outline-none text-gray-500" />
                                            <button onClick={() => alert('Адрес скопирован!')} className="p-4 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-xl hover:bg-[#e0dbf4] transition-colors"><Icons.Code /></button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Хэш транзакции / ID перевода</label>
                                        <input type="text" value={cryptoTxId} onChange={e => { setCryptoTxId(e.target.value); setPaymentErrors(prev => ({...prev, cryptoTxId: null})); }} placeholder="Вставьте после отправки перевода" className={`w-full p-4 bg-gray-50 dark:bg-[#23232f] border rounded-xl dark:text-white font-mono text-sm focus:outline-none ${paymentErrors.cryptoTxId ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                        {paymentErrors.cryptoTxId && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{paymentErrors.cryptoTxId}</p>}
                                        <p className="text-xs text-gray-400 mt-1.5 ml-1">Без этого поля подтвердить оплату не получится — мы проверяем перевод по хэшу.</p>
                                    </div>
                                </div>
                            )}

                            {state.selectedMethod === 'wallet' && (
                                <div className="fade-in space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Баланс кошелька</span>
                                        <span className={`font-extrabold ${(state.walletBalance || 0) >= price ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{formatMoney(state.walletBalance || 0)} ₽</span>
                                    </div>
                                    {(state.walletBalance || 0) < price ? (
                                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 flex gap-3 items-start">
                                            <Icons.Alert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" style={{width:'20px',height:'20px',minWidth:'20px'}} />
                                            <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold leading-relaxed flex-1 min-w-0">Не хватает {formatMoney(price - (state.walletBalance || 0))} ₽. Пополните баланс в разделе «Кошелёк» и вернитесь для оплаты.</p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400">С баланса спишется {formatMoney(price)} ₽, подписка активируется сразу.</p>
                                    )}
                                </div>
                            )}

                            <button onClick={handleConfirmPayment} className="w-full mt-8 py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors text-lg">
                                {state.selectedMethod === 'sbp' ? 'Оплатить через приложение банка' : state.selectedMethod === 'crypto' ? 'Я перевёл средства' : state.selectedMethod === 'wallet' ? `Оплатить с баланса ${formatPrice(price)}₽` : `Оплатить ${formatPrice(price)}₽`}
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
                            <p className="text-2xl font-extrabold dark:text-white">{formatPrice(price)}₽</p>
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
                        <div onClick={() => updateState({selectedMethod: 'crypto'})} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${state.selectedMethod === 'crypto' ? 'border-[#5b32d4] bg-[#efecf9]/50 dark:bg-purple-900/10' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400"><Icons.Crypto /></div>
                            <div className="flex-1"><div className="font-bold text-[15px] dark:text-white">Криптовалюты</div><div className="text-xs text-gray-500">USDT, BTC и другие</div></div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.selectedMethod === 'crypto' ? 'border-[#5b32d4] bg-[#5b32d4]' : 'border-gray-300 dark:border-gray-600'}`}>{state.selectedMethod === 'crypto' && <Icons.Check className="w-3 h-3 text-white" />}</div>
                        </div>
                        <div onClick={() => updateState({selectedMethod: 'wallet'})} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${state.selectedMethod === 'wallet' ? 'border-[#5b32d4] bg-[#efecf9]/50 dark:bg-purple-900/10' : 'border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-darkCard text-[#5b32d4] dark:text-purple-400"><Icons.Wallet /></div>
                            <div className="flex-1"><div className="font-bold text-[15px] dark:text-white">Баланс кошелька</div><div className={`text-xs ${(state.walletBalance || 0) >= price ? 'text-gray-500' : 'text-red-500 font-semibold'}`}>Доступно: {formatMoney(state.walletBalance || 0)} ₽{(state.walletBalance || 0) < price ? ' — не хватает средств' : ''}</div></div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${state.selectedMethod === 'wallet' ? 'border-[#5b32d4] bg-[#5b32d4]' : 'border-gray-300 dark:border-gray-600'}`}>{state.selectedMethod === 'wallet' && <Icons.Check className="w-3 h-3 text-white" />}</div>
                        </div>
                    </div>
                    <button onClick={() => updateState({paymentStep: 'form'})} className="w-full py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors text-lg">Продолжить</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="px-4 py-8 max-w-5xl mx-auto">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h1 className="text-3xl font-extrabold dark:text-white">Тарифы</h1>
                </div>
                <div className="flex justify-center mb-10">
                    <div className="bg-gray-100 dark:bg-darkBorder p-1 flex rounded-2xl relative w-72">
                        <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-darkCard rounded-xl shadow-sm transition-transform duration-300 ease-in-out ${state.billingCycle === 'year' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`} />
                        <button onClick={() => updateState({billingCycle: 'month'})} className={`relative z-10 flex-1 py-2.5 text-sm font-bold transition-colors ${state.billingCycle === 'month' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>В месяц</button>
                        <button onClick={() => updateState({billingCycle: 'year'})} className={`relative z-10 flex-1 py-2.5 text-sm font-bold transition-colors ${state.billingCycle === 'year' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>В год (-20%)</button>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6" key={state.billingCycle}>
                    {PRICING_PLANS.map(p => {
                        // Порядок тарифов по «весу». Тарифы дешевле текущего
                        // становятся недоступными — понизиться нельзя.
                        const rank = { free: 0, plus: 1, pro: 2, pro_plus: 3 };
                        const currentRank = rank[state.userPlan] ?? 0;
                        const isCurrent = p.id === state.userPlan;
                        const isLower = (rank[p.id] ?? 0) < currentRank;
                        const isFree = p.id === 'free';
                        const disabled = isCurrent || isLower || isFree;
                        return (
                        <div key={p.id} className={`void-plan-card bg-white dark:bg-darkCard p-6 rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm flex flex-col ${isLower ? 'opacity-50' : ''}`}>
                            <h2 className="text-2xl font-bold dark:text-white">{p.title}</h2>
                            <p className="text-sm text-gray-500 mt-1 mb-4">{p.subtitle}</p>
                            <div className="text-4xl font-extrabold dark:text-white mb-6">{formatPrice(state.billingCycle === 'month' ? p.priceMonth : p.priceYear)}₽</div>
                            <div className="mb-8">
                                <h4 className="text-sm font-bold mb-4 dark:text-white">Что входит:</h4>
                                <div className="space-y-3">
                                    {p.features.map((f, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <div className="mt-1 bg-[#5b32d4] rounded-full p-0.5 flex-shrink-0"><Icons.Check className="w-3 h-3 text-white"/></div>
                                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight">{f}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => {
                                if (disabled) return;
                                if (!state.user) { updateState({ showAuthModal: true, authTab: 'register' }); return; }
                                updateState({checkoutPlan: p, paymentStep: 'select', selectedMethod: 'card', selectedBank: 'sber'});
                            }} disabled={disabled} className={`mt-auto py-3 rounded-xl font-bold transition-colors ${isCurrent ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 cursor-default' : isLower ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : !isFree ? 'bg-[#5b32d4] text-white hover:bg-[#4a26b0]' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                {isCurrent ? '✓ Текущий тариф' : isLower ? 'Понижение недоступно' : !isFree ? 'Выбрать' : 'Недоступно'}
                            </button>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
