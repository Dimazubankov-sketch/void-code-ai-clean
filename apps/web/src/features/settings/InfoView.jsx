import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { goBack } from '@/shared/lib/navigation';
import { LanguagePicker, APP_LANGUAGES } from '@/features/settings/LanguagePicker';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// InfoView — раздел «Сведения» в настройках
// ==========================================
// Один полноэкранный вид (как «Гид»/«Лимиты») с сегментированным
// контролом наверху и четырьмя разделами: О проекте, Условия
// использования, Политика конфиденциальности, Справочный центр (FAQ).
// В отличие от GuideView (там scroll-spy — все разделы на одной длинной
// странице), здесь разделы РЕАЛЬНО переключаются — виден только один,
// а смена сопровождается лёгким GSAP crossfade (см. useGSAP ниже),
// плюс сброс скролла наверх, чтобы длинный текст предыдущего раздела не
// оставлял следующий «провалившимся» вниз.

const INFO_SECTIONS = [
    { id: 'about', title: 'О Void Code AI', icon: 'Sparkles' },
    { id: 'terms', title: 'Условия использования', icon: 'Receipt' },
    { id: 'privacy', title: 'Политика конфиденциальности', icon: 'Lock' },
    { id: 'faq', title: 'Справочный центр', icon: 'Help' },
];

