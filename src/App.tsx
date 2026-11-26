import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Brain,
  Briefcase,
  CalendarCheck,
  DownloadCloud,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { apiRequest } from './lib/api';
import { AuthGate } from './components/AuthGate';
import { ChatAssistantView } from './components/ChatAssistantView';
import { PersonalAssistantView } from './components/PersonalAssistantView';
import { SlbskBusinessView } from './components/SlbskBusinessView';
import { ContentStudioView } from './components/ContentStudioView';
import { MemoryManagerView } from './components/MemoryManagerView';
import { SettingsView } from './components/SettingsView';
import type { AIProviderStatus, AuthState, UserProfile } from '../shared/types';

type WorkspaceSection = 'companion' | 'personal' | 'business' | 'content' | 'memory' | 'settings';

interface DashboardSummary {
  notifications: Array<{
    id: string;
    level: 'info' | 'warning' | 'urgent';
    title: string;
    detail: string;
    module: string;
  }>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [section, setSection] = useState<WorkspaceSection>('companion');
  const [aiStatus, setAiStatus] = useState<AIProviderStatus | null>(null);
  const [notifications, setNotifications] = useState<DashboardSummary['notifications']>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
    };
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const status = await apiRequest<AuthState>('/api/auth/status');
      setAuth(status);
    } catch {
      setAuth({ initialized: true, authenticated: false, user: null });
    }
  }, []);

  const refreshContext = useCallback(async () => {
    if (!auth?.authenticated) return;
    try {
      const [ai, summary] = await Promise.all([
        apiRequest<AIProviderStatus>('/api/ai/config'),
        apiRequest<DashboardSummary>('/api/dashboard/summary'),
      ]);
      setAiStatus(ai);
      setNotifications(summary.notifications || []);
    } catch {
      // offline fallback handled gracefully
    }
  }, [auth?.authenticated]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext, refreshSignal]);

  const handleAuthenticated = (user: UserProfile) => {
    setAuth({ initialized: true, authenticated: true, user });
    setRefreshSignal((s) => s + 1);
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setAuth({ initialized: true, authenticated: false, user: null });
  };

  const triggerPWAInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (!auth) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#040814] text-cyan-300 text-sm">
        Initializing MESA AI Core...
      </div>
    );
  }

  if (!auth.authenticated || !auth.user) {
    return <AuthGate initialized={auth.initialized} onAuthenticated={handleAuthenticated} />;
  }

  const navItems: Array<{ id: WorkspaceSection; label: string; short: string; icon: React.ReactNode }> = [
    { id: 'companion', label: 'MESA Companion', short: 'MESA', icon: <MessageSquareText className="w-4 h-4" /> },
    { id: 'personal', label: 'Personal Hub', short: 'Personal', icon: <CalendarCheck className="w-4 h-4" /> },
    { id: 'business', label: 'SLBSK Business', short: 'SLBSK', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'content', label: 'Content Studio', short: 'Content', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'memory', label: 'Memory Vault', short: 'Memory', icon: <Brain className="w-4 h-4" /> },
    { id: 'settings', label: 'Brain & Security', short: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const user = auth.user;

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row mesa-grid-bg">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col p-4 gap-4 border-r border-cyan-500/15 bg-[#040814]/80 backdrop-blur-xl no-print">
        <div className="mesa-glass rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 font-black text-base shadow-lg shadow-cyan-500/30">
              M
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">MESA AI 2.0</div>
              <div className="text-[10px] uppercase tracking-widest text-cyan-400 truncate max-w-[140px]">
                {user.organization}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition cursor-pointer ${
                section === item.id
                  ? 'bg-gradient-to-r from-cyan-500/25 to-blue-600/20 text-cyan-200 border border-cyan-400/40 shadow-md shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mesa-glass-soft rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Owner</span>
            <span className="text-white font-semibold">{user.displayName}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full py-2 rounded-xl bg-slate-900/80 hover:bg-rose-500/15 hover:text-rose-200 text-slate-300 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Lock Workspace
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="px-4 sm:px-6 py-3 border-b border-cyan-500/15 bg-[#040814]/75 backdrop-blur-xl flex items-center justify-between gap-3 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl mesa-glass-soft text-slate-200"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-semibold text-white">
                {navItems.find((n) => n.id === section)?.label}
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Welcome back, {user.displayName} • {user.organization}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">
            {installPrompt && (
              <button
                type="button"
                onClick={() => void triggerPWAInstall()}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}

            <span
              className={`px-2.5 py-1.5 rounded-xl text-[11px] flex items-center gap-1.5 border ${
                online
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
              }`}
            >
              {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{online ? 'Online' : 'Offline Cache'}</span>
            </span>

            <button
              type="button"
              onClick={() => setShowNotifPanel(!showNotifPanel)}
              className="relative p-2 rounded-xl mesa-glass-soft text-slate-200 hover:text-cyan-300 cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            {showNotifPanel && (
              <div className="absolute right-0 top-12 w-80 mesa-glass rounded-2xl p-4 z-50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Important Notifications</span>
                  <button type="button" onClick={() => setShowNotifPanel(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">All caught up. No urgent alerts.</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setSection(n.module === 'business' ? 'business' : 'personal');
                        setShowNotifPanel(false);
                      }}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/30"
                    >
                      <div className="text-xs font-medium text-cyan-200">{n.title}</div>
                      <div className="text-[11px] text-slate-400">{n.detail}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mesa-glass border-b border-cyan-500/20 p-3 space-y-1 no-print">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm flex items-center gap-3 ${
                  section === item.id ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-300'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm text-rose-300 flex items-center gap-3"
            >
              <LogOut className="w-4 h-4" /> Lock Workspace
            </button>
          </div>
        )}

        {/* Active Module Content */}
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 overflow-y-auto">
          {section === 'companion' && (
            <ChatAssistantView
              user={user}
              aiStatus={aiStatus}
              onOpenSettings={() => setSection('settings')}
              onDataMutated={() => setRefreshSignal((s) => s + 1)}
            />
          )}
          {section === 'personal' && (
            <PersonalAssistantView
              refreshSignal={refreshSignal}
              onDataMutated={() => setRefreshSignal((s) => s + 1)}
            />
          )}
          {section === 'business' && (
            <SlbskBusinessView
              user={user}
              refreshSignal={refreshSignal}
              onDataMutated={() => setRefreshSignal((s) => s + 1)}
            />
          )}
          {section === 'content' && (
            <ContentStudioView user={user} onOpenSettings={() => setSection('settings')} />
          )}
          {section === 'memory' && <MemoryManagerView />}
          {section === 'settings' && (
            <SettingsView
              user={user}
              aiStatus={aiStatus}
              onUserUpdated={(u) => setAuth({ initialized: true, authenticated: true, user: u })}
              onAIUpdated={(status) => setAiStatus(status)}
            />
          )}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-[#040814]/90 backdrop-blur-xl border-t border-cyan-500/20 px-2 py-1.5 flex justify-around z-30 no-print">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] ${
                section === item.id ? 'text-cyan-300 font-semibold' : 'text-slate-400'
              }`}
            >
              {item.icon}
              <span>{item.short}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default App;
