import { useState, useEffect, useRef } from 'react';
import { BLOCK_COLORS } from '@/shared/config/agents';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОШЕЛЁК — основной экран
// ==========================================
// ==========================================
// ПОДСКАЗКИ — гид по всем возможностям приложения
// ==========================================
export const GUIDE_SECTIONS = [
    {
        id: 'chat', icon: 'MessageSquare', color: 'purple', title: 'Умный чат',
        desc: 'Диалог с AI на любые темы — от вопросов до помощи с текстом и кодом.',
        items: [
            'Открывается с главного экрана (карточка «Умный чат») или кнопкой «Создать новый чат» в боковом меню',
            'Общайтесь с AI на любые темы: задавайте вопросы, просите помощь с текстом, кодом, идеями или переводом',
            'Модель выбирается вверху экрана чата: Void Mini — быстрая и полностью безлимитная; Void Plus и Void Pro — для сложных задач (расходуют дневной лимит запросов)',
            'В рамках одного чата AI помнит предыдущие сообщения — можно ссылаться на сказанное ранее',
            'К сообщению можно приложить изображение через кнопку «+» слева от поля ввода',
            'Отправка — клавишей Enter (перенос строки — Shift+Enter) или кнопкой со стрелкой',
            'История чатов хранится в боковом меню: создавайте несколько диалогов, переключайтесь между ними и удаляйте ненужные'
        ]
    },
    {
        id: 'code', icon: 'Code', color: 'blue', title: 'Работа с кодом',
        desc: 'Генерация и отладка кода с удобным окном просмотра и живым предпросмотром.',
        items: [
            'Выберите модель Void Code Pro — она заточена именно под код, либо откройте карточку «Генератор кода» на главном экране',
            'Готовый код не засоряет переписку: под ответом появляется карточка, которая открывает отдельное окно просмотра',
            'В окне просмотра две вкладки: «Код» (с подсветкой) и «Результат» (живой предпросмотр HTML/CSS/JS)',
            'Код можно скопировать одной кнопкой, чтобы перенести в свой проект',
            'Все сгенерированные фрагменты кода автоматически сохраняются в Библиотеку как отдельные документы',
            'Просто опишите задачу словами — модель предложит решение и объяснит его'
        ]
    },
    {
        id: 'images', icon: 'Image', color: 'pink', title: 'Генерация изображений',
        desc: 'Опишите идею словами — получите изображение с анимацией генерации.',
        items: [
            'Запускается карточкой «Создать изображение» на главном экране, пунктом в боковом меню или переключением поля ввода в режим «Изображение»',
            'Опишите словами, что хотите увидеть — чем подробнее описание, тем точнее результат',
            'Пока картинка создаётся, показывается аккуратная анимация генерации',
            'Готовое изображение можно скачать кнопкой загрузки прямо из чата',
            'Все изображения автоматически сохраняются в Библиотеку и доступны для повторного скачивания'
        ]
    },
    {
        id: 'library', icon: 'Library', color: 'emerald', title: 'Библиотека',
        desc: 'Единое хранилище всех созданных изображений и фрагментов кода.',
        items: [
            'Все созданные изображения и фрагменты кода хранятся в одном месте и не теряются',
            'Материалы разложены по отдельным вкладкам — «Изображения» и «Документы», чтобы не путаться',
            'Любой элемент можно открыть, скопировать (код) или скачать (изображение)',
            'Открывается из бокового меню — кнопка с двумя полосками в правом верхнем углу, затем пункт «Библиотека»'
        ]
    },
    {
        id: 'projects', icon: 'Folder', color: 'purple', title: 'Проекты',
        desc: 'Объединяйте чаты в проекты с единым общим контекстом для ИИ.',
        items: [
            'Открываются из бокового меню — кнопка «Проекты»',
            'Сверху — поиск проектов по названию, снизу — кнопка «+» для создания нового проекта с названием',
            'Внутри проекта можно создать новый чат или добавить существующие чаты из истории',
            'Главное: все чаты проекта имеют ЕДИНЫЙ контекст — ИИ помнит историю всех чатов проекта и учитывает её при ответе в любом из них',
            'Чат можно убрать из проекта крестиком — он останется в общей истории, но выйдет из общего контекста'
        ]
    },
    {
        id: 'plugins', icon: 'Plug', color: 'teal', title: 'Коннекторы',
        desc: 'Внешние инструменты, в которых агенты действуют от вашего лица.',
        items: [
            'Открываются из бокового меню — кнопка «Коннекторы»',
            'В списке — внешние приложения (Gmail, Google Sheets, Telegram и др.); справа у каждого кнопка «+»',
            'По нажатию открывается окно с политикой безопасности и конфиденциальности и кнопкой «Перейти к [название]»',
            'Подключение выполняется по безопасному протоколу OAuth: пароль не передаётся, а доступ можно отозвать в любой момент',
            'После подключения агенты смогут выполнять действия в приложении от вашего лица по вашему запросу'
        ]
    },
    {
        id: 'agents', icon: 'Robot', color: 'indigo', title: 'Агенты',
        desc: 'Единая вкладка: Cockpit (управление), магазин агентов и биллинг в одном месте.',
        items: [
            'Откройте карточку «Агенты» на главном экране — главная страница вкладки это Cockpit, панель управления вашими агентами',
            'Навигация внизу (на телефоне) или слева (на ПК): «Мои агенты» (Cockpit), «Магазин агентов» и «Биллинг»',
            'Сверху — поле поиска: оно фильтрует и ваших агентов в Cockpit, и товары в магазине',
            'В магазине строго два вида: Оркестраторы (премиум, раздают задачи) и Агенты (универсальные исполнители) — узких «профессий» больше нет',
            'Клик по карточке открывает выезжающую панель с описанием, преимуществами и кнопкой покупки — без перезагрузок',
            'Конкретные задачи агенту включаются уже в Cockpit пресетами, а внешние сервисы подключаются через раздел «Коннекторы» в боковом меню',
            'При покупке агент получает уникальное имя (Агент 1, 2, 3…); переименовать можно в Cockpit, но одинаковые имена запрещены, чтобы оркестратор не путался',
            'Покупка списывает средства с баланса кошелька; если денег не хватает, окно покупки подсветится красным с сообщением'
        ]
    },
    {
        id: 'cockpit', icon: 'Robot', color: 'purple', title: 'Cockpit: управление агентами',
        desc: 'Лёгкий пульт управления купленными агентами и оркестраторами.',
        items: [
            'Cockpit — главная страница вкладки «Агенты» на главном экране; здесь вы даёте агентам задачи',
            'Вверху — счётчик «Всего агентов»; интерфейс воздушный и чистый, без лишних плашек',
            'Каждый агент показывает цветной кружок статуса и понятную подпись задачи («Сортирует почту» и т.п.)',
            'Клик по карточке агента раскрывает управление: включение пресетов-действий тумблерами (можно несколько сразу), смена цвета агента и переименование',
            'Чат с агентом — отдельная иконка справа от имени; в чате есть поле ввода и кнопка голосового ввода',
            'Подключённый при покупке сервис (почта/мессенджер) показан в карточке с пометкой безопасного OAuth-доступа',
            'Оркестратор всегда сверху списка, выделен фирменным градиентом — это главный «мозг»',
            'Кнопка «Привязка» у оркестратора открывает меню, где галочками выбираются подчинённые агенты',
            'Поставьте оркестратору задачу словами — он разложит её на подзадачи по шаблону «Агент: задача» и предложит план',
            'Протокол доверия: оркестратор раздаёт задачи только после вашего подтверждения кнопкой «Разрешить»',
            'Лимит оркестраторов зависит от тарифа: Free — недоступны, Plus — ровно один (максимум 1 покупка), Pro — до 3, Ultra — до 5 (см. вкладку «Тарифы»)'
        ]
    },
    {
        id: 'inbox', icon: 'Bell', color: 'blue', title: 'Уведомления и почта',
        desc: 'Центр уведомлений с отчётами оркестраторов и почтой в стиле Gmail.',
        items: [
            'Открывается колокольчиком в правом верхнем углу главного экрана и в чате оркестратора; красная точка означает, что есть отчёт, ждущий вашего решения',
            'Три вкладки: «Обновления» (новости и новые функции системы), «Оповещения агентов» (отчёты оркестраторов) и «Личная почта» (письма от внешних компаний и пользователей)',
            'Во вкладке «Оповещения агентов» выберите оркестратора из списка — внутри чат с его отчётами о проделанной работе',
            'Прямо в отчёте доступны кнопки протокола доверия: «Разрешить», «Отредактировать», «Отказаться» — то же подтверждение, что и в чате',
            'Звук уведомлений включается и выключается отдельно для каждого оркестратора — иконка динамика рядом с его именем в списке'
        ]
    },
    {
        id: 'wallet', icon: 'Wallet', color: 'green', title: 'Кошелёк и оплата',
        desc: 'Баланс для сборки агентов и оплаты токенов за их работу.',
        items: [
            'Пополнить баланс можно банковской картой (в том числе сканером через камеру), через СБП или криптовалютой',
            'С баланса оплачивается разовая сборка агентов и токены за их дальнейшую работу',
            'Перед каждым списанием за токены вы видите подтверждение суммы — ничего не спишется незаметно',
            'История всех пополнений и списаний видна в разделе «Кошелёк»',
            'При нехватке средств активные агенты автоматически приостанавливаются до пополнения баланса'
        ]
    },
    {
        id: 'plans', icon: 'Star', color: 'amber', title: 'Тарифы и лимиты',
        desc: 'Free, Plus, Pro и Ultra — разный объём запросов к мощным моделям.',
        items: [
            'Free, Plus, Pro и Ultra — чем выше тариф, тем больше дневных и недельных запросов к мощным моделям',
            'Оркестраторы: на Plus можно купить ровно одного (максимум 1 покупка), на Pro — до 3, на Ultra — до 5',
            'Модель Flash всегда бесплатна и безлимитна, независимо от тарифа',
            'При исчерпании дневного лимита остаётся доступна модель Flash, а лимиты автоматически восстанавливаются через 8 часов',
            'Оплатить подписку можно картой, СБП, криптовалютой или прямо с баланса кошелька',
            'Текущие лимиты и время их обновления показаны во вкладке «Лимиты» в настройках'
        ]
    },
    {
        id: 'settings', icon: 'Settings', color: 'gray', title: 'Настройки и профиль',
        desc: 'Личные данные, подписка, кошелёк и оформление в одном разделе.',
        items: [
            'Личные данные, подписка, кошелёк и лимиты собраны в одном разделе настроек',
            'Там же — переключатель тёмной темы, уведомления и другие параметры аккаунта',
            'Профиль можно отредактировать в отдельном окне «Редактировать профиль»',
            'Вход сохраняется между сессиями — после обновления страницы заходить заново не нужно'
        ]
    }
];


