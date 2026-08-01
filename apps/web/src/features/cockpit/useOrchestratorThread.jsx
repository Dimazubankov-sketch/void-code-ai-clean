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

    const sendTask = (text, image = null) => {
        const trimmed = (text || '').trim();
        if (!trimmed && !image) return;
        if (!orchestrator) return;
        const plan = buildExecutionPlan(orchestrator, trimmed, subordinates);
        const reportBody = formatPlanReport(plan);
        const report = { id: plan.id, at: Date.now(), body: reportBody, status: 'pending', plan };
        const userMsg = { id: `u_${Date.now()}`, role: 'user', text: trimmed, image, at: Date.now() };
        const orchMsg = { id: `o_${Date.now()}`, role: 'orchestrator', text: reportBody, at: Date.now(), reportId: plan.id, planStatus: 'pending' };

        const threads = { ...(state.orchestratorThreads || {}) };
        threads[orchestrator.id] = [...(threads[orchestrator.id] || []), userMsg, orchMsg];
        const allReports = { ...(state.orchestratorReports || {}) };
        allReports[orchestrator.id] = [...(allReports[orchestrator.id] || []), report];

        updateState({ orchestratorThreads: threads, orchestratorReports: allReports });
        if ((orchestrator.orchestration?.soundEnabled ?? true) && state.notificationsEnabled !== false) {
            playNotificationSound();
        }
    };

    const respond = (reportId, decision) => {
        if (!orchestrator) return;
        updateState({ pendingHitl: { orchestratorId: orchestrator.id, reportId, decision } });
    };

    return { thread, reports, subordinates, sendTask, respond };
}
