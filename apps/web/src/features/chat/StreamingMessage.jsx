import { useState, useEffect, useRef } from 'react';
import { MessageRenderer } from '@/features/chat/MessageRenderer';

// ==========================================
// StreamingMessage — «печать» ответа ИИ (задача 5)
// ==========================================
// Раньше текст «печатался» посимвольно через GSAP-твин числа 0→1 (см.
// прежний TypewriterMessage) — плавно, но визуально это было просто
// быстрое появление символов, без какой-либо реакции на КАЖДОЕ слово.
// По присланной спеке transitions.dev «Streaming text» логика другая:
// текст разбивается на СЛОВА, каждое слово — свой <span>, и слова
// проявляются по очереди через opacity + лёгкое размытие (blur),
// рассасывающееся за --stream-fade — а не просто возникают резко.
//
// Разница с демо-спекой: там весь текст уже известен заранее и слова
// проявляются с фиксированным --stream-gap (60мс). У нас чат может
// прислать очень длинный ответ (сотни слов) — при фиксированных 60мс на
// слово это тянулось бы по 15-20 секунд, что хуже прежнего поведения
// (там жёстко ограничивали 1.2с). Поэтому оставляем 60мс как базовый шаг
// для КОРОТКИХ ответов, но пропорционально сжимаем интервал для длинных,
// чтобы весь показ укладывался в ~1.4с — сама механика анимации (fade +
// blur на каждое слово, кривая, длительность одного перехода) остаётся
// в точности по спеке, меняется только шаг между словами.
//
// Пока идёт анимация, слова показываются как ЕСТЬ в исходном тексте (то
// есть markdown-разметка — **, #, ``` — видна как обычные символы, без
// оформления). Так честнее, чем частично парсить markdown на лету
// (раньше так и было — из-за этого «**жирный**» на середине печати
// иногда мигал сырыми звёздочками). Как только последнее слово
// показалось — компонент переключается на MessageRenderer, и текст
// мгновенно становится полностью отформatированным (тот же переход, что
// и раньше: ChatView сам меняет isAnimated на false и рендерит
// MessageRenderer снаружи, см. markAnimationDone).

const BASE_GAP_MS = 60;     // --stream-gap из спеки — шаг для коротких ответов
const MAX_TOTAL_MS = 1400;  // общий потолок показа для очень длинных ответов
const MIN_GAP_MS = 8;       // нижняя граница шага (не даём словам «слипаться» в 0мс)

export function StreamingMessage({ content, onProgress, onDone }) {
    const [visibleCount, setVisibleCount] = useState(0);
    const [finished, setFinished] = useState(false);
    const wordsRef = useRef([]);
    const timeoutsRef = useRef([]);
    // Увеличивается при каждом новом content — используется в key каждого
    // слова, чтобы гарантированно размонтировать старые <span> и создать
    // новые. Это и есть аналог приёма «wipe + force reflow + restore» из
    // спеки (там это нужно, чтобы обмануть браузер и заставить transition
    // сыграть заново на тех же DOM-узлах) — в React проще и надёжнее
    // просто пересоздать узлы, тогда исходное opacity:0 гарантированно
    // успевает отрисоваться до того, как мы добавим .is-in.
    const revisionRef = useRef(0);

    useEffect(() => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        revisionRef.current += 1;

        const text = content || '';
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Разбиваем по пробельным символам — по спеке единица анимации это
        // слово, а не строка/абзац. Переносы строк внутри текста при этом
        // схлопываются в пробелы ТОЛЬКО на время анимации; после finished
        // рендерится полноценный MessageRenderer с настоящими абзацами.
        const words = text.trim().length ? text.trim().split(/\s+/) : [];
        wordsRef.current = words;

        if (reduce || words.length === 0) {
            setVisibleCount(words.length);
            setFinished(true);
            if (onDone) onDone();
            return undefined;
        }

        setFinished(false);
        setVisibleCount(0);

        const gap = Math.max(MIN_GAP_MS, Math.min(BASE_GAP_MS, MAX_TOTAL_MS / words.length));
        words.forEach((_, i) => {
            const t = setTimeout(() => {
                setVisibleCount(i + 1);
                if (onProgress) onProgress();
                if (i === words.length - 1) {
                    setFinished(true);
                    if (onDone) onDone();
                }
            }, i * gap);
            timeoutsRef.current.push(t);
        });

        return () => { timeoutsRef.current.forEach(clearTimeout); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content]);

    if (finished) return <MessageRenderer content={content} />;

    const revision = revisionRef.current;
    return (
        <span className="whitespace-pre-wrap">
            {wordsRef.current.slice(0, visibleCount).map((word, i) => (
                <span key={`${revision}-${i}`}>
                    <StreamWord word={word} />
                    {i < visibleCount - 1 ? ' ' : ''}
                </span>
            ))}
        </span>
    );
}

// Один сегмент: монтируется с opacity:0 + blur (см. .t-stream-w в
// styles/index.css), затем на следующем кадре получает .is-in — переход
// в чистое/видимое состояние проигрывается за --stream-fade.
function StreamWord({ word }) {
    const [isIn, setIsIn] = useState(false);
    useEffect(() => {
        const raf = requestAnimationFrame(() => setIsIn(true));
        return () => cancelAnimationFrame(raf);
    }, []);
    return <span className={`t-stream-w ${isIn ? 'is-in' : ''}`}>{word}</span>;
}
