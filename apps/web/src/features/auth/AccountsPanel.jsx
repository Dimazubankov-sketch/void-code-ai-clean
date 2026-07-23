import { useRef, useState } from 'react';
import { switchToAccount } from '@/shared/lib/accounts';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ПАНЕЛЬ «АККАУНТЫ VOIDOPS» (переиспользуемая)
// ==========================================
// Одна и та же панель открывается и из почты (по клику на логотип), и из
// настроек → «Личные данные». На телефоне — на весь экран, на ПК — 1/3.
// Сверху текущий аккаунт со сменой фото, «Управлять аккаунтом», список
// аккаунтов для смены, внизу «Войти в другой» / «Создать новый».

const initials = (str) => (str || '?').replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 2).toUpperCase();

export function AccountsPanel({ state, updateState, onClose }) {
    const [manageMode, setManageMode] = useState(false);
    const photoInputRef = useRef(null);

    const accounts = state.savedAccounts || [];
    const accountPhotos = state.accountPhotos || {};

    const doSwitch = (email) => { switchToAccount(state, updateState, email); onClose(); };
    const loginAnother = () => { onClose(); updateState({ showAuthModal: true, authTab: 'login' }); };
    const createNew = () => { onClose(); updateState({ showAuthModal: true, authTab: 'register' }); };

    const onChangePhoto = (e) => {
        const file = e.target.files?.[0];
        if (!file || !state.user) return;
        const reader = new FileReader();
        reader.onload = () => updateState({ accountPhotos: { ...accountPhotos, [state.user.email]: reader.result } });
        reader.readAsDataURL(file);
    };

    // Удаление аккаунта из списка с подтверждением
    const deleteAccount = (email) => {
        if (!window.confirm(`Удалить аккаунт ${email}? Это уберёт его из списка на этом устройстве.`)) return;
        const nextAccounts = accounts.filter(a => a.email !== email);
        const nextData = { ...(state.accountData || {}) };
        delete nextData[email];
        const nextPhotos = { ...accountPhotos };
        delete nextPhotos[email];
        const patch = { savedAccounts: nextAccounts, accountData: nextData, accountPhotos: nextPhotos };
        // Если удаляем текущий аккаунт — выходим в гостя
        if (state.user?.email === email) { patch.user = null; patch.userPlan = 'free'; }
        updateState(patch);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 flex justify-end sm:justify-start fade-in" onClick={onClose}>
            <div className="w-full sm:w-1/3 sm:min-w-[340px] h-full bg-white dark:bg-darkCard shadow-2xl slide-in-right flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                    <h4 className="font-extrabold text-lg dark:text-white">Аккаунты Voidops</h4>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {state.user ? (
                        <div className="flex flex-col items-center text-center mb-6">
                            <button onClick={() => photoInputRef.current?.click()} className="relative group">
                                {accountPhotos[state.user.email] ? (
                                    <img src={accountPhotos[state.user.email]} alt="" className="w-20 h-20 rounded-full object-cover" />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-[#5b32d4] text-white flex items-center justify-center font-extrabold text-2xl">{initials(state.user.name)}</div>
                                )}
                                <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Icons.Pencil className="w-5 h-5 text-white" />
                                </span>
                            </button>
                            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onChangePhoto} />
                            <p className="font-extrabold text-lg dark:text-white mt-3">{state.user.name}</p>
                            <p className="text-sm text-gray-400">{state.user.email}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">Тариф: {state.userPlan}</p>
                            <button onClick={() => photoInputRef.current?.click()} className="text-xs font-bold text-[#5b32d4] mt-2">Сменить фото</button>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 text-center mb-6">Вы не вошли в аккаунт</p>
                    )}

                    {state.user && (
                        <button onClick={() => setManageMode(v => !v)} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-bold dark:text-white transition-colors mb-2">
                            <span className="flex items-center gap-2.5"><Icons.Settings className="w-4 h-4" /> Управлять аккаунтом</span>
                            <Icons.ChevronLeft className={`w-4 h-4 transition-transform ${manageMode ? 'rotate-90' : '-rotate-90'}`} />
                        </button>
                    )}
                    {manageMode && (
                        <div className="mb-4 px-4 py-3 rounded-2xl bg-gray-50/60 dark:bg-gray-900/20 space-y-2">
                            <button className="w-full text-left text-sm text-gray-600 dark:text-gray-300 py-1.5">Изменить имя профиля</button>
                            <button className="w-full text-left text-sm text-gray-600 dark:text-gray-300 py-1.5">Безопасность и пароль</button>
                            <button onClick={() => { onClose(); updateState({ currentView: 'pricing' }); }} className="w-full text-left text-sm text-gray-600 dark:text-gray-300 py-1.5">Управление подпиской</button>
                        </div>
                    )}

                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 px-1 mb-2 mt-4">Сменить аккаунт</p>
                    <div className="space-y-1.5 mb-5">
                        {accounts.length === 0 && <p className="text-sm text-gray-400 px-1">Сохранённых аккаунтов нет</p>}
                        {accounts.map(acc => (
                            <div key={acc.email} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors ${state.user?.email === acc.email ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                                <button onClick={() => doSwitch(acc.email)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                    {accountPhotos[acc.email] ? (
                                        <img src={accountPhotos[acc.email]} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-[#5b32d4] text-white flex items-center justify-center font-bold text-xs shrink-0">{initials(acc.name)}</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm dark:text-white truncate">{acc.email}</p>
                                        <p className="text-[11px] text-gray-400">Тариф: {acc.plan}</p>
                                    </div>
                                    {state.user?.email === acc.email && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                                </button>
                                <button onClick={() => deleteAccount(acc.email)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0" title="Удалить аккаунт"><Icons.Trash className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0 flex gap-2">
                    <button onClick={loginAnother} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm transition-colors">Войти в другой</button>
                    <button onClick={createNew} className="flex-1 py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">Создать новый</button>
                </div>
            </div>
        </div>
    );
}
