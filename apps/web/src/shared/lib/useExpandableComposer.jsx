import { useRef, useState } from 'react';

// ==========================================
// useExpandableComposer — общая логика для полноэкранного режима и
// отступа (общая для чата и Хаба — чинить один раз, не в двух местах)
// ==========================================
// ВАЖНО (после предыдущей неудачной попытки): раньше полноэкранный режим
// был реализован через GSAP FLIP (position:fixed на исходном элементе +
// анимация координат). Проблема — исходный элемент был вложен в предка с
// собственным position:absolute + z-index, который создаёт СВОЙ
// стекинговый контекст; фикс-позиционированный потомок всё равно
// оказывался внутри этого контекста, и оверлей рисовался поверх содержимого
// («видно только блюр»). Надёжное решение — Portal: полноэкранный режим
// рендерится ОТДЕЛЬНЫМ деревом прямо в document.body (см. ChatView.jsx/
// HomeView.jsx), полностью в обход любых родительских z-index/position.
// Здесь остаётся только состояние и чистая логика, без DOM-манипуляций.

const CHAR_TRIGGER = 57;
const INDENT_TRIGGER = 3;

export function useExpandableComposer({ value, onChange }) {
    const [expanded, setExpanded] = useState(false);
    // Считаем количество вставленных отступов (задача 2: кнопка
    // полноэкранного режима должна появляться после 57 символов ИЛИ 3
    // отступов — раньше высчитывалось по высоте textarea, что срабатывало
    // слишком рано, уже на второй визуальной строке).
    const indentCountRef = useRef(0);

    const manyChars = (value || '').length >= CHAR_TRIGGER || indentCountRef.current >= INDENT_TRIGGER;

    const enterFullscreen = () => setExpanded(true);
    const exitFullscreen = () => setExpanded(false);

    // textareaEl передаётся вызывающей стороной — в компактном и
    // полноэкранном режиме это РАЗНЫЕ DOM-узлы (два разных <textarea>,
    // см. комментарий в ChatView.jsx), хук сам не хранит единственный ref.
    const insertIndent = (textareaEl) => {
        if (!textareaEl) return;
        const start = textareaEl.selectionStart ?? (value || '').length;
        const end = textareaEl.selectionEnd ?? start;
        const next = (value || '').slice(0, start) + '\u00A0\u00A0\u00A0\u00A0' + (value || '').slice(end);
        onChange(next);
        indentCountRef.current += 1;
        requestAnimationFrame(() => {
            textareaEl.focus();
            textareaEl.selectionStart = textareaEl.selectionEnd = start + 4;
        });
    };

    return { expanded, manyChars, enterFullscreen, exitFullscreen, insertIndent };
}
