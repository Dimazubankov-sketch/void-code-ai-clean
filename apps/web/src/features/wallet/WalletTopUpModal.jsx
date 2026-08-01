import { useState } from 'react';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОШЕЛЁК — модалка пополнения баланса
// ==========================================
// Переиспользуется и на отдельном экране "Кошелёк", и внутри счёта за
// сборку агента, и при автоматической приостановке из-за нехватки средств.
export function WalletTopUpModal({ state, updateState, onClose, onSuccess, reason }) {
    const PRESETS = [500, 1000, 2000, 5000];
    const [amount, setAmount] = useState(1000);
    const [customAmount, setCustomAmount] = useState('');
    const [method, setMethod] = useState('card');
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [cryptoTxId, setCryptoTxId] = useState('');
    const [errors, setErrors] = useState({});
    const [success, setSuccess] = useState(false);

    const finalAmount = customAmount.trim() !== '' ? (parseInt(customAmount.replace(/\D/g, '')) || 0) : amount;

    const validate = () => {
        const e = {};
        if (!finalAmount || finalAmount < 100) e.amount = 'Минимальная сумма пополнения — 100 ₽';
        if (method === 'card') {
            const digits = cardNumber.replace(/\s+/g, '');
            if (!/^\d{16,19}$/.test(digits)) e.cardNumber = 'Введите корректный номер карты';
            if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry.trim())) e.cardExpiry = 'Формат ММ/ГГ';
            if (!/^\d{3,4}$/.test(cardCvc.trim())) e.cardCvc = 'Введите CVC';
        } else if (method === 'crypto') {
            if (!cryptoTxId.trim() || cryptoTxId.trim().length < 6) e.cryptoTxId = 'Укажите хэш транзакции после перевода';
        }
        return e;
    };

    const handleConfirm = () => {
        const e = validate();
        if (Object.keys(e).length > 0) { setErrors(e); return; }
        setErrors({});
        const now = Date.now();
        const methodLabel = method === 'card' ? 'картой' : method === 'sbp' ? 'через СБП' : 'криптовалютой';
        updateState({
            walletBalance: (state.walletBalance || 0) + finalAmount,
            walletTransactions: [{ id: 'tx' + now, type: 'topup', amount: finalAmount, description: `Пополнение баланса ${methodLabel}`, timestamp: now }, ...(state.walletTransactions || [])]
        });
        setSuccess(true);
        setTimeout(() => { onSuccess && onSuccess(finalAmount); }, 1100);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto fade-in">
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative my-6 sm:my-0">
                <button onClick={onClose} className="void-tap-target absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>

                {success ? (
                    <div className="text-center py-10 fade-in">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Check className="w-8 h-8 text-white" /></div>
                        <h3 className="text-xl font-extrabold dark:text-white mb-1">Баланс пополнен</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">+{formatMoney(finalAmount)} ₽ на кошельке</p>
                    </div>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4"><Icons.Wallet /></div>
                        <h2 className="text-xl font-extrabold dark:text-white mb-1">Пополнить баланс</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{reason || 'Деньги пойдут на оплату токенов и услуг сервиса.'}</p>

                        <div className="grid grid-cols-4 gap-2 mb-3">
                            {PRESETS.map(p => (
                                <button key={p} onClick={() => { setAmount(p); setCustomAmount(''); setErrors(prev => ({ ...prev, amount: null })); }} className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${customAmount === '' && amount === p ? 'bg-[#5b32d4] text-white border-[#5b32d4]' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#5b32d4]'}`}>{p}₽</button>
                            ))}
                        </div>
                        <div className="mb-5">
                            <input type="text" inputMode="numeric" value={customAmount} onChange={e => { setCustomAmount(e.target.value.replace(/\D/g, '')); setErrors(prev => ({ ...prev, amount: null })); }} placeholder="Своя сумма, ₽" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-bold dark:text-white focus:outline-none ${errors.amount ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                            {errors.amount && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.amount}</p>}
                        </div>

                        <div className="flex gap-2 mb-5">
                            {[{ id: 'card', label: 'Карта' }, { id: 'sbp', label: 'СБП' }, { id: 'crypto', label: 'Крипто' }].map(m => (
                                <button key={m.id} onClick={() => setMethod(m.id)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${method === m.id ? 'bg-[#efecf9] dark:bg-purple-900/30 border-[#5b32d4] text-[#5b32d4] dark:text-purple-300' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>{m.label}</button>
                            ))}
                        </div>

                        {method === 'card' && (
                            <div className="space-y-3 mb-2">
                                <div>
                                    <input type="text" value={cardNumber} onChange={e => { setCardNumber(e.target.value); setErrors(prev => ({ ...prev, cardNumber: null })); }} placeholder="Номер карты" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cardNumber ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                    {errors.cardNumber && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cardNumber}</p>}
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <input type="text" value={cardExpiry} onChange={e => { setCardExpiry(e.target.value); setErrors(prev => ({ ...prev, cardExpiry: null })); }} placeholder="ММ/ГГ" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cardExpiry ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                        {errors.cardExpiry && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cardExpiry}</p>}
                                    </div>
                                    <div className="flex-1">
                                        <input type="password" value={cardCvc} onChange={e => { setCardCvc(e.target.value); setErrors(prev => ({ ...prev, cardCvc: null })); }} placeholder="CVC" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cardCvc ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                        {errors.cardCvc && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cardCvc}</p>}
                                    </div>
                                </div>
                            </div>
                        )}
                        {method === 'crypto' && (
                            <div className="mb-2">
                                <input type="text" value={cryptoTxId} onChange={e => { setCryptoTxId(e.target.value); setErrors(prev => ({ ...prev, cryptoTxId: null })); }} placeholder="Хэш транзакции после перевода" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cryptoTxId ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                {errors.cryptoTxId && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cryptoTxId}</p>}
                            </div>
                        )}
                        {method === 'sbp' && <p className="text-xs text-gray-400 mb-2">После нажатия «Пополнить» откроется приложение вашего банка для подтверждения перевода.</p>}

                        <button onClick={handleConfirm} className="w-full mt-4 py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors">
                            Пополнить на {formatMoney(finalAmount)} ₽
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
