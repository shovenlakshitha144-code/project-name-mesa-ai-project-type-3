import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  ListTodo,
  Pin,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  CalendarEvent,
  GoalItem,
  NoteItem,
  ReminderItem,
  TaskItem,
} from '../../shared/types';

type PersonalTab = 'overview' | 'tasks' | 'reminders' | 'calendar' | 'notes' | 'goals' | 'reports';

interface PersonalAssistantViewProps {
  refreshSignal: number;
  onDataMutated: () => void;
}

export const PersonalAssistantView: React.FC<PersonalAssistantViewProps> = ({
  refreshSignal,
  onDataMutated,
}) => {
  const [tab, setTab] = useState<PersonalTab>('overview');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);

  // Form states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskItem['priority']>('medium');
  const [taskDue, setTaskDue] = useState('');
  const [taskCat, setTaskCat] = useState('Personal');

  const [remTitle, setRemTitle] = useState('');
  const [remAt, setRemAt] = useState('');
  const [remRepeat, setRemRepeat] = useState<ReminderItem['repeat']>('none');

  const [evTitle, setEvTitle] = useState('');
  const [evStart, setEvStart] = useState('');
  const [evType, setEvType] = useState<CalendarEvent['type']>('schedule');
  const [evLoc, setEvLoc] = useState('');

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');

  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalMilestones, setGoalMilestones] = useState('');

  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const loadAll = useCallback(async () => {
    const [t, r, e, n, g] = await Promise.all([
      apiRequest<TaskItem[]>('/api/tasks'),
      apiRequest<ReminderItem[]>('/api/reminders'),
      apiRequest<CalendarEvent[]>('/api/calendar'),
      apiRequest<NoteItem[]>('/api/notes'),
      apiRequest<GoalItem[]>('/api/goals'),
    ]);
    setTasks(t);
    setReminders(r);
    setEvents(e);
    setNotes(n);
    setGoals(g);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshSignal]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: taskTitle.trim(),
        priority: taskPriority,
        dueDate: taskDue || null,
        category: taskCat,
      }),
    });
    setTaskTitle('');
    setTaskDue('');
    await loadAll();
    onDataMutated();
  };

  const toggleTask = async (task: TaskItem) => {
    const next = task.status === 'completed' ? 'todo' : 'completed';
    await apiRequest(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
    onDataMutated();
  };

  const deleteTask = async (id: string) => {
    await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' });
    await loadAll();
    onDataMutated();
  };

  const addReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim() || !remAt) return;
    await apiRequest('/api/reminders', {
      method: 'POST',
      body: JSON.stringify({ title: remTitle.trim(), remindAt: remAt, repeat: remRepeat }),
    });
    setRemTitle('');
    setRemAt('');
    await loadAll();
    onDataMutated();
  };

  const dismissReminder = async (id: string) => {
    await apiRequest(`/api/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'dismissed' }),
    });
    await loadAll();
    onDataMutated();
  };

  const deleteReminder = async (id: string) => {
    await apiRequest(`/api/reminders/${id}`, { method: 'DELETE' });
    await loadAll();
    onDataMutated();
  };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim() || !evStart) return;
    await apiRequest('/api/calendar', {
      method: 'POST',
      body: JSON.stringify({
        title: evTitle.trim(),
        startAt: evStart,
        endAt: evStart,
        type: evType,
        location: evLoc,
      }),
    });
    setEvTitle('');
    setEvStart('');
    setEvLoc('');
    await loadAll();
  };

  const deleteEvent = async (id: string) => {
    await apiRequest(`/api/calendar/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    await apiRequest('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: noteTitle.trim(),
        content: noteContent,
        tags: noteTags.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    setNoteTitle('');
    setNoteContent('');
    setNoteTags('');
    await loadAll();
  };

  const togglePinNote = async (note: NoteItem) => {
    await apiRequest(`/api/notes/${note.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    await loadAll();
  };

  const deleteNote = async (id: string) => {
    await apiRequest(`/api/notes/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    await apiRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify({
        title: goalTitle.trim(),
        targetDate: goalTarget || null,
        milestones: goalMilestones.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    setGoalTitle('');
    setGoalTarget('');
    setGoalMilestones('');
    await loadAll();
    onDataMutated();
  };

  const updateGoalProgress = async (id: string, progress: number) => {
    await apiRequest(`/api/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ progress }),
    });
    await loadAll();
    onDataMutated();
  };

  const deleteGoal = async (id: string) => {
    await apiRequest(`/api/goals/${id}`, { method: 'DELETE' });
    await loadAll();
    onDataMutated();
  };

  const requestBrowserNotifications = async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const todaysEvents = events.filter((e) => e.startAt.slice(0, 10) === todayStr);
  const todaysTasks = tasks.filter((t) => t.status !== 'completed' && (!t.dueDate || t.dueDate.slice(0, 10) <= todayStr));

  // Calendar grid helper
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tabs: Array<{ id: PersonalTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Daily Hub', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'tasks', label: `Tasks (${tasks.filter((t) => t.status !== 'completed').length})`, icon: <ListTodo className="w-3.5 h-3.5" /> },
    { id: 'reminders', label: `Reminders (${reminders.filter((r) => r.status === 'pending').length})`, icon: <Bell className="w-3.5 h-3.5" /> },
    { id: 'calendar', label: 'Calendar', icon: <CalendarIcon className="w-3.5 h-3.5" /> },
    { id: 'notes', label: `Notes (${notes.length})`, icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'goals', label: `Goals (${goals.length})`, icon: <Target className="w-3.5 h-3.5" /> },
    { id: 'reports', label: 'Productivity', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ];

  const priorityBadge = (p: TaskItem['priority']) => {
    const styles: Record<TaskItem['priority'], string> = {
      urgent: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
      high: 'bg-amber-500/20 text-amber-300 border-amber-500/35',
      medium: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/35',
      low: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
    };
    return styles[p];
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="mesa-glass rounded-2xl p-2 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              tab === t.id
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:bg-slate-900/70'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW / DAILY SCHEDULE */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 mesa-glass rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Today’s Schedule & Priority Focus</h3>
              <span className="text-xs text-cyan-300">{new Date().toDateString()}</span>
            </div>

            <div className="space-y-2.5">
              {todaysEvents.map((ev) => (
                <div key={ev.id} className="p-3 rounded-2xl mesa-glass-soft flex items-center justify-between">
                  <div>
                    <div className="text-xs text-cyan-300 font-medium">
                      {new Date(ev.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {ev.type}
                    </div>
                    <div className="text-sm font-medium text-white">{ev.title}</div>
                    {ev.location && <div className="text-xs text-slate-400">{ev.location}</div>}
                  </div>
                </div>
              ))}

              {todaysTasks.map((t) => (
                <div key={t.id} className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void toggleTask(t)}
                    className="flex items-center gap-2.5 text-left cursor-pointer"
                  >
                    <Circle className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <div className="text-sm text-white">{t.title}</div>
                      {t.dueDate && <div className="text-[11px] text-slate-400">Due {t.dueDate}</div>}
                    </div>
                  </button>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] border capitalize ${priorityBadge(t.priority)}`}>
                    {t.priority}
                  </span>
                </div>
              ))}

              {todaysEvents.length === 0 && todaysTasks.length === 0 && (
                <p className="text-sm text-slate-400 py-6 text-center">
                  Your schedule for today is clear. Add tasks or calendar blocks to organize your day.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="mesa-glass rounded-3xl p-5">
              <h4 className="text-sm font-semibold text-white mb-3">Pending Reminders</h4>
              <div className="space-y-2">
                {reminders.filter((r) => r.status === 'pending').slice(0, 5).map((r) => (
                  <div key={r.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-cyan-500/15 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-white">{r.title}</div>
                      <div className="text-[11px] text-cyan-300">{new Date(r.remindAt).toLocaleString()}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void dismissReminder(r.id)}
                      className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/15 text-cyan-200 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                ))}
                {reminders.filter((r) => r.status === 'pending').length === 0 && (
                  <p className="text-xs text-slate-500">No active reminders.</p>
                )}
              </div>
            </div>

            <div className="mesa-glass rounded-3xl p-5">
              <h4 className="text-sm font-semibold text-white mb-2">Goal Momentum</h4>
              <div className="space-y-2.5">
                {goals.slice(0, 4).map((g) => (
                  <div key={g.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-200 truncate pr-2">{g.title}</span>
                      <span className="text-cyan-300">{g.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${g.progress}%` }} />
                    </div>
                  </div>
                ))}
                {goals.length === 0 && <p className="text-xs text-slate-500">No personal goals defined yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TASKS */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          <form onSubmit={addTask} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="New task title..."
              required
              className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value as TaskItem['priority'])}
              className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <input
              value={taskCat}
              onChange={(e) => setTaskCat(e.target.value)}
              placeholder="Category"
              className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <button
              type="submit"
              className="sm:col-span-1 py-2.5 px-3 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="mesa-glass rounded-3xl p-4 space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => void toggleTask(t)}
                  className="flex items-center gap-3 text-left flex-1 cursor-pointer"
                >
                  {t.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-cyan-400 shrink-0" />
                  )}
                  <div>
                    <div className={`text-sm ${t.status === 'completed' ? 'line-through text-slate-500' : 'text-white'}`}>
                      {t.title}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {t.category} {t.dueDate ? `• Due ${t.dueDate}` : ''}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] border capitalize ${priorityBadge(t.priority)}`}>
                    {t.priority}
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteTask(t.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No tasks yet.</p>}
          </div>
        </div>
      )}

      {/* REMINDERS */}
      {tab === 'reminders' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void requestBrowserNotifications()}
              className="text-xs px-3 py-1.5 rounded-xl mesa-glass-soft text-cyan-200 cursor-pointer"
            >
              Enable Browser Alerts
            </button>
          </div>
          <form onSubmit={addReminder} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
              placeholder="Reminder message..."
              required
              className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <input
              type="datetime-local"
              value={remAt}
              onChange={(e) => setRemAt(e.target.value)}
              required
              className="sm:col-span-4 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <select
              value={remRepeat}
              onChange={(e) => setRemRepeat(e.target.value as ReminderItem['repeat'])}
              className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="none">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="mesa-glass rounded-3xl p-4 space-y-2">
            {reminders.map((r) => (
              <div key={r.id} className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className={`text-sm font-medium ${r.status === 'dismissed' ? 'line-through text-slate-500' : 'text-white'}`}>
                    {r.title}
                  </div>
                  <div className="text-xs text-cyan-300">
                    {new Date(r.remindAt).toLocaleString()} • {r.repeat}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.status !== 'dismissed' && (
                    <button
                      type="button"
                      onClick={() => void dismissReminder(r.id)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs cursor-pointer"
                    >
                      Dismiss
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteReminder(r.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {reminders.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No reminders scheduled.</p>}
          </div>
        </div>
      )}

      {/* CALENDAR */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <form onSubmit={addEvent} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              value={evTitle}
              onChange={(e) => setEvTitle(e.target.value)}
              placeholder="Event or schedule block..."
              required
              className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <input
              type="datetime-local"
              value={evStart}
              onChange={(e) => setEvStart(e.target.value)}
              required
              className="sm:col-span-3 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <select
              value={evType}
              onChange={(e) => setEvType(e.target.value as CalendarEvent['type'])}
              className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            >
              <option value="schedule">Schedule</option>
              <option value="meeting">Meeting</option>
              <option value="deadline">Deadline</option>
              <option value="personal">Personal</option>
            </select>
            <input
              value={evLoc}
              onChange={(e) => setEvLoc(e.target.value)}
              placeholder="Location / Link"
              className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <button
              type="submit"
              className="sm:col-span-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 mesa-glass rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setCalMonth(new Date(year, month - 1, 1))}
                  className="px-3 py-1 rounded-lg mesa-glass-soft text-xs cursor-pointer"
                >
                  Prev
                </button>
                <h4 className="text-sm font-semibold text-white">
                  {calMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h4>
                <button
                  type="button"
                  onClick={() => setCalMonth(new Date(year, month + 1, 1))}
                  className="px-3 py-1 rounded-lg mesa-glass-soft text-xs cursor-pointer"
                >
                  Next
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-16 rounded-xl bg-slate-950/30" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = events.filter((ev) => ev.startAt.slice(0, 10) === dateKey);
                  const dayTasks = tasks.filter((t) => t.dueDate?.slice(0, 10) === dateKey);
                  const isToday = dateKey === todayStr;
                  return (
                    <div
                      key={day}
                      className={`h-16 p-1.5 rounded-xl border text-xs flex flex-col justify-between overflow-hidden ${
                        isToday
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                          : 'bg-slate-900/50 border-slate-800/70 text-slate-300'
                      }`}
                    >
                      <span className="font-semibold text-[11px]">{day}</span>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 1).map((ev) => (
                          <div key={ev.id} className="truncate text-[10px] px-1 rounded bg-blue-500/25 text-blue-200">
                            {ev.title}
                          </div>
                        ))}
                        {dayTasks.slice(0, 1).map((t) => (
                          <div key={t.id} className="truncate text-[10px] px-1 rounded bg-cyan-500/25 text-cyan-200">
                            • {t.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mesa-glass rounded-3xl p-4 space-y-2.5">
              <h4 className="text-sm font-semibold text-white">Upcoming Events</h4>
              {events.map((ev) => (
                <div key={ev.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white">{ev.title}</div>
                    <div className="text-[11px] text-cyan-300">{new Date(ev.startAt).toLocaleString()}</div>
                    {ev.location && <div className="text-[11px] text-slate-400">{ev.location}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteEvent(ev.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {events.length === 0 && <p className="text-xs text-slate-500">No events scheduled.</p>}
            </div>
          </div>
        </div>
      )}

      {/* NOTES */}
      {tab === 'notes' && (
        <div className="space-y-4">
          <form onSubmit={addNote} className="mesa-glass rounded-3xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title..."
                required
                className="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
              />
              <input
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
                placeholder="Tags (comma separated)"
                className="px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
              />
            </div>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
              placeholder="Write ideas, meeting notes, or personal checklists..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs cursor-pointer">
                Save Note
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {notes.map((n) => (
              <div key={n.id} className="mesa-glass rounded-2xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white">{n.title}</h4>
                    <button
                      type="button"
                      onClick={() => void togglePinNote(n)}
                      className={`p-1 cursor-pointer ${n.pinned ? 'text-cyan-400' : 'text-slate-500'}`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">{n.content}</p>
                  {n.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {n.tags.map((tg) => (
                        <span key={tg} className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/15 text-cyan-300">
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-[11px] text-slate-500">
                  <span>{new Date(n.updatedAt).toLocaleDateString()}</span>
                  <button type="button" onClick={() => void deleteNote(n.id)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GOALS */}
      {tab === 'goals' && (
        <div className="space-y-4">
          <form onSubmit={addGoal} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="Personal goal..."
              required
              className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <input
              type="date"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              className="sm:col-span-3 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <input
              value={goalMilestones}
              onChange={(e) => setGoalMilestones(e.target.value)}
              placeholder="Milestones (comma separated)"
              className="sm:col-span-3 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
            <button
              type="submit"
              className="sm:col-span-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map((g) => (
              <div key={g.id} className="mesa-glass rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{g.title}</h4>
                    {g.targetDate && <span className="text-[11px] text-cyan-300">Target: {g.targetDate}</span>}
                  </div>
                  <button type="button" onClick={() => void deleteGoal(g.id)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-cyan-300 font-semibold">{g.progress}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={g.progress}
                    onChange={(e) => void updateGoalProgress(g.id, Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
                {g.milestones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {g.milestones.map((m, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-300">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRODUCTIVITY REPORTS (REAL COMPUTED METRICS) */}
      {tab === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="mesa-glass rounded-3xl p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Task Completion Rate</div>
            <div className="text-3xl font-bold text-cyan-300 mt-2">{completionRate}%</div>
            <p className="text-xs text-slate-400 mt-1">
              {completedTasks} of {tasks.length} total tasks completed
            </p>
            <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${completionRate}%` }} />
            </div>
          </div>

          <div className="mesa-glass rounded-3xl p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Priority Breakdown</div>
            <div className="space-y-2 mt-3">
              {(['urgent', 'high', 'medium', 'low'] as const).map((p) => {
                const count = tasks.filter((t) => t.priority === p && t.status !== 'completed').length;
                return (
                  <div key={p} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-slate-300">{p}</span>
                    <span className="font-semibold text-white">{count} open</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mesa-glass rounded-3xl p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Goal & Schedule Summary</div>
            <div className="space-y-2 mt-3 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Active Goals</span>
                <span className="font-semibold text-white">{goals.filter((g) => g.status === 'active').length}</span>
              </div>
              <div className="flex justify-between">
                <span>Average Goal Progress</span>
                <span className="font-semibold text-cyan-300">
                  {goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Calendar Events</span>
                <span className="font-semibold text-white">{events.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Saved Notes</span>
                <span className="font-semibold text-white">{notes.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
