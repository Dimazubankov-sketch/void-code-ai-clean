import { useState } from 'react';
import { applyAccountLogin, DOMAIN } from '@/shared/lib/accounts';
import { ApiError } from '@/shared/api/client';
import { Icons } from '@/shared/ui/Icons';


// МОДАЛЬНОЕ ОКНО АВТОРИЗАЦИИ
export function AuthModal({ state, updateState }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);

    if (!state.showAuthModal) return null;

    const handleClose = () => updateState({ showAuthModal: false, sessionExpiredNotice: false });

    const handleAuth = async () => {
        const username = email.trim().toLowerCase();
        const isRegister = state.authTab === 'register';
        if (!username || !password.trim()) {
            setHasError(true);
            setErrorMsg('Заполните почту и пароль');
            return;
        }
        if (isRegister && password.trim().length < 8) {
            setHasError(true);
            setErrorMsg('Пароль — минимум 8 символов');
            return;
        }
        setHasError(false);
        setErrorMsg('');
        setLoading(true);
        try {
            await applyAccountLogin(state, updateState, { username, password, isNewAccount: isRegister });
            updateState({ sessionExpiredNotice: false });
        } catch (err) {
            setHasError(true);
            // Ошибка от сервера (неверный пароль, email уже занят и т.п.),
            // либо сервер вообще недоступен — оба случая ApiError.
            setErrorMsg(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto fade-in">
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative slide-in-right my-6 sm:my-0 mb-[40vh] sm:mb-0">
                <button onClick={handleClose} className="void-tap-target absolute top-3 right-3 sm:top-4 sm:right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>

                <div className="flex justify-center mb-6"><div className="flex items-center gap-2.5 font-extrabold text-2xl dark:text-white"><Icons.VoidLogo /><span><span className="void-grad-text">VOID</span> CODE AI</span></div></div>
                {state.sessionExpiredNotice ? (
                    <div className="mb-6 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm text-center">
                        Сессия истекла — войдите заново, чтобы продолжить работу.
                    </div>
                ) : (
                    <h2 className="text-2xl font-extrabold text-center mb-2 dark:text-white">Регистрация / Вход</h2>
                )}
                <p className="text-center text-gray-500 mb-8 text-sm">Доступ только по корпоративной почте <span className="font-bold text-[#5b32d4]">{DOMAIN}</span></p>
                
                <div className="flex gap-2 p-1.5 bg-gray-50 dark:bg-[#23232f] rounded-2xl mb-6">
                    <button onClick={()=>updateState({authTab: 'login'})} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-colors ${state.authTab==='login'?'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm':'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>Войти</button>
                    <button onClick={()=>updateState({authTab: 'register'})} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-colors ${state.authTab==='register'?'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm':'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>Регистрация</button>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Корпоративная почта</label>
                        <div className={`flex items-stretch bg-gray-50 dark:bg-[#23232f] rounded-2xl overflow-hidden transition-all ${hasError && !email.trim() ? 'border-2 border-red-500' : 'border border-gray-100 dark:border-gray-800 focus-within:border-[#5b32d4]'}`}>
                            <input 
                                type="text" 
                                value={email}
                                onChange={(e) => {
                                    // Пользователь вводит только имя — домен фиксирован и не стирается.
                                    // Отрезаем всё, что могли вставить после @, и служебные символы.
                                    const name = e.target.value.split('@')[0].replace(/\s/g, '');
                                    setEmail(name); setHasError(false); setErrorMsg('');
                                }}
                                className="flex-1 min-w-0 p-4 bg-transparent focus:outline-none dark:text-white" 
                                placeholder="name" 
                            />
                            <span className="flex items-center px-4 bg-gray-100 dark:bg-[#2c2c3a] text-gray-500 dark:text-gray-400 font-bold text-sm select-none border-l border-gray-200 dark:border-gray-700">{DOMAIN}</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Пароль</label>
                        <div className={`flex items-stretch bg-gray-50 dark:bg-[#23232f] rounded-2xl overflow-hidden transition-all ${hasError && !password.trim() ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : 'border border-gray-100 dark:border-gray-800 focus-within:border-[#5b32d4]'}`}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setHasError(false); setErrorMsg(''); }}
                                onFocus={(e) => {
                                    // На телефоне клавиатура может перекрыть поле пароля (особенно
                                    // если оно последнее перед кнопкой) — подскролливаем к нему
                                    // после открытия клавиатуры, как и в поле ввода чата.
                                    setTimeout(() => {
                                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }, 300);
                                }}
                                className="flex-1 min-w-0 p-4 bg-transparent focus:outline-none dark:text-white"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                tabIndex={-1}
                                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                                className="void-tap-target px-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex items-center justify-center shrink-0"
                            >
                                {showPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    {errorMsg && <p className="text-sm font-semibold text-red-500 text-center -mt-1">{errorMsg}</p>}
                    <button onClick={handleAuth} disabled={loading} className="w-full bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-60 text-white font-bold py-4 rounded-2xl shadow-lg transition-colors mt-4">
                        {loading ? 'Проверяем…' : 'Продолжить'}
                    </button>
                    {/* Мелкая ссылка на публичные реквизиты — доступна ещё до
                        регистрации/входа, отдельный статический маршрут (см. main.jsx). */}
                    <a href="/requisites" target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-gray-300 hover:text-gray-400 dark:text-gray-600 dark:hover:text-gray-400 transition-colors pt-1">
                        Реквизиты
                    </a>
                </div>
            </div>
        </div>
    );
}
