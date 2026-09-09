import { useState } from 'react';
import { formatMoney } from '@/shared/lib/format';
import { createTopUp } from '@/shared/api/billing';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОШЕЛЁК — модалка пополнения баланса (#6, реальная оплата)
// ==========================================
// Никаких заглушек и сбора карты: сумма уходит в ЮKassa (createTopUp →
// confirmationUrl), карту вводит пользователь на защищённой странице ЮKassa.
// После оплаты ЮKassa вернёт на APP_URL/?payment=return, где App.jsx
// опросит статус и зачислит средства (kind: wallet_topup).
export function WalletTopUpModal({ onClose, reason }) {
    const PRESETS = [500, 1000, 2000, 5000];
    const [amount, setAmount] = useState(1000);
    const [customAmount, setCustomAmount] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    const finalAmount = customAmount.trim() !== '' ? (parseInt(customAmount.replace(/\D/g, '')) || 0) : amount;

    const handleConfirm = async () => {
        if (!finalAmount || finalAmount < 100) { setErr('Минимальная сумма пополнения — 100 ₽'); return; }
        setErr(''); setBusy(true);
        try {
            const { paymentId, confirmationUrl } = await createTopUp(finalAmount);
            if (paymentId) { try { localStorage.setItem('void_pending_payment', paymentId); } catch { /* noop */ } }
            if (confirmationUrl) { window.location.href = confirmationUrl; return; }
            setErr('Не удалось создать платёж. Попробуйте позже.');
            setBusy(false);
        } catch (e) {
            setErr(e?.message || 'Не удалось создать платёж.');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-t-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="void-tap-target absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>

                <div className="w-12 h-12 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4"><Icons.Wallet /></div>
                <h2 className="text-xl font-extrabold dark:text-white mb-1">Пополнить баланс</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{reason || 'Оплата пройдёт через ЮKassa. Карту вводить на нашем сайте не нужно.'}</p>

                <div className="grid grid-cols-4 gap-2 mb-3">
                    {PRESETS.map(p => (
                        <button key={p} onClick={() => { setAmount(p); setCustomAmount(''); setErr(''); }} className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${customAmount === '' && amount === p ? 'bg-[#5b32d4] text-white border-[#5b32d4]' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#5b32d4]'}`}>{p}₽</button>
                    ))}
                </div>
                <div className="mb-4">
                    <input type="text" inputMode="numeric" value={customAmount} onChange={e => { setCustomAmount(e.target.value.replace(/\D/g, '')); setErr(''); }} placeholder="Своя сумма, ₽" className={`w-full p-3.5 bg-gray-50 dark:bg-[#23232f] border rounded-xl text-sm font-bold dark:text-white focus:outline-none ${err ? 'border-2 border-red-500' : 'border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'}`} />
                    {err && <p className="text-xs text-red-500 font-semibold mt-1.5 ml-1">{err}</p>}
                </div>

                <button disabled={busy} onClick={handleConfirm} className="w-full mt-2 py-4 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-60 text-white font-bold rounded-2xl shadow-lg transition-colors flex items-center justify-center gap-2">
                    {busy ? 'Переходим к оплате…' : `Пополнить на ${formatMoney(finalAmount)} ₽`}
                </button>
                <p className="text-[11px] text-gray-400 text-center mt-3">Оплата картой или через СБП на защищённой странице ЮKassa.</p>
            </div>
        </div>
    );
}
