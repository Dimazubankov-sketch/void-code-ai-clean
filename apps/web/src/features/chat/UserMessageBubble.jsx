import { useLongPressMenu } from '@/shared/lib/useLongPressMenu';
import { MessageActionMenu } from '@/features/chat/MessageActionMenu';
import { copyToCb } from '@/shared/lib/clipboard';

// ==========================================
// UserMessageBubble — пузырь СВОЕГО (user) сообщения
// ==========================================
// Выделен в отдельный компонент, чтобы у каждого экземпляра был свой
// useLongPressMenu (React hooks нельзя вызывать в .map()).
//
// Зажатие (long-press, >450мс) открывает плавающее мини-меню из двух
// действий — «Скопировать» и «Редактировать» — вместо прежнего мгновенного
// копирования. Меню появляется с GSAP-анимацией (см. MessageActionMenu).
//
// onEdit получает текст сообщения и кладёт его в поле ввода чата (родитель
// — ChatView — отвечает за то, куда именно положить текст: обычно в
// state.inputValue с фокусом на textarea).
export function UserMessageBubble({ msg, onCopied, onEdit }) {
    const { bind, menuOpen, setMenuOpen } = useLongPressMenu();

    const handleCopy = () => {
        try { copyToCb(msg.content || ''); } catch { /* noop */ }
        if (onCopied) onCopied('Скопировано');
        setMenuOpen(false);
    };

    const handleEdit = () => {
        if (onEdit) onEdit(msg.content || '');
        setMenuOpen(false);
    };

    return (
        <div className="relative">
            <MessageActionMenu
                open={menuOpen}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onClose={() => setMenuOpen(false)}
            />
            <div
                {...bind}
                // Специально БЕЗ void-selectable: пользователь попросил
                // убрать ручное выделение и копирование СВОИХ сообщений —
                // теперь единственный способ скопировать текст своего
                // сообщения это open-меню и кнопка «Скопировать». user-select-none
                // отключает системное выделение (на desktop и iOS long-press
                // тоже перестанет вызывать системное меню Copy). Сообщения
                // ИИ по-прежнему остаются выделяемыми — их отдельный
                // рендер в MessageRenderer.
                className="p-4 md:p-5 rounded-3xl min-w-0 max-w-full overflow-hidden break-words bg-[#5b32d4] text-white rounded-tr-sm shadow-sm cursor-pointer select-none touch-manipulation"
                style={{ willChange: 'transform', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
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
        </div>
    );
}
