// ==========================================
// КОНФИГУРАЦИЯ ОРКЕСТРАТОРОВ И COCKPIT
// ==========================================

// Сколько оркестраторов можно создать на каждом тарифе
export const ORCHESTRATOR_LIMITS = {
    free: 3,
    plus: 5,
    pro: 10,
    ultra: 15,
};

export const getOrchestratorLimit = (plan) => ORCHESTRATOR_LIMITS[plan] ?? ORCHESTRATOR_LIMITS.free;

// Оркестратор — «дирижёр»: дороже обычного агента и в сборке, и в работе
export const ORCHESTRATOR_BUILD_FEE = 2990;      // разовая сборка (обычный агент — 990)
export const ORCHESTRATOR_DAILY_MULTIPLIER = 3;  // ×3 к дневной стоимости токенов

// ------------------------------------------
// Статусы агента в Cockpit
// ------------------------------------------
export const AGENT_STATUS = {
    active: { id: 'active', label: 'Активен', color: '#22c55e', pulse: true },
    working: { id: 'working', label: 'В задаче', color: '#f59e0b', pulse: true },
    sleeping: { id: 'sleeping', label: 'Спит', color: '#94a3b8', pulse: false },
};

export const getAgentStatus = (statusId) => AGENT_STATUS[statusId] ?? AGENT_STATUS.sleeping;

// Cockpit-статус может не совпадать с биллинговым статусом агента из
// конструктора (там status = unpaid | active | suspended). Эта функция
// приводит любой агент к одному из трёх Cockpit-статусов, не меняя само поле:
//   • не оплачен / приостановлен → «Спит» (не может работать)
//   • есть активная задача от оркестратора → «В задаче»
//   • иначе — как выставлено в Cockpit (active/working/sleeping)
export const resolveCockpitStatus = (agent) => {
    if (agent.kind === 'orchestrator') {
        return AGENT_STATUS[agent.status] ? agent.status : 'sleeping';
    }
    // Обычный агент из конструктора
    if (agent.isPaid === false || agent.status === 'suspended' || agent.status === 'unpaid') {
        return 'sleeping';
    }
    if (AGENT_STATUS[agent.status]) return agent.status; // уже Cockpit-статус
    return 'active'; // оплачен и активен в биллинге
};

// ------------------------------------------
// Уникальная почта оркестратора: agent_<серийный>@voidops.ai
// Генерируется один раз при создании, редактировать нельзя.
// ------------------------------------------
export const VOIDOPS_DOMAIN = 'voidops.ai';

export const generateOrchestratorEmail = (existingEmails = []) => {
    let serial;
    let email;
    do {
        serial = String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
        email = `agent_${serial}@${VOIDOPS_DOMAIN}`;
    } while (existingEmails.includes(email)); // гарантируем уникальность
    return email;
};

// ------------------------------------------
// СХЕМА AgentConfig — единый JSON для динамической «прошивки» инструкций.
// Именно этот объект позволяет менять логику агента и через блоки, и через
// текстовый промпт, не ломая структуру. Версионируется, чтобы можно было
// откатывать «прошивки» и вести аудит изменений (важно для HITL).
// ------------------------------------------
export const createAgentConfig = (overrides = {}) => ({
    schemaVersion: 1,
    id: overrides.id ?? `agent_${Date.now()}`,
    name: overrides.name ?? 'Новый агент',
    kind: overrides.kind ?? 'worker',         // 'worker' | 'orchestrator'
    status: overrides.status ?? 'sleeping',   // active | working | sleeping

    // Логика агента живёт в ДВУХ представлениях, которые синхронизированы:
    instructions: {
        // 1) Текстовый промпт — «динамическая прошивка»
        prompt: overrides.prompt ?? '',
        // 2) Граф блоков из конструктора (nodes + edges)
        graph: overrides.graph ?? { nodes: [], edges: [] },
        // Какой источник главный сейчас: 'prompt' или 'graph'
        source: overrides.source ?? 'graph',
    },

    model: overrides.model ?? 'gemini-2.5-flash',
    tools: overrides.tools ?? [],
    fileIds: overrides.fileIds ?? [],
    schedule: overrides.schedule ?? null,     // { cron, tz } или null = вручную

    // Только для оркестраторов:
    orchestration: overrides.kind === 'orchestrator'
        ? {
            email: overrides.email ?? '',
            subordinateIds: overrides.subordinateIds ?? [], // id подчинённых агентов
            soundEnabled: overrides.soundEnabled ?? true,
        }
        : null,

    // Аудит «прошивок»: каждая правка промпта пишет сюда запись
    revisions: overrides.revisions ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: Date.now(),
});
