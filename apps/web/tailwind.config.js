/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./index.html', './src/**/*.{js,jsx}'],
    // hover:-классы применяются ТОЛЬКО на устройствах с настоящей мышью.
    // Без этого флага на тач-экранах hover срабатывает после тапа и
    // «залипает»: кнопка остаётся в наведённом состоянии, пока не тапнешь
    // в другое место. Одна строка вместо ручного @media на каждый hover.
    future: { hoverOnlyWhenSupported: true },
    theme: {
        extend: {
            colors: {
                darkBg: '#0f0f13',
                darkCard: '#1a1a24',
                darkBorder: '#2a2a35',
                brand: '#5b32d4',
            },
            // Утончённая шкала насыщенности шрифта: весь app использует классы
            // font-medium/semibold/bold/extrabold, но по умолчанию Tailwind
            // делает их слишком жирными для аккуратного, лёгкого интерфейса.
            // Здесь мы облегчаем их глобально — единой правкой, без замены
            // классов в каждом файле — сохраняя ту же визуальную иерархию.
            fontWeight: {
                medium: '450',
                semibold: '520',
                bold: '570',
                extrabold: '640',
            },
        },
    },
    plugins: [],
};
