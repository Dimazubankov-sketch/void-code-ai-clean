// ==========================================
// getVoiceOpts — параметры голоса для TTS-запроса из state
// ==========================================
// Раньше жила только внутри ChatView.jsx (для кнопки «Озвучить» у
// сообщения). Вынесена сюда, чтобы Voice Mode (хук которого теперь живёт
// в App.jsx, а не в ChatView — см. useVoiceMode.jsx) использовал ТУ ЖЕ
// самую логику выбора голоса/провайдера, без дублирования и риска, что
// со временем два места разойдутся.
export function getVoiceOpts(state) {
    // Fish Audio S2.1 Pro — провайдер по умолчанию (в т.ч. для уже
    // существующих пользователей без сохранённого выбора, см. App.jsx).
    const provider = state.ttsProvider || 'fish';
    return {
        provider,
        // Fish: reference_id голоса (или undefined — голос модели по
        // умолчанию). OpenAI: имя голоса (alloy/echo/fable/onyx/nova/shimmer).
        // Голос хранится отдельно для каждого провайдера — см. VoiceSettings.
        voice: provider === 'fish' ? (state.voicePresetFish || undefined) : (state.voicePreset || 'nova'),
        speed: state.voiceRate || 1.0,
        // Оставляем lang для Web Speech-фолбэка.
        lang: state.voiceLang || 'ru-RU',
    };
}
