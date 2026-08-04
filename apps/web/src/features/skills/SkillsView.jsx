import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { goBack } from '@/shared/lib/navigation';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { SkillCard } from '@/features/skills/SkillCard';

// ==========================================
// СКИЛЛЫ — синтаксические инструкции/промты для Void Code AI
// ==========================================
// Скилл — это преднастроенная инструкция, улучшающая качество ответов
// (код, анимации, архитектура и т.д.). Две вкладки:
//  • «Базовые скиллы» — встроенные (SKILLS ниже);
//  • «Свои скиллы» — кастомные, которые пользователь добавляет вручную
//    (текстом) или импортом из GitHub-репозитория.
// Активные скиллы (id базовых + кастомные объекты) учитываются при ответах.

// Базовые скиллы. Каждый instruction — конкретный оперативный чек-лист,
// который модель применяет ПРИ АКТИВНОМ скилле. Раньше здесь были короткие
// «маркетинговые» строки в 1 предложение — модель их часто игнорировала,
// потому что они не давали ей конкретных шагов. Теперь каждый скилл — это
// набор явных требований (что делать, как проверять, чего избегать), близкий
// по стилю к системным промптам моделей. Модель без активного скилла
// продолжает работать по общим правилам; активация скилла ДОБАВЛЯЕТ этот
// текст к системному промпту (см. buildSkillsInstruction ниже).
export const SKILLS = [
    {
        id: 'coding',
        icon: 'Code',
        name: 'Кодинг',
        desc: 'Чистый код уровня Pro: паттерны, читаемость, тесты',
        instruction: 'Скилл «Кодинг» активен. Работай как senior-разработчик: (1) пиши код с говорящими именами (никаких x, tmp, data — используй invoiceLines, activeUserId), (2) обрабатывай ошибки явно (try/catch, guard clauses, ранние возвраты вместо глубокой вложенности), (3) избегай магических чисел и строк — выноси в константы с UPPER_SNAKE_CASE, (4) добавляй краткие комментарии ТОЛЬКО там где неочевидно ПОЧЕМУ (а не ЧТО делает код), (5) следуй принципам SOLID и DRY — одна функция = одна ответственность, не более 40-50 строк, (6) для публичных API/утилит предлагай 2-3 модульных теста (Vitest/Jest/pytest). НЕ используй устаревшие подходы (var в JS, callbacks вместо async/await, class components в React без причины). Если пользователь просит «просто рабочий код» — сначала спроси, критична ли ему производительность или читаемость.',
        details: {
            bullets: [
            "Пишет код с говорящими именами (invoiceLines вместо x)",
            "Обрабатывает ошибки через try/catch и guard-clauses",
            "Следует SOLID и DRY — одна функция = одна ответственность",
            "Выносит магические числа в UPPER_SNAKE_CASE-константы",
            "Предлагает 2-3 модульных теста для публичных API",
            "Отказывается от var, callback'ов, class components без причины"
            ],
            libs: [
            "Vitest / Jest / pytest — для тестов",
            "ESLint + Prettier — для стиля",
            "TypeScript — для типов"
            ],
        }
    },
    {
        id: 'animations',
        icon: 'Sparkles',
        name: 'Анимации',
        desc: 'Плавные GSAP-анимации по лучшим практикам индустрии',
        instruction: 'Скилл «Анимации» активен. По умолчанию используй GSAP (не Framer Motion, не CSS-only), потому что GSAP — стандарт индустрии для сложных таймлайнов. Обязательные правила: (1) в React используй хук useGSAP из @gsap/react — он автоматически чистит анимации при размонтировании и предотвращает утечки памяти; (2) анимируй ТОЛЬКО transform (x, y, scale, rotation) и opacity — они идут на GPU и держат 60fps; НИКОГДА не анимируй width/height/top/left/margin — это layout-thrash; (3) для длинных цепочек используй gsap.timeline() с defaults и position parameter (\"<\", \"+=0.2\"), а не chain из delay; (4) уважай prefers-reduced-motion через gsap.matchMedia — если пользователь его включил, отключай parallax/complex sequences, оставляй только opacity fade; (5) для частых обновлений (mousemove, scroll) используй gsap.quickTo() — он переиспользует один tween вместо создания нового на каждом frame; (6) для scroll-based анимации используй ScrollTrigger с scrub, а не listener на scroll event; (7) при cleanup всегда killTweensOf() или ctx.revert(). Проверяй что 60fps держится в Chrome DevTools Performance.',
        details: {
            bullets: [
            "Использует GSAP как стандарт индустрии (не Framer Motion / CSS-only)",
            "В React — хук useGSAP: авточистка при размонтировании",
            "Анимирует только transform и opacity — 60fps на GPU",
            "Никогда не анимирует width/height/top/left — layout-thrash",
            "Timeline с defaults и position parameter вместо chain из delay",
            "Уважает prefers-reduced-motion через gsap.matchMedia",
            "quickTo для частых обновлений (mousemove, scroll)",
            "ScrollTrigger со scrub для scroll-based анимаций"
            ],
            libs: [
            "gsap",
            "@gsap/react",
            "gsap/ScrollTrigger",
            "gsap/MotionPathPlugin"
            ],
        }
    },
    {
        id: 'architecture',
        icon: 'BarChart',
        name: 'Архитектура',
        desc: 'Продуманные архитектурные решения с разбором альтернатив',
        instruction: 'Скилл «Архитектура» активен. Ты — Staff Engineer / архитектор. При любом дизайн-вопросе действуй так: (1) сначала уточни функциональные И нефункциональные требования (нагрузка, SLA, консистентность, бюджет, команда) — без них любое решение — гадание; (2) предлагай 2-3 варианта архитектуры с явными trade-offs (например: «монолит — быстрее для 1 команды, но потом больно; микросервисы — гибче, но overhead»); (3) для каждого варианта укажи: границы модулей, коммуникацию (sync/async, REST/gRPC/queue), схему данных (нормализация vs денормализация, шардинг), горячие точки, точки отказа; (4) явно называй риски и unknown-unknowns; (5) думай о наблюдаемости с первого дня — логи, метрики, трейсы; (6) для распределённых систем помни про CAP, идемпотентность, at-least-once vs exactly-once. Избегай карго-культа: «микросервисы потому что модно» — плохой ответ. Всегда спрашивай «зачем» до «как». Используй C4-модель (Context → Container → Component → Code) для описания.',
        details: {
            bullets: [
            "Сначала уточняет требования (нагрузка, SLA, бюджет, команда)",
            "Предлагает 2-3 варианта с явными trade-offs",
            "Описывает границы модулей, коммуникацию, схему данных",
            "Явно называет риски и unknown-unknowns",
            "Продумывает наблюдаемость с первого дня (логи, метрики, трейсы)",
            "Помнит про CAP, идемпотентность, at-least-once vs exactly-once",
            "Использует C4-модель для описания (Context → Container → Component → Code)"
            ],
            libs: [
            "Draw.io / Excalidraw — для схем",
            "Structurizr — C4-модели",
            "OpenTelemetry — трассировка"
            ],
        }
    },
    {
        id: 'research',
        icon: 'Search',
        name: 'Исследование',
        desc: 'Глубокий анализ задачи с проверкой предположений',
        instruction: 'Скилл «Исследование» активен. Работай как research-аналитик: (1) сформулируй ОДНО главное исследовательское вопросительное предложение и 3-5 подвопросов; (2) раздели знаемое и незнаемое — что фактически известно, что требует проверки; (3) для каждой ключевой гипотезы явно назови допущения, при которых она верна, и как их можно опровергнуть (falsifiability по Попперу); (4) приведи минимум 2-3 альтернативных объяснения / решения, разбери pro/contra каждого; (5) укажи Bayesian-приоры: «эта гипотеза более вероятна ПРИ УСЛОВИИ что…», не выдавай уверенность за факт; (6) в конце — конкретный actionable output: список вопросов для дальнейшего исследования, чек-лист экспериментов, метрики успеха. Избегай handwaving («в целом хорошо / скорее всего работает») — заменяй на числа, диапазоны, ссылки. Если данных мало — прямо скажи «данных недостаточно для уверенного вывода» и укажи какие именно данные нужны.',
        details: {
            bullets: [
            "Формулирует главный вопрос и 3-5 подвопросов",
            "Разделяет знаемое и незнаемое",
            "Явно называет допущения и способы их опровергнуть (falsifiability)",
            "Приводит 2-3 альтернативных объяснения с pro/contra",
            "Использует Bayesian-приоры вместо категорических утверждений",
            "В конце — actionable output: вопросы, чек-лист, метрики",
            "Не handwave'ит — числа, диапазоны, ссылки"
            ],
            libs: [
            "Notion / Obsidian — для заметок",
            "Google Scholar — для источников",
            "Zotero — для ссылок"
            ],
        }
    },
    {
        id: 'writing',
        icon: 'MessageSquare',
        name: 'Копирайтинг',
        desc: 'Тексты, документация, письма — ясно и без воды',
        instruction: 'Скилл «Копирайтинг» активен. Правила: (1) сначала уточни аудиторию, цель и желаемое действие (CTA) — без этого текст пишется вслепую; (2) применяй пирамиду Минто: главная мысль в первом предложении, затем аргументы, затем детали — читатель должен понять суть, даже прочитав только заголовок и первый абзац; (3) заменяй канцелярит на живой язык: «в связи с необходимостью» → «чтобы», «осуществлять» → «делать», «данный» → «этот»; (4) активный залог сильнее пассивного: «мы запустили» вместо «был запущен»; (5) ритм: чередуй короткие и длинные предложения, ни одного длиннее 25 слов без веской причины; (6) для marketing/landing: заголовок отвечает на «что и для кого», подзаголовок — «в чём выгода», CTA — глагол; (7) для документации: примеры > описания, «Do»/«Don\'t» пары, скриншоты/схемы там где текст громоздок; (8) для писем: тема ≤ 8 слов, первая строка — суть, последняя — конкретное действие с дедлайном. Избегай штампов («в современном мире», «неотъемлемая часть», «инновационное решение») — они сигнализируют что автору нечего сказать.',
        details: {
            bullets: [
            "Уточняет аудиторию, цель и CTA перед писанием",
            "Применяет пирамиду Минто: главная мысль → аргументы → детали",
            "Заменяет канцелярит на живой язык",
            "Активный залог сильнее пассивного",
            "Чередует короткие и длинные предложения",
            "Для лендингов: заголовок → выгода → CTA-глагол",
            "Для доки: примеры > описания, Do/Don't пары",
            "Избегает штампов «в современном мире», «неотъемлемая часть»"
            ],
            libs: [
            "Grammarly / LanguageTool — проверка",
            "Hemingway Editor — читаемость",
            "Главред — канцелярит"
            ],
        }
    },
    {
        id: 'translate',
        icon: 'Globe',
        name: 'Перевод',
        desc: 'Локализация с сохранением тона и терминологии',
        instruction: 'Скилл «Перевод» активен. Работай как профессиональный переводчик, а не подстрочник: (1) переводи СМЫСЛ, а не слова — идиомы заменяй эквивалентными в целевом языке («it\'s raining cats and dogs» → «льёт как из ведра», не буквально); (2) сохраняй регистр и тон оригинала — формальный текст остаётся формальным, разговорный — разговорным, поэтический — с ритмом и образностью; (3) технические термины — сохраняй устоявшийся отраслевой перевод (не выдумывай «облачные вычисления» если в индустрии говорят «клауд»); (4) имена собственные, бренды, названия продуктов — оставляй как в оригинале, если нет общепринятой локализации; (5) единицы измерения адаптируй под целевую локаль (мили → км, °F → °C) — если это не техдокументация где важна точность; (6) даты, время, деньги, номера телефонов — форматируй по правилам целевого языка; (7) для маркетинга/UI применяй транскреацию: игра слов и заголовки часто требуют переработки, а не перевода; (8) в конце укажи неоднозначные места, где смысл оригинала можно понять двояко, и предложи варианты. Если контекст неясен — спрашивай, а не гадай.',
        details: {
            bullets: [
            "Переводит СМЫСЛ, а не слова (идиомы → эквиваленты)",
            "Сохраняет регистр и тон оригинала",
            "Технические термины — отраслевой перевод",
            "Имена собственные и бренды — как в оригинале",
            "Единицы измерения — под целевую локаль",
            "Для маркетинга — транскреация вместо перевода",
            "Указывает неоднозначные места с вариантами"
            ],
            libs: [
            "DeepL — сравнение переводов",
            "Multitran — специализированные словари",
            "Linguee — примеры из корпусов"
            ],
        }
    },
    {
        id: 'reviewer',
        icon: 'Check',
        name: 'Код-ревьюер',
        desc: 'Разбор кода: баги, безопасность, производительность',
        instruction: 'Скилл «Код-ревьюер» активен. Разбирай присланный код по чек-листу senior-ревью: (1) КОРРЕКТНОСТЬ — есть ли баги, off-by-one, гонки, необработанные ошибки, ветки без return; (2) БЕЗОПАСНОСТЬ — SQL/XSS/CSRF инъекции, утечки токенов в логах, доверие user input без валидации, timing-атаки на сравнение секретов, path traversal; (3) ПРОИЗВОДИТЕЛЬНОСТЬ — N+1 запросы к БД, лишние ре-рендеры в React, синхронные I/O в hot path, O(n²) где можно O(n log n); (4) ЧИТАЕМОСТЬ — глубокая вложенность (>3 уровней), длинные функции (>50 строк), «магические» числа, неговорящие имена; (5) ТЕСТИРУЕМОСТЬ — есть ли скрытые зависимости, mock\'абельность внешних сервисов, покрытие edge cases; (6) СОПРОВОЖДАЕМОСТЬ — DRY-нарушения, tight coupling, отсутствие типов там где нужны. Формат ответа: маркированный список замечаний, для каждого — уровень (🔴 blocker, 🟠 major, 🟡 minor, 🟢 nit) + пример правки. НЕ переписывай весь код — точечно предлагай исправления. Хвали хорошие места явно (это тоже часть code review).',
        details: {
            bullets: [
            "КОРРЕКТНОСТЬ: баги, off-by-one, гонки, необработанные ошибки",
            "БЕЗОПАСНОСТЬ: SQL/XSS/CSRF, утечки токенов, path traversal",
            "ПРОИЗВОДИТЕЛЬНОСТЬ: N+1 запросы, ре-рендеры, O(n²)",
            "ЧИТАЕМОСТЬ: вложенность, длинные функции, магические числа",
            "ТЕСТИРУЕМОСТЬ: скрытые зависимости, mock'абельность",
            "СОПРОВОЖДАЕМОСТЬ: DRY, tight coupling, отсутствие типов",
            "Помечает замечания уровнями: 🔴 blocker, 🟠 major, 🟡 minor, 🟢 nit",
            "Хвалит хорошие места явно — это часть code review"
            ],
            libs: [
            "ESLint / SonarQube — статический анализ",
            "Semgrep — паттерны безопасности",
            "CodeQL — уязвимости"
            ],
        }
    },
];

