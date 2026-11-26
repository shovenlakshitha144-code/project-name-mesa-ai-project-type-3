import React, { useCallback, useEffect, useState } from 'react';
import { Brain, Edit3, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { MemoryItem } from '../../shared/types';

const CATEGORIES: MemoryItem['category'][] = [
  'business',
  'project',
  'preference',
  'decision',
  'task',
  'conversation',
];

export const MemoryManagerView: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState<MemoryItem['category']>('preference');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState(4);

  const loadMemories = useCallback(async () => {
    const data = await apiRequest<MemoryItem[]>('/api/memories');
    setMemories(data);
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const openNew = () => {
    setEditing(null);
    setCategory('preference');
    setTitle('');
    setContent('');
    setImportance(4);
    setShowForm(true);
  };

  const openEdit = (m: MemoryItem) => {
    setEditing(m);
    setCategory(m.category);
    setTitle(m.title);
    setContent(m.content);
    setImportance(m.importance);
    setShowForm(true);
  };

  const saveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await apiRequest(`/api/memories/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ category, title, content, importance }),
      });
    } else {
      await apiRequest('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ category, title, content, importance, source: 'manual' }),
      });
    }
    setShowForm(false);
    void loadMemories();
  };

  const removeMemory = async (id: string) => {
    await apiRequest(`/api/memories/${id}`, { method: 'DELETE' });
    void loadMemories();
  };

  const filtered = memories.filter((m) => {
    if (filterCat !== 'all' && m.category !== filterCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="mesa-glass rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
            <Brain className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Persistent Neural Memory</h2>
            <p className="text-xs text-slate-400">
              Facts, preferences, business decisions, and context Mesa remembers across all sessions.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-sm flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Memory
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stored memories..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/20 text-sm text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            className={`px-3 py-2 rounded-xl text-xs capitalize cursor-pointer ${
              filterCat === 'all'
                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                : 'mesa-glass-soft text-slate-400'
            }`}
          >
            All ({memories.length})
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilterCat(c)}
              className={`px-3 py-2 rounded-xl text-xs capitalize cursor-pointer ${
                filterCat === c
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                  : 'mesa-glass-soft text-slate-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <form onSubmit={saveMemory} className="mesa-glass rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-cyan-200">
              {editing ? 'Edit Memory' : 'Store New Memory'}
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoryItem['category'])}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Client pricing rule"
                className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Importance (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={importance}
                onChange={(e) => setImportance(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Memory Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={3}
              placeholder="Write the exact preference, decision, or project context Mesa should remember..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl mesa-glass-soft text-xs text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              {editing ? 'Update Memory' : 'Save Memory'}
            </button>
          </div>
        </form>
      )}

      {/* Memory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filtered.map((m) => (
          <div key={m.id} className="mesa-glass rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                  {m.category}
                </span>
                <div className="flex items-center gap-0.5 text-amber-400">
                  {Array.from({ length: m.importance }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-current" />
                  ))}
                </div>
              </div>
              <h4 className="text-sm font-semibold text-white">{m.title}</h4>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
              <span>Source: {m.source} • {new Date(m.updatedAt).toLocaleDateString()}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  className="text-slate-400 hover:text-cyan-300 p-1 cursor-pointer"
                  title="Edit"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void removeMemory(m.id)}
                  className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full mesa-glass rounded-2xl p-8 text-center text-sm text-slate-400">
            No matching memories found.
          </div>
        )}
      </div>
    </div>
  );
};
