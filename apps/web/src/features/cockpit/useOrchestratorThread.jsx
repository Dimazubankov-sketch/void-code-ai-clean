import { useState } from 'react';
import { buildExecutionPlan, formatPlanReport } from '@/shared/lib/orchestrator-engine';
import { playNotificationSound } from '@/shared/lib/sound';

// ==========================================
// useOrchestratorThread — единая логика чата оркестратора
// ==========================================
// И «кабина» оркестратора (открывается из Cockpit), и вкладка «Оповещения
// агентов» в почте читают и пишут один и тот же state.orchestratorThreads /
// state.orchestratorReports через этот хук — это ОДИН чат с одним контекстом,
// показанный в двух местах интерфейса, а не две разные системы.

export function useOrchestratorThread(state, updateState, orchestrator) {
    const thread = orchestrator ? (state.orchestratorThreads || {})[orchestrator.id] || [] : [];
    const reports = orchestrator ? (state.orchestratorReports || {})[orchestrator.id] || [] : [];
    const subordinates = orchestrator
        ? (state.aiAgents || []).filter(a => a.kind !== 'orchestrator' && (orchestrator.orchestration?.subordinateIds || []).includes(a.id))
        : [];

    // Оркестратор «продумывает план» перед тем, как выдать отчёт —
    // показываем индикатор размышления, как в обычном чате, и только затем
    // добавляем сообщение-план. План на высоких уровнях сложнее, поэтому
    // берём паузу чуть больше, чем у обычного агента.
    const [thinking, setThinking] = useState(false);

    const sendTask = (text, image = null) => {
        const trimmed = (text || '').trim();
        if (!trimmed && !image) return;
        if (!orchestrator) return;

        const now = Date.now();
        const userMsg = { id: `u_${now}`, role: 'user', text: trimmed, image, at: now };
        const threadsWithUser = { ...(state.orchestratorThreads || {}) };
        threadsWithUser[orchestrator.id] = [...(threadsWithUser[orchestrator.id] || []), userMsg];
        updateState({ orchestratorThreads: threadsWithUser });
        setThinking(true);

        const plan = buildExecutionPlan(orchestrator, trimmed, subordinates);
        const reportBody = formatPlanReport(plan);
        const report = { id: plan.id, at: now, body: reportBody, status: 'pending', plan };
        const orchMsg = { id: `o_${now}`, role: 'orchestrator', text: reportBody, at: now + 1, reportId: plan.id, planStatus: 'pending', isAnimated: true };

        setTimeout(() => {
            setThinking(false);
            const threads = { ...threadsWithUser };
            threads[orchestrator.id] = [...(threads[orchestrator.id] || []), orchMsg];
            const allReports = { ...(state.orchestratorReports || {}) };
            allReports[orchestrator.id] = [...(allReports[orchestrator.id] || []), report];
            updateState({ orchestratorThreads: threads, orchestratorReports: allReports });
            if ((orchestrator.orchestration?.soundEnabled ?? true) && state.notificationsEnabled !== false) {
                playNotificationSound();
            }
        }, 1100);
    };

    const respond = (reportId, decision) => {
        if (!orchestrator) return;
        updateState({ pendingHitl: { orchestratorId: orchestrator.id, reportId, decision } });
    };

    return { thread, reports, subordinates, sendTask, respond, thinking };
}
