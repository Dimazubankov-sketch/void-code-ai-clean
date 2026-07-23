import { useState, useEffect, useRef } from 'react';
import { RightMenu } from '@/app/RightMenu';
import { AgentBuilderView } from '@/features/agents/AgentBuilderView';
import { AgentStoreApp } from '@/features/agents/store/AgentStoreApp';
import { AgentChatBuilderView } from '@/features/agents/AgentChatBuilderView';
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
import { SettingsView } from '@/features/settings/SettingsView';
import { SystemPromptView } from '@/features/settings/SystemPromptView';
import { SiteBuilderView } from '@/features/sites/SiteBuilderView';
import { SiteChatBuilderView } from '@/features/sites/SiteChatBuilderView';
import { WalletView } from '@/features/wallet/WalletView';
import { callGeminiAI } from '@/shared/api/llm';
import { AI_MODELS, getPlanLimits } from '@/shared/config/models';
import { splitMessageContent } from '@/shared/lib/documents';
import { generateArtImage } from '@/shared/lib/imagegen';
import { goBack } from '@/shared/lib/navigation';
import { readSharedFromHash, clearShareHash } from '@/shared/lib/shareDialog';
import { loadPersistedState, savePersistedState } from '@/shared/lib/storage';
import { applyTheme } from '@/shared/lib/theme';
import { Splash } from '@/shared/ui/Splash';



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
            systemPromptState: '',
            authTab: 'login',
            imageGenMode: false,
            isGeneratingImage: false,
            generatedImages: [],
            generatedDocuments: [],
            aiAgents: [],
            activeAgentId: null,
            walletBalance: 0,
            walletTransactions: [],
            sites: [],
            activeSiteId: null,
            sitesCreatedCount: 0,
            sitesCreatedDate: null,
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
            sites: [],
            activeSiteId: null,
            sitesCreatedCount: 0,
            sitesCreatedDate: null,
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
            sites: saved.sites || [],
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
    const DAILY_LIMIT_RESET_MS = 8 * 60 * 60 * 1000;
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
        state.selectedModelId, state.systemPromptState, state.lang,
        state.generatedImages, state.generatedDocuments, state.aiAgents, state.activeAgentId, state.walletBalance, state.walletTransactions,
        state.sites, state.activeSiteId, state.sitesCreatedCount, state.sitesCreatedDate
    ]);

    // Каждый раз, когда меняется currentView (и вызывающий код сам не
    // передал viewHistory явно — так делает goBack при возврате),
    // запоминаем, откуда пришли. Это работает для ВСЕХ переходов по
    // всему приложению без необходимости трогать каждый вызов отдельно.
    const updateState = (updates) => setState(prev => {
        if (updates.currentView !== undefined && updates.currentView !== prev.currentView && !('viewHistory' in updates)) {
            const newHistory = [...(prev.viewHistory || []), prev.currentView].slice(-20);
            return { ...prev, ...updates, viewHistory: newHistory };
        }
        return { ...prev, ...updates };
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
        if ((!textToSend.trim() && !state.selectedImage) || state.isGenerating) return;
        
        const activeModel = AI_MODELS.find(m => m.id === state.selectedModelId) || AI_MODELS[1];
        const maxLimits = getPlanLimits(state.userPlan);
        
        // ПРОВЕРКА ЛИМИТОВ (дневной лимит остаётся основным ограничителем)
        if (state.usedDailyLimits + activeModel.cost > maxLimits.daily && activeModel.cost > 0) {
            alert('Вы исчерпали дневной лимит. Лимиты обновятся автоматически через 8 часов — можно отслеживать обратный отсчёт во вкладке «Лимиты», либо переключитесь на бесплатную модель Flash.');
            return;
        }
        
        const newUserMessage = { role: 'user', content: textToSend, image: state.selectedImage };
        
        let messagesForApi = [];

        // 1. Оптимистично добавляем запрос юзера
        setState(prev => {
            let currentMessages = [];
            const newSessions = prev.chatSessions.map(session => {
                if (session.id === prev.activeChatId) {
                    currentMessages = [...session.messages, newUserMessage];
                    return { 
                        ...session, 
                        title: session.messages.length === 0 ? textToSend.slice(0, 25) + '...' : session.title, 
                        messages: currentMessages 
                    };
                }
                return session;
            });
            
            messagesForApi = currentMessages; 

            const newUsedDaily = prev.usedDailyLimits + activeModel.cost;
            const justExceeded = maxLimits.daily !== Infinity && newUsedDaily >= maxLimits.daily && !prev.dailyLimitExceededAt;

            return {
                ...prev,
                chatSessions: newSessions,
                inputValue: '',
                selectedImage: null,
                isGenerating: true,
                currentView: 'chat',
                usedDailyLimits: newUsedDaily,
                usedWeeklyLimits: (prev.usedWeeklyLimits || 0) + activeModel.cost,
                dailyLimitExceededAt: justExceeded ? Date.now() : prev.dailyLimitExceededAt,
                selectedModelId: justExceeded ? 'flash' : prev.selectedModelId
            };
        });
        
        // 2. Отправляем запрос к ИИ
        let responseText = '';
        try {
            responseText = await callGeminiAI(messagesForApi, state.systemPromptState || activeModel.sysPrompt, state.selectedModelId);
        } catch (e) {
            responseText = "Произошла ошибка при получении ответа от ИИ.";
        }
        
        // 3. Добавляем ответ. Код из ответа не печатается в чат — он уходит
        // в отдельные карточки, которые открывают окно просмотра кода.
        setState(prev => {
            const { text: displayText, blocks: codeBlocks } = splitMessageContent(responseText);
            const finalText = displayText || (codeBlocks.length > 0 ? 'Готово! Я подготовил код — открой его в окне просмотра ниже, чтобы посмотреть исходник или результат.' : responseText);

            const newSessions = prev.chatSessions.map(session => {
                if (session.id === prev.activeChatId) {
                    return { ...session, messages: [...session.messages, { role: 'assistant', content: finalText, codeBlocks, isAnimated: true }] };
                }
                return session;
            });

            // Автоматически сохраняем блоки кода из ответа в "Библиотеку" → Документы
            const foundDocs = codeBlocks.filter(b => b.content.length >= 25).map(doc => ({
                id: Date.now() + Math.random(),
                ...doc,
                timestamp: Date.now(),
                chatId: prev.activeChatId
            }));

            return {
                ...prev,
                chatSessions: newSessions,
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

        const newUserMessage = { role: 'user', content: prompt };

        setState(prev => {
            const newSessions = prev.chatSessions.map(session => {
                if (session.id === prev.activeChatId) {
                    return {
                        ...session,
                        title: session.messages.length === 0 ? ('🎨 ' + prompt.slice(0, 22)) : session.title,
                        messages: [...session.messages, newUserMessage]
                    };
                }
                return session;
            });
            return { ...prev, chatSessions: newSessions, inputValue: '', isGenerating: true, isGeneratingImage: true, currentView: 'chat' };
        });

        // Небольшая пауза имитирует время генерации — под неё крутится анимация
        await new Promise(resolve => setTimeout(resolve, 1600 + Math.random() * 900));

        const imageUrl = generateArtImage(prompt);

        setState(prev => {
            const newSessions = prev.chatSessions.map(session => {
                if (session.id === prev.activeChatId) {
                    return { ...session, messages: [...session.messages, { role: 'assistant', content: `Готово! Вот изображение по запросу: «${prompt}»`, generatedImage: imageUrl, isAnimated: false }] };
                }
                return session;
            });
            return {
                ...prev,
                chatSessions: newSessions,
                isGenerating: false,
                isGeneratingImage: false,
                generatedImages: [{ id: Date.now() + Math.random(), prompt, url: imageUrl, timestamp: Date.now(), chatId: prev.activeChatId }, ...(prev.generatedImages || [])]
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
                {state.currentView === 'limits' && <LimitsView state={state} updateState={updateState} />}
                {state.currentView === 'sys-prompt' && <SystemPromptView state={state} updateState={updateState} />}
                {state.currentView === 'library' && <LibraryView state={state} updateState={updateState} />}
                {state.currentView === 'wallet' && <WalletView state={state} updateState={updateState} />}
                {state.currentView === 'guide' && <GuideView state={state} updateState={updateState} />}
                {state.currentView === 'agent-builder' && <AgentBuilderView state={state} updateState={updateState} />}
                {state.currentView === 'agent-store' && <AgentStoreApp state={state} updateState={updateState} />}
                {state.currentView === 'agent-chat-builder' && <AgentChatBuilderView state={state} updateState={updateState} />}
                {(state.currentView === 'cockpit' || state.currentView === 'orchestrator-chat' || state.currentView === 'agent-chat') && <CockpitView state={state} updateState={updateState} />}
                {state.currentView === 'orchestrator-chat' && <OrchestratorChatView state={state} updateState={updateState} />}
                {state.currentView === 'agent-chat' && <AgentChatView state={state} updateState={updateState} />}
                {state.currentView === 'site-builder' && <SiteBuilderView state={state} updateState={updateState} />}
                {state.currentView === 'site-chat-builder' && <SiteChatBuilderView state={state} updateState={updateState} />}
            </main>
            
            <RightMenu state={state} updateState={updateState} />

            {/* Центр уведомлений (почта): открывается колокольчиком */}
            {state.showNotifications && (
                <NotificationCenter state={state} updateState={updateState} onClose={() => updateState({ showNotifications: false })} />
            )}
        </div>
    );
}
