import { useEffect, useState } from 'react';
import { Icons } from '@/shared/ui/Icons';
import { copyToCb } from '@/shared/lib/clipboard';

// ==========================================
// RequisitesPage — публичная страница реквизитов (/requisites)
// ==========================================
// Полностью открытая страница: без авторизации, без зависимости от
// state приложения — подключается ДО монтирования <App /> (см. main.jsx),
// поэтому не тянет за собой ни загрузку сессии, ни сплэш, ни тему из
// localStorage. Светлая, спокойная, в духе Linear/Vercel: много воздуха,
// один аккуратный блок с данными, никаких лишних украшений.
//
// Клик по значению копирует его в буфер (иконка на секунду меняется на
// галочку) — мелкое, но уместное для страницы с реквизитами удобство.

const REQUISITES = [
    { label: 'ФИО', value: 'Зубанков Дмитрий Алексеевич' },
    { label: 'Статус', value: 'Самозанятый (плательщик НПД)' },
    { label: 'ИНН', value: '711811074307' },
    { label: 'Email', value: 'Dimazubankov@gmail.com', href: 'mailto:Dimazubankov@gmail.com' },
    { label: 'Телефон', value: '+7 (950) 901-14-21', href: 'tel:+79509011421' },
];

function RequisiteRow({ label, value, href, isLast }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        copyToCb(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    return (
        <div className={`flex items-center justify-between gap-4 py-5 px-6 sm:px-7 ${isLast ? '' : 'border-b border-gray-100'}`}>
            <span className="text-sm text-gray-400 shrink-0">{label}</span>
            <div className="flex items-center gap-2.5 min-w-0">
                {href ? (
                    <a href={href} className="text-[15px] sm:text-base font-semibold text-gray-900 hover:text-[#5b32d4] transition-colors truncate text-right">
                        {value}
                    </a>
                ) : (
                    <span className="text-[15px] sm:text-base font-semibold text-gray-900 truncate text-right">{value}</span>
                )}
                <button
                    onClick={handleCopy}
                    title="Скопировать"
                    className="shrink-0 p-1.5 -m-1.5 text-gray-300 hover:text-gray-500 transition-colors rounded-lg"
                >
                    {copied ? <Icons.Check className="w-4 h-4 text-green-500" /> : <Icons.Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

export function RequisitesPage() {
    useEffect(() => {
        document.title = 'Реквизиты — Void Code AI';
    }, []);

    return (
        <div className="min-h-screen bg-[#fafafa] flex flex-col">
            <div className="flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
                <div className="w-full max-w-lg">
                    <a href="/" className="flex items-center gap-2.5 justify-center mb-12 select-none">
                        <Icons.VoidLogo className="w-6 h-6" />
                        <span className="font-extrabold text-[15px] tracking-tight text-gray-900">
                            <span className="void-grad-text">VOID</span> CODE AI
                        </span>
                    </a>

                    <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-gray-900 tracking-tight mb-2">
                        Реквизиты
                    </h1>
                    <p className="text-center text-gray-400 text-sm mb-10">
                        Информация о лице, оказывающем услуги
                    </p>

                    <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.04)] overflow-hidden">
                        {REQUISITES.map((item, i) => (
                            <RequisiteRow key={item.label} {...item} isLast={i === REQUISITES.length - 1} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="py-8 text-center">
                <span className="text-xs text-gray-300">Void Code AI • 2026</span>
            </div>
        </div>
    );
}
