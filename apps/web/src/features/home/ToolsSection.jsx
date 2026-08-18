// ==========================================
// ToolsSection — «Инструменты»
// ==========================================
// Компактные tiles вместо прежних огромных карточек 2×2. Voice Mode сюда
// сознательно НЕ добавлен отдельной плиткой — это способ взаимодействия,
// который уже живёт в Composer (кнопка ниже поля ввода), а не отдельный
// инструмент. Voice Studio (создание/клонирование голосов) — наоборот,
// отдельный инструмент, поэтому он здесь.
export function ToolsSection({ tools, onOpenAll }) {
    return (
        <div className="mb-8 sm:mb-10">
            <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Инструменты</h2>
                <button onClick={onOpenAll} className="void-tap-target text-xs font-bold text-[#5b32d4] dark:text-purple-400 hover:underline px-1 py-1">Все →</button>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0 pb-1">
                {tools.map((tool, i) => (
                    <button
                        key={i}
                        onClick={tool.onClick}
                        className="void-tap-target shrink-0 w-[104px] sm:w-[116px] flex flex-col items-center gap-2 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] transition-all"
                    >
                        <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${tool.color}`}>
                            <tool.icon className="w-5 h-5" />
                        </span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 text-center leading-tight">{tool.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
