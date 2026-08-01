import { useState } from 'react';
import { changePassword } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/client';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function SecurityView({ state, updateState }) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setError('');
        setSuccess(false);
        if (!current || !next) { setError('Заполните оба поля пароля'); return; }
        if (next.length < 8) { setError('Новый пароль — минимум 8 символов'); return; }
        if (next !== confirm) { setError('Пароли не совпадают'); return; }
        setLoading(true);
        try {
            await changePassword(current, next);
            setSuccess(true);
            setCurrent(''); setNext(''); setConfirm('');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Безопасность и пароль</h2>
                </div>
                <div className="bg-white dark:bg-darkCard rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-darkBorder space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Текущий пароль</label>
                        <div className="flex items-stretch bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden focus-within:border-[#5b32d4] transition-all">
                            <input type={showCurrent ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)} className="flex-1 min-w-0 p-4 bg-transparent focus:outline-none dark:text-white font-medium" placeholder="••••••••" />
                            <button type="button" onClick={() => setShowCurrent(v => !v)} tabIndex={-1} className="void-tap-target px-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex items-center justify-center shrink-0">
                                {showCurrent ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Новый пароль</label>
                        <div className="flex items-stretch bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden focus-within:border-[#5b32d4] transition-all">
                            <input type={showNext ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)} className="flex-1 min-w-0 p-4 bg-transparent focus:outline-none dark:text-white font-medium" placeholder="Минимум 8 символов" />
                            <button type="button" onClick={() => setShowNext(v => !v)} tabIndex={-1} className="void-tap-target px-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex items-center justify-center shrink-0">
                                {showNext ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Повторите новый пароль</label>
                        <input type={showNext ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl dark:text-white font-medium outline-none transition-all focus:border-[#5b32d4]" placeholder="Ещё раз" />
                    </div>
                    {error && <p className="text-sm font-semibold text-red-500 text-center">{error}</p>}
                    {success && <p className="text-sm font-semibold text-green-600 dark:text-green-400 text-center">Пароль успешно изменён ✓</p>}
                    <div className="pt-2">
                        <button onClick={handleSubmit} disabled={loading} className="w-full bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-60 text-white font-bold py-4 rounded-2xl shadow-lg transition-colors">
                            {loading ? 'Сохраняем…' : 'Сохранить новый пароль'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
