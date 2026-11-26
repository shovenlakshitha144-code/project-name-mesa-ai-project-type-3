import type { DatabaseSync } from 'node:sqlite';
import { decryptSecret } from '../security.js';
import type { AIProviderId, AIProviderStatus } from '../../shared/types.js';

export class AIConfigError extends Error {
  code: 'NOT_CONFIGURED' | 'PROVIDER_ERROR';
  constructor(message: string, code: 'NOT_CONFIGURED' | 'PROVIDER_ERROR' = 'NOT_CONFIGURED') {
    super(message);
    this.code = code;
  }
}

export interface AIConfigRecord {
  activeProvider: AIProviderId;
  activeModel: string;
  customBaseUrl: string;
  ollamaBaseUrl: string;
  temperature: number;
  systemNotes: string;
}

export function getAISettings(db: DatabaseSync, userId: string): AIConfigRecord {
  const row = db.prepare('SELECT * FROM ai_settings WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) {
    return {
      activeProvider: (process.env.DEFAULT_AI_PROVIDER as AIProviderId) || 'gemini',
      activeModel: process.env.DEFAULT_AI_MODEL || 'gemini-2.5-flash',
      customBaseUrl: '',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      temperature: 0.7,
      systemNotes: '',
    };
  }
  return {
    activeProvider: String(row.active_provider) as AIProviderId,
    activeModel: String(row.active_model),
    customBaseUrl: String(row.custom_base_url || ''),
    ollamaBaseUrl: String(row.ollama_base_url || 'http://localhost:11434'),
    temperature: Number(row.temperature ?? 0.7),
    systemNotes: String(row.system_notes || ''),
  };
}

export function getProviderApiKey(db: DatabaseSync, userId: string, provider: AIProviderId): string {
  const row = db
    .prepare('SELECT encrypted_key FROM api_vault WHERE user_id = ? AND provider = ?')
    .get(userId, provider) as { encrypted_key: string } | undefined;

  if (row?.encrypted_key) {
    const decrypted = decryptSecret(row.encrypted_key);
    if (decrypted) return decrypted;
  }

  switch (provider) {
    case 'gemini':
      return process.env.GEMINI_API_KEY?.trim() || '';
    case 'openai':
      return process.env.OPENAI_API_KEY?.trim() || '';
    case 'groq':
      return process.env.GROQ_API_KEY?.trim() || '';
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY?.trim() || '';
    case 'custom':
      return process.env.CUSTOM_AI_API_KEY?.trim() || '';
    case 'ollama':
      return 'ollama-local';
  }
}

export function getAIStatusForClient(db: DatabaseSync, userId: string): AIProviderStatus {
  const cfg = getAISettings(db, userId);
  const providers: AIProviderId[] = ['gemini', 'openai', 'groq', 'openrouter', 'ollama', 'custom'];
  const configuredProviders = {} as Record<AIProviderId, boolean>;
  for (const p of providers) {
    if (p === 'ollama') {
      configuredProviders[p] = Boolean(cfg.ollamaBaseUrl);
    } else {
      configuredProviders[p] = Boolean(getProviderApiKey(db, userId, p));
    }
  }
  return {
    ...cfg,
    configuredProviders,
  };
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callAIModel(
  db: DatabaseSync,
  userId: string,
  messages: ChatTurn[],
  options?: { temperature?: number }
): Promise<{ text: string; provider: AIProviderId; model: string }> {
  const cfg = getAISettings(db, userId);
  const provider = cfg.activeProvider;
  const model = cfg.activeModel;
  const temp = options?.temperature ?? cfg.temperature;
  const apiKey = getProviderApiKey(db, userId, provider);

  if (provider !== 'ollama' && !apiKey) {
    throw new AIConfigError(
      `No API key configured for ${provider.toUpperCase()}. Open Settings → AI Brain to add an API key (Gemini, Groq, OpenRouter, OpenAI) or switch to local Ollama.`,
      'NOT_CONFIGURED'
    );
  }

  if (provider === 'gemini') {
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => ({ text: m.content }));
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model || 'gemini-2.5-flash'
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
        contents,
        generationConfig: { temperature: temp },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AIConfigError(`Gemini API error (${res.status}): ${errText.slice(0, 260)}`, 'PROVIDER_ERROR');
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) {
      throw new AIConfigError('Gemini returned an empty response.', 'PROVIDER_ERROR');
    }
    return { text, provider, model };
  }

  // OpenAI-compatible path: openai, groq, openrouter, ollama, custom
  let baseUrl = 'https://api.openai.com/v1';
  if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
  else if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
  else if (provider === 'ollama') baseUrl = `${cfg.ollamaBaseUrl.replace(/\/$/, '')}/v1`;
  else if (provider === 'custom') {
    if (!cfg.customBaseUrl) {
      throw new AIConfigError('Custom provider Base URL is not set.', 'NOT_CONFIGURED');
    }
    baseUrl = cfg.customBaseUrl.replace(/\/$/, '');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && provider !== 'ollama') {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://slbsk-mesa.local';
    headers['X-Title'] = 'MESA AI v2.0';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || (provider === 'ollama' ? 'llama3.1' : 'gpt-4o-mini'),
      messages,
      temperature: temp,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new AIConfigError(`${provider.toUpperCase()} API error (${res.status}): ${errText.slice(0, 260)}`, 'PROVIDER_ERROR');
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new AIConfigError(`${provider.toUpperCase()} returned an empty response.`, 'PROVIDER_ERROR');
  }
  return { text, provider, model };
}
