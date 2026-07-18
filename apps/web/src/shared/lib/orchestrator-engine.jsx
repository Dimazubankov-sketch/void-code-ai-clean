// ==========================================
// ДВИЖОК ОРКЕСТРАТОРА (логика оркестрации)
// ==========================================
// Все функции здесь — ЧИСТЫЕ (принимают данные, возвращают данные, без побочных
// эффектов на UI). Это сделано намеренно: сейчас они работают на клиенте с
// mock-декомпозицией, но их сигнатуры уже готовы стать HTTP-эндпоинтами
// бэкенда (Void OS) без переписывания интерфейса:
//
//   decomposeTask     → POST /orchestrators/:id/decompose
//   buildExecutionPlan→ (серверная сборка плана)
//   applyApprovedPlan → POST /orchestrators/:id/plans/:planId/approve
//
// ГЛАВНЫЙ ПРИНЦИП БЕЗОПАСНОСТИ (HITL): оркестратор НИКОГДА не меняет промпты
// подчинённых напрямую. Он лишь предлагает план. Изменения применяются только
// после явного «Разрешить» от пользователя.

// ------------------------------------------
// 1. Декомпозиция задачи на подзадачи
// ------------------------------------------
// На бэкенде здесь будет реальный вызов LLM, который дробит задачу и
// сопоставляет подзадачи с навыками подчинённых. Пока — эвристика-заглушка.
export const decomposeTask = (taskText, subordinates) => {
    if (!subordinates.length) return [];

    // Режем задачу по строкам/предложениям как черновые подзадачи
    const rawParts = taskText
        .split(/[\n.;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 3);

    const parts = rawParts.length ? rawParts : [taskText.trim()];

    // Раскладываем подзадачи по подчинённым по кругу (round-robin)
    return parts.map((part, i) => {
        const agent = subordinates[i % subordinates.length];
        return {
            id: `sub_${Date.now()}_${i}`,
            agentId: agent.id,
            agentName: agent.name,
            subtask: part,
            // Инструкция, которую предлагается «прошить» подчинённому:
            proposedPrompt: `Задача от оркестратора: ${part}`,
        };
    });
};

// ------------------------------------------
// 2. Сборка плана исполнения (конверт для HITL)
// ------------------------------------------
// Возвращает объект-«предложение» со статусом pending. Ничего ещё не применено.
export const buildExecutionPlan = (orchestrator, taskText, subordinates) => {
    const assignments = decomposeTask(taskText, subordinates);
    return {
        id: `plan_${Date.now()}`,
        orchestratorId: orchestrator.id,
        orchestratorName: orchestrator.name,
        task: taskText,
        assignments,        // [{ agentId, subtask, proposedPrompt }]
        status: 'pending',  // pending | approved | rejected | edited
        createdAt: Date.now(),
    };
};

// ------------------------------------------
// 3. Человекочитаемый отчёт оркестратора (уходит в чат и на почту)
// ------------------------------------------
export const formatPlanReport = (plan) => {
    if (!plan.assignments.length) {
        return 'Не удалось разложить задачу: у оркестратора нет подчинённых агентов. Привяжите агентов в конструкторе.';
    }
    const lines = plan.assignments.map(
        (a, i) => `${i + 1}. ${a.agentName}: ${a.subtask}`,
    );
    return [
        `Я разложил задачу «${plan.task}» на ${plan.assignments.length} подзадач(и) и предлагаю раздать их так:`,
        '',
        ...lines,
        '',
        'Подтвердите, чтобы я прошил эти инструкции агентам.',
    ].join('\n');
};

// ------------------------------------------
// 4. Применение ОДОБРЕННОГО плана к промптам подчинённых
// ------------------------------------------
// Вызывается ТОЛЬКО после нажатия «Разрешить». Возвращает НОВЫЙ массив агентов
// (иммутабельно) с обновлёнными промптами и записью в аудит revisions.
export const applyApprovedPlan = (agents, plan) => {
    const byAgent = new Map();
    plan.assignments.forEach((a) => byAgent.set(a.agentId, a));

    return agents.map((agent) => {
        const assignment = byAgent.get(agent.id);
        if (!assignment) return agent;

        const revision = {
            at: Date.now(),
            source: 'orchestrator',
            orchestratorId: plan.orchestratorId,
            planId: plan.id,
            prompt: assignment.proposedPrompt,
        };

        return {
            ...agent,
            status: 'working', // получил задачу → «В задаче»
            config: {
                ...agent.config,
                instructions: {
                    ...agent.config?.instructions,
                    prompt: assignment.proposedPrompt,
                    source: 'prompt',
                },
                revisions: [...(agent.config?.revisions ?? []), revision],
                updatedAt: Date.now(),
            },
        };
    });
};

// ------------------------------------------
// 5. Ручная «прошивка» промпта (из AgentPromptEditor, без оркестратора)
// ------------------------------------------
export const applyManualPrompt = (agent, newPrompt) => ({
    ...agent,
    config: {
        ...agent.config,
        instructions: { ...agent.config?.instructions, prompt: newPrompt, source: 'prompt' },
        revisions: [
            ...(agent.config?.revisions ?? []),
            { at: Date.now(), source: 'manual', prompt: newPrompt },
        ],
        updatedAt: Date.now(),
    },
});
