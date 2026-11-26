import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Ear,
  MessageSquarePlus,
  Mic,
  MicOff,
  Radio,
  Send,
  Settings,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import { MesaAvatar } from './MesaAvatar';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import type {
  AIProviderStatus,
  AvatarExpression,
  ChatMessage,
  ChatThread,
  LanguageMode,
  UserProfile,
} from '../../shared/types';

interface ChatAssistantViewProps {
  user: UserProfile;
  aiStatus: AIProviderStatus | null;
  onOpenSettings: () => void;
  onDataMutated: () => void;
}

const QUICK_PROMPTS = [
  { label: 'Daily Briefing', text: 'Give me a concise executive briefing of my active tasks, upcoming reminders, and SLBSK projects today.' },
  { label: 'සිංහලෙන් කතා කරමු', text: 'ආයුබෝවන් මේසා, අද මගේ දවසේ වැඩ ටික සැලසුම් කරන්න උදව් කරන්න.' },
  { label: 'Singlish Task', text: 'Mata ada urgent task ekak add karanna: Client proposal eka review karanna.' },
  { label: 'SLBSK Growth Idea', text: 'Suggest 3 practical ways SLBSK DIGITAL CREATION can win high-value clients this month.' },
];

export const ChatAssistantView: React.FC<ChatAssistantViewProps> = ({
  user,
  aiStatus,
  onOpenSettings,
  onDataMutated,
}) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<LanguageMode>(user.preferredLanguage || 'auto');
  const [isThinking, setIsThinking] = useState(false);
  const [expression, setExpression] = useState<AvatarExpression>('happy');
  const [errorBanner, setErrorBanner] = useState<{ message: string; isConfig?: boolean } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const list = await apiRequest<ChatThread[]>('/api/ai/threads');
      setThreads(list);
      if (list.length > 0 && !activeThreadId) {
        setActiveThreadId(list[0].id);
      }
    } catch {
      // handled gracefully
    }
  }, [activeThreadId]);

  const loadMessages = useCallback(async (tid: string) => {
    if (!tid) {
      setMessages([]);
      return;
    }
    try {
      const msgs = await apiRequest<ChatMessage[]>(`/api/ai/threads/${tid}/messages`);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  const voice = useVoiceAssistant({
    language,
    onTranscriptReady: (transcript) => {
      void sendMessageRef.current(transcript);
    },
  });

  const handleSend = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || isThinking) return;

      setInput('');
      setErrorBanner(null);
      voice.interruptSpeech();

      const optimisticUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        threadId: activeThreadId,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);
      setIsThinking(true);
      setExpression('thinking');

      try {
        const res = await apiRequest<{
          threadId: string;
          userMessage: ChatMessage;
          assistantMessage: ChatMessage;
        }>('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            threadId: activeThreadId || undefined,
            message: text,
            language,
          }),
        });

        setActiveThreadId(res.threadId);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUserMsg.id),
          res.userMessage,
          res.assistantMessage,
        ]);
        setExpression(res.assistantMessage.expression || 'happy');
        void loadThreads();

        if (res.assistantMessage.actionsTaken?.some((a) => a.status === 'executed')) {
          onDataMutated();
        }

        voice.speakText(res.assistantMessage.content);
      } catch (err) {
        setExpression('alert');
        if (err instanceof ApiError) {
          setErrorBanner({
            message: err.message,
            isConfig: err.code === 'NOT_CONFIGURED',
          });
        } else {
          setErrorBanner({ message: 'Failed to contact AI brain.' });
        }
      } finally {
        setIsThinking(false);
      }
    },
    [activeThreadId, input, isThinking, language, loadThreads, onDataMutated, voice]
  );

  sendMessageRef.current = handleSend;

  const createNewThread = () => {
    setActiveThreadId('');
    setMessages([]);
    setExpression('happy');
    setErrorBanner(null);
  };

  const deleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await apiRequest(`/api/ai/threads/${id}`, { method: 'DELETE' });
    if (activeThreadId === id) {
      setActiveThreadId('');
      setMessages([]);
    }
    void loadThreads();
  };

  const activeProviderConfigured = aiStatus
    ? aiStatus.configuredProviders[aiStatus.activeProvider]
    : false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-[calc(100dvh-7.5rem)]">
      {/* LEFT PANEL: Animated MESA Avatar & Voice Console */}
      <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4">
        <div className="mesa-glass rounded-3xl p-5 flex flex-col items-center relative overflow-hidden">
          <div className="w-full flex items-center justify-between mb-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                MESA NEURAL CORE
              </span>
              <h2 className="text-sm font-medium text-slate-300">
                Digital Secretary • {user.organization}
              </h2>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                activeProviderConfigured
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {activeProviderConfigured
                ? `${aiStatus?.activeProvider.toUpperCase()} Live`
                : 'AI Key Needed'}
            </span>
          </div>

          <MesaAvatar
            expression={voice.isListening ? 'listening' : expression}
            isSpeaking={voice.isSpeaking}
            isListening={voice.isListening}
            isThinking={isThinking}
            speechEnergy={voice.speechEnergy}
            micLevel={voice.micLevel}
          />

          {/* Voice Control Deck */}
          <div className="w-full mt-4 space-y-3">
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={voice.isListening ? voice.stopListening : voice.startListening}
                className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  voice.isListening
                    ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/35'
                    : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/30'
                }`}
              >
                {voice.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {voice.isListening ? 'Stop Listening' : 'Speak to Mesa'}
              </button>

              {voice.isSpeaking && (
                <button
                  type="button"
                  onClick={voice.interruptSpeech}
                  title="Interrupt Mesa's speech"
                  className="py-2.5 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/35 text-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop
                </button>
              )}

              <button
                type="button"
                onClick={() => voice.setVoiceOutputEnabled(!voice.voiceOutputEnabled)}
                title={voice.voiceOutputEnabled ? 'Mute voice output' : 'Enable voice output'}
                className="p-2.5 rounded-xl mesa-glass-soft text-slate-300 hover:text-cyan-300 cursor-pointer"
              >
                {voice.voiceOutputEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>

            {voice.interimTranscript && (
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-100">
                “{voice.interimTranscript}”
              </div>
            )}

            {/* Toggles: Wake Word "Hey Mesa" & Continuous Mode */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => voice.setWakeWordEnabled(!voice.wakeWordEnabled)}
                disabled={!voice.speechRecognitionSupported}
                className={`p-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer disabled:opacity-40 ${
                  voice.wakeWordEnabled
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Ear className="w-3.5 h-3.5" />
                “Hey Mesa”: {voice.wakeWordEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => voice.setContinuousMode(!voice.continuousMode)}
                disabled={!voice.speechRecognitionSupported}
                className={`p-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer disabled:opacity-40 ${
                  voice.continuousMode
                    ? 'bg-blue-500/20 border-blue-400/50 text-blue-200'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Continuous: {voice.continuousMode ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Language & Voice selectors */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageMode)}
                className="px-2.5 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-xs text-slate-200 focus:outline-none"
              >
                <option value="auto">Lang: Auto</option>
                <option value="en">English</option>
                <option value="si">Sinhala (සිංහල)</option>
                <option value="mixed">Sinhala + English</option>
              </select>

              <select
                value={voice.selectedVoiceURI}
                onChange={(e) => voice.setSelectedVoiceURI(e.target.value)}
                className="px-2.5 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-xs text-slate-200 focus:outline-none truncate"
              >
                <option value="">Voice: Auto Natural</option>
                {voice.availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            {voice.voiceStatusNote && (
              <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
                {voice.voiceStatusNote}
              </p>
            )}
          </div>
        </div>

        {/* Conversation Threads */}
        <div className="mesa-glass rounded-3xl p-4 flex-1 min-h-[180px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Conversation History
            </h3>
            <button
              type="button"
              onClick={createNewThread}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs flex items-center gap-1 cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
          <div className="space-y-1.5 overflow-y-auto max-h-52 pr-1">
            {threads.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No saved threads yet.</p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
                    activeThreadId === t.id
                      ? 'bg-cyan-500/20 border border-cyan-400/35 text-cyan-100'
                      : 'hover:bg-slate-900/70 text-slate-400'
                  }`}
                >
                  <span className="truncate pr-2">{t.title}</span>
                  <button
                    type="button"
                    onClick={(e) => deleteThread(t.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Conversation & Action Stream */}
      <div className="lg:col-span-8 xl:col-span-8 mesa-glass rounded-3xl flex flex-col overflow-hidden min-h-[540px]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-cyan-500/15 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">
              MESA Conversational Workspace
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              • Context-aware memory & live workspace actions
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs px-3 py-1.5 rounded-lg mesa-glass-soft text-cyan-200 hover:border-cyan-400/50 flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Configure AI Model
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <p className="text-lg font-medium text-cyan-100">
                Ayubowan {user.displayName}. I am MESA.
              </p>
              <p className="text-sm text-slate-400 max-w-lg mt-2">
                Ask me anything in Sinhala, English, or mixed Singlish. I can organize your tasks, set reminders, remember key facts, manage SLBSK projects, record income/expenses, and draft invoices.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6 max-w-2xl w-full">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    onClick={() => void handleSend(qp.text)}
                    className="text-left p-3 rounded-2xl mesa-glass-soft hover:border-cyan-400/45 transition cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-cyan-300">{qp.label}</div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">{qp.text}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-cyan-500/25 to-blue-600/25 border border-cyan-400/35 text-white'
                    : 'bg-slate-900/80 border border-slate-700/60 text-slate-100'
                }`}
              >
                {msg.content}
              </div>

              {msg.actionsTaken && msg.actionsTaken.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-[85%]">
                  {msg.actionsTaken.map((act, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${
                        act.status === 'executed'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {act.summary}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex items-start">
              <div className="bg-slate-900/80 border border-cyan-500/25 rounded-2xl px-4 py-3 text-sm text-cyan-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                MESA is reasoning...
              </div>
            </div>
          )}

          {errorBanner && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/35 text-sm text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <span>{errorBanner.message}</span>
              </div>
              {errorBanner.isConfig && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-semibold text-xs shrink-0 cursor-pointer"
                >
                  Open AI Brain Setup
                </button>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="p-3.5 sm:p-4 border-t border-cyan-500/15 bg-slate-950/40"
        >
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message MESA in English, සිංහල, or Singlish..."
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-900/80 border border-cyan-500/20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold text-sm flex items-center gap-1.5 transition disabled:opacity-40 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
