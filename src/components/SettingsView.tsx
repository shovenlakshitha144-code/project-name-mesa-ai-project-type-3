import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Download, KeyRound, Shield, Zap } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AIProviderId, AIProviderStatus, LanguageMode, UserProfile } from '../../shared/types';

interface SettingsViewProps {
  user: UserProfile;
  aiStatus: AIProviderStatus | null;
  onUserUpdated: (user: UserProfile) => void;
  onAIUpdated: (status: AIProviderStatus) => void;
}

const MODEL_SUGGESTIONS: Record<AIProviderId, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  openrouter: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  ollama: ['llama3.1', 'qwen2.5', 'gemma2'],
  custom: ['custom-model'],
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  aiStatus,
  onUserUpdated,
  onAIUpdated,
}) => {
  const [provider, setProvider] = useState<AIProviderId>(aiStatus?.activeProvider || 'gemini');
  const [model, setModel] = useState(aiStatus?.activeModel || 'gemini-2.5-flash');
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState(aiStatus?.ollamaBaseUrl || 'http://localhost:11434');
  const [customUrl, setCustomUrl] = useState(aiStatus?.customBaseUrl || '');
  const [temperature, setTemperature] = useState(aiStatus?.temperature ?? 0.7);
  const [systemNotes, setSystemNotes] = useState(aiStatus?.systemNotes || '');
  const [aiNotice, setAiNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Profile
  const [displayName, setDisplayName] = useState(user.displayName);
  const [organization, setOrganization] = useState(user.organization);
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageMode>(user.preferredLanguage);
  const [currency, setCurrency] = useState(user.currency);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  useEffect(() => {
    if (aiStatus) {
      setProvider(aiStatus.activeProvider);
      setModel(aiStatus.activeModel);
      setOllamaUrl(aiStatus.ollamaBaseUrl);
      setCustomUrl(aiStatus.customBaseUrl);
      setTemperature(aiStatus.temperature);
      setSystemNotes(aiStatus.systemNotes);
    }
  }, [aiStatus]);

  const saveAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiNotice(null);
    const updated = await apiRequest<AIProviderStatus>('/api/ai/config', {
      method: 'PUT',
      body: JSON.stringify({
        activeProvider: provider,
        activeModel: model,
        keyProvider: provider,
        apiKey: apiKey.trim() || undefined,
        ollamaBaseUrl: ollamaUrl,
        customBaseUrl: customUrl,
        temperature,
        systemNotes,
      }),
    });
    setApiKey('');
    onAIUpdated(updated);
    setAiNotice({ ok: true, msg: 'AI Brain configuration encrypted and saved to server vault.' });
  };

  const clearProviderKey = async (p: AIProviderId) => {
    const updated = await apiRequest<AIProviderStatus>('/api/ai/config', {
      method: 'PUT',
      body: JSON.stringify({
        activeProvider: provider,
        activeModel: model,
        ollamaBaseUrl: ollamaUrl,
        customBaseUrl: customUrl,
        temperature,
        systemNotes,
        clearKeyProvider: p,
      }),
    });
    onAIUpdated(updated);
    setAiNotice({ ok: true, msg: `Cleared stored key for ${p.toUpperCase()}.` });
  };

  const testConnection = async () => {
    setTesting(true);
    setAiNotice(null);
    try {
      const res = await apiRequest<{ ok: boolean; provider: string; model: string; reply: string }>('/api/ai/test', {
        method: 'POST',
      });
      setAiNotice({ ok: true, msg: `Connected (${res.provider}/${res.model}): "${res.reply}"` });
    } catch (err) {
      setAiNotice({ ok: false, msg: err instanceof Error ? err.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          organization,
          preferredLanguage,
          currency,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      onUserUpdated(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setProfileNotice('Owner profile and security settings updated.');
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* AI BRAIN & ENCRYPTED KEY VAULT */}
      <form onSubmit={saveAI} className="mesa-glass rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-base font-semibold text-white">AI Brain & Encrypted API Vault</h3>
            <p className="text-xs text-slate-400">
              API keys are AES-256-GCM encrypted on the server and never exposed in frontend code.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Active AI Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                const next = e.target.value as AIProviderId;
                setProvider(next);
                setModel(MODEL_SUGGESTIONS[next][0]);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="gemini">Google Gemini (Free tier / Pro)</option>
              <option value="groq">Groq (Ultra-fast Free Tier)</option>
              <option value="openrouter">OpenRouter (Free & Paid Models)</option>
              <option value="ollama">Ollama (100% Free Local Offline LLM)</option>
              <option value="openai">OpenAI</option>
              <option value="custom">Custom OpenAI-Compatible API</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Model Identifier</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list="mesa-model-list"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <datalist id="mesa-model-list">
              {MODEL_SUGGESTIONS[provider].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        {provider !== 'ollama' ? (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-slate-400 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                {provider.toUpperCase()} API Key {aiStatus?.configuredProviders[provider] ? '(Stored securely)' : '(Not set)'}
              </label>
              {aiStatus?.configuredProviders[provider] && (
                <button
                  type="button"
                  onClick={() => void clearProviderKey(provider)}
                  className="text-[11px] text-rose-300 hover:underline cursor-pointer"
                >
                  Clear Stored Key
                </button>
              )}
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                aiStatus?.configuredProviders[provider]
                  ? '•••••••••••• (leave blank to keep existing key)'
                  : `Paste your ${provider.toUpperCase()} API key`
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ollama Local Server URL</label>
            <input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
        )}

        {provider === 'custom' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Custom OpenAI-Compatible Base URL</label>
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Creativity / Temperature ({temperature})
          </label>
          <input
            type="range"
            min={0}
            max={1.4}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Custom Owner Context / Instructions</label>
          <textarea
            value={systemNotes}
            onChange={(e) => setSystemNotes(e.target.value)}
            rows={2}
            placeholder="Optional instructions for how Mesa addresses you or prioritizes SLBSK projects..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
          />
        </div>

        {aiNotice && (
          <div
            className={`p-3 rounded-xl text-xs border ${
              aiNotice.ok
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
            }`}
          >
            {aiNotice.msg}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing}
            className="px-4 py-2 rounded-xl mesa-glass-soft text-xs text-cyan-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            {testing ? 'Testing...' : 'Test Live Connection'}
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            Save AI Config
          </button>
        </div>
      </form>

      {/* OWNER PROFILE, SECURITY & BACKUP */}
      <form onSubmit={saveProfile} className="mesa-glass rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-base font-semibold text-white">Owner Profile, Security & Backup</h3>
            <p className="text-xs text-slate-400">Protected workspace preferences and data portability.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Owner Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Organization</label>
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Preferred Language</label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as LanguageMode)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="auto">Auto (English + Sinhala + Mixed)</option>
              <option value="en">English</option>
              <option value="si">Sinhala (සිංහල)</option>
              <option value="mixed">Sinhala + English</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="LKR">LKR (Rs.)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="text-xs font-semibold text-slate-300">Change Password (Optional)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current Password"
              className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New Password (min 6 chars)"
              minLength={6}
              className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
        </div>

        {profileNotice && (
          <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs text-cyan-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            {profileNotice}
          </div>
        )}

        <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
          <a
            href="/api/export"
            className="px-4 py-2 rounded-xl mesa-glass-soft text-xs text-cyan-200 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Full JSON Backup
          </a>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            Update Profile
          </button>
        </div>
      </form>
    </div>
  );
};
