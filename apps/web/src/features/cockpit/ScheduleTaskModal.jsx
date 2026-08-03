import { useState, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { apiFetch } from '@/shared/api/client';

// ==========================================
// ScheduleTaskModal — планировщик задач для агента-оркестратора
// ==========================================
// Позволяет пользователю запланировать задачу: описать её текстом,
// выбрать время старта и периодичность (одноразово / ежедневно /
// еженедельно / ежемесячно). После сохранения задача уходит в очередь
// на бэкенд (POST /api/v1/tasks/schedule) — оркестратор её подхватит и
// начнёт исполнять по расписанию.
//
// GSAP: модалка появляется через fade + scale, кнопки — hover:scale-105.
//
// Backend-эндпоинт — заглушка (StubTasksController) с in-memory Map.
// Реальный планировщик (например, node-cron или BullMQ) — задача
// следующей итерации; сейчас достаточно того, что фронт умеет собирать
// корректный payload и получать 201.

const PERIODS = [
    { id: 'once', label: 'Один раз', icon: '📅' },
    { id: 'daily', label: 'Ежедневно', icon: '🔁' },
    { id: 'weekly', label: 'Еженедельно', icon: '📆' },
    { id: 'monthly', label: 'Ежемесячно', icon: '🗓️' },
];

function nowLocalDatetimeInput() {
    // datetime-local хочет ISO без часового пояса: YYYY-MM-DDThh:mm
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

export function ScheduleTaskModal({ open, onClose, agentId, agentName, onScheduled }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startAt, setStartAt] = useState(nowLocalDatetimeInput);
    const [period, setPeriod] = useState('once');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const scope = useRef(null);

    useGSAP(() => {
        if (!open || !scope.current) return;
        gsap.from(scope.current, { autoAlpha: 0, y: 20, scale: 0.96, duration: 0.3, ease: 'back.out(1.6)' });
    }, { scope, dependencies: [open] });

    if (!open) return null;

    const save = async () => {
        setError(null);
        const trimmedTitle = title.trim();
        if (!trimmedTitle) { setError('Введите название задачи'); return; }
        if (!startAt) { setError('Укажите время старта'); return; }
        // Собираем ISO с локальной ТЗ. В backend уходит UTC-строка.
        const startAtIso = new Date(startAt).toISOString();
        setSaving(true);
        try {
            const created = await apiFetch('/api/v1/tasks/schedule', {
                method: 'POST',
                body: JSON.stringify({
                    agentId,
                    title: trimmedTitle,
                    description: description.trim(),
                    startAt: startAtIso,
                    period,
                }),
            });
            if (onScheduled) onScheduled(created);
            onClose();
        } catch (e) {
            setError(e?.message || 'Не удалось запланировать задачу');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[110] bg-black/50 flex items-end sm:items-center justify-center fade-in"
            onClick={onClose}
        >
            <div
                ref={scope}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:w-[440px] bg-white dark:bg-darkCard rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-darkBorder">
                    <div className="flex items-center gap-2">
                        <Icons.Clock className="w-5 h-5 text-[#5b32d4]" />
                        <h4 className="font-extrabold text-lg dark:text-white">Запланировать задачу</h4>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 -mr-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                    >
                        <Icons.X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {agentName && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Icons.Robot className="w-3.5 h-3.5" />
                            <span>Агент: <b className="text-gray-700 dark:text-gray-200">{agentName}</b></span>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Название задачи
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Например: Проверить почту и составить сводку"
                            className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 dark:bg-darkBg border border-gray-200 dark:border-darkBorder text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5b32d4]/40"
                            maxLength={120}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Описание (что делать)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Дополнительные детали для агента…"
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 dark:bg-darkBg border border-gray-200 dark:border-darkBorder text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5b32d4]/40 resize-none"
                            maxLength={800}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Когда начать
                        </label>
                        <input
                            type="datetime-local"
                            value={startAt}
                            onChange={(e) => setStartAt(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-2xl bg-gray-50 dark:bg-darkBg border border-gray-200 dark:border-darkBorder text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5b32d4]/40"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Периодичность
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {PERIODS.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setPeriod(p.id)}
                                    className={
                                        `flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold border transition-all ` +
                                        (period === p.id
                                            ? 'bg-[#5b32d4] text-white border-[#5b32d4] shadow-md'
                                            : 'bg-gray-50 dark:bg-darkBg text-gray-700 dark:text-gray-200 border-gray-200 dark:border-darkBorder hover:bg-gray-100 dark:hover:bg-gray-800')
                                    }
                                >
                                    <span>{p.icon}</span>
                                    <span>{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs font-semibold">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex gap-2 p-5 pt-0">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 rounded-2xl font-bold text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 rounded-2xl font-bold text-sm text-white bg-[#5b32d4] hover:bg-[#4c28b8] transition-colors disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                    >
                        {saving ? 'Сохранение…' : (<><Icons.Clock className="w-4 h-4" /> В очередь</>)}
                    </button>
                </div>
            </div>
        </div>
    );
}
