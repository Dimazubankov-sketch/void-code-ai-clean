import { useRef, useState } from 'react';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';

const initials = (str) => (str || '?').replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 2).toUpperCase();

// ==========================================
// «Личная информация» (задача 10)
// ==========================================
// Фото профиля, имя (можно менять сколько угодно), дата рождения (можно
// выбрать РОВНО ОДИН РАЗ — после сохранения поле блокируется навсегда),
// телефон и почта — только для чтения (привязываются при регистрации и
// не меняются). Изменения имени/даты рождения применяются только по
// нажатию «Сохранить», а не сразу при вводе — черновик живёт в локальном
// состоянии компонента.
export function ProfileEditView({ state, updateState }) {
    const photoInputRef = useRef(null);
    const accountPhotos = state.accountPhotos || {};
    const currentPhoto = state.user ? accountPhotos[state.user.email] : null;

    const birthDateLocked = !!state.user?.birthDate;
    const [name, setName] = useState(state.user?.name || '');
    const [birthDate, setBirthDate] = useState(state.user?.birthDate || '');
    const [saved, setSaved] = useState(false);

    const onChangePhoto = (e) => {
        const file = e.target.files?.[0];
        if (!file || !state.user) return;
        const reader = new FileReader();
        reader.onload = () => updateState({ accountPhotos: { ...accountPhotos, [state.user.email]: reader.result } });
        reader.readAsDataURL(file);
    };

    const canSave = name.trim().length > 0;

    const handleSave = () => {
        if (!canSave) return;
        const nextUser = { ...state.user, name: name.trim() };
        // Дату рождения фиксируем только если её ещё не было — повторные
        // сохранения поля не трогают (оно и так заблокировано на UI, но
        // проверяем и здесь на случай гонки состояний).
        if (!birthDateLocked && birthDate) {
            nextUser.birthDate = birthDate;
        }
        const patch = { user: nextUser };
        // Синхронизируем savedAccounts — иначе имя/дата рождения потеряются
        // при следующем переключении аккаунта (см. switchToAccount в
        // shared/lib/accounts.jsx, который пересобирает user именно из
        // savedAccounts).
        if (state.savedAccounts?.length) {
            patch.savedAccounts = state.savedAccounts.map(a =>
                a.email === state.user?.email ? { ...a, name: nextUser.name, birthDate: nextUser.birthDate ?? a.birthDate } : a
            );
        }
        updateState(patch);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
    };

    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Личная информация</h2>
                </div>

                <div className="bg-white dark:bg-darkCard rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-darkBorder space-y-6">
                    {/* Фото профиля */}
                    <div className="flex flex-col items-center text-center">
                        <button onClick={() => photoInputRef.current?.click()} className="relative group">
                            {currentPhoto ? (
                                <img src={currentPhoto} alt="" className="w-24 h-24 rounded-full object-cover" />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-[#5b32d4] text-white flex items-center justify-center font-extrabold text-3xl">{initials(state.user?.name)}</div>
                            )}
                            <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Icons.Pencil className="w-6 h-6 text-white" />
                            </span>
                        </button>
                        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onChangePhoto} />
                        <button onClick={() => photoInputRef.current?.click()} className="text-xs font-bold text-[#5b32d4] mt-2">Сменить фото</button>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Имя</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl dark:text-white font-medium outline-none transition-all focus:border-[#5b32d4]" />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Дата рождения</label>
                            <input
                                type="date"
                                value={birthDate}
                                disabled={birthDateLocked}
                                onChange={e => setBirthDate(e.target.value)}
                                max={new Date().toISOString().slice(0, 10)}
                                className={`w-full p-4 border rounded-2xl font-medium outline-none transition-all ${birthDateLocked ? 'bg-gray-100 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400 cursor-not-allowed' : 'bg-gray-50 dark:bg-[#23232f] border-gray-100 dark:border-gray-800 dark:text-white focus:border-[#5b32d4]'}`}
                            />
                            <p className="text-[11px] text-gray-400 mt-1.5 ml-1">
                                {birthDateLocked ? 'Дату рождения можно указать только один раз — изменить её больше нельзя.' : 'Можно указать только один раз. Проверьте дату перед сохранением.'}
                            </p>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Номер телефона</label>
                            <input type="tel" value={state.user?.phone || ''} readOnly disabled className="w-full p-4 bg-gray-100 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-400 font-medium outline-none cursor-not-allowed" />
                            <p className="text-[11px] text-gray-400 mt-1.5 ml-1">Номер телефона привязывается при регистрации и не может быть изменён.</p>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Почта</label>
                            <input type="text" value={state.user?.email || ''} readOnly disabled className="w-full p-4 bg-gray-100 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-400 font-medium outline-none cursor-not-allowed" />
                            <p className="text-[11px] text-gray-400 mt-1.5 ml-1">Почта привязывается при регистрации и не может быть изменена.</p>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button onClick={handleSave} disabled={!canSave} className="w-full bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold py-4 rounded-2xl shadow-lg transition-colors">
                            {saved ? 'Сохранено ✓' : 'Сохранить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
