import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация построена ТОЛЬКО на масштабе (scale) — простое плавное «дыхание»
// в покое, без изменений прозрачности/яркости.
//
// ЗАДАЧА 5 (повторный раунд): круг теперь анимируется В ТАКТ РЕАЛЬНОЙ
// озвучке через Web Audio API (AnalyserNode читает громкость воспроизводимого
// <audio>), а не имитацией случайными импульсами, как раньше. GSAP здесь
// используется для самого рендера: gsap.quickTo() плавно подтягивает scale
// к целевому значению на каждом тике gsap.ticker — так частые обновления
// (десятки раз в секунду) не создают сотни отдельных твинов, а амплитуда
// озвучки читается напрямую из voiceEl (переиспользуем УЖЕ существующий и
// проверенный паттерн из VoiceWaveMic.jsx, где то же самое реализовано для
// записи голоса и работает надёжно).
//
// БЕЗОПАСНЫЙ ОТКАТ: если Web Audio недоступен (старый браузер) или элемент
// озвучки отсутствует (фолбэк на Web Speech API без <audio>, см.
// useOpenAiTts.jsx), используется прежняя имитация случайными импульсами —
// круг всё равно «живёт», просто не идеально в такт.

// AudioContext дорог и браузеры ограничивают их число на страницу — держим
// один общий контекст на всё приложение, создаём лениво при первой попытке.
let sharedAudioCtx = null;
const getAudioCtx = () => {
    if (sharedAudioCtx) return sharedAudioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
        sharedAudioCtx = new Ctx();
    } catch {
        sharedAudioCtx = null;
    }
    return sharedAudioCtx;
};

