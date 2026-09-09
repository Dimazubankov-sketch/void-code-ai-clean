import { useState } from 'react';
import { formatMoney } from '@/shared/lib/format';
import { requestWithdrawal } from '@/shared/api/billing';
import { Icons } from '@/shared/ui/Icons';


// #6: реальная заявка на вывод средств. Сумма списывается с баланса на
// сервере, заявка уходит в обработку; реквизиты (номер карты) на сервере
// хранятся только маскированными (последние 4 цифры).
export function WalletWithdrawModal({ balance = 0, onClose, onSuccess }) {
    const [amount, setAmount] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [success, setSuccess] = useState(false);

    const finalAmount = parseInt(amount.replace(/\D/g, '')) || 0;

    const handleConfirm = async () => {
        const e = {};
        if (!finalAmount || finalAmount < 100) e.amount = 'Минимальная сумма вывода — 100 ₽';
        else if (finalAmount > balance) e.amount = 'Сумма больше, чем есть на балансе';
        const digits = cardNumber.replace(/\s+/g, '');
        if (!/^\d{16,19}$/.test(digits)) e.cardNumber = 'Введите корректный номер карты';
        if (Object.keys(e).length > 0) { setErrors(e); return; }
        setErrors({}); setBusy(true);
        try {
            await requestWithdrawal(finalAmount, digits);
            setSuccess(true);
            setTimeout(() => { onSuccess && onSuccess(finalAmount); }, 1200);
        } catch (err) {
            setErrors({ amount: err?.message || 'Не удалось создать заявку на вывод.' });
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-t-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="void-tap-target absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>

                {success ? (
                    <div className="text-center py-10 fade-in">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Check className="w-8 h-8 text-white" /></div>
                        <h3 className="text-xl font-extrabold dark:text-white mb-1">Заявка на вывод принята</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">−{formatMoney(finalAmount)} ₽ списано, средства поступят после обработки.</p>
                    </div>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4"><Icons.ArrowUp /></div>
                        <h2 className="text-xl font-extrabold dark:text-white mb-1">Вывести деньги</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Доступно к выводу: {formatMoney(balance)} ₽</p>

                        <div className="mb-5">
                            <input type="text" inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value.replace(/\D/g, '')); setErrors(prev => ({ ...prev, amount: null })); }} placeholder="Сумма к выводу, ₽" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-bold dark:text-white focus:outline-none ${errors.amount ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                            {errors.amount && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.amount}</p>}
                            <button onClick={() => { setAmount(String(balance)); setErrors(prev => ({ ...prev, amount: null })); }} className="text-xs font-bold text-[#5b32d4] dark:text-purple-400 hover:underline mt-1.5 ml-1">Вывести всё</button>
                        </div>

                        <div className="mb-2">
                            <input type="text" value={cardNumber} onChange={e => { setCardNumber(e.target.value); setErrors(prev => ({ ...prev, cardNumber: null })); }} placeholder="Номер карты для получения" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-mono dark:text-white focus:outline-none ${errors.cardNumber ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                            {errors.cardNumber && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{errors.cardNumber}</p>}
                            <p className="text-xs text-gray-400 mt-2">Заявка обрабатывается вручную; средства поступят на карту после проверки. Полный номер карты не сохраняется.</p>
                        </div>

                        <button onClick={handleConfirm} disabled={balance <= 0 || busy} className="w-full mt-4 py-4 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-bold rounded-2xl shadow-lg transition-colors">
                            {busy ? 'Отправляем заявку…' : `Вывести ${finalAmount ? formatMoney(finalAmount) + ' ₽' : ''}`}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
