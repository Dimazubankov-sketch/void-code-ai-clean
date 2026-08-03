import { useLongPressCopy } from '@/shared/lib/useLongPressCopy';

// ==========================================
// UserMessageBubble — пузырь СВОЕГО (user) сообщения
// ==========================================
// Выделен в отдельный компонент, чтобы у каждого экземпляра был свой
// useLongPressCopy (React hooks нельзя вызывать в .map()). При long-press
// (>500мс) содержимое msg.content копируется в буфер, срабатывает GSAP
// анимация «сжатие → пульсация → возврат» и вызывается onCopied для тоста.

export function UserMessageBubble({ msg, onCopied }) {
    const { bind } = useLongPressCopy(() => msg.content || '', onCopied);
    return (
        <div
            {...bind}
            className="p-4 md:p-5 rounded-3xl void-selectable min-w-0 max-w-full overflow-hidden break-words bg-[#5b32d4] text-white rounded-tr-sm shadow-sm cursor-pointer select-none touch-manipulation"
            style={{ willChange: 'transform' }}
        >
            {msg.image && (
                <img
                    src={msg.image}
                    alt="Upload"
                    className="max-w-full md:max-w-sm rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-800"
                />
            )}
            {msg.content && (
                <div className="text-[17px] sm:text-[18px] leading-relaxed break-words whitespace-pre-wrap">
                    {msg.content}
                </div>
            )}
        </div>
    );
}
