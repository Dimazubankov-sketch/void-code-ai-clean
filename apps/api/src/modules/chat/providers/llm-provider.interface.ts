// ==========================================
// ЕДИНЫЙ ИНТЕРФЕЙС LLM-ПРОВАЙДЕРА (паттерн «Адаптер»)
// ==========================================
// Это то самое «место для интеграции API»: чат, AI-агенты и конструктор
// сайтов зависят только от этого интерфейса. Чтобы подключить нового
// провайдера (OpenRouter, Anthropic, локальную модель) — достаточно
// написать один класс-адаптер, не трогая остальной код.

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageBase64?: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  systemPrompt: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmProvider {
  readonly name: string;
  generate(request: LlmRequest): Promise<string>;
}

// Токен для DI: модули просят «какого-нибудь провайдера», а какой именно
// подставить — решает конфигурация ChatModule.
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
