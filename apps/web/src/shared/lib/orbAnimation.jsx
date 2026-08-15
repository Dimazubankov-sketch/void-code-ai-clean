import { gsap } from 'gsap';

// ==========================================
// OrbAnimationController — единый контроллер анимации ОРБа
// ==========================================
// Одна точка правды на оба экрана: превью голоса в Настройках и большой
// ОРБ в голосовом режиме. Компоненты не держат GSAP-логику у себя —
// только дёргают setState().
//
// Требования, из которых вырос этот код:
//   • Анимация НИКОГДА не стоит в await-цепочке TTS. setState('speaking')
//     вызывается из audio.onplay, а не после fetch — звук не ждёт GSAP.
//   • Один таймлайн на ОРБ. При смене состояния старый убивается, новый
//     стартует — повторные нажатия «Проверить голос» не копят анимации.
//   • Анимируем только scale/opacity (+ микроскопический x/y для
//     listening). Никакого layout thrashing, никакого разбора PCM на
//     каждом кадре: «дыхание» — это закольцованный твин, а не аналайзер.
//   • Любой выход (ended / error / pause / stop / unmount) возвращает в
//     idle, поэтому зависнуть в speaking невозможно даже при сбое API.

const STATES = {
    // Покой: медленное мягкое дыхание.
    idle: { scale: 1.04, duration: 2.4, ease: 'sine.inOut' },
    // Речь: быстрее и заметнее — читается как «сейчас говорит».
    speaking: { scale: 1.10, duration: 0.42, ease: 'sine.inOut' },
    // Слушает: как покой, но чуть шире и с лёгким дрожанием.
    listening: { scale: 1.06, duration: 1.5, ease: 'sine.inOut', jitter: true },
    // Думает: спокойнее listening, без дрожания.
    thinking: { scale: 1.06, duration: 1.1, ease: 'sine.inOut' },
};

export function createOrbController() {
    let el = null;
    let tl = null;
    let jitterTl = null;
    let current = null;

    const killTimelines = () => {
        tl?.kill(); tl = null;
        jitterTl?.kill(); jitterTl = null;
    };

    const attach = (node) => {
        if (el === node) return;
        killTimelines();
        el = node;
        if (el) {
            // Подсказываем браузеру заранее — иначе первый кадр анимации
            // может дёрнуться на слабом устройстве.
            el.style.willChange = 'transform';
            gsap.set(el, { scale: 1, x: 0, y: 0 });
        }
        if (current) setState(current, true);
    };

    const setState = (next, force = false) => {
        if (!el) { current = next; return; }
        if (next === current && !force) return;
        current = next;

        const cfg = STATES[next] || STATES.idle;
        killTimelines();

        // Уважаем системную настройку: при prefers-reduced-motion ОРБ
        // просто стоит на месте.
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            gsap.to(el, { scale: 1, x: 0, y: 0, duration: 0.2, overwrite: 'auto' });
            return;
        }

        // Плавный переход к новому состоянию: сначала мягко приводим к 1,
        // затем запускаем цикл — без этого смена состояния «щёлкает».
        tl = gsap.timeline();
        tl.to(el, { scale: 1, x: 0, y: 0, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
        tl.to(el, {
            scale: cfg.scale,
            duration: cfg.duration,
            ease: cfg.ease,
            yoyo: true,
            repeat: -1,
        });

        if (cfg.jitter) {
            // Очень лёгкое дрожание — пара пикселей, отдельным твином,
            // чтобы не мешать основному циклу масштаба.
            jitterTl = gsap.to(el, {
                x: 'random(-2, 2)',
                y: 'random(-2, 2)',
                duration: 0.45,
                ease: 'sine.inOut',
                repeat: -1,
                repeatRefresh: true,
            });
        }
    };

    const destroy = () => {
        killTimelines();
        if (el) {
            gsap.killTweensOf(el);
            gsap.set(el, { scale: 1, x: 0, y: 0 });
            el.style.willChange = '';
        }
        el = null;
        current = null;
    };

    return { attach, setState, destroy, getState: () => current };
}

// ==========================================
// bindOrbToAudio — привязка состояния к РЕАЛЬНОМУ воспроизведению
// ==========================================
// Ключевой момент: speaking включается по событию play самого
// <audio>-элемента, а не по старту запроса к TTS. Пока звук грузится,
// ОРБ остаётся в переданном состоянии ожидания (обычно thinking), и
// пользователь не видит «говорящий» ОРБ в тишине.
//
// Возвращает функцию отписки — обязательно вызывать при размонтировании,
// иначе слушатели переживут экран.
export function bindOrbToAudio(audioEl, controller, { idleState = 'idle' } = {}) {
    if (!audioEl || !controller) return () => {};

    const toSpeaking = () => controller.setState('speaking');
    const toIdle = () => controller.setState(idleState);

    audioEl.addEventListener('play', toSpeaking);
    audioEl.addEventListener('playing', toSpeaking);
    audioEl.addEventListener('ended', toIdle);
    audioEl.addEventListener('pause', toIdle);
    audioEl.addEventListener('error', toIdle);
    audioEl.addEventListener('emptied', toIdle);

    return () => {
        audioEl.removeEventListener('play', toSpeaking);
        audioEl.removeEventListener('playing', toSpeaking);
        audioEl.removeEventListener('ended', toIdle);
        audioEl.removeEventListener('pause', toIdle);
        audioEl.removeEventListener('error', toIdle);
        audioEl.removeEventListener('emptied', toIdle);
    };
}