// Каждый <audio>-элемент можно обернуть в MediaElementSourceNode РОВНО ОДИН
// раз за всю его жизнь — повторный вызов на том же элементе бросает
// InvalidStateError. WeakMap не мешает сборке мусора, когда элемент
// (создаётся заново на каждый speak(), см. useOpenAiTts.jsx) больше не нужен.
const sourceNodeCache = new WeakMap();

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128, audioEl = null }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    // Твины «дыхания» покоя — ставим на паузу на время «речи», чтобы не
    // спорить за scale с анимацией ниже.
    const idleTweensRef = useRef([]);

    // ---- Пассивная анимация «дыхания» — только scale ----
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        const coreTween = gsap.to('.orb-core', {
            scale: 1.06,
            duration: 2.2,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
        });

        gsap.set('.orb-halo-1', { autoAlpha: 0.28 });
        gsap.set('.orb-halo-2', { autoAlpha: 0.22 });
        const halo1Tween = gsap.to('.orb-halo-1', { scale: 1.15, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        const halo2Tween = gsap.to('.orb-halo-2', { scale: 1.22, duration: 3.0, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.6 });

        idleTweensRef.current = [coreTween, halo1Tween, halo2Tween];
        return () => { coreTween?.kill(); halo1Tween?.kill(); halo2Tween?.kill(); idleTweensRef.current = []; };
    }, { scope });

    // ---- Плавная смена цвета голоса ----
    const buildGradient = (from, to) =>
        `radial-gradient(circle at 32% 28%, ${from}, ${to} 70%, ${to})`;

    useGSAP(() => {
        const core = coreRef.current;
        if (!core) return;
        gsap.to(core, {
            background: buildGradient(colorFrom, colorTo),
            duration: 0.6,
            ease: 'power2.out',
        });
    }, { scope, dependencies: [colorFrom, colorTo] });

    // ---- Анимация «речи» при active=true ----
    useGSAP(() => {
        if (!active) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        idleTweensRef.current.forEach((tw) => tw?.pause());
        const resetToIdle = () => {
            gsap.to([coreRef.current, halo1Ref.current, halo2Ref.current], {
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
                overwrite: 'auto',
                onComplete: () => { idleTweensRef.current.forEach((tw) => tw?.resume()); },
            });
        };

        // --- Попытка №1: реальная синхронизация через Web Audio ---
        if (audioEl) {
            const ctx = getAudioCtx();
            if (ctx) {
                try {
                    // Контекст может остаться "suspended" до жеста
                    // пользователя в некоторых браузерах — клик по «Проверить
                    // голос» это ровно такой жест, resume() здесь безопасен.
                    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

                    let entry = sourceNodeCache.get(audioEl);
                    if (!entry) {
                        const source = ctx.createMediaElementSource(audioEl);
                        const analyser = ctx.createAnalyser();
                        analyser.fftSize = 256;
                        analyser.smoothingTimeConstant = 0.6;
                        source.connect(analyser);
                        // Обязательно — иначе после оборачивания в
                        // MediaElementSourceNode звук из колонок пропадёт:
                        // весь путь воспроизведения теперь идёт через граф
                        // Web Audio, а не напрямую из <audio>.
                        analyser.connect(ctx.destination);
                        entry = { analyser };
                        sourceNodeCache.set(audioEl, entry);
                    }

                    const { analyser } = entry;
                    const data = new Uint8Array(analyser.frequencyBinCount);
                    // quickTo — самый дешёвый способ гонять scale к новой
                    // цели десятки раз в секунду через GSAP, не создавая
                    // отдельный твин на каждый тик.
                    const quickCore = gsap.quickTo(coreRef.current, 'scale', { duration: 0.09, ease: 'power2.out' });
                    const quickHalo1 = gsap.quickTo(halo1Ref.current, 'scale', { duration: 0.12, ease: 'power2.out' });
                    const quickHalo2 = gsap.quickTo(halo2Ref.current, 'scale', { duration: 0.16, ease: 'power2.out' });

                    const tick = () => {
                        analyser.getByteFrequencyData(data);
                        let sum = 0;
                        for (let i = 0; i < data.length; i++) sum += data[i];
                        const avg = sum / data.length / 255; // 0..1 громкость
                        const scale = 1 + avg * 0.42;
                        quickCore(scale);
                        quickHalo1(scale + avg * 0.16);
                        quickHalo2(scale + avg * 0.24);
                    };
                    gsap.ticker.add(tick);

                    return () => { gsap.ticker.remove(tick); resetToIdle(); };
                } catch {
                    // Падаем в запасной вариант ниже (например, если этот
                    // audioEl уже был обёрнут где-то ещё — не должно
                    // случаться в норме, но не рискуем сломать анимацию).
                }
            }
        }

        // --- Запасной вариант: имитация случайными импульсами (Web
        // Speech фолбэк без <audio>, либо Web Audio недоступен/упал) ---
        const chain = { stopped: false };
        const rand = (min, max) => min + Math.random() * (max - min);
        const step = () => {
            if (chain.stopped) return;
            const scale = rand(1.05, 1.32);
            const haloScale = scale + rand(0.05, 0.18);
            const dur = rand(0.12, 0.26);
            gsap.timeline({ onComplete: step })
                .to([coreRef.current], { scale, duration: dur, ease: 'power2.out' }, 0)
                .to([halo1Ref.current, halo2Ref.current], { scale: haloScale, duration: dur, ease: 'power2.out' }, 0);
        };
        step();

        return () => { chain.stopped = true; resetToIdle(); };
    }, { scope, dependencies: [active, audioEl] });

    const px = `${size}px`;
    return (
        <div ref={scope} className="relative flex items-center justify-center" style={{ width: px, height: px }}>
            <div ref={halo1Ref} className="orb-halo-1 absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${colorFrom}, transparent 70%)` }} />
            <div ref={halo2Ref} className="orb-halo-2 absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${colorTo}, transparent 70%)` }} />
            <div
                ref={coreRef}
                className="orb-core rounded-full shadow-lg will-change-transform"
                style={{ width: px, height: px, background: `radial-gradient(circle at 32% 28%, ${colorFrom}, ${colorTo} 70%, ${colorTo})` }}
            />
        </div>
    );
}