// Собирает текст активных скиллов (базовых + кастомных) в единый блок
// инструкций, который добавляется к системному промпту при ответах.
// Если передан project — добавляются и его изолированные скиллы (работают
// только в чатах этого проекта).
export function buildSkillsInstruction(state, project = null) {
    const activeIds = state.activeSkills || [];
    const custom = state.customSkills || [];
    const parts = [];
    SKILLS.forEach(s => { if (activeIds.includes(s.id)) parts.push(`[${s.name}] ${s.instruction}`); });
    custom.forEach(s => { if (s.active) parts.push(`[${s.name}] ${s.instruction}`); });
    if (project) {
        const pActive = project.activeSkills || [];
        const pCustom = project.customSkills || [];
        SKILLS.forEach(s => { if (pActive.includes(s.id)) parts.push(`[${s.name}] ${s.instruction}`); });
        pCustom.forEach(s => { if (s.active) parts.push(`[${s.name}] ${s.instruction}`); });
    }
    if (parts.length === 0) return '';
    return 'Учитывай активные скиллы (инструкции пользователя):\n' + parts.join('\n');
}

export function SkillsView({ state, updateState }) {
    const lang = state.lang || 'ru';
    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-2 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">{t(lang, 'menu.skills')}</h2>
                </div>
                <p className="text-gray-500 dark:text-gray-400 mb-6 ml-1">Скиллы — это инструкции, которые ассистент учитывает при ответах: качество кода, анимации, архитектура и другое.</p>
                <SkillsPanel state={state} updateState={updateState} />
            </div>
        </div>
    );
}

