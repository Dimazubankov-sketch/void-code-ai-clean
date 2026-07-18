// ==========================================
// ЗВУК УВЕДОМЛЕНИЙ
// ==========================================
// Мягкий двухнотный «динь» синтезируется через WebAudio прямо в браузере —
// не нужен ни один аудиофайл, ничего не грузится с сети. Звук воспроизводится
// только по явному триггеру (новый отчёт) и только если для ящика включён звук.

let audioCtx = null;

// AudioContext создаётся лениво и только после первого взаимодействия
// пользователя со страницей (иначе браузер его блокирует).
const getCtx = () => {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    return audioCtx;
};

const tone = (ctx, freq, startAt, duration) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Плавная атака и затухание — без щелчков
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.14, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration);
};

// Мягкий «динь-дон»: две ноты с небольшим восходящим интервалом
export const playNotificationSound = () => {
    try {
        const ctx = getCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        tone(ctx, 660, now, 0.18);        // E5
        tone(ctx, 880, now + 0.12, 0.22); // A5
    } catch (e) {
        // Звук — не критичная функция: любая ошибка не должна ломать приложение
    }
};
