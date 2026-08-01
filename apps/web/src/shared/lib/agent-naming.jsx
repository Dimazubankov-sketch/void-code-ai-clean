// ==========================================
// ИМЕНА АГЕНТОВ — генерация уникальных и защита от дубликатов
// ==========================================
// При покупке агент получает уникальное имя «Агент 1, 2, …». Пользователь
// может переименовать его в Cockpit, но нельзя сохранить одинаковое или
// похожее имя — иначе Оркестратор запутается.

// Нормализуем имя для сравнения: убираем регистр, пробелы и небуквенные символы
const normalize = (str) => (str || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/gi, '')
    .trim();

// Сгенерировать следующее свободное имя «Агент N»
export const generateUniqueAgentName = (agents = []) => {
    const used = new Set(agents.map(a => normalize(a.name)));
    let n = 1;
    while (used.has(normalize(`Агент ${n}`))) n++;
    return `Агент ${n}`;
};

// Проверка имени перед сохранением. Возвращает { ok, reason }.
// excludeId — id самого агента (чтобы не сравнивать с собой при переименовании).
export const validateAgentName = (name, agents = [], excludeId = null) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, reason: 'Имя не может быть пустым' };
    if (trimmed.length < 2) return { ok: false, reason: 'Слишком короткое имя' };
    if (trimmed.length > 40) return { ok: false, reason: 'Слишком длинное имя (макс. 40 символов)' };

    const norm = normalize(trimmed);
    const clash = agents.some(a => a.id !== excludeId && normalize(a.name) === norm);
    if (clash) return { ok: false, reason: 'Агент с таким (или похожим) именем уже есть. Придумайте другое, чтобы оркестратор не путался.' };

    return { ok: true };
};
