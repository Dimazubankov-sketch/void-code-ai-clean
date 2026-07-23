import { App } from '@/app/App';


// ==========================================
// НАВИГАЦИЯ "НАЗАД" С ПАМЯТЬЮ ЭКРАНОВ
// ==========================================
// App.updateState автоматически ведёт стек посещённых экранов (см. App).
// goBack достаёт из этого стека предыдущий экран — так что, например,
// выйдя из "Кошелька", пользователь возвращается туда, откуда зашёл
// (чат, конструктор агентов, главная — куда угодно), а не всегда на Главную.
export const goBack = (state, updateState, fallback = 'home') => {
    const hist = state.viewHistory || [];
    if (hist.length > 0) {
        const target = hist[hist.length - 1];
        updateState({ currentView: target, viewHistory: hist.slice(0, -1) });
    } else {
        updateState({ currentView: fallback });
    }
};