// Переиспользуемая панель скиллов (в полной вкладке и в модалке «+» чата).
export function SkillsPanel({ state, updateState, projectId = null }) {
    const [tab, setTab] = useState('base');
    const [adding, setAdding] = useState(null); // null | 'text' | 'github'
    const scope = useRef(null);

    // Для проектных скиллов используем отдельные поля состояния проекта.
    const active = projectId
        ? ((state.projects || []).find(p => p.id === projectId)?.activeSkills || [])
        : (state.activeSkills || []);
    const custom = projectId
        ? ((state.projects || []).find(p => p.id === projectId)?.customSkills || [])
        : (state.customSkills || []);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.from('.skill-card', { autoAlpha: 0, y: 16, duration: 0.35, stagger: 0.05, ease: 'power2.out' });
    }, { scope, dependencies: [tab] });

    const patchProject = (patch) => {
        updateState({ projects: (state.projects || []).map(p => p.id === projectId ? { ...p, ...patch } : p) });
    };
    const setActive = (next) => projectId ? patchProject({ activeSkills: next }) : updateState({ activeSkills: next });
    const setCustom = (next) => projectId ? patchProject({ customSkills: next }) : updateState({ customSkills: next });

    const toggleBase = (id) => setActive(active.includes(id) ? active.filter(s => s !== id) : [...active, id]);
    const toggleCustom = (id) => setCustom(custom.map(s => s.id === id ? { ...s, active: !s.active } : s));
    const removeCustom = (id) => setCustom(custom.filter(s => s.id !== id));
    const addCustom = (skill) => { setCustom([{ ...skill, id: 'sk_' + Date.now(), active: true }, ...custom]); setAdding(null); };

    if (adding === 'text') return <AddTextSkill onAdd={addCustom} onCancel={() => setAdding(null)} />;
    if (adding === 'github') return <AddGithubSkill onAdd={addCustom} onCancel={() => setAdding(null)} />;

    return (
        <div ref={scope}>
            {/* Вкладки */}
            <div className="flex gap-2 mb-4 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-2xl">
                <button onClick={() => setTab('base')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'base' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500'}`}>Базовые скиллы</button>
                <button onClick={() => setTab('custom')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'custom' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500'}`}>Свои скиллы</button>
            </div>

            {tab === 'base' ? (
                <div className="grid sm:grid-cols-2 gap-3">
                    {SKILLS.map(skill => (
                        <SkillCard
                            key={skill.id}
                            skill={skill}
                            on={active.includes(skill.id)}
                            onToggle={() => toggleBase(skill.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setAdding('text')} className="skill-card flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <Icons.Plus className="w-4 h-4" /> Текстом
                        </button>
                        <button onClick={() => setAdding('github')} className="skill-card flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <Icons.Github className="w-4 h-4" /> Из GitHub
                        </button>
                    </div>
                    {custom.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Пока нет своих скиллов. Добавьте инструкцию текстом или импортируйте из GitHub.</p>
                    ) : custom.map(skill => (
                        <div key={skill.id} className={`skill-card flex items-center gap-3 p-4 rounded-2xl border ${skill.active ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/40' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder'}`}>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm dark:text-white truncate">{skill.name}</p>
                                <p className="text-xs text-gray-400 truncate">{skill.desc || skill.instruction}</p>
                            </div>
                            <button onClick={() => toggleCustom(skill.id)} className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${skill.active ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${skill.active ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                            <button onClick={() => removeCustom(skill.id)} className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 rounded-lg"><Icons.Trash className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function AddTextSkill({ onAdd, onCancel }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [instruction, setInstruction] = useState('');
    const ok = name.trim() && instruction.trim();
    return (
        <div className="space-y-3">
            <button onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 mb-1"><Icons.ChevronLeft className="w-4 h-4" /> Назад</button>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Название скилла" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Краткое описание (необязательно)" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
            <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={5} placeholder="Текст инструкции (промт), который ассистент будет учитывать…" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none" />
            <button onClick={() => onAdd({ name: name.trim(), desc: desc.trim(), instruction: instruction.trim() })} disabled={!ok} className="w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 text-white font-bold text-sm transition-colors">Добавить скилл</button>
        </div>
    );
}

// Импорт скилла из GitHub. Пользователь вводит personal access token (или
// оставляет пустым для публичных репозиториев), мы тянем список его репо
// через GitHub API, он выбирает репозиторий — README подтягивается как
// текст инструкции. Полноценный OAuth-flow — задача на будущее; сейчас
// используется token/username, без хранения секретов на клиенте дольше сессии.
function AddGithubSkill({ onAdd, onCancel }) {
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [repos, setRepos] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const loadRepos = async () => {
        setLoading(true); setError(''); setRepos(null);
        try {
            const headers = token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {};
            const url = token.trim()
                ? 'https://api.github.com/user/repos?per_page=50&sort=updated'
                : `https://api.github.com/users/${encodeURIComponent(username.trim())}/repos?per_page=50&sort=updated`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('GitHub API ' + res.status);
            const data = await res.json();
            setRepos(data.map(r => ({ id: r.id, name: r.full_name, default_branch: r.default_branch })));
        } catch (e) {
            setError('Не удалось получить репозитории. Проверьте токен или имя пользователя.');
        } finally { setLoading(false); }
    };

    const importRepo = async (repo) => {
        setLoading(true); setError('');
        try {
            const headers = token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {};
            const res = await fetch(`https://api.github.com/repos/${repo.name}/readme`, { headers: { ...headers, Accept: 'application/vnd.github.raw' } });
            const text = res.ok ? await res.text() : '';
            onAdd({
                name: repo.name.split('/')[1] || repo.name,
                desc: 'Импортировано из GitHub: ' + repo.name,
                instruction: (text || `Скилл на основе репозитория ${repo.name}.`).slice(0, 6000),
            });
        } catch (e) {
            setError('Не удалось импортировать репозиторий.');
        } finally { setLoading(false); }
    };

    return (
        <div className="space-y-3">
            <button onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 mb-1"><Icons.ChevronLeft className="w-4 h-4" /> Назад</button>
            {!repos ? (
                <>
                    <div className="p-4 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 flex items-start gap-2.5">
                        <Icons.Github className="w-5 h-5 text-[#5b32d4] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#5b32d4] dark:text-purple-300 leading-relaxed">Введите personal access token для доступа к вашим репозиториям (в т.ч. приватным) или укажите имя пользователя для публичных.</p>
                    </div>
                    <input value={token} onChange={e => setToken(e.target.value)} placeholder="GitHub token (для приватных репо)" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="или имя пользователя (для публичных)" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button onClick={loadRepos} disabled={loading || (!token.trim() && !username.trim())} className="w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 text-white font-bold text-sm transition-colors">{loading ? 'Загрузка…' : 'Показать репозитории'}</button>
                </>
            ) : (
                <>
                    <p className="text-sm font-bold dark:text-white">Выберите репозиторий:</p>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {repos.map(r => (
                            <button key={r.id} onClick={() => importRepo(r)} disabled={loading} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder hover:border-[#5b32d4]/40 transition-colors text-left">
                                <Icons.Github className="w-4 h-4 text-gray-500 shrink-0" />
                                <span className="flex-1 text-sm font-semibold dark:text-white truncate">{r.name}</span>
                                <Icons.Plus className="w-4 h-4 text-gray-400" />
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
