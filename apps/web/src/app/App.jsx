import { useState, useEffect, useRef } from 'react';
import { RightMenu } from '@/app/RightMenu';
import { AgentStoreApp } from '@/features/agents/store/AgentStoreApp';
import { CockpitView } from '@/features/cockpit/CockpitView';
import { OrchestratorChatView } from '@/features/cockpit/OrchestratorChatView';
import { AgentChatView } from '@/features/cockpit/AgentChatView';
import { NotificationCenter } from '@/features/cockpit/NotificationCenter';
import { applyApprovedPlan } from '@/shared/lib/orchestrator-engine';
import { AuthModal } from '@/features/auth/AuthModal';
import { PricingView } from '@/features/billing/PricingView';
import { ChatView } from '@/features/chat/ChatView';
import { GuideView } from '@/features/guide/GuideView';
import { HomeView } from '@/features/home/HomeView';
import { LibraryView } from '@/features/library/LibraryView';
import { LimitsView } from '@/features/settings/LimitsView';
import { ProfileEditView } from '@/features/settings/ProfileEditView';
import { SecurityView } from '@/features/settings/SecurityView';
import { SettingsView } from '@/features/settings/SettingsView';
import { ProjectsView } from '@/features/projects/ProjectsView';
import { SkillsView, buildSkillsInstruction } from '@/features/skills/SkillsView';
import { PluginsView } from '@/features/plugins/PluginsView';
import { WalletView } from '@/features/wallet/WalletView';
import { createBackendChat, sendBackendMessage, generateBackendImage, fetchWebPage } from '@/shared/api/chat';
import { ApiError } from '@/shared/api/client';
import { AI_MODELS, getPlanLimits, defaultReasoningFor } from '@/shared/config/models';
import { buildReasoningScript, levelDelayMs } from '@/shared/config/reasoningScript';
import { buildAgentSystemPrompt } from '@/shared/lib/agentPrompt';
import { splitMessageContent } from '@/shared/lib/documents';
import { goBack } from '@/shared/lib/navigation';
import { readSharedFromHash, clearShareHash } from '@/shared/lib/shareDialog';
import { loadPersistedState, savePersistedState } from '@/shared/lib/storage';
import { applyTheme } from '@/shared/lib/theme';
import { Splash } from '@/shared/ui/Splash';



// Заголовок чата из первого сообщения: аккуратно обрезаем по словам,
// многоточие добавляем только если текст реально длиннее лимита.
const makeChatTitle = (text) => {
    const clean = (text || '').trim().replace(/\s+/g, ' ');
    if (!clean) return 'Новый чат';
    if (clean.length <= 30) return clean;
    return clean.slice(0, 30).trim() + '…';
};

