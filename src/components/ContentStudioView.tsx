import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import type { ContentDraft, LanguageMode, UserProfile } from '../../shared/types';

interface ContentStudioViewProps {
  user: UserProfile;
  onOpenSettings: () => void;
}

const PLATFORMS: Array<{ id: ContentDraft['platform']; label: string }> = [
  { id: 'facebook_post', label: 'Facebook Post' },
  { id: 'instagram_caption', label: 'Instagram Caption' },
  { id: 'tiktok_caption', label: 'TikTok Caption' },
  { id: 'youtube_description', label: 'YouTube Description' },
  { id: 'ad_script', label: 'Advertisement Script' },
  { id: 'business_promotion', label: 'Business Promotion' },
  { id: 'ai_video_prompt', label: 'AI Video Prompt' },
  { id: 'content_ideas', label: 'Social Media Content Ideas' },
];

export const ContentStudioView: React.FC<ContentStudioViewProps> = ({ user, onOpenSettings }) => {
  const [platform, setPlatform] = useState<ContentDraft['platform']>('facebook_post');
  const [language, setLanguage] = useState<LanguageMode>('mixed');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Futuristic, Executive & Persuasive');
  const [details, setDetails] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<{ msg: string; isConfig?: boolean } | null>(null);
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    const list = await apiRequest<ContentDraft[]>('/api/content-drafts');
    setDrafts(list);
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const created = await apiRequest<ContentDraft>('/api/ai/content', {
        method: 'POST',
        body: JSON.stringify({ platform, language, topic: topic.trim(), tone, details }),
      });
      setDrafts((prev) => [created, ...prev]);
      setTopic('');
      setDetails('');
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ msg: err.message, isConfig: err.code === 'NOT_CONFIGURED' });
      } else {
        setError({ msg: 'Content generation failed.' });
      }
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-5">
      <div className="mesa-glass rounded-3xl p-5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-cyan-300" />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-[0.2em] text-cyan-400 font-semibold">
            {user.organization} WORKSPACE
          </span>
          <h2 className="text-lg font-semibold text-white">AI Content Creation Studio</h2>
        </div>
      </div>

      <form onSubmit={generate} className="mesa-glass rounded-3xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Content Format</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ContentDraft['platform'])}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageMode)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="mixed">Sinhala + English (Mixed)</option>
              <option value="si">Sinhala (සිංහල)</option>
              <option value="en">English</option>
              <option value="auto">Auto</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Brand Tone</label>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Topic / Campaign Brief</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            placeholder="e.g. Promote SLBSK DIGITAL CREATION AI website & branding package for Sri Lankan startups"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Offer, CTA, or Visual Details (Optional)</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Include pricing, WhatsApp CTA, target audience, or cinematic style..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs text-amber-200 flex items-center justify-between gap-3">
            <span>{error.msg}</span>
            {error.isConfig && (
              <button type="button" onClick={onOpenSettings} className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-semibold cursor-pointer">
                Configure AI
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={generating}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Wand2 className="w-4 h-4" />
            {generating ? 'Generating with MESA...' : 'Generate Content'}
          </button>
        </div>
      </form>

      {/* Saved Drafts */}
      <div className="space-y-3">
        {drafts.map((d) => (
          <div key={d.id} className="mesa-glass rounded-3xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                  {PLATFORMS.find((p) => p.id === d.platform)?.label || d.platform}
                </span>
                <span className="ml-2 text-xs text-slate-400">{d.language.toUpperCase()} • {d.topic}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(d.id, d.generatedText)}
                  className="px-3 py-1.5 rounded-lg mesa-glass-soft text-xs text-cyan-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === d.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === d.id ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => void apiRequest(`/api/content-drafts/${d.id}`, { method: 'DELETE' }).then(loadDrafts)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
              {d.generatedText}
            </div>
          </div>
        ))}
        {drafts.length === 0 && (
          <div className="mesa-glass rounded-2xl p-8 text-center text-sm text-slate-400">
            Generated SLBSK posts, scripts, and AI video prompts will appear here.
          </div>
        )}
      </div>
    </div>
  );
};
