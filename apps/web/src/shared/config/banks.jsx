// ==========================================
// Банки/платёжные системы и валюты — зависят от языка интерфейса
// ==========================================
// Выбор языка во вкладке «Язык» определяет валюту оплаты и список
// релевантных банков/платёжных систем в «Тарифах» и «Кошельке».
//  • ru → рубли (RUB), российские банки и СБП;
//  • en → доллары (USD), международные сервисы (Stripe, PayPal, Wise…);
//  • zh → юани (CNY), китайские платёжные системы.
// Цены в конфиге тарифов заданы в рублях (базовая валюта) и пересчитываются
// по приблизительному курсу в валюту выбранного языка — это витринный
// пересчёт для отображения, а не биржевой курс.

// Российские банки (для СБП и карт)
const BANKS_RU = [
    { id: 'sber', name: 'Сбербанк', bg: '#21A038', text: 'white', initial: 'С' },
    { id: 'tbank', name: 'Т-Банк', bg: '#FFDD2D', text: 'black', initial: 'Т' },
    { id: 'alfa', name: 'Альфа-Банк', bg: '#EF3124', text: 'white', initial: 'А' },
    { id: 'vtb', name: 'ВТБ', bg: '#0A2896', text: 'white', initial: 'В' },
    { id: 'raif', name: 'Райффайзен', bg: '#FEE600', text: 'black', initial: 'Р' },
    { id: 'ozon', name: 'Ozon Банк', bg: '#005BFF', text: 'white', initial: 'О' },
];

// Международные платёжные сервисы
const BANKS_EN = [
    { id: 'stripe', name: 'Stripe', bg: '#635BFF', text: 'white', initial: 'S' },
    { id: 'paypal', name: 'PayPal', bg: '#003087', text: 'white', initial: 'P' },
    { id: 'wise', name: 'Wise', bg: '#9FE870', text: 'black', initial: 'W' },
    { id: 'revolut', name: 'Revolut', bg: '#0666EB', text: 'white', initial: 'R' },
    { id: 'visa', name: 'Visa', bg: '#1A1F71', text: 'white', initial: 'V' },
    { id: 'mastercard', name: 'Mastercard', bg: '#EB001B', text: 'white', initial: 'M' },
];

// Китайские платёжные системы
const BANKS_ZH = [
    { id: 'alipay', name: 'Alipay', bg: '#1677FF', text: 'white', initial: '支' },
    { id: 'wechat', name: 'WeChat Pay', bg: '#07C160', text: 'white', initial: '微' },
    { id: 'unionpay', name: 'UnionPay', bg: '#E21836', text: 'white', initial: '银' },
    { id: 'icbc', name: 'ICBC', bg: '#C7000B', text: 'white', initial: '工' },
];

const BANKS_BY_LANG = { ru: BANKS_RU, en: BANKS_EN, zh: BANKS_ZH };

// Валюта по языку: символ, код, позиция символа и курс к рублю (1 RUB = rate)
export const CURRENCY_BY_LANG = {
    ru: { code: 'RUB', symbol: '₽', symbolAfter: true, rate: 1 },
    en: { code: 'USD', symbol: '$', symbolAfter: false, rate: 0.011 },
    zh: { code: 'CNY', symbol: '¥', symbolAfter: false, rate: 0.078 },
};

export const getCurrency = (lang) => CURRENCY_BY_LANG[lang] || CURRENCY_BY_LANG.ru;
export const getBanks = (lang) => BANKS_BY_LANG[lang] || BANKS_RU;

// Совместимость со старым импортом: BANKS по умолчанию (русские).
export const BANKS = BANKS_RU;

// Пересчёт цены из рублей в валюту языка (витринный курс).
export const convertPrice = (priceRub, lang) => {
    const cur = getCurrency(lang);
    if (cur.rate === 1) return Math.round(priceRub);
    // Округляем до «красивого» значения: доллары/юани — до целого.
    return Math.max(0, Math.round(priceRub * cur.rate));
};

// Форматирование суммы с символом валюты в нужной позиции.
export const formatCurrency = (priceRub, lang) => {
    const cur = getCurrency(lang);
    const amount = convertPrice(priceRub, lang);
    const grouped = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return cur.symbolAfter ? `${grouped} ${cur.symbol}` : `${cur.symbol}${grouped}`;
};
