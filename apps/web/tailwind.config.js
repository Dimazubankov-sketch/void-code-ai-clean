/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: {
                darkBg: '#0f0f13',
                darkCard: '#1a1a24',
                darkBorder: '#2a2a35',
                brand: '#5b32d4',
            },
        },
    },
    plugins: [],
};
