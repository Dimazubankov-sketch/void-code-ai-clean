import { Icons } from '@/shared/ui/Icons';

// ==========================================
// OrchestratorMessages — общая лента сообщений оркестратора
// ==========================================
// Один и тот же рендер для «кабины» (OrchestratorChatView) и «Оповещений
// агентов» (NotificationCenter) — часть единой системы одного чата.

export function OrchestratorMessages({ thread, reports, onRespond, emptyHint }) {
    if (thread.length === 0) {
        return (
            <div className="text-center text-gray-400 py-12 px-6">
                <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm leading-relaxed">{emptyHint}</p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {thread.map((m) => {
                if (m.role === 'user') {
                    return (
                        <div key={m.id} className="flex justify-end">
                            <div className="max-w-[80%] bg-[#5b32d4] text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
                            {m.image && <img src={m.image} alt="" className="max-w-full rounded-xl mb-2" />}
                            {m.text}
                        </div>
                        </div>
                    );
                }
                const report = reports.find((r) => r.id === m.reportId);
                const status = report?.status || 'pending';
                return (
                    <div key={m.id} className="flex justify-start">
                        <div className="max-w-[85%] bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl rounded-bl-md px-4 py-3 text-sm dark:text-gray-200">
                            <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                            {status === 'pending' && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => onRespond(m.reportId, 'approved')} className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-colors">Разрешить</button>
                                    <button onClick={() => onRespond(m.reportId, 'edited')} className="flex-1 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs font-bold dark:text-white transition-colors">Правка</button>
                                    <button onClick={() => onRespond(m.reportId, 'rejected')} className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 text-red-500 text-xs font-bold transition-colors">Отказ</button>
                                </div>
                            )}
                            {status === 'approved' && <p className="mt-2 text-[11px] font-bold text-green-600 dark:text-green-400">✓ Одобрено — задачи разданы</p>}
                            {status === 'rejected' && <p className="mt-2 text-[11px] font-bold text-red-500">✕ Отклонено</p>}
                            {status === 'edited' && <p className="mt-2 text-[11px] font-bold text-amber-500">✎ Отправлено на правку</p>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
