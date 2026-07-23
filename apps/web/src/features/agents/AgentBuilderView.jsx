import { useState, useEffect, useRef } from 'react';
import { AgentBuilderMenu } from '@/features/agents/AgentBuilderMenu';
import { AgentStore } from '@/features/agents/AgentStore';
import { OrchestratorPurchaseModal } from '@/features/agents/OrchestratorPurchaseModal';
import { AgentInvoiceModal } from '@/features/agents/AgentInvoiceModal';
import { AGENT_NODE_H, AGENT_NODE_W, BLOCK_CATEGORIES, BLOCK_COLORS, BLOCK_LIBRARY, LOW_BALANCE_THRESHOLD, PLATFORM_MARGIN_PERCENT, TOKEN_CHARGE_PER_NODE, createBlankAgentDraft, getBlockDef } from '@/shared/config/agents';
import { formatMoney } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОНСТРУКТОР AI-АГЕНТОВ — основной экран
// ==========================================
export function AgentBuilderView({ state, updateState }) {
    const NODE_W = AGENT_NODE_W, NODE_H = AGENT_NODE_H;
    const canvasRef = useRef(null);

    const loadDraftFromAgent = (agent) => ({
        id: agent.id,
        name: agent.name,
        nodes: agent.nodes.map(n => ({ ...n, config: { ...n.config } })),
        edges: agent.edges.map(e => ({ ...e }))
    });

    const [draft, setDraft] = useState(() => {
        const existing = state.aiAgents.find(a => a.id === state.activeAgentId);
        return existing ? loadDraftFromAgent(existing) : createBlankAgentDraft();
    });

    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showHistoryMenu, setShowHistoryMenu] = useState(false);
    const [showAgentStore, setShowAgentStore] = useState(false);
    const [showOrchPurchase, setShowOrchPurchase] = useState(false);
    const [showMobileBlockPicker, setShowMobileBlockPicker] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(draft.name);
    const [savedFlash, setSavedFlash] = useState(false);
    const [showInvoice, setShowInvoice] = useState(false);
    const [showLowBalance, setShowLowBalance] = useState(false);
    const [showTestConfirm, setShowTestConfirm] = useState(false);
    const [lastChargeInfo, setLastChargeInfo] = useState(null);

    const [offset, setOffset] = useState({ x: 60, y: 40 });
    const [scale, setScale] = useState(1);
    const [locked, setLocked] = useState(false);
    const [connecting, setConnecting] = useState(null);
    const [quickPicker, setQuickPicker] = useState(null);
    const [testRunNodeId, setTestRunNodeId] = useState(null);
    const [isTesting, setIsTesting] = useState(false);

    const [history, setHistory] = useState({ stack: [{ nodes: draft.nodes, edges: draft.edges }], index: 0 });

    const pushHistory = (nodes, edges) => {
        setHistory(h => {
            const newStack = h.stack.slice(0, h.index + 1);
            newStack.push({ nodes, edges });
            if (newStack.length > 40) newStack.shift();
            return { stack: newStack, index: newStack.length - 1 };
        });
    };

    const updateNodesEdges = (nodes, edges) => {
        setDraft(prev => ({ ...prev, nodes, edges }));
        pushHistory(nodes, edges);
    };

    const undo = () => {
        if (history.index <= 0) return;
        const idx = history.index - 1;
        const snap = history.stack[idx];
        setDraft(prev => ({ ...prev, nodes: snap.nodes, edges: snap.edges }));
        setHistory(h => ({ ...h, index: idx }));
        setSelectedNodeId(null); setSelectedEdgeId(null);
    };
    const redo = () => {
        if (history.index >= history.stack.length - 1) return;
        const idx = history.index + 1;
        const snap = history.stack[idx];
        setDraft(prev => ({ ...prev, nodes: snap.nodes, edges: snap.edges }));
        setHistory(h => ({ ...h, index: idx }));
        setSelectedNodeId(null); setSelectedEdgeId(null);
    };

    // Горячие клавиши: Delete/Backspace удаляет выбранный блок или связь
    // (но не когда фокус находится в текстовом поле — иначе мешало бы вводу).
    useEffect(() => {
        const onKeyDown = (e) => {
            const tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeId) deleteNode(selectedNodeId);
                else if (selectedEdgeId) deleteEdge(selectedEdgeId);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedNodeId, selectedEdgeId, draft]);

    // Если открыт ранее сохранённый, но ещё не оплаченный агент —
    // сразу напоминаем о счёте, чтобы пользователь не забыл его оплатить.
    useEffect(() => {
        if (draft.id) {
            const record = state.aiAgents.find(a => a.id === draft.id);
            if (record && !record.isPaid) {
                const t = setTimeout(() => setShowInvoice(true), 500);
                return () => clearTimeout(t);
            }
        }
    }, []);

    const getWorldPoint = (clientX, clientY) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return { x: (clientX - rect.left - offset.x) / scale, y: (clientY - rect.top - offset.y) / scale };
    };

    // Всегда актуальные offset/scale в ref — нужны внутри "живого" обработчика
    // pinch-зума ниже, который навешан один раз при монтировании и иначе
    // видел бы устаревшие (замкнутые) значения.
    const scaleRef = useRef(scale);
    const offsetRef = useRef(offset);
    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { offsetRef.current = offset; }, [offset]);

    // Активные касания (только тач) — используются и для pinch-zoom, и
    // чтобы "заморозить" обычное панорамирование/перетаскивание одним
    // пальцем, пока на экране одновременно две точки касания.
    const touchPointsRef = useRef(new Map());
    const pinchDataRef = useRef(null);

    // Pinch-zoom двумя пальцами — навешан напрямую на канвас через нативные
    // Pointer Events (в обход React), чтобы корректно ловить оба касания
    // независимо от того, начались они на пустом канвасе или на блоке.
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;

        const onDown = (e) => {
            if (e.pointerType !== 'touch') return;
            touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touchPointsRef.current.size === 2) {
                const pts = Array.from(touchPointsRef.current.values());
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
                const rect = el.getBoundingClientRect();
                pinchDataRef.current = {
                    initialDist: dist,
                    initialScale: scaleRef.current,
                    initialOffset: offsetRef.current,
                    mid: { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top }
                };
            }
        };
        const onMove = (e) => {
            if (e.pointerType !== 'touch' || !touchPointsRef.current.has(e.pointerId)) return;
            touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touchPointsRef.current.size === 2 && pinchDataRef.current) {
                const pts = Array.from(touchPointsRef.current.values());
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
                const rect = el.getBoundingClientRect();
                // Текущая точка между пальцами (а не только начальная) — так
                // жест одновременно и зумит, и панорамирует, если пальцы
                // сдвигаются вместе (а не просто сближаются/расходятся).
                const curMid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top };
                const ratio = dist / pinchDataRef.current.initialDist;
                const newScale = Math.min(1.6, Math.max(0.4, pinchDataRef.current.initialScale * ratio));
                const factor = newScale / pinchDataRef.current.initialScale;
                const initMid = pinchDataRef.current.mid;
                setScale(newScale);
                setOffset({
                    x: curMid.x - (initMid.x - pinchDataRef.current.initialOffset.x) * factor,
                    y: curMid.y - (initMid.y - pinchDataRef.current.initialOffset.y) * factor
                });
            }
        };
        const onUp = (e) => {
            if (e.pointerType !== 'touch') return;
            touchPointsRef.current.delete(e.pointerId);
            if (touchPointsRef.current.size < 2) pinchDataRef.current = null;
        };

        // Зум колесом мыши на десктопе — масштабирование "от курсора",
        // как в любом графическом/канвас-редакторе.
        const onWheel = (e) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
            const oldScale = scaleRef.current;
            const newScale = Math.min(1.6, Math.max(0.4, oldScale * factor));
            const realFactor = newScale / oldScale;
            const oldOffset = offsetRef.current;
            setScale(newScale);
            setOffset({
                x: mouseX - (mouseX - oldOffset.x) * realFactor,
                y: mouseY - (mouseY - oldOffset.y) * realFactor
            });
        };

        el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            el.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            el.removeEventListener('wheel', onWheel);
        };
    }, []);

    // Все обработчики ниже используют Pointer Events (а не Mouse Events),
    // потому что PointerEvent одинаково работает и с мышью, и с пальцем на
    // тачскрине — без этого перетаскивание блоков и соединение стрелками
    // было попросту недоступно на телефоне.
    const handleCanvasPointerDown = (e) => {
        if (e.pointerType === 'touch' && touchPointsRef.current.size >= 1) return; // идёт pinch — не панорамируем одним пальцем поверх
        if (e.target !== e.currentTarget) return;
        setSelectedNodeId(null); setSelectedEdgeId(null);
        if (locked) return;
        e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
        const startOffset = offset;
        const startClient = { x: e.clientX, y: e.clientY };
        const onMove = (ev) => {
            if (touchPointsRef.current.size >= 2) return; // начался pinch — прекращаем панорамирование
            setOffset({ x: startOffset.x + (ev.clientX - startClient.x), y: startOffset.y + (ev.clientY - startClient.y) });
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    // Тап по блоку (без движения пальцем/мышью) открывает его настройки.
    // Любое заметное движение — это перетаскивание: блок двигается, но
    // панель настроек НЕ открывается. Раньше настройки открывались сразу
    // при касании, и на телефоне полноэкранная панель тут же перекрывала
    // канвас, из-за чего перетаскивать блоки было невозможно.
    const handleNodePointerDown = (e, node) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedEdgeId(null);
        if (locked) { setSelectedNodeId(node.id); return; }

        const startClient = { x: e.clientX, y: e.clientY };
        const startWorld = getWorldPoint(e.clientX, e.clientY);
        const startNodeX = node.x, startNodeY = node.y;
        const baseNodes = draft.nodes;
        let latestNodes = baseNodes;
        let moved = false;
        const MOVE_THRESHOLD = 6; // маленький порог — чтобы дрожание пальца не двигало блок случайно

        setDraggingNodeId(node.id); // подсветка активного блока во время касания/перетаскивания

        const onMove = (ev) => {
            if (touchPointsRef.current.size >= 2) return; // начался pinch — блок не двигаем
            if (!moved) {
                const moveDist = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y);
                if (moveDist < MOVE_THRESHOLD) return;
                moved = true;
            }
            const w = getWorldPoint(ev.clientX, ev.clientY);
            const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
            latestNodes = baseNodes.map(n => n.id === node.id ? { ...n, x: startNodeX + dx, y: startNodeY + dy } : n);
            setDraft(prev => ({ ...prev, nodes: latestNodes }));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            setDraggingNodeId(null);
            if (moved) {
                // Перетащили блок — сохраняем позицию, настройки не открываем.
                pushHistory(latestNodes, draft.edges);
            } else {
                // Чистый тап без движения — открываем панель настроек блока.
                setSelectedNodeId(node.id);
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    const handleOutputPointerDown = (e, node) => {
        e.stopPropagation();
        e.preventDefault();
        if (locked) return;
        setConnecting({ from: node.id, point: { x: node.x + NODE_W, y: node.y + NODE_H / 2 } });
        const onMove = (ev) => {
            setConnecting({ from: node.id, point: getWorldPoint(ev.clientX, ev.clientY) });
        };
        const onUp = (ev) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            const w = getWorldPoint(ev.clientX, ev.clientY);
            const target = draft.nodes.find(n => n.id !== node.id && w.x >= n.x && w.x <= n.x + NODE_W && w.y >= n.y && w.y <= n.y + NODE_H);
            if (target) {
                const exists = draft.edges.some(ed => ed.from === node.id && ed.to === target.id);
                const check = validateConnection(node, target);
                if (!check.ok) {
                    window.alert(check.reason);
                } else if (!exists) {
                    updateNodesEdges(draft.nodes, [...draft.edges, { id: 'e' + Date.now(), from: node.id, to: target.id }]);
                }
            } else {
                setQuickPicker({ x: w.x, y: w.y, fromNodeId: node.id });
            }
            setConnecting(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    const computeDefaultPosition = () => {
        if (selectedNodeId) {
            const sel = draft.nodes.find(n => n.id === selectedNodeId);
            if (sel) return { x: sel.x + NODE_W + 80, y: sel.y };
        }
        const count = draft.nodes.length;
        return { x: 80 + (count % 4) * 60, y: 60 + Math.floor(count / 4) * 150 + count * 18 };
    };

    // Ранг блока для строгого порядка соединений:
    //   оркестратор(0) → агент(1) → триггер(2) → действие(3)
    // Соединять можно только от меньшего ранга к большему (по цепочке).
    const blockRank = (blockId) => {
        const def = getBlockDef(blockId);
        if (!def) return 3;
        if (def.isOrchestrator) return 0;
        if (def.isAgent) return 1;
        if (def.isTrigger) return 2;
        return 3; // действия и всё остальное
    };

    const validateConnection = (fromNode, toNode) => {
        const fromDef = getBlockDef(fromNode.blockId);
        const toDef = getBlockDef(toNode.blockId);
        // Оркестратор можно привязать ТОЛЬКО к агенту
        if (fromDef?.isOrchestrator && !toDef?.isAgent) {
            return { ok: false, reason: 'Оркестратор можно соединить только с агентом.' };
        }
        // Агент, у которого уже есть оркестратор, нельзя привязать к другому
        if (fromDef?.isOrchestrator && toDef?.isAgent) {
            const alreadyHasOrch = draft.edges.some(ed => {
                const src = draft.nodes.find(n => n.id === ed.from);
                return ed.to === toNode.id && getBlockDef(src?.blockId)?.isOrchestrator;
            });
            if (alreadyHasOrch) return { ok: false, reason: 'У этого агента уже есть оркестратор. Один агент — один оркестратор.' };
        }
        // Строгий порядок по рангам: только вперёд по цепочке
        if (blockRank(toNode.blockId) < blockRank(fromNode.blockId)) {
            return { ok: false, reason: 'Порядок блоков: оркестратор → агент → триггер → действие. Соединять можно только по этому порядку.' };
        }
        return { ok: true };
    };

    const addNodeFromBlock = (blockDef) => {
        const pos = computeDefaultPosition();
        const newNode = { id: 'n' + Date.now() + Math.floor(Math.random() * 1000), blockId: blockDef.id, x: pos.x, y: pos.y, name: blockDef.name, description: blockDef.subtitle, config: {} };
        const newEdges = selectedNodeId ? [...draft.edges, { id: 'e' + Date.now(), from: selectedNodeId, to: newNode.id }] : draft.edges;
        updateNodesEdges([...draft.nodes, newNode], newEdges);
        setSelectedNodeId(newNode.id);
    };

    // Перетаскивание оплаченного агента из «Списка агентов» на холст: он ложится
    // как узел ai_agent (или оркестратор) с привязкой к исходному агенту.
    const handleAgentDrop = (e) => {
        const agentId = e.dataTransfer.getData('application/x-agent-id');
        if (!agentId) return;
        e.preventDefault();
        const agent = (state.aiAgents || []).find(a => a.id === agentId);
        if (!agent) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - offset.x) / scale - NODE_W / 2;
        const y = (e.clientY - rect.top - offset.y) / scale - NODE_H / 2;
        const isOrch = agent.kind === 'orchestrator';
        const newNode = {
            id: 'n' + Date.now() + Math.floor(Math.random() * 1000),
            blockId: isOrch ? 'orchestrator' : 'ai_agent',
            x, y,
            name: agent.name,
            description: isOrch ? 'Оркестратор' : 'AI-агент',
            config: {},
            linkedAgentId: agent.id,
        };
        updateNodesEdges([...draft.nodes, newNode], draft.edges);
        setSelectedNodeId(newNode.id);
    };

    const handleQuickPickerSelect = (blockDef) => {
        const fromNode = draft.nodes.find(n => n.id === quickPicker.fromNodeId);
        const tempTarget = { blockId: blockDef.id };
        if (fromNode) {
            const check = validateConnection(fromNode, tempTarget);
            if (!check.ok) { window.alert(check.reason); return; }
        }
        const newNode = { id: 'n' + Date.now() + Math.floor(Math.random() * 1000), blockId: blockDef.id, x: quickPicker.x - NODE_W / 4, y: quickPicker.y - NODE_H / 2, name: blockDef.name, description: blockDef.subtitle, config: {} };
        updateNodesEdges([...draft.nodes, newNode], [...draft.edges, { id: 'e' + Date.now(), from: quickPicker.fromNodeId, to: newNode.id }]);
        setQuickPicker(null);
        setSelectedNodeId(newNode.id);
    };

    const deleteNode = (nodeId) => {
        updateNodesEdges(draft.nodes.filter(n => n.id !== nodeId), draft.edges.filter(e => e.from !== nodeId && e.to !== nodeId));
        if (selectedNodeId === nodeId) setSelectedNodeId(null);
    };

    const deleteEdge = (edgeId) => {
        updateNodesEdges(draft.nodes, draft.edges.filter(e => e.id !== edgeId));
        setSelectedEdgeId(null);
    };

    const updateNodeField = (nodeId, patch) => {
        setDraft(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n) }));
    };
    const commitFieldHistory = () => pushHistory(draft.nodes, draft.edges);

    const zoomIn = () => setScale(s => Math.min(1.6, +(s + 0.1).toFixed(2)));
    const zoomOut = () => setScale(s => Math.max(0.5, +(s - 0.1).toFixed(2)));
    const resetView = () => { setOffset({ x: 60, y: 40 }); setScale(1); };

    const handleSave = () => {
        const now = Date.now();
        let savedAgent;
        if (draft.id) {
            const updated = state.aiAgents.map(a => a.id === draft.id ? { ...a, name: draft.name, nodes: draft.nodes, edges: draft.edges, updatedAt: now } : a);
            savedAgent = updated.find(a => a.id === draft.id);
            updateState({ aiAgents: updated, activeAgentId: draft.id });
        } else {
            const newId = 'agent_' + now;
            savedAgent = { id: newId, name: draft.name, nodes: draft.nodes, edges: draft.edges, createdAt: now, updatedAt: now, isPaid: false, status: 'unpaid' };
            updateState({ aiAgents: [...state.aiAgents, savedAgent], activeAgentId: newId });
            setDraft(prev => ({ ...prev, id: newId }));
        }
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1800);
        if (savedAgent && !savedAgent.isPaid) {
            setTimeout(() => setShowInvoice(true), 400);
        }
    };

    const handleSelectAgentFromHistory = (agent) => {
        const d = loadDraftFromAgent(agent);
        setDraft(d);
        setSelectedNodeId(null); setSelectedEdgeId(null);
        setHistory({ stack: [{ nodes: d.nodes, edges: d.edges }], index: 0 });
        updateState({ activeAgentId: agent.id });
        setShowHistoryMenu(false);
    };
    const handleNewAgentFromHistory = () => {
        const blank = createBlankAgentDraft();
        setDraft(blank);
        setSelectedNodeId(null); setSelectedEdgeId(null);
        setHistory({ stack: [{ nodes: blank.nodes, edges: blank.edges }], index: 0 });
        updateState({ activeAgentId: null });
        setShowHistoryMenu(false);
    };
    const handleDeleteAgentFromHistory = (id) => {
        updateState({ aiAgents: state.aiAgents.filter(a => a.id !== id), activeAgentId: state.activeAgentId === id ? null : state.activeAgentId });
        if (draft.id === id) {
            const blank = createBlankAgentDraft();
            setDraft(blank);
            setHistory({ stack: [{ nodes: blank.nodes, edges: blank.edges }], index: 0 });
        }
    };
    const handleRenameAgentFromHistory = (id, newName) => {
        updateState({ aiAgents: state.aiAgents.map(a => a.id === id ? { ...a, name: newName, updatedAt: Date.now() } : a) });
        if (draft.id === id) setDraft(prev => ({ ...prev, name: newName }));
    };

    const [pendingTestCost, setPendingTestCost] = useState(0);

    // Клик по "Тестировать": сначала проверяем оплату сборки и баланс,
    // и только после подтверждения списываем токены и запускаем анимацию.
    const handleTestClick = () => {
        if (draft.nodes.length === 0 || isTesting) return;
        if (!draft.id) { alert('Сначала сохраните агента — тестовый запуск списывает токены с баланса, а для этого агент должен быть сохранён и оплачен.'); return; }
        const agentRecord = state.aiAgents.find(a => a.id === draft.id);
        if (!agentRecord || !agentRecord.isPaid) { setShowInvoice(true); return; }
        if (agentRecord.status === 'suspended') { setShowLowBalance(true); return; }
        const cost = Math.max(2, draft.nodes.length * TOKEN_CHARGE_PER_NODE);
        setPendingTestCost(cost);
        setShowTestConfirm(true);
    };

    // Пользователь подтвердил списание — проверяем баланс и либо списываем,
    // либо приостанавливаем агента и просим пополнить счёт.
    const confirmTestCharge = () => {
        setShowTestConfirm(false);
        const balance = state.walletBalance || 0;
        if (balance < pendingTestCost) {
            updateState({ aiAgents: state.aiAgents.map(a => a.id === draft.id ? { ...a, status: 'suspended' } : a) });
            setShowLowBalance(true);
            return;
        }
        const now = Date.now();
        const platformCut = Math.round(pendingTestCost * PLATFORM_MARGIN_PERCENT / 100);
        const providerCut = pendingTestCost - platformCut;
        updateState({
            walletBalance: balance - pendingTestCost,
            walletTransactions: [{ id: 'tx' + now, type: 'token_charge', amount: -pendingTestCost, description: `Токены агента «${draft.name}» (сервис ${platformCut}₽ + модель ${providerCut}₽)`, timestamp: now, agentId: draft.id }, ...(state.walletTransactions || [])]
        });
        setLastChargeInfo({ amount: pendingTestCost, platformCut, providerCut });
        setTimeout(() => setLastChargeInfo(null), 4000);
        runTestAnimation();
    };

    const runTestAnimation = () => {
        setIsTesting(true);
        const incoming = {};
        draft.nodes.forEach(n => { incoming[n.id] = 0; });
        draft.edges.forEach(e => { incoming[e.to] = (incoming[e.to] || 0) + 1; });
        let queue = draft.nodes.filter(n => incoming[n.id] === 0).map(n => n.id);
        if (queue.length === 0) queue = [draft.nodes[0].id];
        const visited = new Set();
        const order = [];
        while (queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            order.push(id);
            draft.edges.filter(e => e.from === id).forEach(e => { if (!visited.has(e.to)) queue.push(e.to); });
        }
        draft.nodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id); });

        let i = 0;
        const step = () => {
            if (i >= order.length) { setTestRunNodeId(null); setIsTesting(false); return; }
            setTestRunNodeId(order[i]);
            i += 1;
            setTimeout(step, 550);
        };
        step();
    };

    const configSummary = (node, block) => {
        if (!block) return '';
        const c = node.config || {};
        switch (block.id) {
            case 'http_request': return `${c.method || 'GET'}${c.url ? ': ' + c.url : ''}`;
            case 'code': return 'JavaScript';
            case 'google_sheets': return c.sheetName ? `sheet: ${c.sheetName}` : 'append: sheet';
            case 'google_drive': return c.fileName || 'update: file';
            case 'airtable': return c.baseId || 'base';
            case 'send_email': return c.to || '';
            case 'email_trigger': return c.mailbox || '';
            case 'telegram_trigger': case 'telegram_send': return c.chatId || '';
            case 'webhook': return c.path || '';
            case 'schedule': return c.cron || '';
            case 'ai_agent': case 'openai': return c.model || 'GPT-4o';
            case 'text_processing': return c.instruction ? c.instruction.slice(0, 30) : '';
            case 'classification': return c.categories || '';
            default: return '';
        }
    };

    // Строит путь связи между блоками. В обычном случае (цель правее
    // источника) — плавная S-образная кривая, выходящая и заходящая
    // строго горизонтально из портов. Если же цель левее источника
    // (обратная связь), прямая кривая резала бы карточки блоков —
    // поэтому в этом случае линия аккуратно огибает их сверху.
    const edgePath = (p1, p2) => {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const absDy = Math.abs(dy);

        if (dx >= 40) {
            const bend = Math.max(50, Math.min(Math.abs(dx) * 0.5, 160));
            return `M ${p1.x} ${p1.y} C ${p1.x + bend} ${p1.y}, ${p2.x - bend} ${p2.y}, ${p2.x} ${p2.y}`;
        }

        const bend = 46;
        const clearance = Math.max(60, absDy / 2 + 40);
        const topY = Math.min(p1.y, p2.y) - clearance;
        return `M ${p1.x} ${p1.y} C ${p1.x + bend} ${p1.y}, ${p1.x + bend} ${topY}, ${p1.x + bend} ${topY} L ${p2.x - bend} ${topY} C ${p2.x - bend} ${topY}, ${p2.x - bend} ${p2.y}, ${p2.x} ${p2.y}`;
    };

    const readyToRun = draft.nodes.some(n => { const b = getBlockDef(n.blockId); return b && b.isTrigger; }) && draft.edges.length > 0;
    const currentAgentRecord = draft.id ? state.aiAgents.find(a => a.id === draft.id) : null;
    const billingBadge = !currentAgentRecord
        ? { label: 'Черновик', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: 'Info' }
        : !currentAgentRecord.isPaid
            ? { label: 'Не оплачен', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400', icon: 'Receipt' }
            : currentAgentRecord.status === 'suspended'
                ? { label: 'Приостановлен', cls: 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400', icon: 'Pause' }
                : { label: readyToRun ? 'Активен' : 'Активен · нет триггера', cls: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400', icon: 'Check' };

    const filteredCategories = BLOCK_CATEGORIES.map(cat => ({
        cat,
        items: BLOCK_LIBRARY.filter(b => b.category === cat && (searchQuery.trim() === '' || b.name.toLowerCase().includes(searchQuery.trim().toLowerCase())))
    })).filter(g => g.items.length > 0);

    const renderBlockList = (isMobile) => (
        <>
            {filteredCategories.map(({ cat, items }) => (
                <div key={cat} className="mb-5">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{cat}</h4>
                    <div className="space-y-1">
                        {items.map(b => {
                            const c = BLOCK_COLORS[b.color] || BLOCK_COLORS.gray;
                            const IconComp = Icons[b.icon] || Icons.Robot;
                            return (
                                <button key={b.id} onClick={() => { addNodeFromBlock(b); if (isMobile) setShowMobileBlockPicker(false); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left group">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg} ${c.text}`}><IconComp className="w-4 h-4" /></div>
                                    <span className="text-sm font-semibold dark:text-gray-200 truncate">{b.name}</span>
                                    <Icons.Plus className="w-3.5 h-3.5 text-gray-300 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </>
    );

    const selectedNode = selectedNodeId ? draft.nodes.find(n => n.id === selectedNodeId) : null;
    const selectedBlock = selectedNode ? getBlockDef(selectedNode.blockId) : null;

    return (
        <div className="h-app-screen w-full flex flex-col bg-[#f8f9fc] dark:bg-darkBg overflow-hidden void-view-enter">
            {/* ВЕРХНЯЯ ПАНЕЛЬ */}
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder flex-shrink-0 z-30">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button onClick={() => goBack(state, updateState, 'home')} title="Назад" className="void-tap-target p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
                        <Icons.ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <h1 className="font-extrabold text-[13px] sm:text-base md:text-lg dark:text-white truncate">Конструктор AI-агентов</h1>
                        </div>
                        {editingName ? (
                            <input
                                autoFocus
                                value={nameDraft}
                                onChange={e => setNameDraft(e.target.value)}
                                onBlur={() => { setDraft(prev => ({ ...prev, name: nameDraft.trim() || 'Мой агент' })); setEditingName(false); }}
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-0.5 focus:outline-none focus:border-[#5b32d4] w-36 sm:w-48"
                            />
                        ) : (
                            <button onClick={() => { setNameDraft(draft.name); setEditingName(true); }} className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-[#5b32d4] transition-colors max-w-full">
                                <span className="truncate max-w-[120px] sm:max-w-none">{draft.name}</span> <Icons.Pencil className="w-3 h-3 flex-shrink-0" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <button onClick={() => updateState({ currentView: 'wallet' })} title="Кошелёк" className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${(state.walletBalance || 0) < LOW_BALANCE_THRESHOLD ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                        <Icons.Wallet className="w-3.5 h-3.5" /> {formatMoney(state.walletBalance || 0)} ₽
                    </button>
                    <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${billingBadge.cls}`}>
                        {billingBadge.icon === 'Check' && <Icons.Check className="w-3.5 h-3.5" />}
                        {billingBadge.icon === 'Receipt' && <Icons.Receipt className="w-3.5 h-3.5" />}
                        {billingBadge.icon === 'Pause' && <Icons.Pause className="w-3.5 h-3.5" />}
                        {billingBadge.icon === 'Info' && <Icons.Info style={{ width: '14px', height: '14px' }} />}
                        {billingBadge.label}
                    </div>
                    <button onClick={() => setShowOrchPurchase(true)} title="Купить оркестратора" className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 font-bold text-sm transition-colors">
                        <Icons.RobotArmy className="w-4 h-4" /> <span className="hidden md:inline">Оркестратор</span>
                    </button>
                    <button onClick={() => setShowAgentStore(true)} title="Магазин готовых агентов" className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 hover:bg-[#e0dbf4] dark:hover:bg-purple-900/40 text-[#5b32d4] dark:text-purple-300 font-bold text-sm transition-colors">
                        <Icons.Store className="w-4 h-4" /> <span className="hidden sm:inline">Магазин агентов</span>
                    </button>
                    <button onClick={undo} disabled={history.index <= 0} title="Отменить" className="void-tap-target p-2.5 rounded-xl border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><Icons.Undo className="w-4 h-4" /></button>
                    <button onClick={redo} disabled={history.index >= history.stack.length - 1} title="Повторить" className="void-tap-target p-2.5 rounded-xl border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><Icons.Redo className="w-4 h-4" /></button>
                    <button onClick={handleTestClick} disabled={isTesting} className="hidden sm:flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl border border-gray-200 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm transition-colors disabled:opacity-50">
                        <Icons.Play className="w-4 h-4" /> <span className="hidden md:inline">{isTesting ? 'Тестируем...' : 'Тестировать'}</span>
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-1.5 px-3.5 sm:px-5 py-2.5 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm shadow-md transition-colors whitespace-nowrap">
                        {savedFlash ? <><Icons.Check className="w-4 h-4" /> <span className="hidden sm:inline">Сохранено</span></> : 'Сохранить'}
                    </button>
                    <button onClick={() => setShowHistoryMenu(true)} className="void-tap-target p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder transition-colors"><Icons.TwoLines className="w-5 h-5" /></button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* ЛЕВЫЙ САЙДБАР — БИБЛИОТЕКА БЛОКОВ (десктоп) */}
                <div className="hidden sm:flex w-64 md:w-72 flex-shrink-0 bg-white dark:bg-darkCard border-r border-gray-100 dark:border-darkBorder flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-gray-100 dark:border-darkBorder flex-shrink-0">
                        <div className="relative">
                            <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск блоков..." className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                        {renderBlockList(false)}
                    </div>
                </div>

                {/* КАНВАС */}
                <div
                    ref={canvasRef}
                    onPointerDown={handleCanvasPointerDown}
                    onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-agent-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                    onDrop={handleAgentDrop}
                    className="flex-1 relative overflow-hidden bg-[#f4f5fa] dark:bg-[#141019]"
                    style={{ backgroundImage: 'radial-gradient(circle, #d8d2ee 1.5px, transparent 1.5px)', backgroundSize: `${24 * scale}px ${24 * scale}px`, backgroundPosition: `${offset.x}px ${offset.y}px`, touchAction: 'none' }}
                >
                    <div className="flex absolute top-4 left-4 z-20 bg-white dark:bg-darkCard rounded-2xl shadow-md border border-gray-100 dark:border-darkBorder flex-col p-1 gap-1">
                        <button onClick={resetView} title="Показать всё" className="void-tap-target p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"><Icons.Expand className="w-4 h-4" /></button>
                        <button onClick={() => setLocked(l => !l)} title={locked ? 'Разблокировать канвас' : 'Заблокировать канвас'} className={`void-tap-target p-2 rounded-xl transition-colors ${locked ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4]' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'}`}><Icons.Lock className="w-4 h-4" /></button>
                    </div>

                    <div style={{ position: 'absolute', top: 0, left: 0, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0' }}>
                        <svg className="absolute top-0 left-0 pointer-events-none" width={4000} height={3000} style={{ overflow: 'visible' }}>
                            {draft.edges.map(edge => {
                                const fromNode = draft.nodes.find(n => n.id === edge.from);
                                const toNode = draft.nodes.find(n => n.id === edge.to);
                                if (!fromNode || !toNode) return null;
                                const p1 = { x: fromNode.x + NODE_W, y: fromNode.y + NODE_H / 2 };
                                const p2 = { x: toNode.x, y: toNode.y + NODE_H / 2 };
                                const isSel = selectedEdgeId === edge.id;
                                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                                return (
                                    <g key={edge.id}>
                                        <path d={edgePath(p1, p2)} fill="none" stroke={isSel ? '#5b32d4' : '#b8b0d9'} strokeWidth={isSel ? 4 : 3} strokeLinecap="round" />
                                        <path d={edgePath(p1, p2)} fill="none" stroke="transparent" strokeWidth={20} className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); }} />
                                        <polygon points={`${p2.x - 10},${p2.y - 6} ${p2.x - 10},${p2.y + 6} ${p2.x},${p2.y}`} fill={isSel ? '#5b32d4' : '#b8b0d9'} />
                                        {isSel && (
                                            <foreignObject x={mid.x - 12} y={mid.y - 12} width="24" height="24" className="pointer-events-auto">
                                                <button onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }} className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600"><Icons.X className="w-3.5 h-3.5" /></button>
                                            </foreignObject>
                                        )}
                                    </g>
                                );
                            })}
                            {connecting && (() => {
                                const fromNode = draft.nodes.find(n => n.id === connecting.from);
                                if (!fromNode) return null;
                                const p1 = { x: fromNode.x + NODE_W, y: fromNode.y + NODE_H / 2 };
                                return <path d={edgePath(p1, connecting.point)} fill="none" stroke="#5b32d4" strokeWidth={3} strokeLinecap="round" strokeDasharray="7 5" />;
                            })()}
                        </svg>

                        {draft.nodes.map(node => {
                            const block = getBlockDef(node.blockId);
                            if (!block) return null;
                            const color = BLOCK_COLORS[block.color] || BLOCK_COLORS.gray;
                            const IconComp = Icons[block.icon] || Icons.Robot;
                            const isSelected = selectedNodeId === node.id;
                            const isActive = isSelected || draggingNodeId === node.id;
                            const isTestingNode = testRunNodeId === node.id;
                            const summary = configSummary(node, block);
                            return (
                                <div
                                    key={node.id}
                                    style={{ position: 'absolute', left: node.x, top: node.y, width: NODE_W, touchAction: 'none' }}
                                    onPointerDown={(e) => handleNodePointerDown(e, node)}
                                    className={`bg-white dark:bg-darkCard rounded-2xl border-2 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing select-none ${isActive ? 'border-[#5b32d4]' : 'border-gray-100 dark:border-darkBorder'} ${isTestingNode ? 'ring-4 ring-[#5b32d4]/30' : ''}`}
                                >
                                    <div className="p-3.5 flex items-start gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color.bg} ${color.text}`}><IconComp className="w-5 h-5" /></div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-sm dark:text-white truncate">{node.name}</p>
                                            <p className="text-xs text-gray-400 truncate">{node.description || block.subtitle}</p>
                                        </div>
                                    </div>
                                    {summary && (
                                        <div className="px-3.5 pb-3 -mt-1">
                                            <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate bg-gray-50 dark:bg-gray-800/50 rounded-lg px-2 py-1">{summary}</p>
                                        </div>
                                    )}
                                    {!block.isTrigger && <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white dark:bg-darkCard border-2 border-gray-300 dark:border-gray-600"></div>}
                                    <div onPointerDown={(e) => handleOutputPointerDown(e, node)} style={{touchAction:'none'}} className="absolute -right-2.5 sm:-right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-3.5 sm:h-3.5 rounded-full bg-white dark:bg-darkCard border-2 border-[#5b32d4] cursor-crosshair hover:scale-125 transition-transform"></div>
                                    {isSelected && (
                                        <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full shadow-md flex items-center justify-center hover:bg-red-600 transition-colors" title="Удалить блок"><Icons.X className="w-3.5 h-3.5" /></button>
                                    )}
                                </div>
                            );
                        })}

                        {quickPicker && (
                            <div style={{ position: 'absolute', left: quickPicker.x, top: quickPicker.y }} className="z-30 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl shadow-2xl w-64 max-h-80 overflow-y-auto p-2 fade-in" onPointerDown={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between px-2 py-1.5">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Выберите блок</p>
                                    <button onClick={() => setQuickPicker(null)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"><Icons.X className="w-3.5 h-3.5" /></button>
                                </div>
                                {BLOCK_CATEGORIES.map(cat => (
                                    <div key={cat} className="mb-1">
                                        <p className="text-[10px] font-bold text-gray-400 px-2 pt-1.5 pb-0.5 uppercase">{cat}</p>
                                        {BLOCK_LIBRARY.filter(b => b.category === cat).map(b => {
                                            const c = BLOCK_COLORS[b.color] || BLOCK_COLORS.gray;
                                            const IconComp = Icons[b.icon] || Icons.Robot;
                                            return (
                                                <button key={b.id} onClick={() => handleQuickPickerSelect(b)} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg} ${c.text}`}><IconComp className="w-4 h-4" /></div>
                                                    <span className="text-sm font-semibold dark:text-gray-200 truncate">{b.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button onClick={() => setShowMobileBlockPicker(true)} className="sm:hidden void-tap-target absolute bottom-5 right-5 z-20 w-14 h-14 rounded-full bg-[#5b32d4] text-white shadow-xl flex items-center justify-center hover:bg-[#4a26b0] transition-colors">
                        <Icons.Plus className="w-6 h-6" />
                    </button>
                </div>

                {/* ПРАВАЯ ПАНЕЛЬ ПАРАМЕТРОВ БЛОКА */}
                {selectedNode && selectedBlock && (
                    <div className="w-full sm:w-80 md:w-96 flex-shrink-0 bg-white dark:bg-darkCard border-l border-gray-100 dark:border-darkBorder h-full overflow-y-auto fixed sm:static right-0 top-0 z-40 sm:z-auto pt-0 fade-in">
                        <div className="p-5 border-b border-gray-100 dark:border-darkBorder flex items-center justify-between sticky top-0 bg-white dark:bg-darkCard z-10">
                            <h3 className="font-extrabold dark:text-white truncate">{selectedBlock.name}</h3>
                            <button onClick={() => setSelectedNodeId(null)} className="void-tap-target p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center"><Icons.X /></button>
                        </div>
                        <div className="p-5 space-y-5">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Название блока</label>
                                <input value={selectedNode.name} onChange={e => updateNodeField(selectedNode.id, { name: e.target.value })} onBlur={commitFieldHistory} className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm font-semibold dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Описание</label>
                                <textarea value={selectedNode.description || ''} onChange={e => updateNodeField(selectedNode.id, { description: e.target.value })} onBlur={commitFieldHistory} rows={2} className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4] resize-none" />
                            </div>

                            {selectedBlock.isAI ? (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Модель</label>
                                        <select value={selectedNode.config.model || 'GPT-4o'} onChange={e => { updateNodeField(selectedNode.id, { config: { ...selectedNode.config, model: e.target.value } }); commitFieldHistory(); }} className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm font-semibold dark:text-white focus:outline-none focus:border-[#5b32d4]">
                                            <option>GPT-4o</option><option>GPT-4o mini</option><option>Claude 3.5 Sonnet</option><option>Gemini 2.5 Flash</option>
                                        </select>
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1.5"><label className="text-xs font-bold text-gray-500">Температура</label><span className="text-xs font-bold text-[#5b32d4]">{selectedNode.config.temperature ?? 0.7}</span></div>
                                        <input type="range" min="0" max="1" step="0.1" value={selectedNode.config.temperature ?? 0.7} onChange={e => updateNodeField(selectedNode.id, { config: { ...selectedNode.config, temperature: parseFloat(e.target.value) } })} onMouseUp={commitFieldHistory} className="w-full accent-[#5b32d4]" />
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1.5"><label className="text-xs font-bold text-gray-500">Макс. длина ответа</label><span className="text-xs font-bold text-[#5b32d4]">{selectedNode.config.maxTokens ?? 1024}</span></div>
                                        <input type="range" min="128" max="4096" step="128" value={selectedNode.config.maxTokens ?? 1024} onChange={e => updateNodeField(selectedNode.id, { config: { ...selectedNode.config, maxTokens: parseInt(e.target.value) } })} onMouseUp={commitFieldHistory} className="w-full accent-[#5b32d4]" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-500">Память</label>
                                        <button onClick={() => { updateNodeField(selectedNode.id, { config: { ...selectedNode.config, memory: !(selectedNode.config.memory ?? true) } }); commitFieldHistory(); }} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${(selectedNode.config.memory ?? true) ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>{(selectedNode.config.memory ?? true) ? 'Включена' : 'Выключена'}</button>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">Системный промпт</label>
                                        <textarea value={selectedNode.config.systemPrompt ?? 'Вы — полезный AI-агент, который помогает пользователям решать их задачи. Отвечайте кратко и по существу.'} onChange={e => updateNodeField(selectedNode.id, { config: { ...selectedNode.config, systemPrompt: e.target.value } })} onBlur={commitFieldHistory} rows={4} className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4] resize-none" />
                                    </div>
                                </>
                            ) : (
                                selectedBlock.fields.map(f => (
                                    <div key={f.key}>
                                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">{f.label}</label>
                                        {f.multiline ? (
                                            <textarea value={selectedNode.config[f.key] || ''} onChange={e => updateNodeField(selectedNode.id, { config: { ...selectedNode.config, [f.key]: e.target.value } })} onBlur={commitFieldHistory} placeholder={f.placeholder} rows={4} className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm font-mono dark:text-white focus:outline-none focus:border-[#5b32d4] resize-none" />
                                        ) : (
                                            <input value={selectedNode.config[f.key] || ''} onChange={e => updateNodeField(selectedNode.id, { config: { ...selectedNode.config, [f.key]: e.target.value } })} onBlur={commitFieldHistory} placeholder={f.placeholder} className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                                        )}
                                    </div>
                                ))
                            )}

                            <button onClick={() => deleteNode(selectedNode.id)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 font-bold text-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors mt-2">
                                <Icons.Trash className="w-4 h-4" /> Удалить блок
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showMobileBlockPicker && (
                <div className="sm:hidden fixed inset-0 z-50 flex items-end">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileBlockPicker(false)}></div>
                    <div className="relative bg-white dark:bg-darkCard w-full max-h-[75vh] rounded-t-3xl overflow-hidden flex flex-col fade-in pb-safe">
                        <div className="p-4 border-b border-gray-100 dark:border-darkBorder flex items-center justify-between flex-shrink-0">
                            <h3 className="font-extrabold dark:text-white">Добавить блок</h3>
                            <button onClick={() => setShowMobileBlockPicker(false)} className="void-tap-target p-2 text-gray-400"><Icons.X /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {renderBlockList(true)}
                        </div>
                    </div>
                </div>
            )}

            <AgentBuilderMenu
                open={showHistoryMenu}
                onClose={() => setShowHistoryMenu(false)}
                agents={state.aiAgents}
                activeAgentId={draft.id}
                onSelectAgent={handleSelectAgentFromHistory}
                onNewAgent={handleNewAgentFromHistory}
                onDeleteAgent={handleDeleteAgentFromHistory}
                onRenameAgent={handleRenameAgentFromHistory}
                updateState={updateState}
                state={state}
            />

            {showAgentStore && (
                <AgentStore state={state} updateState={updateState} onClose={() => setShowAgentStore(false)} />
            )}
            {showOrchPurchase && (
                <OrchestratorPurchaseModal state={state} updateState={updateState} stayInPlace onClose={() => setShowOrchPurchase(false)} />
            )}

            {showInvoice && currentAgentRecord && (
                <AgentInvoiceModal
                    state={state}
                    updateState={updateState}
                    agent={currentAgentRecord}
                    onClose={() => setShowInvoice(false)}
                    onPaid={() => setShowInvoice(false)}
                />
            )}

            {/* Предупреждение перед списанием токенов за тестовый запуск */}
            {showTestConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 fade-in">
                    <div className="bg-white dark:bg-darkCard w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border border-gray-100 dark:border-darkBorder">
                        <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-2xl flex items-center justify-center mb-4"><Icons.Sparkles className="w-6 h-6" /></div>
                        <h3 className="text-lg font-extrabold dark:text-white mb-1">Списать оплату за токены?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Тестовый запуск агента «{draft.name}» спишет с баланса примерно <strong className="text-gray-800 dark:text-gray-200">{formatMoney(pendingTestCost)} ₽</strong> за токены модели.</p>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-5 text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Баланс сейчас</span>
                            <span className={`font-bold ${(state.walletBalance || 0) >= pendingTestCost ? 'text-gray-700 dark:text-gray-200' : 'text-red-500'}`}>{formatMoney(state.walletBalance || 0)} ₽</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowTestConfirm(false)} className="flex-1 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Отмена</button>
                            <button onClick={confirmTestCharge} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm shadow-md transition-colors">Списать и запустить</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Агент приостановлен из-за нехватки средств */}
            {showLowBalance && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 fade-in">
                    <div className="bg-white dark:bg-darkCard w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border border-gray-100 dark:border-darkBorder">
                        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center mb-4"><Icons.Pause className="w-6 h-6" /></div>
                        <h3 className="text-lg font-extrabold dark:text-white mb-1">Агент приостановлен</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">На балансе недостаточно средств для оплаты токенов. Работа агента «{draft.name}» приостановлена — пополните баланс, чтобы возобновить.</p>
                        <div className="flex gap-2">
                            <button onClick={() => setShowLowBalance(false)} className="flex-1 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Закрыть</button>
                            <button onClick={() => { setShowLowBalance(false); updateState({ currentView: 'wallet' }); }} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm shadow-md transition-colors">Пополнить баланс</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Тост с подтверждением списания за токены */}
            {lastChargeInfo && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[65] bg-[#1a0b38] text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 fade-in max-w-[92vw]">
                    <Icons.Receipt className="w-4 h-4 text-purple-300 flex-shrink-0" />
                    <span className="text-sm font-semibold">Списано {formatMoney(lastChargeInfo.amount)} ₽ за токены (сервис {formatMoney(lastChargeInfo.platformCut)} ₽ + модель {formatMoney(lastChargeInfo.providerCut)} ₽)</span>
                </div>
            )}
        </div>
    );
}
