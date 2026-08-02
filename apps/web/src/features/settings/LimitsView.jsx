import { useState, useEffect } from 'react';
import { getPlanLimits } from '@/shared/config/models';
import { goBack } from '@/shared/lib/navigation';
import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { fetchImageUsage, fetchTtsUsage } from '@/shared/api/chat';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// LimitsView — раздел «Лимиты»
// ==========================================
// На ПК открывается как центрированная модалка (как «Голос» / «Личные
// данные»), а не на весь экран. Если onClose передан — рендерим модалку;
// если нет — остаётся полноэкранный режим (обратная совместимость).

export function LimitsView({ state, updateState, onClose }) {
    useLockBodyScroll(!!onClose);
    if (onClose) {
        return (
            <div data-modal-overlay className="fixed inset-0 z-[100] bg-black/40 flex justify-end sm:items-center sm:justify-center fade-in" onClick={onClose}>
                <div className="w-full sm:w-[460px] h-full sm:h-auto sm:max-h-[85vh] bg-white dark:bg-darkCard shadow-2xl slide-in-right sm:rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                        <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                        <h4 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.BarChart className="w-5 h-5 text-[#5b32d4]" /> Лимиты</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5">
                        <LimitsContent state={state} updateState={updateState} onNavigate={onClose} />
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Лимиты</h2>
                </div>
                <LimitsContent state={state} updateState={updateState} />
            </div>
        </div>
    );
}

// ==========================================
// Универсальный блок «лимит» с прогрессом
// ==========================================
// Используется для дневного/недельного лимита чата, для картинок и для
// символов TTS — единый визуальный контракт.
function LimitBar({ title, used, limit, unitLabel = 'запросов', accent = '#5b32d4' }) {
    const isInfinite = limit === Infinity || limit === 'Infinity';
    const percent = isInfinite ? 100 : (limit > 0 ? Math.min((used / limit) * 100, 100) : 0);
    const exhausted = !isInfinite && used >= limit;
    const label = isInfinite ? 'Безлимитно' : `${formatCompact(used)} / ${formatCompact(limit)} ${unitLabel}`;
    return (
        <div>
            <div className="flex justify-between items-end mb-2">
                <span className="font-bold text-sm dark:text-white">{title}</span>
                <span className={`text-sm font-bold ${exhausted ? 'text-amber-500' : 'text-gray-500'}`}>{label}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
                <div
                    className="h-3 rounded-full transition-all duration-700"
                    style={{
                        width: `${percent}%`,
                        background: exhausted ? '#f59e0b' : accent,
                    }}
                />
            </div>
        </div>
    );
}

// Компактный формат для больших чисел (12345 → 12.3K).
function formatCompact(n) {
    if (n === Infinity) return '∞';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(0) + 'K';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

// Форматирует миллисекунды в «5 ч 59 мин» / «59 мин 30 с» — в зависимости
// от масштаба оставшегося времени.
function formatCountdown(ms) {
    if (ms <= 0) return 'обновляется…';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h} ч ${m.toString().padStart(2, '0')} мин`;
    if (m > 0) return `${m} мин ${s.toString().padStart(2, '0')} с`;
    return `${s} с`;
}

// Общее наполнение (инфо-блоки + прогресс-бары), одинаковое для модалки и
// полноэкранного режима.
function LimitsContent({ state, updateState, onNavigate }) {
    const plan = state.userPlan;
    const { daily: maxDaily, weekly: maxWeekly } = getPlanLimits(plan);

    const usedDaily = state.usedDailyLimits || 0;
    const usedWeekly = state.usedWeeklyLimits || 0;
    const dailyExhausted = maxDaily !== Infinity && usedDaily >= maxDaily;

    // Тикающие часы: раз в секунду обновляем «сейчас», чтобы обратный
    // отсчёт до восстановления лимитов был живым (5 ч 59 мин → 5 ч 58 мин).
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Дневные лимиты восстанавливаются через 6 часов после последнего
    // превышения — соответствует новому ТЗ.
    const RESET_WINDOW_MS = 6 * 60 * 60 * 1000;
    const resetInMs = state.dailyLimitExceededAt ? Math.max(0, (state.dailyLimitExceededAt + RESET_WINDOW_MS) - now) : 0;

    // Подтягиваем реальные usage-данные с бэкенда (картинки и TTS).
    // Если поле в БД ещё не мигрировано или сервер недоступен —
    // fetchImageUsage/fetchTtsUsage вернут нули, вкладка не сломается.
    const [imageUsage, setImageUsage] = useState({ used: 0, limit: 0 });
    const [ttsUsage, setTtsUsage] = useState({ used: 0, limit: 0 });
    useEffect(() => {
        let alive = true;
        Promise.all([fetchImageUsage(), fetchTtsUsage()]).then(([img, tts]) => {
            if (!alive) return;
            setImageUsage(img);
            setTtsUsage(tts);
        });
        return () => { alive = false; };
    }, [state.usedDailyLimits, state.generatedImages?.length]);

    const goPricing = () => { if (onNavigate) onNavigate(); updateState({ currentView: 'pricing' }); };

    return (
        <div className="bg-white dark:bg-darkCard rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-darkBorder space-y-6">
            {/* Пояснение про Void Mini */}
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-900/50 flex gap-3 items-start">
                <Icons.Info className="w-5 h-5 shrink-0 text-[#5b32d4] mt-0.5" />
                <p className="text-sm text-[#5b32d4] dark:text-purple-300 font-medium leading-relaxed flex-1 min-w-0">
                    Обычные запросы к модели <strong>Void Mini</strong> не расходуют премиум-лимиты и не отображаются на графике.
                </p>
            </div>

            {/* Универсальное уведомление о восстановлении через 6 часов */}
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 flex gap-3 items-start">
                <Icons.Clock className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold leading-relaxed">
                        Исчерпанные лимиты автоматически возобновляются через 6 часов.
                    </p>
                    {dailyExhausted && state.dailyLimitExceededAt && (
                        <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-medium mt-1">
                            Восстановление через <strong className="tabular-nums">{formatCountdown(resetInMs)}</strong>
                        </p>
                    )}
                </div>
            </div>

            {/* Дневной / Недельный лимит чатов */}
            <div className="space-y-5">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">Чат-запросы</h5>
                <LimitBar title="Дневной лимит" used={usedDaily} limit={maxDaily} />
                <LimitBar title="Недельный лимит" used={usedWeekly} limit={maxWeekly} />
            </div>

            {/* Лимит изображений */}
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 pt-3 flex items-center gap-2">
                    <Icons.Image className="w-3.5 h-3.5" /> Генерация изображений
                </h5>
                <LimitBar
                    title="Дневной лимит"
                    used={imageUsage.used || 0}
                    limit={imageUsage.limit || 0}
                    unitLabel="картинок"
                    accent="#8b5cf6"
                />
            </div>

            {/* Лимит озвучки */}
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 pt-3 flex items-center gap-2">
                    <Icons.Volume2 className="w-3.5 h-3.5" /> Озвучка текста
                </h5>
                <LimitBar
                    title="Символов за день"
                    used={ttsUsage.used || 0}
                    limit={ttsUsage.limit || 0}
                    unitLabel="симв."
                    accent="#22d3ee"
                />
                <p className="text-[11px] text-gray-400 font-medium">Одна страница текста ≈ 2000 символов.</p>
            </div>

            {plan === 'free' && (
                <button onClick={goPricing} className="w-full mt-2 bg-[#1a0b38] text-white font-bold py-4 rounded-2xl shadow-lg flex justify-center items-center gap-2 hover:bg-[#2a1b48] transition-colors">
                    <Icons.Star /> Сменить план
                </button>
            )}
        </div>
    );
}
