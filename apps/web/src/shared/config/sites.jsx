
// ==========================================
// КОНСТРУКТОР САЙТОВ — типы блоков и тарификация
// ==========================================
// Типы блоков, из которых пользователь собирает макет. Поле w — это
// ВНУТРЕННИЙ вес сложности блока (используется только для расчёта счёта
// и НЕ показывается пользователю).
export const SITE_BLOCK_TYPES = [
    { id: 'hero',     label: 'Обложка (Hero)',     icon: 'Image',           w: 3, hint: 'Первый экран: крупный заголовок, подзаголовок и кнопка' },
    { id: 'about',    label: 'О нас / Текст',      icon: 'MessageSquare',   w: 1, hint: 'Текстовый блок с описанием' },
    { id: 'services', label: 'Услуги / Карточки',  icon: 'LayoutDashboard', w: 2, hint: 'Сетка карточек: услуги, преимущества, шаги' },
    { id: 'gallery',  label: 'Галерея / Портфолио',icon: 'Image',           w: 2, hint: 'Ряд или сетка изображений' },
    { id: 'pricing',  label: 'Тарифы / Цены',      icon: 'Star',            w: 3, hint: 'Ценовые планы, прайс-лист' },
    { id: 'reviews',  label: 'Отзывы',             icon: 'Star',            w: 2, hint: 'Карусель или сетка отзывов клиентов' },
    { id: 'faq',      label: 'FAQ / Вопросы',      icon: 'Info',            w: 2, hint: 'Раскрывающийся список вопросов и ответов' },
    { id: 'form',     label: 'Форма / Контакты',   icon: 'Mail',            w: 3, hint: 'Форма заявки, контакты, карта' },
    { id: 'cta',      label: 'Призыв к действию',  icon: 'Send',            w: 1, hint: 'Короткий блок с яркой кнопкой' },
    { id: 'footer',   label: 'Футер',              icon: 'LayoutDashboard', w: 1, hint: 'Нижний блок: ссылки, соцсети, копирайт' },
    { id: 'custom',   label: 'Свой блок',          icon: 'Code',            w: 2, hint: 'Опишите произвольный блок своими словами' },
];

export const getSiteBlockType = (id) => SITE_BLOCK_TYPES.find(t => t.id === id) || SITE_BLOCK_TYPES[0];


// Дневной лимит на создание сайтов по тарифам.
export const SITE_LIMITS = { free: 1, plus: 3, pro: 5, pro_plus: 10 };

export const SITE_LIMIT_LABEL = { free: '1', plus: '3', pro: '5', pro_plus: '8–10' };

export const PLAN_LABEL = { free: 'Free', plus: 'Plus', pro: 'Pro', pro_plus: 'Ultra' };

export const getSiteLimit = (plan) => SITE_LIMITS[plan] ?? SITE_LIMITS.free;

// Конструктор сайтов доступен всем пользователям; дневной лимит на
// создание сайтов при этом всё ещё зависит от тарифа (см. SITE_LIMITS).
export const canUseSiteBuilder = (plan) => true;


export const SITE_BASE_PRICE = 1500;

// Итоговый счёт зависит от сложности макета и внесённых правок.
// (Внутренняя логика расчёта пользователю не показывается.)
export const computeSiteComplexity = (site) => {
    const blocks = [...(site.layoutDesktop || []), ...(site.layoutMobile || [])];
    let c = 0;
    blocks.forEach(b => {
        c += getSiteBlockType(b.type).w;
        if ((b.desc || '').trim().length > 60) c += 1;
    });
    return c;
};

export const computeSitePrice = (site) => {
    const c = computeSiteComplexity(site);
    const edits = site.editApplied || 0;
    const editSurcharge = edits * Math.max(300, Math.round(c * 45));
    return SITE_BASE_PRICE + c * 350 + editSurcharge;
};

// Правка уже оплаченного сайта стоит дешевле создания, но каждая
// внесённая в сессии правка добавляет к счёту — сумма зависит от
// сложности макета (объёма работы), а не фиксирована.
export const computeSiteEditFee = (site) => {
    const c = computeSiteComplexity(site);
    const base = Math.max(500, Math.round(c * 160));
    const sessionEdits = site.paidEditsApplied || 0;
    const perEditSurcharge = sessionEdits * Math.max(150, Math.round(c * 60));
    return base + perEditSurcharge;
};
