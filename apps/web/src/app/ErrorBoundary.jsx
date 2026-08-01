import React from 'react';


// ==========================================
// ERROR BOUNDARY — защита от белого экрана
// ==========================================
// Если где-то в дереве компонентов случится ошибка рендера (например,
// обращение к несуществующей иконке или полю), вместо мгновенного
// белого экрана пользователь увидит понятное сообщение с кнопкой
// перезагрузки, а сессия при этом не потеряется (она уже в localStorage).
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('Void Code AI: ошибка рендера', error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-app-screen w-full items-center justify-center bg-[#f8f9fc] dark:bg-darkBg px-6">
                    <div className="max-w-md w-full text-center bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-[2rem] p-8 shadow-xl">
                        <h2 className="text-xl font-extrabold mb-2 dark:text-white">Что-то пошло не так</h2>
                        <p className="text-sm text-gray-500 mb-6">Произошла непредвиденная ошибка интерфейса. Ваши данные и вход в аккаунт сохранены — просто перезагрузите страницу.</p>
                        <button onClick={() => window.location.reload()} className="w-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-3.5 rounded-2xl shadow-lg transition-colors">
                            Перезагрузить страницу
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
