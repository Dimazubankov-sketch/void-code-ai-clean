import { useRef, useState, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// useExpandableComposer — общая логика для задач 11 и 12
// ==========================================
// ВАЖНО (урок с прошлого раунда): и основной чат (ChatView.jsx), и Хаб
// (HomeView.jsx) имеют СВОИ СОБСТВЕННЫЕ, не связанные друг с другом копии
// разметки поля ввода — правка одного файла никак не затрагивает другой.
// Чтобы одинаковый баг («забыли поправить второе место») не повторился —
// вся логика полноэкранного режима и отступа вынесена сюда ОДИН раз, а
// используется в обоих компонентах. Если понадобится починить что-то в
// будущем — чинить нужно только здесь.
//
// Задача 11: после 3 строк текста показываем кнопку разворота на весь
// экран (FLIP-анимация через GSAP — элемент визуально «выезжает» из
// текущего места в полноэкранное, без скачка).
// Задача 12: кнопка отступа (красная строка) — вставляет отступ в позицию
// курсора; также перехватываем Tab, чтобы он не уводил фокус со страницы.

const LINE_HEIGHT_PX = 24;
// Задача 3 (повторно): кнопку полноэкранного режима показываем только
// начиная с 4-й строки — раньше был порог 3 и она вылезала слишком рано
// (уже на второй визуальной строке из-за запаса) и налезала на кнопку
// отправки в правом верхнем углу.
const FULLSCREEN_TRIGGER_LINES = 4;

export function useExpandableComposer({ textareaRef, wrapRef, value, onChange }) {
    const [expanded, setExpanded] = useState(false);
    const [manyLines, setManyLines] = useState(false);
    const collapsedRectRef = useRef(null);

    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el || expanded) return;
        const prevMaxHeight = el.style.maxHeight;
        el.style.maxHeight = 'none';
        const lines = Math.round(el.scrollHeight / LINE_HEIGHT_PX);
        el.style.maxHeight = prevMaxHeight;
        setManyLines(lines >= FULLSCREEN_TRIGGER_LINES);
    }, [value, expanded, textareaRef]);

    const { contextSafe } = useGSAP({ scope: wrapRef });

    const enterFullscreen = contextSafe(() => {
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        collapsedRectRef.current = rect;
        setExpanded(true);
        gsap.set(el, {
            position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            zIndex: 100, margin: 0,
        });
        gsap.to(el, {
            top: 12, left: 12, right: 12, bottom: 12, width: 'auto', height: 'auto',
            duration: 0.4, ease: 'power3.inOut',
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
    });

    const exitFullscreen = contextSafe(() => {
        const el = wrapRef.current;
        const rect = collapsedRectRef.current;
        if (!el || !rect) { setExpanded(false); return; }
        gsap.to(el, {
            top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: 'auto', bottom: 'auto',
            duration: 0.35, ease: 'power3.inOut',
            onComplete: () => {
                gsap.set(el, { clearProps: 'position,top,left,right,bottom,width,height,zIndex,margin' });
                setExpanded(false);
            },
        });
    });

    const insertIndent = () => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? (value || '').length;
        const end = el.selectionEnd ?? start;
        const next = (value || '').slice(0, start) + '\u00A0\u00A0\u00A0\u00A0' + (value || '').slice(end);
        onChange(next);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + 4;
        });
    };

    return { expanded, manyLines, enterFullscreen, exitFullscreen, insertIndent };
}
