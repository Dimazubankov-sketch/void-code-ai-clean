// ==========================================
// Пост-обработка ответа LLM
// ==========================================
// Модели (особенно Qwen) периодически игнорируют указание «весь код —
// в блоках ```» и вставляют HTML/CSS/JS прямо в текст. Фронтенд извлекает
// код по регулярному выражению /```lang\n...```/ — если обёртки нет, код
// попадёт в основной текст сообщения как обычный markdown, что и было
// главной жалобой пользователя.
//
// Здесь мы страхуемся на сервере: если видим явные признаки кода в тексте
// (много подряд идущих HTML/CSS/JS-паттернов), но код не в блоке — оборачиваем
// его. Дополнительно закрываем незакрытые ``` (bug: модель обрывается на
// max_tokens посреди кода — фронтенд тогда не парсит блок вообще).

// Балансирует тройные кавычки: если их нечётное количество, дописывает ```
// в конце, чтобы последний блок парсился корректно.
export function balanceCodeFences(text: string): string {
  const fences = text.match(/```/g);
  if (!fences) return text;
  if (fences.length % 2 === 0) return text;
  // Незакрытый блок — добавляем закрывающую кавычку.
  return text.endsWith('\n') ? text + '```' : text + '\n```';
}

// Ищет большие непрерывные куски, похожие на код, которые ЛЕЖАТ ВНЕ блоков ```
// и оборачивает их. Работает консервативно: срабатывает только на явные
// признаки (DOCTYPE, <html>, <?php, function/const с телом и т.п.), чтобы
// не обернуть случайное `<div>` внутри обычного объяснения.
export function ensureCodeBlocks(text: string): string {
  // Уже есть блок — считаем, что модель отформатировала правильно; текст
  // между блоками — пояснения, их не трогаем.
  if (/```[\s\S]*?```/.test(text)) return text;

  // Ищем явные признаки полноценного кода в общем тексте.
  const isHtml = /<!DOCTYPE\s+html/i.test(text) || /<html[\s>]/i.test(text);
  const isCss = /^[a-z0-9\-_.#:*\s,>+~[\]="]+\s*\{[\s\S]*\}/im.test(text) && text.includes('}');
  const isJs = /(^|\n)\s*(function\s+\w+\s*\(|const\s+\w+\s*=|import\s+.*from)/m.test(text);
  const isPhp = /<\?php/i.test(text);
  const isPython = /(^|\n)\s*(def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import)/m.test(text);

  let lang = '';
  if (isHtml || isPhp) lang = 'html';
  else if (isCss) lang = 'css';
  else if (isJs) lang = 'javascript';
  else if (isPython) lang = 'python';
  else return text; // Не код — не трогаем.

  // Дополнительный порог: короткий фрагмент (< 6 строк) — вероятно, пример
  // в объяснении, а не полноценный файл. Оставляем как есть.
  const lineCount = text.split('\n').length;
  if (lineCount < 6) return text;

  return '```' + lang + '\n' + text.trim() + '\n```';
}

// Главная функция пост-обработки — вызывается на бэкенде перед сохранением
// ответа в БД и возвратом на фронт.
export function postProcessAnswer(rawAnswer: string): string {
  if (!rawAnswer) return rawAnswer;
  let out = balanceCodeFences(rawAnswer);
  out = ensureCodeBlocks(out);
  return out;
}
