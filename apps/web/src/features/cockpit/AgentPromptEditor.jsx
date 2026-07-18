import { useState } from 'react';
import { applyManualPrompt } from '@/shared/lib/orchestrator-engine';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AgentPromptEditor — «динамическая прошивка» инструкций текстом
// ==========================================
// Позволяет править логику агента не только блоками в конструкторе, но и
// напрямую текстовым промптом. Каждое сохранение пишет запись в config.revisions
// (аудит), чтобы «прошивки» можно было отслеживать и откатывать.

export function AgentPromptEditor({ agent, state, updateState, onClose }) {
    const currentPrompt = agent.config?.instructions?.prompt || '';
    const [prompt, setPrompt] = useState(currentPrompt);

    const save = () => {
        const updated = applyManualPrompt(agent, prompt);
        const agents = (state.aiAgents || []).map((a) => (a.id === agent.id ? updated : a));
        updateState({ aiAgents: agents });
        onClose();
    };

    const revisions = agent.config?.revisions || [];

    return (
        <div className="p-5">
            <div className="flex items-center gap-2 mb-1">
                <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                <h4 className="font-extrabold text-lg dark:text-white">Правка через промпт</h4>
            </div>
            <p className="text-sm text-gray-400 mb-4 ml-1">
                Опишите текстом, как должен вести себя агент. Инструкция прошьётся поверх блоков.
            </p>

            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={7}
                placeholder="Например: Ты — агент поддержки. Отвечай кратко и по делу, всегда предлагай следующий шаг…"
                className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none mb-3"
                autoFocus
            />

            {revisions.length > 0 && (
                <div className="mb-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">История прошивок</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                        {revisions.slice().reverse().slice(0, 5).map((r, i) => (
                            <div key={i} className="text-[11px] text-gray-400 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                                <span className="truncate">{r.source === 'orchestrator' ? 'Оркестратор' : 'Вручную'}: {r.prompt}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 font-bold text-sm dark:text-white">Отмена</button>
                <button onClick={save} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4c28b8] text-white font-bold text-sm transition-colors">Прошить</button>
            </div>
        </div>
    );
}
