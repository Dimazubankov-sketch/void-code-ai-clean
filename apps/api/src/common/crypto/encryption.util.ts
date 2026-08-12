import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ==========================================
// Шифрование секретов в БД (AES-256-GCM)
// ==========================================
// Используется для пароля от почтового ящика Migadu (mailboxPasswordEnc
// на User) — серверу нужно расшифровать его на лету, чтобы авторизоваться
// по SMTP/IMAP от имени пользователя, поэтому это симметричное шифрование
// (не одностороннее хеширование, как для пароля от аккаунта Void Code).
//
// Ключ — ENCRYPTION_KEY в .env сервера, ЛЮБАЯ строка (не обязательно ровно
// 32 байта — scryptSync ниже детерминированно растягивает её до нужной
// длины ключа AES-256). Один и тот же ENCRYPTION_KEY должен использоваться
// постоянно: смена ключа делает ранее зашифрованные пароли ящиков
// нерасшифровываемыми (пользователям придётся заново генерировать пароль
// ящика через админку Migadu).
//
// Формат хранимой строки: "<iv_hex>:<authTag_hex>:<ciphertext_hex>" —
// один текстовый столбец в БД, ничего лишнего в схеме заводить не надо.

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // рекомендованная длина IV для GCM

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY не задан в .env — шифрование секретов невозможно');
  }
  // scryptSync с фиксированной солью — соль здесь не для защиты от
  // радужных таблиц (ключ не пароль пользователя, а секрет из .env),
  // а просто чтобы гарантированно получить ровно 32 байта из строки
  // любой длины/формата.
  return scryptSync(secret, 'void-code-ai-mailbox-salt', 32);
}

export function encryptSecret(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, dataHex] = stored.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Некорректный формат зашифрованного значения');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// Генерирует случайный надёжный пароль для нового почтового ящика —
// пользователь его никогда не вводит и не видит (он не для входа
// в Void Code AI, а внутренний технический пароль для SMTP/IMAP,
// которым от его имени пользуется только наш сервер).
export function generateMailboxPassword(): string {
  return randomBytes(24).toString('base64url'); // 32 символа, URL-safe
}
