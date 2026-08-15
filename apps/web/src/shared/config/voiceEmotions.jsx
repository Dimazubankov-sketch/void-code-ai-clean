// ==========================================
// Эмоции и тон голоса
// ==========================================
// Управление подачей идёт ШТАТНЫМ способом Fish Audio S2: модель понимает
// естественно-языковые указания и скобочные маркеры прямо в тексте
// (например «[warm, calm tone]», «[laugh]», «[sigh]»). Никакого отдельного
// TTS-механизма мы не заводим — просто добавляем к тексту короткую
// инструкцию подачи перед синтезом (см. buildEmotionCue и его применение
// в fish-audio-tts.service.ts).
//
// Настройки эмоций сохраняются в состоянии пользователя (persist в
// storage.jsx) и применяются во всех будущих сессиях — и в обычной
// озвучке сообщений, и в Voice Mode.
//
// Фича сознательно НЕ закрыта подпиской — доступна всем тарифам. Если
// когда-нибудь понадобится закрыть, достаточно добавить проверку в одном
// месте (там, где строится emotion в getVoiceOpts), не трогая остальное.

export const EMOTION_MODES = { AUTO: 'auto', MANUAL: 'manual' };

// Пресеты подачи. cue — то, что реально уходит модели; описание на русском
// нужно только интерфейсу. Формулировки на английском намеренно: у Fish
// инструкции подачи стабильнее отрабатывают именно так, независимо от
// языка самого произносимого текста.
export const EMOTION_PRESETS = [
    { id: 'neutral',      name: 'Нейтральный',     cue: 'neutral, even tone' },
    { id: 'calm',         name: 'Спокойный',       cue: 'calm, unhurried, relaxed tone' },
    { id: 'positive',     name: 'Позитивный',      cue: 'positive, light and upbeat tone' },
    { id: 'friendly',     name: 'Дружелюбный',     cue: 'friendly, warm and welcoming tone' },
    { id: 'energetic',    name: 'Энергичный',      cue: 'energetic, lively, brisk delivery' },
    { id: 'confident',    name: 'Уверенный',       cue: 'confident, steady, assured tone' },
    { id: 'serious',      name: 'Серьёзный',       cue: 'serious, measured, matter-of-fact tone' },
    { id: 'emotional',    name: 'Эмоциональный',   cue: 'expressive, emotionally rich delivery' },
    { id: 'inspired',     name: 'Воодушевлённый',  cue: 'inspired, enthusiastic, uplifting tone' },
    { id: 'empathetic',   name: 'Сочувствующий',   cue: 'gentle, empathetic, caring tone' },
    { id: 'professional', name: 'Профессиональный',cue: 'professional, clear, business-like tone' },
    { id: 'mysterious',   name: 'Таинственный',    cue: 'mysterious, hushed, intriguing tone' },
];

// Ручные регуляторы: 0..100. Значения по умолчанию — «середина», то есть
// нейтральная подача, ничем не отличающаяся от прежнего поведения.
export const EMOTION_DEFAULTS = {
    mode: EMOTION_MODES.AUTO,
    preset: 'neutral',
    expressiveness: 50, // эмоциональность
    energy: 50,         // энергичность
    warmth: 50,         // теплота
    // Скорость живёт отдельно (state.voiceRate) — она уже была в проекте
    // и применяется параметром prosody.speed, а не текстовой инструкцией.
};

export function getEmotionSettings(state) {
    return { ...EMOTION_DEFAULTS, ...(state.voiceEmotion || {}) };
}

// Переводим ползунок 0..100 в словесную градацию: числа модели ничего не
// говорят, а вот «very warm» / «slightly warm» она понимает.
function level(value, low, mid, high) {
    if (value <= 25) return low;
    if (value >= 75) return high;
    if (value >= 40 && value <= 60) return null; // середина — молчим, не засоряем инструкцию
    return mid;
}

// Ключевые слова голосовых команд «говори спокойнее / позитивнее / …».
// Возвращает id пресета или null. Используется в Voice Mode для ВРЕМЕННОЙ
// смены подачи (см. useVoiceMode) — постоянные настройки не трогаются.
const VOICE_COMMANDS = [
    { id: 'calm',       re: /(говори|будь|станьте|стань)[^.!?]{0,20}(спокойн|тише|медленн|размеренн)/i },
    { id: 'positive',   re: /(говори|будь)[^.!?]{0,20}(позитивн|веселе|радостн)/i },
    { id: 'energetic',  re: /(говори|будь)[^.!?]{0,20}(энергичн|бодре|живе)/i },
    { id: 'serious',    re: /(говори|будь)[^.!?]{0,20}(серьёзн|серьезн|строже|сдержанн)/i },
    { id: 'emotional',  re: /(говори|будь)[^.!?]{0,20}(эмоциональн|выразительн)/i },
    { id: 'friendly',   re: /(говори|будь)[^.!?]{0,20}(дружелюбн|тепле|мягче)/i },
    { id: 'confident',  re: /(говори|будь)[^.!?]{0,20}(увереннее|увереннe|твёрже|тверже)/i },
    { id: 'neutral',    re: /(говори|будь)[^.!?]{0,20}(нейтральн|обычн|как\s*раньше|как\s*обычно)/i },
];

export function detectEmotionCommand(text) {
    const t = String(text || '');
    for (const c of VOICE_COMMANDS) if (c.re.test(t)) return c.id;
    return null;
}

// Собирает короткую инструкцию подачи. Возвращает '' — значит подача
// дефолтная и в текст ничего добавлять не нужно.
//   • auto  — инструкцию не задаём вовсе: модель сама выбирает подачу по
//     смыслу текста, это и есть «автоматический режим». Единственное
//     исключение — временная эмоция из голосовой команды, она сильнее.
//   • manual — пресет + отклонения ползунков от середины.
export function buildEmotionCue(settings, overridePresetId = null) {
    const s = { ...EMOTION_DEFAULTS, ...(settings || {}) };
    const presetId = overridePresetId || (s.mode === EMOTION_MODES.MANUAL ? s.preset : null);
    if (!presetId) return '';

    const preset = EMOTION_PRESETS.find((p) => p.id === presetId);
    const parts = [preset ? preset.cue : presetId];

    // Ползунки применяем только в ручном режиме: временная голосовая
    // команда не должна тащить за собой чужие настройки.
    if (!overridePresetId && s.mode === EMOTION_MODES.MANUAL) {
        const ex = level(s.expressiveness, 'restrained expression', 'expressive', 'highly expressive');
        const en = level(s.energy, 'low energy', 'energetic', 'high energy');
        const wa = level(s.warmth, 'cool and detached', 'warm', 'very warm');
        [ex, en, wa].forEach((x) => { if (x) parts.push(x); });
    }
    return parts.join(', ');
}
