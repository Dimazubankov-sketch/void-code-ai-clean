import { App } from '@/app/App';


// ==========================================
// НАВИГАЦИЯ "НАЗАД" С ПАМЯТЬЮ ЭКРАНОВ
// ==========================================
// App.updateState автоматически ведёт стек посещённых экранов (см. App).
// goBack достаёт из этого стека предыдущий экран — так что, например,
// выйдя из "Кошелька", пользователь возвращается туда, откуда зашёл
// (чат, конструктор агентов, главная — куда угодно), а не всегда на Главную.
// Хаб удалён — общий fallback теперь чат (стартовый экран приложения).
// Дополнительная страховка есть в App.updateState: любой currentView
// 'home', пришедший из старого кода, там нормализуется в 'chat'.
export const goBack = (state, updateState, fallback = 'chat') => {
    // Почта — не экран (currentView), а оверлей поверх любого экрана.
    // Поэтому одного восстановления currentView мало: если пользователь
    // ушёл на «Личную информацию» / «Безопасность» / «Тарифы» именно из
    // почты, надо ещё и вернуть саму почту с открытой панелью аккаунтов,
    // иначе он оказывается на голом Хабе (см. returnToMailAccounts).
    const mailReturn = state.returnToMailAccounts
        ? { showNotifications: true, reopenMailAccounts: true, returnToMailAccounts: false }
        : {};
    const hist = state.viewHistory || [];
    if (hist.length > 0) {
        const target = hist[hist.length - 1];
        updateState({ currentView: target, viewHistory: hist.slice(0, -1), ...mailReturn });
    } else {
        updateState({ currentView: fallback, ...mailReturn });
    }
};
