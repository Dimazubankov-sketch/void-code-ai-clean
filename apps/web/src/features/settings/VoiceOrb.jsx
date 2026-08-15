import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { createOrbController } from '@/shared/lib/orbAnimation';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация — ТОЛЬКО плавное «дыхание» в покое (scale), играет ВСЕГДА,
// независимо от того, идёт сейчас воспроизведение пробного голоса или нет.
//
// Раньше при active=true (во время «Проверить голос») дополнительно
// запускалась имитация «речи» случайными импульсами scale — по задаче
// это выглядело как «ужасная, цикличная» анимация (дёргания, не
// прекращающие работу даже после окончания звука) и должно быть убрано
// насовсем. Прежде здесь также была попытка синхронизировать круг с
// реальной громкостью через Web Audio API (AnalyserNode на
// createMediaElementSource(audioEl)) — она искажала сам звук на части
// устройств и роняла события <audio> (ended/timeupdate), что и было
// первопричиной сбоев. Импульсную имитацию, пришедшую ей на замену,
// теперь тоже убираем — остаётся только «дыхание», без реакции на
// проигрывание вообще.
// state — 'idle' | 'speaking' | 'listening' | 'thinking'. Приходит извне и
// отражает РЕАЛЬНОЕ воспроизведение (см. VoiceSettings: привязка к
// tts.speaking, а не к моменту отправки запроса).
export function VoiceOrb({ colorFrom, colorTo, size = 128, state = 'idle' }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);

    // Анимацию ведёт общий контроллер (см. orbAnimation.jsx): один
    // таймлайн на орб, смена состояния убивает предыдущий — повторные
    // нажатия «Проверить голос» не копят анимации. GSAP здесь никогда не
    // стоит в цепочке ожидания TTS: сюда прилетает уже готовое состояние.
    const controllerRef = useRef(null);
    if (!controllerRef.current) controllerRef.current = createOrbController();

    useEffect(() => {
        const c = controllerRef.current;
        c.attach(coreRef.current);
        return () => c.destroy();
    }, []);

    useEffect(() => {
        controllerRef.current.setState(state);
    }, [state]);

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
