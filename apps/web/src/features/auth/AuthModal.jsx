import { useState } from 'react';
import { applyAccountLogin } from '@/shared/lib/accounts';
import { Icons } from '@/shared/ui/Icons';


// МОДАЛЬНОЕ ОКНО АВТОРИЗАЦИИ
export function AuthModal({ state, updateState }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [hasError, setHasError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    if (!state.showAuthModal) return null;

    const handleAuth = () => {
        const username = email.trim().toLowerCase();
        if (!username || !password.trim()) {
            setHasError(true);
            setErrorMsg('Заполните почту и пароль');
            return;
        }
        setHasError(false);
        setErrorMsg('');
        applyAccountLogin(state, updateState, { username, isNewAccount: state.authTab === 'register' });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto fade-in">
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative slide-in-right my-6 sm:my-0">
                <button onClick={() => updateState({showAuthModal: false})} className="void-tap-target absolute top-3 right-3 sm:top-4 sm:right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>
                
                <div className="flex justify-center mb-6"><div className="flex items-center gap-2.5 font-extrabold text-2xl dark:text-white"><Icons.VoidLogo /><span><span className="void-grad-text">VOID</span> CODE AI</span></div></div>
                <h2 className="text-2xl font-extrabold text-center mb-2 dark:text-white">Регистрация / Вход</h2>
                <p className="text-center text-gray-500 mb-8 text-sm">Доступ только по корпоративной почте <span className="font-bold text-[#5b32d4]">@voidops.com</span></p>
                
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
                            <span className="flex items-center px-4 bg-gray-100 dark:bg-[#2c2c3a] text-gray-500 dark:text-gray-400 font-bold text-sm select-none border-l border-gray-200 dark:border-gray-700">@voidops.com</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Пароль</label>
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setHasError(false); setErrorMsg(''); }}
                            className={`w-full p-4 bg-gray-50 dark:bg-[#23232f] rounded-2xl focus:outline-none transition-all ${hasError && !password.trim() ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10 placeholder-red-300 dark:placeholder-red-700' : 'border border-gray-100 dark:border-gray-800 focus:border-[#5b32d4]'} dark:text-white`} 
                            placeholder="••••••••" 
                        />
                    </div>
                    {errorMsg && <p className="text-sm font-semibold text-red-500 text-center -mt-1">{errorMsg}</p>}
                    <button onClick={handleAuth} className="w-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-4 rounded-2xl shadow-lg transition-colors mt-4">
                        Продолжить
                    </button>
                </div>
            </div>
        </div>
    );
}