export function InfoView({ state, updateState, onClose }) {
    const [section, setSection] = useState('about');
    const contentRef = useRef(null);
    const scrollRef = useRef(null);

    // Crossfade + лёгкий сдвиг при смене раздела — коротко и ненавязчиво,
    // как и просили («плавные, но без избыточности»). Уважаем
    // prefers-reduced-motion — тогда контент просто мгновенно меняется.
    useGSAP(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !contentRef.current) return;
        gsap.fromTo(contentRef.current, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' });
    }, { dependencies: [section] });

    const handleClose = () => { if (onClose) onClose(); else goBack(state, updateState, 'settings'); };

    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            {/* Фиксированная шапка — заголовок + сегментированный контрол */}
            <div className="shrink-0 bg-[#f8f9fc]/95 dark:bg-darkBg/95 backdrop-blur-md border-b border-gray-100 dark:border-darkBorder">
                <div className="max-w-3xl mx-auto px-4 pt-6 pb-3">
                    <div className="flex items-center gap-4 mb-4">
                        <button onClick={handleClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                        <h2 className="text-2xl md:text-3xl font-extrabold dark:text-white">Сведения</h2>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
                        {INFO_SECTIONS.map((s) => {
                            const IconComp = Icons[s.icon] || Icons.Info;
                            const on = section === s.id;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setSection(s.id)}
                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl whitespace-nowrap text-sm font-bold transition-colors flex-shrink-0 ${on ? 'bg-[#5b32d4] text-white shadow-sm' : 'bg-white dark:bg-darkCard text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                >
                                    <IconComp className="w-4 h-4" /> {s.title}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Прокручиваемый контент активного раздела */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                <div className="max-w-3xl mx-auto px-4 py-8">
                    <div ref={contentRef} className="bg-white dark:bg-darkCard rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100 dark:border-darkBorder">
                        {section === 'about' && <AboutSection />}
                        {section === 'terms' && <TermsSection />}
                        {section === 'privacy' && <PrivacySection />}
                        {section === 'faq' && <FaqSection onOpenSupport={() => updateState({ currentView: 'support-chat' })} />}
                    </div>

                    <InfoFooter state={state} updateState={updateState} />
                </div>
            </div>
        </div>
    );
}

// ==========================================
// Общие текстовые примитивы для разделов
// ==========================================
function H(props) { return <h3 className="text-lg font-extrabold dark:text-white mt-7 mb-3 first:mt-0" {...props} />; }
function P(props) { return <p className="text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 mb-4" {...props} />; }
function Li(props) { return <li className="text-[15px] leading-relaxed text-gray-600 dark:text-gray-300 mb-2 ml-5 list-disc" {...props} />; }

// ==========================================
// 1. О Void Code AI
// ==========================================
function AboutSection() {
    return (
        <div>
            <div className="flex items-center gap-3 mb-1">
                <Icons.VoidLogo className="w-8 h-8" />
                <span className="text-xl font-extrabold dark:text-white"><span className="void-grad-text">VOID</span> CODE AI</span>
            </div>
            <P>
                Void Code AI — единое рабочее пространство с ИИ: вместо десятка разрозненных
                вкладок и подписок — один продукт, где можно общаться с моделью, ставить задачи
                агентам, держать голосового ассистента под рукой и вести проекты, не теряя
                контекст между ними.
            </P>
            <H>Идея</H>
            <P>
                Мы считаем, что искусственный интеллект должен быть быстрым, понятным и
                встроенным в повседневную работу, а не отдельным «инструментом», о котором нужно
                вспоминать. Поэтому Void Code AI собран вокруг одного диалога и одной точки
                входа — остальное (модели, агенты, память проекта) работает на фоне и не требует
                лишних телодвижений.
            </P>
            <H>Возможности</H>
            <ul>
                <Li>Диалог с ИИ на нескольких моделях — от быстрых ответов до глубоких рассуждений</Li>
                <Li>Оркестрация агентов: делегирование задач, подчинённые агенты, расписание</Li>
                <Li>Голосовой ассистент — озвучка ответов и голосовой ввод</Li>
                <Li>Генерация и редактирование изображений, работа со ссылками и файлами</Li>
                <Li>Проекты с собственной памятью и настраиваемыми скиллами</Li>
                <Li>Магазин агентов и готовых сценариев под конкретные задачи</Li>
            </ul>
            <H>Философия</H>
            <P>
                Никакой перегрузки интерфейса ради количества функций. Каждая новая возможность
                добавляется только если она реально ускоряет работу, а не усложняет её. Русский
                язык — родной для продукта, а не перевод интерфейса «на скорую руку».
            </P>
        </div>
    );
}

// ==========================================
// 2. Условия использования (пользовательское соглашение)
// ==========================================
function TermsSection() {
    return (
        <div>
            <P className="text-gray-400 text-sm !mb-6">Публичная оферта. Действует с момента начала использования сервиса.</P>

            <H>1. Общие положения</H>
            <P>
                Настоящие Условия использования (далее — «Условия») регулируют порядок доступа
                к сервису Void Code AI (далее — «Сервис»), предоставляемому самозанятым
                Зубанковым Дмитрием Алексеевичем (далее — «Исполнитель»). Начиная использовать
                Сервис — регистрируя аккаунт или совершая любые действия в интерфейсе — пользователь
                (далее — «Пользователь») подтверждает, что ознакомился с Условиями и принимает их
                в полном объёме.
            </P>

            <H>2. Описание Сервиса</H>
            <P>
                Сервис предоставляет доступ к функциям на основе искусственного интеллекта:
                текстовому диалогу с моделями ИИ, агентам и их оркестрации, голосовому вводу и
                озвучке, генерации изображений и сопутствующим инструментам. Функциональность
                Сервиса может изменяться, дополняться или ограничиваться без предварительного
                уведомления, если это не ухудшает условия уже оплаченной подписки.
            </P>

            <H>3. Регистрация и аккаунт</H>
            <P>
                Для использования части функций Сервиса требуется регистрация. Пользователь
                обязуется указывать достоверные данные и несёт ответственность за сохранность
                своих учётных данных и за все действия, совершённые под его аккаунтом.
            </P>

            <H>4. Тарифы и оплата</H>
            <P>
                Часть функциональности доступна бесплатно, часть — по платной подписке одного из
                тарифов, указанных в разделе «Тарифы» внутри Сервиса. Оплата подписки означает
                согласие с выбранным тарифом и его стоимостью на момент оплаты. Возврат средств
                производится в случаях и порядке, предусмотренных законодательством РФ о защите
                прав потребителей.
            </P>

            <H>5. Обязанности Пользователя</H>
            <ul>
                <Li>Не использовать Сервис для незаконной деятельности, рассылки спама или вредоносного контента</Li>
                <Li>Не пытаться нарушить работу Сервиса, обходить лимиты или технические ограничения</Li>
                <Li>Не передавать доступ к своему аккаунту третьим лицам</Li>
                <Li>Самостоятельно оценивать корректность и применимость сгенерированного контента перед использованием</Li>
            </ul>

            <H>6. Интеллектуальная собственность</H>
            <P>
                Все права на Сервис, включая программный код, дизайн и товарный знак Void Code AI,
                принадлежат Исполнителю. Права на контент, сгенерированный Пользователем с помощью
                Сервиса, принадлежат Пользователю в объёме, разрешённом применимым
                законодательством и условиями использования сторонних моделей ИИ.
            </P>

            <H>7. Ограничение ответственности</H>
            <P>
                Сервис предоставляется «как есть». Ответы моделей ИИ могут содержать неточности —
                Исполнитель не гарантирует абсолютную точность, полноту или применимость
                сгенерированного контента и не несёт ответственности за решения, принятые на его
                основе. Исполнитель принимает разумные меры для бесперебойной работы Сервиса, но
                не гарантирует его работу без сбоев и прерываний.
            </P>

            <H>8. Изменение Условий</H>
            <P>
                Исполнитель вправе изменять настоящие Условия. Актуальная версия всегда доступна
                в этом разделе. Продолжение использования Сервиса после публикации изменений
                означает согласие с новой редакцией.
            </P>

            <H>9. Контакты</H>
            <P>
                По всем вопросам, связанным с настоящими Условиями, можно связаться по адресу,
                указанному в разделе «Реквизиты».
            </P>
        </div>
    );
}

// ==========================================
// 3. Политика конфиденциальности
// ==========================================
function PrivacySection() {
    return (
        <div>
            <P className="text-gray-400 text-sm !mb-6">Как мы собираем, используем и защищаем данные пользователей.</P>

            <H>1. Какие данные мы собираем</H>
            <ul>
                <Li>Регистрационные данные: email и пароль (в зашифрованном виде)</Li>
                <Li>Содержимое переписки с ИИ и агентами — для работы функций Сервиса и памяти проектов</Li>
                <Li>Технические данные: сведения об устройстве, браузере, примерном IP-регионе — для безопасности и диагностики</Li>
                <Li>Данные об оплате — обрабатываются платёжным провайдером, номер карты Сервису не передаётся и не хранится</Li>
            </ul>

            <H>2. Цели обработки данных</H>
            <P>
                Данные используются для предоставления и улучшения функций Сервиса, персонализации
                ответов ИИ, обеспечения безопасности аккаунта, технической поддержки и выполнения
                обязательств по оплаченной подписке. Данные не используются для целей, не связанных
                с работой Сервиса, без отдельного согласия Пользователя.
            </P>

            <H>3. Передача данных третьим лицам</H>
            <P>
                Для генерации ответов Сервис обращается к моделям искусственного интеллекта
                сторонних провайдеров — им передаётся только тот объём данных, который необходим
                для формирования ответа на конкретный запрос. Персональные данные не продаются и
                не передаются в маркетинговых целях третьим лицам.
            </P>

            <H>4. Хранение и защита данных</H>
            <P>
                Данные хранятся на серверах с ограниченным доступом, пароли — в хешированном виде,
                соединение с Сервисом защищено шифрованием (HTTPS). Доступ к данным имеют только
                лица, которым это необходимо для работы и поддержки Сервиса.
            </P>

            <H>5. Права Пользователя</H>
            <ul>
                <Li>Запросить копию своих данных</Li>
                <Li>Потребовать исправления неточных данных</Li>
                <Li>Запросить удаление аккаунта и связанных с ним данных</Li>
                <Li>Отозвать согласие на обработку данных, если она основана на согласии</Li>
            </ul>
            <P>
                Для реализации этих прав достаточно написать на email, указанный в разделе
                «Реквизиты».
            </P>

            <H>6. Файлы и локальное хранилище</H>
            <P>
                Сервис использует локальное хранилище браузера для сохранения настроек интерфейса
                и текущей сессии — это не сторонние рекламные cookie, а техническая необходимость
                для корректной работы Сервиса.
            </P>

            <H>7. Изменение политики</H>
            <P>
                Политика может обновляться по мере развития Сервиса. Актуальная версия всегда
                доступна в этом разделе.
            </P>
        </div>
    );
}

// ==========================================
// 4. Справочный центр (FAQ) — аккордеон
// ==========================================
const FAQ_ITEMS = [
    {
        q: 'Что такое Void Code AI?',
        a: 'Единая платформа для работы с искусственным интеллектом: диалог с моделями, агенты, голосовой ассистент, генерация изображений и проекты — в одном интерфейсе, на русском языке.',
    },
    {
        q: 'Нужно ли платить за использование?',
        a: 'Базовые функции доступны бесплатно с дневными и недельными лимитами. Платные тарифы снимают или расширяют эти лимиты и открывают дополнительные возможности — подробности в разделе «Тарифы».',
    },
    {
        q: 'Как работают агенты и оркестрация?',
        a: 'Агентам можно делегировать задачи так же, как коллеге: поставить цель, а дальше агент (или несколько подчинённых агентов под управлением оркестратора) выполняет её самостоятельно, отчитываясь о результате.',
    },
    {
        q: 'Мои переписки видит кто-то ещё?',
        a: 'Нет. Доступ к содержимому переписки есть только у вас и у систем, необходимых для формирования ответа (см. раздел «Политика конфиденциальности»).',
    },
    {
        q: 'Можно ли отменить подписку?',
        a: 'Да, отменить или сменить тариф можно в любой момент в Настройках → Подписка. Уже оплаченный период сохраняется до конца оплаченного срока.',
    },
    {
        q: 'Как связаться с поддержкой?',
        a: 'Быстрее всего — через ИИ-агента техподдержки прямо здесь (кнопка выше). Если вопрос сложный, агент попросит email и передаст его профильным специалистам.',
    },
];

function FaqSection({ onOpenSupport }) {
    const [openIdx, setOpenIdx] = useState(0);
    return (
        <div>
            {/* Вход в чат с ИИ-техподдержкой — круглая полупрозрачная кнопка
                с иконкой сообщения, как и просили. */}
            <div className="flex items-center justify-between gap-4 mb-5 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40">
                <div className="min-w-0">
                    <p className="font-bold text-sm dark:text-white">Не нашли ответ?</p>
                    <p className="text-xs text-gray-400">Напишите ИИ-агенту техподдержки — отвечает почти мгновенно</p>
                </div>
                <button
                    onClick={onOpenSupport}
                    title="Написать в техподдержку"
                    className="shrink-0 w-12 h-12 rounded-full bg-[#5b32d4]/10 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 flex items-center justify-center hover:bg-[#5b32d4]/20 dark:hover:bg-purple-900/30 transition-colors"
                >
                    <Icons.MessageSquare className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-2">
                {FAQ_ITEMS.map((item, i) => {
                    const open = openIdx === i;
                    return (
                        <div key={i} className="border border-gray-100 dark:border-darkBorder rounded-2xl overflow-hidden">
                            <button
                                onClick={() => setOpenIdx(open ? -1 : i)}
                                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                            >
                                <span className="font-bold text-[15px] dark:text-white">{item.q}</span>
                                <Icons.ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                            </button>
                            {open && (
                                <div className="px-4 pb-4 -mt-1 fade-in">
                                    <p className="text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">{item.a}</p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ==========================================
// Подвал «Сведений»
// ==========================================
// Сверху вниз, как в ТЗ: соцсети (чёрно-белые «стикеры») → копирайт →
// селектор языка (открывает тот же LanguagePicker, что и в Настройках) →
// юридические реквизиты самым мелким и полупрозрачным шрифтом внизу.
function InfoFooter({ state, updateState }) {
    const [showLang, setShowLang] = useState(false);
    const iconsRef = useRef(null);
    const lang = state.lang || 'ru';
    const langLabel = (APP_LANGUAGES.find((l) => l.id === lang) || APP_LANGUAGES[0]).native;

    // Лёгкий GSAP-«bounce» иконки соцсети при наведении/тапе — простая,
    // ненавязчивая обратная связь вместо голого CSS-hover.
    const bump = (e) => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.fromTo(e.currentTarget, { scale: 1 }, { scale: 1.12, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 });
    };

    return (
        <div className="mt-10 pt-8 border-t border-gray-100 dark:border-gray-800 flex flex-col items-center gap-5 pb-4">
            {/* Соцсети */}
            <div ref={iconsRef} className="flex items-center gap-3">
                <a
                    href="https://t.me/voidcodeoffical"
                    target="_blank" rel="noopener noreferrer" title="Telegram"
                    onMouseEnter={bump}
                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-colors"
                >
                    <Icons.Telegram className="w-5 h-5" />
                </a>
                <a
                    href="https://www.tiktok.com/@voidcode.ru?_r=1&_d=eld46g800c81be&sec_uid=MS4wLjABAAAAL_zwYuCWtLz3ACZmiVrzg919Gubj2cfYFLOstS9ZoT2y5edGxbJhPxGF7oVQWGYP&share_author_id=7658971784893744142&sharer_language=ru&source=h5_m&u_code=f4b6l75fdb96g7&item_author_type=1&utm_source=copy&tt_from=copy&enable_checksum=1&utm_medium=ios&share_link_id=894FDF04-A75A-4274-8DE0-78D28D5D1648&user_id=7658971784893744142&sec_user_id=MS4wLjABAAAAL_zwYuCWtLz3ACZmiVrzg919Gubj2cfYFLOstS9ZoT2y5edGxbJhPxGF7oVQWGYP&social_share_type=4&ug_btm=b8727,b0&utm_campaign=client_share&share_app_id=1233"
                    target="_blank" rel="noopener noreferrer" title="TikTok"
                    onMouseEnter={bump}
                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-colors"
                >
                    <Icons.TikTok className="w-5 h-5" />
                </a>
            </div>

            {/* Копирайт */}
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">Void code © 2026</p>

            {/* Язык — текущий, кликабельный */}
            <button
                onClick={() => setShowLang(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
                <Icons.Globe className="w-3.5 h-3.5" /> {langLabel}
            </button>

            {/* Реквизиты — самым мелким и полупрозрачным шрифтом, но физически
                присутствуют на странице; ссылка на полную карточку /requisites */}
            <a
                href="/requisites"
                target="_blank" rel="noopener noreferrer"
                className="text-xs opacity-50 hover:opacity-80 text-gray-500 dark:text-gray-400 transition-opacity text-center px-6 leading-relaxed"
            >
                Зубанков Дмитрий Алексеевич · Самозанятый (плательщик НПД) · ИНН 711811074307
            </a>

            {showLang && <LanguagePicker state={state} updateState={updateState} onClose={() => setShowLang(false)} />}
        </div>
    );
}