export function App() {
    // Заставка при загрузке/обновлении страницы (проигрывается каждый раз).
    const [showSplash, setShowSplash] = useState(true);
    // Ленивая инициализация: при первом рендере пытаемся достать
    // сохранённую сессию (вход, чаты, тему и т.д.) из localStorage.
    // Если её нет — используем значения по умолчанию, как раньше.
    const [state, setState] = useState(() => {
        const defaults = {
            currentView: 'home',
            isDarkMode: false,
            lang: 'ru',
            user: null, // До входа - null
            userPlan: 'free',
            accountPlans: {}, // email (в нижнем регистре) -> тарифный план этого аккаунта
            usedDailyLimits: 0,
            usedWeeklyLimits: 0,
            dailyLimitExceededAt: null,
            notificationsEnabled: true,
            voiceLang: 'ru-RU',                // язык озвучки
            voiceURI: null,                    // выбранный голос (voiceURI)
            voiceRate: 1,                      // скорость речи
            voicePitch: 1,                     // высота голоса (для пресетов)
            voicePreset: 'default',            // выбранный пресет русского голоса
            isRightMenuOpen: false,
            showAuthModal: false,
            checkoutPlan: null,
            billingCycle: 'month',
            paymentStep: 'select', 
            selectedMethod: 'card', 
            selectedBank: 'sber',
            chatSessions: [{ id: Date.now(), title: 'Новый чат', messages: [] }],
            activeChatId: null,
            selectedModelId: 'flash_ext',
            reasoningByModel: {},              // modelId -> уровень рассуждений (low/medium/high/max)
            inputValue: '',
            isGenerating: false,
            selectedImage: null,
            // Массив вложений (до 9 фото на платных тарифах, 3 на Free —
            // см. getAttachmentLimit). selectedImage (одиночное) оставлен
            // для обратной совместимости со старыми местами (агенты/
            // оркестраторы используют одно фото), но основной чат теперь
            // работает через selectedImages.
            selectedImages: [],
            authTab: 'login',
            imageGenMode: false,
            activeAgentId: null,
            activeSkills: [],
            customSkills: [],
            isGeneratingImage: false,
            generatedImages: [],
            generatedDocuments: [],
            aiAgents: [],
            walletBalance: 0,
            walletTransactions: [],
            // Проекты: объединяют чаты в единый общий контекст для ИИ
            projects: [],
            // Коннекторы: внешние инструменты, к которым пользователь дал доступ агентам
            connectedPlugins: [],
            // --- Cockpit / оркестраторы / почта ---
            showNotifications: false,          // открыт ли центр уведомлений
            notifyUpdates: true,               // уведомления об обновлениях системы
            notifyPersonal: true,              // уведомления личной почты
            readUpdateIds: [],                 // прочитанные обновления (для бейджа)
            readPersonalIds: [],               // прочитанные личные письма
            starredIds: [],                    // id писем, помеченных звёздочкой
            savedAccounts: [],                 // [{email, name, plan}] — для переключателя аккаунтов
            accountPhotos: {},                 // email -> dataURL фото профиля
            accountData: {},                   // email -> личная история аккаунта (чаты, кошелёк, агенты...)
            mailComposeDraft: null,            // черновик, который автосохраняется при закрытии окна
            orchestratorThreads: {},           // { [orchId]: сообщения чата }
            agentThreads: {},                  // { [agentId]: сообщения чата обычного агента }
            orchestratorReports: {},           // { [orchId]: отчёты (HITL) }
            pendingHitl: null,                 // { orchestratorId, reportId, decision }
            inbox: {
                updates: [
                    { id: 'upd_cockpit', title: 'Новинка: Cockpit', body: 'Панель управления агентами и оркестраторами. Ставьте задачи оркестратору — он раздаёт их агентам с вашего подтверждения.', at: Date.now() },
                ],
                personal: [
                    { id: 'pm_welcome', from: 'team@voidops.com', subject: 'Добро пожаловать в Void Code AI', preview: 'Спасибо, что присоединились к закрытому тесту. Здесь появятся письма от внешних компаний и пользователей.', at: Date.now() },
                ],
                sent: [],
                drafts: [],
                trash: [],
            },
            viewHistory: []
        };

        const saved = loadPersistedState();
        if (!saved) return defaults;

        // Гость (нет входа) видит чистый интерфейс — личная история не
        // показывается. История каждого аккаунта живёт в accountData[email]
        // и подставляется только после входа/переключения.
        const isGuest = !saved.user;
        const guestEmpty = {
            chatSessions: defaults.chatSessions,
            activeChatId: null,
            generatedImages: [],
            generatedDocuments: [],
            aiAgents: [],
            walletBalance: 0,
            walletTransactions: [],
            projects: [],
            connectedPlugins: [],
            inbox: { updates: [], personal: [], sent: [], drafts: [], trash: [] },
            readUpdateIds: [], readPersonalIds: [], starredIds: [],
            orchestratorThreads: {}, orchestratorReports: {}, agentThreads: {},
        };

        const accountHistory = isGuest ? guestEmpty : {
            chatSessions: (saved.chatSessions && saved.chatSessions.length > 0) ? saved.chatSessions.map(c => ({ ...c, messages: (c.messages || []).map(m => m.isAnimated ? { ...m, isAnimated: false } : m) })) : defaults.chatSessions,
            generatedImages: saved.generatedImages || [],
            generatedDocuments: saved.generatedDocuments || [],
            aiAgents: saved.aiAgents || [],
            walletTransactions: saved.walletTransactions || [],
            walletBalance: saved.walletBalance || 0,
            projects: saved.projects || [],
            connectedPlugins: saved.connectedPlugins || [],
            inbox: {
                ...defaults.inbox,
                ...(saved.inbox || {}),
                updates: (saved.inbox && saved.inbox.updates) || defaults.inbox.updates,
                personal: (saved.inbox && saved.inbox.personal) || defaults.inbox.personal,
                sent: (saved.inbox && saved.inbox.sent) || [],
                drafts: (saved.inbox && saved.inbox.drafts) || [],
                trash: (saved.inbox && saved.inbox.trash) || [],
            },
            readUpdateIds: saved.readUpdateIds || [],
            readPersonalIds: saved.readPersonalIds || [],
            starredIds: saved.starredIds || [],
            orchestratorThreads: saved.orchestratorThreads || {},
            agentThreads: saved.agentThreads || {},
            orchestratorReports: saved.orchestratorReports || {},
        };

        return {
            ...defaults,
            ...saved,
            ...accountHistory,
            userPlan: isGuest ? 'free' : (saved.userPlan || 'free'),
            imageGenMode: false,
            activeAgentId: null,
            activeSkills: [],
            customSkills: [],
            isGeneratingImage: false,
            showAuthModal: false,
            savedAccounts: saved.savedAccounts || [],
            accountPhotos: saved.accountPhotos || {},
            accountData: saved.accountData || {},
        };
    });

    // Инициализация activeChatId
    useEffect(() => {
        if (!state.activeChatId && state.chatSessions.length > 0) {
            setState(prev => ({ ...prev, activeChatId: prev.chatSessions[0].id }));
        }
    }, []);

    // Импорт диалога из ссылки #share=... — создаём его как новый чат
    useEffect(() => {
        const shared = readSharedFromHash();
        if (!shared) return;
        setState(prev => ({
            ...prev,
            chatSessions: [shared, ...prev.chatSessions],
            activeChatId: shared.id,
            currentView: 'chat',
        }));
        clearShareHash();
    }, []);

    // Автоматическое восстановление дневного лимита через 8 часов после
    // исчерпания. Проверяем регулярно — так это сработает, даже если
    // вкладка с сайтом всё это время была открыта, без необходимости
    // обновлять страницу.
    // Окно автоматического восстановления дневного лимита — 6 часов после
    // последнего превышения. Соответствует тексту в LimitsView и ТЗ.
    const DAILY_LIMIT_RESET_MS = 6 * 60 * 60 * 1000;
    useEffect(() => {
        const checkReset = () => {
            setState(prev => {
                if (prev.dailyLimitExceededAt && (Date.now() - prev.dailyLimitExceededAt >= DAILY_LIMIT_RESET_MS)) {
                    return { ...prev, usedDailyLimits: 0, dailyLimitExceededAt: null };
                }
                return prev;
            });
        };
        checkReset();
        const interval = setInterval(checkReset, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Автосохранение сессии: при любом изменении входа, чатов, темы,
    // тарифа и т.п. состояние сразу пишется в localStorage.
    // Благодаря этому обновление страницы (F5) больше не сбрасывает вход.
    useEffect(() => {
        savePersistedState(state);
    }, [
        state.user, state.userPlan, state.usedDailyLimits, state.usedWeeklyLimits, state.dailyLimitExceededAt, state.isDarkMode,
        state.notificationsEnabled, state.chatSessions, state.activeChatId,
        state.selectedModelId, state.lang,
        state.generatedImages, state.generatedDocuments, state.aiAgents, state.activeAgentId, state.walletBalance, state.walletTransactions,
        state.projects, state.connectedPlugins
    ]);

    // Каждый раз, когда меняется currentView (и вызывающий код сам не
    // передал viewHistory явно — так делает goBack при возврате),
    // запоминаем, откуда пришли. Это работает для ВСЕХ переходов по
    // всему приложению без необходимости трогать каждый вызов отдельно.
    const updateState = (updates) => setState(prev => {
        // Уборка «мусорных» пустых чатов: если пользователь создал новый чат,
        // ничего не написал и ушёл на другой экран — такой чат (без сообщений)
        // удаляем из истории, чтобы она не забивалась пустышками. Не трогаем
        // чат, в который переходим, и активный, если остаёмся в чате.
        let cleaned = prev;
        if (updates.currentView !== undefined && updates.currentView !== 'chat' && prev.currentView === 'chat') {
            const keepId = updates.activeChatId !== undefined ? updates.activeChatId : prev.activeChatId;
            const filtered = (prev.chatSessions || []).filter(s => (s.messages && s.messages.length > 0) || s.id === keepId);
            if (filtered.length !== (prev.chatSessions || []).length) {
                cleaned = { ...prev, chatSessions: filtered };
            }
        }
        if (updates.currentView !== undefined && updates.currentView !== cleaned.currentView && !('viewHistory' in updates)) {
            const newHistory = [...(cleaned.viewHistory || []), cleaned.currentView].slice(-20);
            return { ...cleaned, ...updates, viewHistory: newHistory };
        }
        return { ...cleaned, ...updates };
    });
    
    // --- HITL: обработка решения пользователя по плану оркестратора ---
    // Единая точка применения решений и из чата, и из почты. Промпты
    // подчинённых меняются ТОЛЬКО здесь и ТОЛЬКО после «Разрешить».
    useEffect(() => {
        const hitl = state.pendingHitl;
        if (!hitl) return;
        const { orchestratorId, reportId, decision } = hitl;

        setState(prev => {
            const reportsForOrch = (prev.orchestratorReports?.[orchestratorId] || []);
            const report = reportsForOrch.find(r => r.id === reportId);
            if (!report || report.status !== 'pending') {
                return { ...prev, pendingHitl: null };
            }

            // Обновляем статус отчёта в почте
            const newReports = {
                ...prev.orchestratorReports,
                [orchestratorId]: reportsForOrch.map(r => r.id === reportId ? { ...r, status: decision } : r),
            };
            // И статус сообщения в чате оркестратора
            const thread = (prev.orchestratorThreads?.[orchestratorId] || []).map(m =>
                m.reportId === reportId ? { ...m, planStatus: decision } : m,
            );
            const newThreads = { ...prev.orchestratorThreads, [orchestratorId]: thread };

            // Применяем план к промптам подчинённых только при одобрении
            let agents = prev.aiAgents;
            if (decision === 'approved' && report.plan) {
                agents = applyApprovedPlan(prev.aiAgents, report.plan);
            }
            return { ...prev, aiAgents: agents, orchestratorReports: newReports, orchestratorThreads: newThreads, pendingHitl: null };
        });
    }, [state.pendingHitl]);

    const chatFileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    // Всегда актуальные ссылки на state/updateState для обработчиков свайпа,
    // которые регистрируются один раз при монтировании (см. ниже).
    const stateRef = useRef(state);
    stateRef.current = state;
    const updateStateRef = useRef(updateState);
    updateStateRef.current = updateState;

    // Свайп для открытия/закрытия бокового меню с телефона — работает на
    // любой вкладке приложения, в том числе в мобильном браузере (не
    // только в установленном приложении). Свайп влево от правого края
    // экрана открывает меню, свайп вправо по открытому меню — закрывает.
    const touchStartRef = useRef(null);
    useEffect(() => {
        const EDGE_ZONE = 28; // px от правого края экрана, где начинается открывающий свайп
        const MIN_DISTANCE = 55; // минимальная длина свайпа по горизонтали
        const onTouchStart = (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
        };
        const onTouchEnd = (e) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            const t = e.changedTouches && e.changedTouches[0];
            if (!start || !t) return;
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            if (dx < 0 && !stateRef.current.isRightMenuOpen && stateRef.current.user && start.x > window.innerWidth - EDGE_ZONE) {
                // Свайп влево от самого правого края экрана — открыть меню
                updateStateRef.current({ isRightMenuOpen: true });
            } else if (dx > 0 && stateRef.current.isRightMenuOpen) {
                // Свайп вправо по открытому меню — закрыть его
                updateStateRef.current({ isRightMenuOpen: false });
            }
        };
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, []);

    useEffect(() => {
        applyTheme(state.isDarkMode);
    }, [state.isDarkMode]);

    // ГЛАВНАЯ ФУНКЦИЯ ОТПРАВКИ И ОБНОВЛЕНИЯ ЧАТА
    const handleSendMessage = async (textOverride = null) => {
        // ПРОВЕРКА АВТОРИЗАЦИИ: Если не вошел, показываем модалку логина
        if (!state.user) {
            updateState({ showAuthModal: true });
            return;
        }

        const textToSend = typeof textOverride === 'string' ? textOverride : (state.inputValue || '');
        const attachedImages = state.selectedImages && state.selectedImages.length > 0 ? state.selectedImages : (state.selectedImage ? [state.selectedImage] : []);
        if ((!textToSend.trim() && attachedImages.length === 0) || state.isGenerating) return;
        
        const activeModel = AI_MODELS.find(m => m.id === state.selectedModelId) || AI_MODELS[1];
        const maxLimits = getPlanLimits(state.userPlan);
        
        // ПРОВЕРКА ЛИМИТОВ (дневной лимит остаётся основным ограничителем)
        if (state.usedDailyLimits + activeModel.cost > maxLimits.daily && activeModel.cost > 0) {
            alert('Вы исчерпали дневной лимит. Лимиты обновятся автоматически через 8 часов — можно отслеживать обратный отсчёт во вкладке «Лимиты», либо переключитесь на бесплатную модель Flash.');
            return;
        }
        
        // image — первое вложение (для обратной совместимости со старым
        // UI сообщения), images — полный массив (используется превью
        // в несколько картинок и Vision-обогащением запроса к LLM).
        const newUserMessage = { role: 'user', content: textToSend, image: attachedImages[0] || null, images: attachedImages };

        // Определяем ID сессии, в которую пишем, ДО setState — если активной
        // сессии нет (например, сразу после регистрации, когда ни одного
        // чата ещё не было), создаём её здесь же. Раньше это создание
        // откладывалось на отдельный useEffect, который не успевал
        // сработать до первого сообщения — из-за этого само сообщение и
        // ответ ИИ терялись (не привязывались ни к одной сессии).
        // Если отправка идёт НЕ из уже открытого экрана чата (а с главного
        // экрана Home), всегда стартуем новый чат, а не дописываем в
        // последний активный — так поле ввода на Home всегда начинает
        // новый разговор.
        const enteringFromHome = state.currentView !== 'chat';
        const sessionExists = !enteringFromHome && state.chatSessions.some(s => s.id === state.activeChatId);
        const targetChatId = sessionExists ? state.activeChatId : Date.now();

        let messagesForApi = [];

        // 1. Оптимистично добавляем запрос юзера
        setState(prev => {
            let currentMessages = [];
            let newSessions;
            const idx = prev.chatSessions.findIndex(s => s.id === targetChatId);
            if (idx === -1) {
                currentMessages = [newUserMessage];
                newSessions = [{ id: targetChatId, title: makeChatTitle(textToSend), messages: currentMessages }, ...prev.chatSessions];
            } else {
                newSessions = prev.chatSessions.map(session => {
                    if (session.id === targetChatId) {
                        currentMessages = [...session.messages, newUserMessage];
                        return {
                            ...session,
                            title: session.messages.length === 0 ? makeChatTitle(textToSend) : session.title,
                            messages: currentMessages
                        };
                    }
                    return session;
                });
            }

            messagesForApi = currentMessages; 

            const newUsedDaily = prev.usedDailyLimits + activeModel.cost;
            const justExceeded = maxLimits.daily !== Infinity && newUsedDaily >= maxLimits.daily && !prev.dailyLimitExceededAt;

            return {
                ...prev,
                chatSessions: newSessions,
                activeChatId: targetChatId,
                inputValue: '',
                selectedImage: null,
                selectedImages: [],
                isGenerating: true,
                currentView: 'chat',
                usedDailyLimits: newUsedDaily,
                usedWeeklyLimits: (prev.usedWeeklyLimits || 0) + activeModel.cost,
                dailyLimitExceededAt: justExceeded ? Date.now() : prev.dailyLimitExceededAt,
                selectedModelId: justExceeded ? 'flash' : prev.selectedModelId
            };
        });
        
        // 2. Отправляем запрос к ИИ.
        const project = (state.projects || []).find(p => (p.chatIds || []).includes(targetChatId));
        let systemPrompt = activeModel.sysPrompt;
        if (project) {
            // Примечание: реальный backend ведёт историю сам по chatId в базе,
            // поэтому объединение истории соседних чатов проекта (как было в
            // тестовом режиме) здесь не переносится — только текст подсказки.
            systemPrompt = `${activeModel.sysPrompt}\n\nЭтот диалог входит в проект «${project.name}».`;
            // Сквозной контекст проекта: если включён — считываем «Инструкции
            // проекта» (стек, архитектура, ключевые детали прошлых обсуждений),
            // чтобы ассистент помнил контекст даже в новом чате проекта.
            if ((project.unifiedContext ?? true) && (project.memory || '').trim()) {
                systemPrompt += `\n\nИнструкции и контекст проекта (учитывай их):\n${project.memory.trim()}`;
            }
        }

        // Режим агента: если в поле ввода выбран агент, ИИ отвечает как
        // агент-исполнитель — кратко, по делу, с упором на действия и
        // подключение инструментов (коннекторов). Он не «болтает», а ведёт
        // задачу: перечисляет шаги, при нехватке доступа просит подключить
        // нужный коннектор и (если требуется) API-токен с точным списком
        // прав, объясняет проделанную работу по шагам. Код пишет уровня
        // Void Plus/Pro в зависимости от сложности.
        const activeAgent = state.activeAgentId ? (state.aiAgents || []).find(a => a.id === state.activeAgentId) : null;
        if (activeAgent) {
            systemPrompt = buildAgentSystemPrompt(activeAgent, state.connectedPlugins || []);
        }

        // Добавляем инструкции активных скиллов (базовых + кастомных, а для
        // чата в проекте — ещё и проектных) к системному промпту.
        const skillsInstruction = buildSkillsInstruction(state, project);
        if (skillsInstruction) systemPrompt = `${systemPrompt}\n\n${skillsInstruction}`;

        let responseText = '';
        try {
            // У каждой локальной сессии чата — своя сессия на бэкенде
            // (создаётся один раз, лениво, при первом сообщении).
            let session = state.chatSessions.find(s => s.id === targetChatId);
            let backendChatId = session?.backendChatId;
            if (!backendChatId) {
                backendChatId = await createBackendChat();
                setState(prev => ({
                    ...prev,
                    chatSessions: prev.chatSessions.map(s =>
                        s.id === targetChatId ? { ...s, backendChatId } : s
                    ),
                }));
            }
            // В режиме агента используем pro-модель (код уровня Plus/Pro),
            // иначе — выбранную пользователем модель.
            const modelForRequest = activeAgent ? 'pro' : state.selectedModelId;

            // Если в сообщении есть URL(ы) — предзагружаем их содержимое
            // и подмешиваем в запрос к LLM. Модель не имеет прямого выхода
            // в интернет, но благодаря этому пользователь может присылать
            // ссылки и просить «изучи этот сайт». Максимум 2 URL за раз,
            // чтобы не раздувать промпт и время ожидания. Ошибки загрузки
            // игнорируем молча — модель просто ответит на исходное
            // сообщение без обогащения.
            let enrichedText = textToSend;
            const urlRegex = /https?:\/\/[^\s<>"'`)]+/gi;
            const urls = (textToSend.match(urlRegex) || []).slice(0, 2);
            if (urls.length > 0) {
                const parts = [];
                for (const u of urls) {
                    try {
                        const page = await fetchWebPage(u);
                        if (page?.text) {
                            parts.push(`\n\n[Содержимое страницы ${page.url}${page.title ? ` — «${page.title}»` : ''}${page.truncated ? ' (обрезано)' : ''}]\n${page.text}`);
                        }
                    } catch (e) {
                        console.warn(`[App] Не удалось загрузить ${u}:`, e?.message);
                    }
                }
                if (parts.length > 0) {
                    enrichedText = textToSend + parts.join('') + '\n\n[/содержимое страниц]';
                }
            }

            responseText = await sendBackendMessage(backendChatId, enrichedText, modelForRequest, systemPrompt, attachedImages);
            // На более тяжёлых уровнях рассуждений даём ИИ «подумать» чуть
            // дольше перед выдачей ответа — пользователь тем временем видит
            // расширенный индикатор размышления (см. ThinkingIndicator).
            const reasoningLevel = (state.reasoningByModel || {})[state.selectedModelId] || defaultReasoningFor(state.selectedModelId);
            const extraDelay = levelDelayMs(reasoningLevel);
            if (extraDelay > 0) await new Promise(resolve => setTimeout(resolve, extraDelay));
        } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
                responseText = '⚠️ Сессия истекла — выйдите и войдите заново, чтобы продолжить общение с ИИ.';
            } else if (e instanceof ApiError) {
                responseText = `⚠️ ${e.message}`; // напр. 403 — исчерпан лимит запросов
            } else {
                responseText = 'Произошла ошибка при получении ответа от ИИ.';
            }
        }
        
        // 3. Добавляем ответ. Код из ответа не печатается в чат — он уходит
        // в отдельные карточки, которые открывают окно просмотра кода.
        setState(prev => {
            const { text: displayText, blocks: codeBlocks } = splitMessageContent(responseText);
            const finalText = displayText || (codeBlocks.length > 0 ? 'Готово! Я подготовил код — открой его в окне просмотра ниже, чтобы посмотреть исходник или результат.' : responseText);
            const reasoningLevel = (prev.reasoningByModel || {})[prev.selectedModelId] || defaultReasoningFor(prev.selectedModelId);
            const reasoningTrace = buildReasoningScript(reasoningLevel, prev.lang || 'ru');

            const newSessions = prev.chatSessions.map(session => {
                if (session.id === targetChatId) {
                    return { ...session, messages: [...session.messages, { role: 'assistant', content: finalText, codeBlocks, isAnimated: true, reasoningTrace }] };
                }
                return session;
            });

            // Автоматически сохраняем блоки кода из ответа в "Библиотеку" → Документы
            const foundDocs = codeBlocks.filter(b => b.content.length >= 25).map(doc => ({
                id: Date.now() + Math.random(),
                ...doc,
                timestamp: Date.now(),
                chatId: targetChatId
            }));

            // Автоагрегация памяти проекта: если чат входит в проект и включён
            // «сквозной контекст», ключевые сообщения пользователя (стек, ключи,
            // архитектура, требования) кратко дописываются в «Инструкции
            // проекта», чтобы новый чат проекта помнил контекст обсуждений.
            let updatedProjects = prev.projects;
            const proj = (prev.projects || []).find(p => (p.chatIds || []).includes(targetChatId));
            if (proj && (proj.unifiedContext ?? true) && textToSend) {
                const markers = /(стек|architecture|архитектур|api|ключ|token|токен|требовани|deploy|деплой|база данных|database|framework|фреймворк|версия|version|endpoint|url|домен|domain)/i;
                if (markers.test(textToSend) && textToSend.length <= 400) {
                    const note = `• ${textToSend.trim()}`;
                    const existing = proj.memory || '';
                    if (!existing.includes(textToSend.trim())) {
                        const nextMemory = (existing ? existing + '\n' : '') + note;
                        updatedProjects = (prev.projects || []).map(p => p.id === proj.id ? { ...p, memory: nextMemory.slice(-8000) } : p);
                    }
                }
            }

            return {
                ...prev,
                chatSessions: newSessions,
                projects: updatedProjects,
                isGenerating: false,
                generatedDocuments: foundDocs.length > 0 ? [...foundDocs, ...(prev.generatedDocuments || [])] : prev.generatedDocuments
            };
        });
    };

    // ФУНКЦИЯ ГЕНЕРАЦИИ ИЗОБРАЖЕНИЙ (работает офлайн, без внешних API)
    const handleGenerateImage = async (promptOverride = null) => {
        if (!state.user) {
            updateState({ showAuthModal: true });
            return;
        }

        const prompt = typeof promptOverride === 'string' ? promptOverride : (state.inputValue || '');
        if (!prompt.trim() || state.isGenerating) return;

        // Референсные фото (Image-to-Image): прикреплённые в режиме
        // «Генерация изображений» через то же поле «+», что и обычные
        // вложения — используем то же state.selectedImages (задача 6).
        const referenceImages = state.selectedImages && state.selectedImages.length > 0 ? state.selectedImages : [];
        const newUserMessage = { role: 'user', content: prompt, image: referenceImages[0] || null, images: referenceImages };

        setState(prev => {
            const newSessions = prev.chatSessions.map(session => {
                if (session.id === prev.activeChatId) {
                    return {
                        ...session,
                        title: session.messages.length === 0 ? ('🎨 ' + makeChatTitle(prompt)) : session.title,
                        messages: [...session.messages, newUserMessage]
                    };
                }
                return session;
            });
            return { ...prev, chatSessions: newSessions, inputValue: '', selectedImages: [], isGenerating: true, isGeneratingImage: true, currentView: 'chat' };
        });

        // Реальная генерация через backend (OpenAI DALL-E 3). Раньше при ошибке
        // тихо подставлялась локальная арт-заглушка и показывалось generic
        // «сервис временно недоступен». Из-за этого пользователь никогда не
        // видел реальную причину (нет ключа / политика контента / rate-limit /
        // billing / таймаут) и не понимал, что делать. Теперь пробрасываем
        // текст ошибки от бэкенда как есть — там формулировки уже адаптированы
        // под пользователя (image.service выкидывает конкретные тексты).
        let imageUrl = null;
        let errorText = null;
        try {
            imageUrl = await generateBackendImage(prompt, referenceImages);
        } catch (e) {
            // ApiError наследует Error → e.message содержит текст с бэкенда
            // (см. image.service — там уже пользовательские формулировки).
            const msg = e?.message || '';
            errorText = msg && msg.length < 200 && msg !== 'Failed to fetch'
                ? `Не удалось сгенерировать изображение: ${msg}`
                : 'Не удалось сгенерировать изображение — сервис временно недоступен. Попробуй ещё раз через минуту.';
            // eslint-disable-next-line no-console
            console.warn('[Image generation] failed:', e);
        }

        setState(prev => {
            const newSessions = prev.chatSessions.map(session => {
                if (session.id === prev.activeChatId) {
                    const assistantMsg = imageUrl
                        ? { role: 'assistant', content: `Готово! Вот изображение по запросу: «${prompt}»`, generatedImage: imageUrl, imagePrompt: prompt, isAnimated: false }
                        : { role: 'assistant', content: errorText, isAnimated: false };
                    return { ...session, messages: [...session.messages, assistantMsg] };
                }
                return session;
            });
            return {
                ...prev,
                chatSessions: newSessions,
                isGenerating: false,
                isGeneratingImage: false,
                // В галерею добавляем только реально сгенерированные картинки.
                generatedImages: imageUrl
                    ? [{ id: Date.now() + Math.random(), prompt, url: imageUrl, timestamp: Date.now(), chatId: prev.activeChatId }, ...(prev.generatedImages || [])]
                    : (prev.generatedImages || [])
            };
        });
    };

    return (
        <div className="flex h-app-screen w-full bg-[#f8f9fc] dark:bg-darkBg relative overflow-hidden">
            {showSplash && <Splash dark={state.isDarkMode} onDone={() => setShowSplash(false)} />}
            {/* МОДАЛКА АВТОРИЗАЦИИ ПОВЕРХ ВСЕГО */}
            <AuthModal state={state} updateState={updateState} />

            <main className="flex-1 flex flex-col h-full w-full relative z-10 transition-transform">
                {state.currentView === 'home' && <HomeView state={state} updateState={updateState} handleSendMessage={handleSendMessage} handleGenerateImage={handleGenerateImage} chatFileInputRef={chatFileInputRef} />}
                {state.currentView === 'chat' && <ChatView state={state} updateState={updateState} handleSendMessage={handleSendMessage} handleGenerateImage={handleGenerateImage} messagesEndRef={messagesEndRef} chatFileInputRef={chatFileInputRef} />}
                {state.currentView === 'settings' && <SettingsView state={state} updateState={updateState} />}
                {state.currentView === 'pricing' && <PricingView state={state} updateState={updateState} />}
                {state.currentView === 'profile-edit' && <ProfileEditView state={state} updateState={updateState} />}
                {state.currentView === 'security' && <SecurityView state={state} updateState={updateState} />}
                {state.currentView === 'limits' && <LimitsView state={state} updateState={updateState} />}
                {state.currentView === 'projects' && <ProjectsView state={state} updateState={updateState} />}
                {state.currentView === 'skills' && <SkillsView state={state} updateState={updateState} />}
                {state.currentView === 'plugins' && <PluginsView state={state} updateState={updateState} />}
                {state.currentView === 'library' && <LibraryView state={state} updateState={updateState} />}
                {state.currentView === 'wallet' && <WalletView state={state} updateState={updateState} />}
                {state.currentView === 'guide' && <GuideView state={state} updateState={updateState} />}
                {/* Единая вкладка «Агенты»: Cockpit — главная страница, магазин — внутри */}
                {state.currentView === 'agent-store' && <AgentStoreApp state={state} updateState={updateState} />}
                {state.currentView === 'cockpit' && <AgentStoreApp state={state} updateState={updateState} />}
                {(state.currentView === 'orchestrator-chat' || state.currentView === 'agent-chat') && <CockpitView state={state} updateState={updateState} />}
                {state.currentView === 'orchestrator-chat' && <OrchestratorChatView state={state} updateState={updateState} />}
                {state.currentView === 'agent-chat' && <AgentChatView state={state} updateState={updateState} />}
            </main>
            
            <RightMenu state={state} updateState={updateState} />

            {/* Центр уведомлений (почта): открывается колокольчиком */}
            {state.showNotifications && (
                <NotificationCenter state={state} updateState={updateState} onClose={() => updateState({ showNotifications: false })} />
            )}
        </div>
    );
}
