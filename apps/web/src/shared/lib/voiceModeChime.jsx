// ==========================================
// voiceModeChime — короткие звуки входа/выхода из Voice Mode
// ==========================================
// Синтезируем на лету через WebAudio, а не тянем mp3-файлы: звук нужен
// совсем короткий (пара нот), отдельные ассеты ради этого раздували бы
// бандл и добавляли ещё один сетевой запрос в момент, когда пользователь
// ждёт мгновенной реакции на нажатие.
//
// Вызывается всегда СИНХРОННО из обработчика клика — AudioContext в
// Chrome/Safari стартует в состоянии 'suspended' и требует жеста
// пользователя, поэтому здесь же вызываем resume().

let ctx = null;

function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
    return ctx;
}

// Одна короткая нота с мягкой атакой/затуханием, чтобы не щёлкало.
function tone(audioCtx, freq, startAt, duration, peak = 0.12) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
}

// Вход — восходящая пара нот (ощущение «открылось»).
export function playVoiceModeOpenChime() {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    tone(audioCtx, 523.25, t, 0.12);        // C5
    tone(audioCtx, 783.99, t + 0.09, 0.16); // G5
}

// Выход — нисходящая пара нот (ощущение «закрылось»).
export function playVoiceModeCloseChime() {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    tone(audioCtx, 659.25, t, 0.1);         // E5
    tone(audioCtx, 392.00, t + 0.08, 0.18); // G4
}