// Цвета точек-маркеров в списках гида — соответствуют цветам иконок разделов
export const GUIDE_DOT_COLORS = {
    purple: 'bg-[#5b32d4] dark:bg-purple-400',
    blue: 'bg-blue-600 dark:bg-blue-400',
    pink: 'bg-pink-600 dark:bg-pink-400',
    emerald: 'bg-emerald-600 dark:bg-emerald-400',
    indigo: 'bg-indigo-600 dark:bg-indigo-400',
    green: 'bg-green-600 dark:bg-green-400',
    teal: 'bg-teal-600 dark:bg-teal-400',
    amber: 'bg-amber-600 dark:bg-amber-400',
    gray: 'bg-gray-500 dark:bg-gray-400'
};


export function GuideView({ state, updateState }) {
    const scrollRef = useRef(null);
    const [active, setActive] = useState(GUIDE_SECTIONS[0].id);

    // Подсветка активного раздела при прокрутке (по центру области просмотра).
    useEffect(() => {
        const root = scrollRef.current;
        if (!root || typeof IntersectionObserver === 'undefined') return;
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting && e.target.dataset.secid) setActive(e.target.dataset.secid); });
        }, { root, rootMargin: '-45% 0px -50% 0px', threshold: 0 });
        GUIDE_SECTIONS.forEach(s => {
            const el = document.getElementById('guide-sec-' + s.id);
            if (el) obs.observe(el);
        });
        return () => obs.disconnect();
    }, []);

    const goToSection = (id) => {
        setActive(id);
        const el = document.getElementById('guide-sec-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            {/* Фиксированная шапка — всегда на месте, стрелка «назад» под рукой */}
            <div className="shrink-0 bg-[#f8f9fc]/95 dark:bg-darkBg/95 backdrop-blur-md border-b border-gray-100 dark:border-darkBorder">
                <div className="max-w-5xl mx-auto px-4 pt-6 pb-3">
                    <div className="flex items-center gap-4">
                        <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                        <h2 className="text-2xl md:text-3xl font-extrabold dark:text-white">Гид по возможностям</h2>
                    </div>

                    {/* Мобильная навигация — фиксированные чипы под шапкой */}
                    <div className="lg:hidden mt-3">
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                            {GUIDE_SECTIONS.map(section => {
                                const IconComp = Icons[section.icon] || Icons.Info;
                                const on = active === section.id;
                                return (
                                    <button key={section.id} onClick={() => goToSection(section.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl whitespace-nowrap text-sm font-bold transition-colors flex-shrink-0 ${on ? 'bg-[#5b32d4] text-white shadow-sm' : 'bg-white dark:bg-darkCard text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-darkBorder'}`}>
                                        <IconComp className="w-4 h-4" /> {section.title}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Прокручиваемая область: слева фиксированная навигация (десктоп),
                справа — спокойно листающийся контент разделов */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                <div className="max-w-5xl mx-auto px-4 py-6">
                    <p className="text-gray-500 dark:text-gray-400 mb-6 ml-1">Всё, что умеет Void Code AI, и как этим пользоваться. Выберите раздел в навигации слева.</p>
                    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8 lg:items-start">
                        {/* Десктопная навигация — липкий список слева */}
                        <nav className="hidden lg:block sticky top-0 self-start space-y-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-2">Разделы</p>
                            {GUIDE_SECTIONS.map(section => {
                                const IconComp = Icons[section.icon] || Icons.Info;
                                const on = active === section.id;
                                return (
                                    <button key={section.id} onClick={() => goToSection(section.id)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${on ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                                        <IconComp className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{section.title}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Контент разделов */}
                        <div className="space-y-4 min-w-0">
                            {GUIDE_SECTIONS.map((section) => {
                                const c = BLOCK_COLORS[section.color] || BLOCK_COLORS.gray;
                                const IconComp = Icons[section.icon] || Icons.Info;
                                return (
                                    <div key={section.id} id={'guide-sec-' + section.id} data-secid={section.id} style={{ scrollMarginTop: '16px' }} className="bg-white dark:bg-darkCard rounded-[1.75rem] border border-gray-100 dark:border-darkBorder shadow-sm p-5 sm:p-6">
                                        <div className="flex items-start gap-3 mb-4">
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg} ${c.text}`}><IconComp className="w-5 h-5" /></div>
                                            <div className="min-w-0">
                                                <h3 className="font-extrabold text-lg dark:text-white">{section.title}</h3>
                                                {section.desc && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{section.desc}</p>}
                                            </div>
                                        </div>
                                        <ul className="space-y-2.5">
                                            {section.items.map((item, j) => (
                                                <li key={j} className="flex gap-2.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${GUIDE_DOT_COLORS[section.color] || GUIDE_DOT_COLORS.gray}`}></span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}

                            <div className="mt-8 mb-8 p-5 sm:p-6 bg-[#1a0b38] rounded-[1.75rem] text-white flex items-center gap-4">
                                <Icons.VoidLogo className="w-10 h-10 flex-shrink-0" />
                                <p className="text-sm text-purple-100 leading-relaxed">Void Code AI постоянно развивается — новые возможности и интеграции будут появляться прямо здесь.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
