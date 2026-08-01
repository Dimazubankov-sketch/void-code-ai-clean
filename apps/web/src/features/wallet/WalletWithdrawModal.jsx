import { useState } from 'react';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';


export function WalletWithdrawModal({ state, updateState, onClose, onSuccess }) {
    const balance = state.walletBalance || 0;
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('sbp');
    const [cardNumber, setCardNumber] = useState('');
    const [cryptoAddress, setCryptoAddress] = useState('');
    const [cryptoNetwork, setCryptoNetwork] = useState('USDT (TRC-20)');
    const [errors, setErrors] = useState({});
    const [success, setSuccess] = useState(false);

    const finalAmount = parseInt(amount.replace(/\D/g, '')) || 0;

    const validate = () => {
        const e = {};
        if (!finalAmount || finalAmount < 100) e.amount = 'Минимальная сумма вывода — 100 ₽';
        else if (finalAmount > balance) e.amount = 'Сумма больше, чем есть на балансе';
        if (method === 'sbp') {
            const digits = cardNumber.replace(/\s+/g, '');
            if (!/^\d{16,19}$/.test(digits)) e.cardNumber = 'Введите корректный номер карты';
        } else if (method === 'crypto') {
            if (!cryptoAddress.trim() || cryptoAddress.trim().length < 10) e.cryptoAddress = 'Введите адрес криптокошелька';
        }
        return e;
    };

    const handleConfirm = () => {
        const e = validate();
        if (Object.keys(e).length > 0) { setErrors(e); return; }
        setErrors({});
        const now = Date.now();
        const methodLabel = method === 'sbp' ? 'на карту через СБП' : `на криптокошелёк (${cryptoNetwork})`;
        updateState({
            walletBalance: balance - finalAmount,
            walletTransactions: [{ id: 'tx' + now, type: 'withdraw', amount: -finalAmount, description: `Вывод средств ${methodLabel}`, timestamp: now }, ...(state.walletTransactions || [])]
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
                        <h3 className="text-xl font-extrabold dark:text-white mb-1">Заявка на вывод принята</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">−{formatMoney(finalAmount)} ₽ спишется с кошелька</p>
                    </div>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4"><Icons.Wallet /></div>
                        <h2 className="text-xl font-extrabold dark:text-white mb-1">Вывести деньги</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Доступно к выводу: {formatMoney(balance)} ₽</p>

                        <div className="mb-5">
                            <input type="text" inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value.replace(/\D/g, '')); setErrors(prev => ({ ...prev, amount: null })); }} placeholder="Сумма к выводу, ₽" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-bold dark:text-white focus:outline-none ${errors.amount ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                            {errors.amount && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.amount}</p>}
                            <button onClick={() => { setAmount(String(balance)); setErrors(prev => ({ ...prev, amount: null })); }} className="text-xs font-bold text-[#5b32d4] dark:text-purple-400 hover:underline mt-1.5 ml-1">Вывести всё</button>
                        </div>

                        <div className="flex gap-2 mb-5">
                            {[{ id: 'sbp', label: 'На карту (СБП)' }, { id: 'crypto', label: 'Криптокошелёк' }].map(m => (
                                <button key={m.id} onClick={() => setMethod(m.id)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${method === m.id ? 'bg-[#efecf9] dark:bg-purple-900/30 border-[#5b32d4] text-[#5b32d4] dark:text-purple-300' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>{m.label}</button>
                            ))}
                        </div>

                        {method === 'sbp' && (
                            <div className="mb-2">
                                <input type="text" value={cardNumber} onChange={e => { setCardNumber(e.target.value); setErrors(prev => ({ ...prev, cardNumber: null })); }} placeholder="Номер карты для получения" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cardNumber ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                {errors.cardNumber && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cardNumber}</p>}
                                <p className="text-xs text-gray-400 mt-2">Деньги придут через Систему быстрых платежей, обычно в течение нескольких минут.</p>
                            </div>
                        )}
                        {method === 'crypto' && (
                            <div className="space-y-3 mb-2">
                                <div className="flex gap-2">
                                    {['USDT (TRC-20)', 'USDT (ERC-20)', 'BTC'].map(n => (
                                        <button key={n} onClick={() => setCryptoNetwork(n)} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${cryptoNetwork === n ? 'bg-[#efecf9] dark:bg-purple-900/30 border-[#5b32d4] text-[#5b32d4] dark:text-purple-300' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>{n}</button>
                                    ))}
                                </div>
                                <div>
                                    <input type="text" value={cryptoAddress} onChange={e => { setCryptoAddress(e.target.value); setErrors(prev => ({ ...prev, cryptoAddress: null })); }} placeholder="Адрес криптокошелька" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cryptoAddress ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                                    {errors.cryptoAddress && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cryptoAddress}</p>}
                                </div>
                                <p className="text-xs text-gray-400">Проверьте сеть и адрес — переводы в криптовалюте необратимы.</p>
                            </div>
                        )}

                        <button onClick={handleConfirm} disabled={balance <= 0} className="w-full mt-4 py-4 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-bold rounded-2xl shadow-lg transition-colors">
                            Вывести {finalAmount ? formatMoney(finalAmount) + ' ₽' : ''}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
