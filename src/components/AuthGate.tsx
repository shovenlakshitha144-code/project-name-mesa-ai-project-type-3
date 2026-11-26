import React, { useState } from 'react';
import { Lock, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { LanguageMode, UserProfile } from '../../shared/types';

interface AuthGateProps {
  initialized: boolean;
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ initialized, onAuthenticated }) => {
  const [username, setUsername] = useState(initialized ? '' : 'shoven');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('Shoven');
  const [organization, setOrganization] = useState('SLBSK DIGITAL CREATION');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageMode>('auto');
  const [currency, setCurrency] = useState('LKR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = initialized ? '/api/auth/login' : '/api/auth/setup';
      const body = initialized
        ? { username, password }
        : { username, password, displayName, organization, preferredLanguage, currency };
      const res = await apiRequest<{ user: UserProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 mesa-grid-bg">
      <div className="w-full max-w-md mesa-glass rounded-3xl p-7 sm:p-8 mesa-glow-border">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-8 h-8 text-cyan-300" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
            MESA AI v2.0
          </h1>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-400/80 mt-1">
            SLBSK DIGITAL CREATION
          </p>
          <p className="text-sm text-slate-400 mt-3">
            {initialized
              ? 'Sign in to unlock your encrypted personal AI & business workspace.'
              : 'First-time setup: initialize Owner access and security vault.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!initialized && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Owner Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="LKR">LKR (Rs.)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Organization</label>
                <input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Default Conversation Language</label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as LanguageMode)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="auto">Auto (English + Sinhala + Mixed)</option>
                  <option value="en">English</option>
                  <option value="si">Sinhala (සිංහල)</option>
                  <option value="mixed">Sinhala-English Mixed</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="shoven"
              autoComplete="username"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              autoComplete={initialized ? 'current-password' : 'new-password'}
              required
              minLength={6}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/25 disabled:opacity-50 cursor-pointer"
          >
            {initialized ? <Lock className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
            {loading ? 'Securing Session...' : initialized ? 'Unlock MESA OS' : 'Initialize MESA Owner Account'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-cyan-500/15 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Encrypted Server Vault • HttpOnly Session • Private SQLite DB</span>
        </div>
      </div>
    </div>
  );
};
