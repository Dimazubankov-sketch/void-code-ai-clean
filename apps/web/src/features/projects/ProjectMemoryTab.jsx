import { useState } from 'react';
import { SkillsPanel } from '@/features/skills/SkillsView';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// Подвкладки проекта: Скиллы / Инструкции / (Чаты рендерятся снаружи)
// ==========================================
// «Инструкции проекта» (Project Memory) — динамический документ с ключевым
// контекстом проекта: стек, архитектура, API-ключи, важные детали. При
// включённом «Сквозном контексте» новая ключевая информация из чатов
// проекта агрегируется сюда, и новый чат проекта считывает весь контекст.
// Здесь пользователь может редактировать документ вручную и искать по нему.

export function ProjectMemoryTab({ project, updateProject }) {
    const [query, setQuery] = useState('');
    const memory = project.memory || '';

    // Подсветка найденных фрагментов при поиске по документу.
    const lines = memory.split('\n');
    const q = query.trim().toLowerCase();
    const filtered = q ? lines.filter(l => l.toLowerCase().includes(q)) : lines;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20">
                <div className="flex items-center gap-3 min-w-0">
                    <Icons.Sparkles className="w-5 h-5 text-[#5b32d4] shrink-0" />
                    <div className="min-w-0">
                        <p className="font-bold text-sm text-[#5b32d4] dark:text-purple-300">Сквозной контекст проекта</p>
                        <p className="text-xs text-[#5b32d4]/70 dark:text-purple-300/70 leading-relaxed">Новая ключевая информация из чатов автоматически пополняет инструкции.</p>
                    </div>
                </div>
                <button
                    onClick={() => updateProject({ unifiedContext: !(project.unifiedContext ?? true) })}
                    className={`shrink-0 w-12 h-7 rounded-full p-1 transition-colors flex items-center ${(project.unifiedContext ?? true) ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${(project.unifiedContext ?? true) ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>

            {/* Поиск по инструкциям */}
            <div className="relative">
                <Icons.Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Поиск по инструкциям…"
                    className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-xl text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors"
                />
            </div>

            {q ? (
                // Режим поиска — показываем только совпавшие строки
                <div className="bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl p-4 min-h-[120px]">
                    {filtered.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Ничего не найдено</p>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map((l, i) => <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{l}</p>)}
                        </div>
                    )}
                </div>
            ) : (
                // Обычный режим — редактируемый документ
                <textarea
                    value={memory}
                    onChange={e => updateProject({ memory: e.target.value })}
                    rows={12}
                    placeholder={'Здесь хранится контекст проекта: стек, архитектура, важные детали, ключи…\n\nПри включённом сквозном контексте раздел пополняется автоматически из чатов проекта.'}
                    className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none leading-relaxed"
                />
            )}
            <p className="text-xs text-gray-400 ml-1">Эти инструкции считываются ассистентом во всех чатах проекта.</p>
        </div>
    );
}

// Подвкладка «Скиллы» проекта — та же панель, но с projectId (скиллы
// изолированы: работают только в чатах этого проекта).
export function ProjectSkillsTab({ state, updateState, projectId }) {
    return <SkillsPanel state={state} updateState={updateState} projectId={projectId} />;
}
