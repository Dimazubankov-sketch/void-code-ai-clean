import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function SystemPromptView({ state, updateState }) {
    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Системный промт</h2>
                </div>
                <div className="bg-white dark:bg-darkCard rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-darkBorder space-y-4">
                    <textarea value={state.systemPromptState} onChange={e => updateState({systemPromptState: e.target.value})} className="w-full h-48 p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl dark:text-white font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#5b32d4]" placeholder="Укажите базовые инструкции для ИИ..."></textarea>
                    <button onClick={() => updateState({systemPromptState: 'Ты — опытный наставник по программированию. Объясняй концепции просто и с комментариями.'})} className="w-full bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 font-bold py-3.5 rounded-2xl transition-colors flex justify-center items-center gap-2 hover:bg-[#e0dbf4]"><Icons.Sparkles /> Сгенерировать</button>
                </div>
            </div>
        </div>
    );
}
