import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { Icons } from '@/shared/ui/Icons';
import { playNotificationSound } from '@/shared/lib/sound';
import { playVoiceModeOpenChime } from '@/shared/lib/voiceModeChime';

// ==========================================
// SoundSettings — раздел «Звук» в настройках
// ==========================================
// Собирает в одном месте два переключателя, которые раньше лежали прямо
// в общем списке настроек:
//   • «Уведомления» — общий выключатель уведомлений Void Code
//     (state.notificationsEnabled, читается по всему приложению).
//   • «Звук голосового режима» — короткие сигналы входа/выхода из Voice
//     Mode (state.voiceModeSounds, см. voiceModeChime.jsx).
//
// Оба по умолчанию ВКЛЮЧЕНЫ. Для voiceModeSounds это важно проверять как
// `!== false`, а не по truthy: у существующих пользователей поля в
// сохранённом состоянии ещё нет, и они должны слышать звук, а не молчание.

function ToggleRow({ icon: Icon, label, hint, checked, onToggle, last }) {
    return (
        <div
            onClick={onToggle}
            className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/50 rounded-2xl transition-colors ${last ? '' : 'border-b border-gray-50 dark:border-gray-800/50'}`}
        >
            <div className="flex items-center gap-4 min-w-0">
                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 rounded-xl shrink-0"><Icon /></div>
                <div className="min-w-0">
                    <p className="font-bold text-[15px] dark:text-white">{label}</p>
                    {hint && <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>}
                </div>
            </div>
            <div className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center shrink-0 ml-3 ${checked ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}></div>
            </div>
        </div>
    );
}

export function SoundSettings({ state, updateState, onClose }) {
    useLockBodyScroll();

    const notificationsOn = state.notificationsEnabled !== false;
    const voiceSoundsOn = state.voiceModeSounds !== false;

    const toggleNotifications = () => {
        const next = !notificationsOn;
        updateState({ notificationsEnabled: next });
        // Проигрываем только при включении — сразу слышно, что именно включили.
        if (next) playNotificationSound();
    };

    const toggleVoiceSounds = () => {
        const next = !voiceSoundsOn;
        updateState({ voiceModeSounds: next });
        if (next) playVoiceModeOpenChime();
    };

    return (
        <div data-modal-overlay className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Bell className="w-5 h-5" /></div>
                    <h4 className="font-extrabold text-lg dark:text-white">Звук</h4>
                    <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <p className="text-sm text-gray-400 mb-4">Управление звуками и уведомлениями</p>

                <div className="bg-gray-50/60 dark:bg-gray-800/30 rounded-2xl p-1">
                    <ToggleRow
                        icon={Icons.Bell}
                        label="Уведомления"
                        hint="Все уведомления Void Code"
                        checked={notificationsOn}
                        onToggle={toggleNotifications}
                    />
                    <ToggleRow
                        icon={Icons.Waveform}
                        label="Звук голосового режима"
                        hint="Сигналы входа и выхода"
                        checked={voiceSoundsOn}
                        onToggle={toggleVoiceSounds}
                        last
                    />
                </div>
            </div>
        </div>
    );
}
