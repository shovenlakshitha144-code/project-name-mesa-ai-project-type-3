import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getDataDir } from '../db.js';
import type { AuthenticatedRequest } from '../security.js';
import type { InvoiceLineItem } from '../../shared/types.js';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function createDataRouter(db: DatabaseSync): Router {
  const router = Router();

  const uid = (req: AuthenticatedRequest) => req.user!.id;

  // ---------------- DASHBOARD SUMMARY & NOTIFICATIONS ----------------
  router.get('/dashboard/summary', (req: AuthenticatedRequest, res) => {
    const userId = uid(req);
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);

    const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>;
    const reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>;
    const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>;
    const projects = db.prepare('SELECT * FROM business_projects WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>;
    const customers = db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE user_id = ?').get(userId) as { cnt: number };
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>;
    const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>;

    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const pendingTasks = tasks.filter((t) => t.status !== 'completed').length;
    const overdueTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.due_date && String(t.due_date).slice(0, 10) < todayStr
    );

    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalExpense = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const unpaidInvoices = invoices.filter((inv) => inv.doc_type === 'invoice' && (inv.status === 'sent' || inv.status === 'overdue'));
    const unpaidAmount = unpaidInvoices.reduce((sum, inv) => {
      const items = safeJsonParse<InvoiceLineItem[]>(inv.items_json, []);
      const sub = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
      const afterDisc = Math.max(0, sub - Number(inv.discount || 0));
      return sum + afterDisc * (1 + Number(inv.tax_rate || 0) / 100);
    }, 0);

    const activeProjects = projects.filter((p) => ['planning', 'in_progress', 'review'].includes(String(p.status))).length;
    const completedProjects = projects.filter((p) => p.status === 'completed').length;
    const pendingProjects = projects.filter((p) => p.status === 'pending' || p.status === 'on_hold').length;

    const notifications: Array<{ id: string; level: 'info' | 'warning' | 'urgent'; title: string; detail: string; module: string }> = [];

    for (const t of overdueTasks.slice(0, 5)) {
      notifications.push({
        id: `task-${t.id}`,
        level: 'urgent',
        title: `Overdue Task: ${t.title}`,
        detail: `Due ${String(t.due_date).slice(0, 10)}`,
        module: 'personal',
      });
    }

    for (const r of reminders.filter((rem) => rem.status === 'pending' && String(rem.remind_at) <= nowIso).slice(0, 5)) {
      notifications.push({
        id: `rem-${r.id}`,
        level: 'warning',
        title: `Reminder Due: ${r.title}`,
        detail: String(r.remind_at),
        module: 'personal',
      });
    }

    for (const p of projects.filter((pr) => pr.status !== 'completed' && pr.deadline && String(pr.deadline) <= new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10)).slice(0, 5)) {
      notifications.push({
        id: `proj-${p.id}`,
        level: 'warning',
        title: `Project Deadline Approaching: ${p.title}`,
        detail: `Deadline ${p.deadline}`,
        module: 'business',
      });
    }

    for (const inv of unpaidInvoices.filter((i) => String(i.due_date) < todayStr).slice(0, 5)) {
      notifications.push({
        id: `inv-${inv.id}`,
        level: 'urgent',
        title: `Overdue Invoice ${inv.invoice_number}`,
        detail: `Client: ${inv.customer_name} • Due ${inv.due_date}`,
        module: 'business',
      });
    }

    res.json({
      personal: {
        totalTasks: tasks.length,
        completedTasks,
        pendingTasks,
        overdueTasks: overdueTasks.length,
        pendingReminders: reminders.filter((r) => r.status === 'pending').length,
        activeGoals: goals.filter((g) => g.status === 'active').length,
        avgGoalProgress: goals.length
          ? Math.round(goals.reduce((s, g) => s + Number(g.progress || 0), 0) / goals.length)
          : 0,
      },
      business: {
        totalCustomers: Number(customers.cnt),
        totalProjects: projects.length,
        activeProjects,
        completedProjects,
        pendingProjects,
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
        unpaidInvoicesCount: unpaidInvoices.length,
        unpaidAmount,
      },
      notifications,
    });
  });

  // ---------------- TASKS ----------------
  router.get('/tasks', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        dueDate: r.due_date,
        category: r.category,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/tasks', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Task title is required.' });
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const status = String(req.body?.status || 'todo');
    db.prepare(
      `INSERT INTO tasks (id, user_id, title, description, priority, status, due_date, category, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      title,
      String(req.body?.description || ''),
      String(req.body?.priority || 'medium'),
      status,
      req.body?.dueDate || null,
      String(req.body?.category || 'General'),
      status === 'completed' ? now : null,
      now
    );
    res.status(201).json({ id });
  });

  router.patch('/tasks/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const nextStatus = String(req.body?.status ?? existing.status);
    const completedAt =
      nextStatus === 'completed'
        ? (existing.completed_at as string | null) || new Date().toISOString()
        : null;

    db.prepare(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, status = ?, due_date = ?, category = ?, completed_at = ? WHERE id = ? AND user_id = ?`
    ).run(
      String(req.body?.title ?? existing.title),
      String(req.body?.description ?? existing.description),
      String(req.body?.priority ?? existing.priority),
      nextStatus,
      req.body?.dueDate !== undefined ? (req.body.dueDate ? String(req.body.dueDate) : null) : (existing.due_date ? String(existing.due_date) : null),
      String(req.body?.category ?? existing.category),
      completedAt,
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/tasks/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- REMINDERS ----------------
  router.get('/reminders', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        notes: r.notes,
        remindAt: r.remind_at,
        repeat: r.repeat,
        status: r.status,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/reminders', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const remindAt = String(req.body?.remindAt || '').trim();
    if (!title || !remindAt) {
      res.status(400).json({ error: 'Title and remindAt are required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO reminders (id, user_id, title, notes, remind_at, repeat, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, uid(req), title, String(req.body?.notes || ''), remindAt, String(req.body?.repeat || 'none'), new Date().toISOString());
    res.status(201).json({ id });
  });

  router.patch('/reminders/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }
    db.prepare('UPDATE reminders SET title = ?, notes = ?, remind_at = ?, repeat = ?, status = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.title ?? existing.title),
      String(req.body?.notes ?? existing.notes),
      String(req.body?.remindAt ?? existing.remind_at),
      String(req.body?.repeat ?? existing.repeat),
      String(req.body?.status ?? existing.status),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/reminders/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- CALENDAR ----------------
  router.get('/calendar', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_at ASC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        startAt: r.start_at,
        endAt: r.end_at,
        type: r.type,
        location: r.location,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/calendar', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const startAt = String(req.body?.startAt || '').trim();
    if (!title || !startAt) {
      res.status(400).json({ error: 'Event title and startAt are required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO calendar_events (id, user_id, title, description, start_at, end_at, type, location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      title,
      String(req.body?.description || ''),
      startAt,
      String(req.body?.endAt || startAt),
      String(req.body?.type || 'schedule'),
      String(req.body?.location || ''),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.delete('/calendar/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- NOTES ----------------
  router.get('/notes', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        tags: safeJsonParse<string[]>(r.tags_json, []),
        pinned: Boolean(r.pinned),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  });

  router.post('/notes', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Note title is required.' });
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO notes (id, user_id, title, content, tags_json, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      title,
      String(req.body?.content || ''),
      JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []),
      req.body?.pinned ? 1 : 0,
      now,
      now
    );
    res.status(201).json({ id });
  });

  router.patch('/notes/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    db.prepare('UPDATE notes SET title = ?, content = ?, tags_json = ?, pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.title ?? existing.title),
      String(req.body?.content ?? existing.content),
      req.body?.tags ? JSON.stringify(req.body.tags) : String(existing.tags_json),
      req.body?.pinned !== undefined ? (req.body.pinned ? 1 : 0) : Number(existing.pinned),
      new Date().toISOString(),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/notes/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- GOALS ----------------
  router.get('/goals', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        targetDate: r.target_date,
        progress: Number(r.progress),
        status: r.status,
        milestones: safeJsonParse<string[]>(r.milestones_json, []),
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/goals', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Goal title is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO goals (id, user_id, title, description, target_date, progress, status, milestones_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      title,
      String(req.body?.description || ''),
      req.body?.targetDate || null,
      Math.max(0, Math.min(100, Number(req.body?.progress || 0))),
      String(req.body?.status || 'active'),
      JSON.stringify(Array.isArray(req.body?.milestones) ? req.body.milestones : []),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.patch('/goals/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }
    const progress = req.body?.progress !== undefined ? Math.max(0, Math.min(100, Number(req.body.progress))) : Number(existing.progress);
    const status = req.body?.status ?? (progress === 100 ? 'completed' : existing.status);
    db.prepare('UPDATE goals SET title = ?, description = ?, target_date = ?, progress = ?, status = ?, milestones_json = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.title ?? existing.title),
      String(req.body?.description ?? existing.description),
      req.body?.targetDate !== undefined ? (req.body.targetDate ? String(req.body.targetDate) : null) : (existing.target_date ? String(existing.target_date) : null),
      progress,
      String(status),
      req.body?.milestones ? JSON.stringify(req.body.milestones) : String(existing.milestones_json),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/goals/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- MEMORIES ----------------
  router.get('/memories', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM memories WHERE user_id = ? ORDER BY importance DESC, updated_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        content: r.content,
        importance: Number(r.importance),
        source: r.source,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  });

  router.post('/memories', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title || !content) {
      res.status(400).json({ error: 'Memory title and content are required.' });
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO memories (id, user_id, category, title, content, importance, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      String(req.body?.category || 'preference'),
      title,
      content,
      Math.max(1, Math.min(5, Number(req.body?.importance || 3))),
      String(req.body?.source || 'manual'),
      now,
      now
    );
    res.status(201).json({ id });
  });

  router.patch('/memories/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM memories WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    db.prepare('UPDATE memories SET category = ?, title = ?, content = ?, importance = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.category ?? existing.category),
      String(req.body?.title ?? existing.title),
      String(req.body?.content ?? existing.content),
      Math.max(1, Math.min(5, Number(req.body?.importance ?? existing.importance))),
      new Date().toISOString(),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/memories/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- CUSTOMERS ----------------
  router.get('/customers', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        company: r.company,
        email: r.email,
        phone: r.phone,
        address: r.address,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/customers', (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Customer name is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO customers (id, user_id, name, company, email, phone, address, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      name,
      String(req.body?.company || ''),
      String(req.body?.email || ''),
      String(req.body?.phone || ''),
      String(req.body?.address || ''),
      String(req.body?.status || 'active'),
      String(req.body?.notes || ''),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.patch('/customers/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    db.prepare('UPDATE customers SET name = ?, company = ?, email = ?, phone = ?, address = ?, status = ?, notes = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.name ?? existing.name),
      String(req.body?.company ?? existing.company),
      String(req.body?.email ?? existing.email),
      String(req.body?.phone ?? existing.phone),
      String(req.body?.address ?? existing.address),
      String(req.body?.status ?? existing.status),
      String(req.body?.notes ?? existing.notes),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/customers/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- BUSINESS PROJECTS ----------------
  router.get('/projects', (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, c.name as customer_name
         FROM business_projects p
         LEFT JOIN customers c ON p.customer_id = c.id
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC`
      )
      .all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        customerId: r.customer_id,
        customerName: r.customer_name || '',
        description: r.description,
        status: r.status,
        priority: r.priority,
        budget: Number(r.budget),
        startDate: r.start_date,
        deadline: r.deadline,
        deliverables: safeJsonParse(r.deliverables_json, []),
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/projects', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Project title is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO business_projects (id, user_id, title, customer_id, description, status, priority, budget, start_date, deadline, deliverables_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      title,
      req.body?.customerId || null,
      String(req.body?.description || ''),
      String(req.body?.status || 'planning'),
      String(req.body?.priority || 'medium'),
      Number(req.body?.budget || 0),
      req.body?.startDate || null,
      req.body?.deadline || null,
      JSON.stringify(Array.isArray(req.body?.deliverables) ? req.body.deliverables : []),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.patch('/projects/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM business_projects WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    db.prepare(
      `UPDATE business_projects SET title = ?, customer_id = ?, description = ?, status = ?, priority = ?, budget = ?, start_date = ?, deadline = ?, deliverables_json = ? WHERE id = ? AND user_id = ?`
    ).run(
      String(req.body?.title ?? existing.title),
      req.body?.customerId !== undefined ? (req.body.customerId ? String(req.body.customerId) : null) : (existing.customer_id ? String(existing.customer_id) : null),
      String(req.body?.description ?? existing.description),
      String(req.body?.status ?? existing.status),
      String(req.body?.priority ?? existing.priority),
      req.body?.budget !== undefined ? Number(req.body.budget) : Number(existing.budget),
      req.body?.startDate !== undefined ? (req.body.startDate ? String(req.body.startDate) : null) : (existing.start_date ? String(existing.start_date) : null),
      req.body?.deadline !== undefined ? (req.body.deadline ? String(req.body.deadline) : null) : (existing.deadline ? String(existing.deadline) : null),
      req.body?.deliverables ? JSON.stringify(req.body.deliverables) : String(existing.deliverables_json),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/projects/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM business_projects WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- INCOME & EXPENSES ----------------
  router.get('/transactions', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        category: r.category,
        amount: Number(r.amount),
        currency: r.currency,
        description: r.description,
        date: r.date,
        paymentMethod: r.payment_method,
        projectId: r.project_id,
        invoiceId: r.invoice_id,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/transactions', (req: AuthenticatedRequest, res) => {
    const type = req.body?.type === 'expense' ? 'expense' : 'income';
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid positive amount is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO transactions (id, user_id, type, category, amount, currency, description, date, payment_method, project_id, invoice_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      type,
      String(req.body?.category || (type === 'income' ? 'Client Payment' : 'Operations')),
      amount,
      String(req.body?.currency || req.user!.currency || 'LKR'),
      String(req.body?.description || ''),
      String(req.body?.date || new Date().toISOString().slice(0, 10)),
      String(req.body?.paymentMethod || 'Bank Transfer'),
      req.body?.projectId || null,
      req.body?.invoiceId || null,
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.delete('/transactions/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- SERVICES ----------------
  router.get('/services', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        basePrice: Number(r.base_price),
        deliveryDays: Number(r.delivery_days),
        active: Boolean(r.active),
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/services', (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Service name is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO services (id, user_id, name, category, description, base_price, delivery_days, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      name,
      String(req.body?.category || 'Digital Creation'),
      String(req.body?.description || ''),
      Number(req.body?.basePrice || 0),
      Number(req.body?.deliveryDays || 7),
      req.body?.active === false ? 0 : 1,
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.patch('/services/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    db.prepare('UPDATE services SET name = ?, category = ?, description = ?, base_price = ?, delivery_days = ?, active = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.name ?? existing.name),
      String(req.body?.category ?? existing.category),
      String(req.body?.description ?? existing.description),
      req.body?.basePrice !== undefined ? Number(req.body.basePrice) : Number(existing.base_price),
      req.body?.deliveryDays !== undefined ? Number(req.body.deliveryDays) : Number(existing.delivery_days),
      req.body?.active !== undefined ? (req.body.active ? 1 : 0) : Number(existing.active),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/services/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM services WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- PRICING TIERS ----------------
  router.get('/pricing', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM pricing_tiers WHERE user_id = ? ORDER BY price ASC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        serviceId: r.service_id,
        billingCycle: r.billing_cycle,
        price: Number(r.price),
        currency: r.currency,
        features: safeJsonParse<string[]>(r.features_json, []),
        popular: Boolean(r.popular),
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/pricing', (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Package name is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO pricing_tiers (id, user_id, name, service_id, billing_cycle, price, currency, features_json, popular, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      name,
      req.body?.serviceId || null,
      String(req.body?.billingCycle || 'one_time'),
      Number(req.body?.price || 0),
      String(req.body?.currency || req.user!.currency || 'LKR'),
      JSON.stringify(Array.isArray(req.body?.features) ? req.body.features : []),
      req.body?.popular ? 1 : 0,
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.delete('/pricing/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM pricing_tiers WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- INVOICES & QUOTATIONS ----------------
  router.get('/invoices', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        docType: r.doc_type,
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        customerAddress: r.customer_address,
        issueDate: r.issue_date,
        dueDate: r.due_date,
        currency: r.currency,
        items: safeJsonParse<InvoiceLineItem[]>(r.items_json, []),
        taxRate: Number(r.tax_rate),
        discount: Number(r.discount),
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/invoices', (req: AuthenticatedRequest, res) => {
    const customerName = String(req.body?.customerName || '').trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!customerName || items.length === 0) {
      res.status(400).json({ error: 'Customer name and at least one line item are required.' });
      return;
    }
    const id = crypto.randomUUID();
    const docType = req.body?.docType === 'quotation' ? 'quotation' : 'invoice';
    const prefix = docType === 'quotation' ? 'SLBSK-QT' : 'SLBSK-INV';
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE user_id = ?').get(uid(req)) as { cnt: number };
    const invoiceNumber =
      String(req.body?.invoiceNumber || '').trim() ||
      `${prefix}-${new Date().getFullYear()}-${String(Number(countRow.cnt) + 1).padStart(4, '0')}`;

    db.prepare(
      `INSERT INTO invoices (id, user_id, invoice_number, doc_type, customer_id, customer_name, customer_email, customer_address, issue_date, due_date, currency, items_json, tax_rate, discount, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      invoiceNumber,
      docType,
      req.body?.customerId || null,
      customerName,
      String(req.body?.customerEmail || ''),
      String(req.body?.customerAddress || ''),
      String(req.body?.issueDate || new Date().toISOString().slice(0, 10)),
      String(req.body?.dueDate || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10)),
      String(req.body?.currency || req.user!.currency || 'LKR'),
      JSON.stringify(items),
      Number(req.body?.taxRate || 0),
      Number(req.body?.discount || 0),
      String(req.body?.status || 'draft'),
      String(req.body?.notes || ''),
      new Date().toISOString()
    );
    res.status(201).json({ id, invoiceNumber });
  });

  router.patch('/invoices/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    const nextStatus = String(req.body?.status ?? existing.status);
    db.prepare('UPDATE invoices SET status = ?, notes = ?, due_date = ? WHERE id = ? AND user_id = ?').run(
      nextStatus,
      String(req.body?.notes ?? existing.notes),
      String(req.body?.dueDate ?? existing.due_date),
      String(req.params.id),
      uid(req)
    );

    if (req.body?.recordIncome === true && nextStatus === 'paid' && existing.status !== 'paid') {
      const items = safeJsonParse<InvoiceLineItem[]>(existing.items_json, []);
      const sub = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
      const total = Math.max(0, sub - Number(existing.discount || 0)) * (1 + Number(existing.tax_rate || 0) / 100);
      if (total > 0) {
        db.prepare(
          `INSERT INTO transactions (id, user_id, type, category, amount, currency, description, date, payment_method, project_id, invoice_id, created_at)
           VALUES (?, ?, 'income', 'Invoice Payment', ?, ?, ?, ?, 'Bank Transfer', NULL, ?, ?)`
        ).run(
          crypto.randomUUID(),
          uid(req),
          total,
          String(existing.currency),
          `Payment for ${existing.invoice_number} (${existing.customer_name})`,
          new Date().toISOString().slice(0, 10),
          String(existing.id),
          new Date().toISOString()
        );
      }
    }

    res.json({ ok: true });
  });

  router.delete('/invoices/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- CUSTOMER DOCUMENTS ----------------
  router.get('/documents', (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT d.*, c.name as customer_name
         FROM customer_documents d
         LEFT JOIN customers c ON d.customer_id = c.id
         WHERE d.user_id = ?
         ORDER BY d.created_at DESC`
      )
      .all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        customerName: r.customer_name || '',
        projectId: r.project_id,
        title: r.title,
        docType: r.doc_type,
        fileName: r.file_name,
        mimeType: r.mime_type,
        sizeBytes: Number(r.size_bytes),
        notes: r.notes,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/documents', (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const fileName = path.basename(String(req.body?.fileName || 'document.txt').trim());
    const contentBase64 = String(req.body?.contentBase64 || '');
    if (!title) {
      res.status(400).json({ error: 'Document title is required.' });
      return;
    }

    const id = crypto.randomUUID();
    const uploadDir = path.join(getDataDir(), 'uploads', uid(req));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
    }

    const buffer = contentBase64
      ? Buffer.from(contentBase64, 'base64')
      : Buffer.from(String(req.body?.notes || title), 'utf8');

    if (buffer.byteLength > 10 * 1024 * 1024) {
      res.status(413).json({ error: 'File exceeds 10MB limit.' });
      return;
    }

    const safeDiskName = `${id}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storedPath = path.join(uploadDir, safeDiskName);
    fs.writeFileSync(storedPath, buffer);

    db.prepare(
      `INSERT INTO customer_documents (id, user_id, customer_id, project_id, title, doc_type, file_name, stored_path, mime_type, size_bytes, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      req.body?.customerId || null,
      req.body?.projectId || null,
      title,
      String(req.body?.docType || 'other'),
      fileName,
      storedPath,
      String(req.body?.mimeType || 'application/octet-stream'),
      buffer.byteLength,
      String(req.body?.notes || ''),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.get('/documents/:id/download', (req: AuthenticatedRequest, res) => {
    const doc = db
      .prepare('SELECT * FROM customer_documents WHERE id = ? AND user_id = ?')
      .get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const storedPath = String(doc.stored_path);
    if (!fs.existsSync(storedPath)) {
      res.status(404).json({ error: 'Stored file missing on disk' });
      return;
    }
    res.setHeader('Content-Type', String(doc.mime_type || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `attachment; filename="${String(doc.file_name).replace(/"/g, '')}"`);
    fs.createReadStream(storedPath).pipe(res);
  });

  router.delete('/documents/:id', (req: AuthenticatedRequest, res) => {
    const doc = db
      .prepare('SELECT stored_path FROM customer_documents WHERE id = ? AND user_id = ?')
      .get(String(req.params.id), uid(req)) as { stored_path: string } | undefined;
    if (doc?.stored_path && fs.existsSync(doc.stored_path)) {
      fs.unlinkSync(doc.stored_path);
    }
    db.prepare('DELETE FROM customer_documents WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- MARKETING CAMPAIGNS ----------------
  router.get('/campaigns', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM marketing_campaigns WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        channel: r.channel,
        status: r.status,
        budget: Number(r.budget),
        spent: Number(r.spent),
        targetAudience: r.target_audience,
        startDate: r.start_date,
        endDate: r.end_date,
        notes: r.notes,
        createdAt: r.created_at,
      }))
    );
  });

  router.post('/campaigns', (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Campaign name is required.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO marketing_campaigns (id, user_id, name, channel, status, budget, spent, target_audience, start_date, end_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      uid(req),
      name,
      String(req.body?.channel || 'facebook'),
      String(req.body?.status || 'planned'),
      Number(req.body?.budget || 0),
      Number(req.body?.spent || 0),
      String(req.body?.targetAudience || ''),
      req.body?.startDate || null,
      req.body?.endDate || null,
      String(req.body?.notes || ''),
      new Date().toISOString()
    );
    res.status(201).json({ id });
  });

  router.patch('/campaigns/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND user_id = ?').get(String(req.params.id), uid(req)) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    db.prepare('UPDATE marketing_campaigns SET status = ?, spent = ?, notes = ? WHERE id = ? AND user_id = ?').run(
      String(req.body?.status ?? existing.status),
      req.body?.spent !== undefined ? Number(req.body.spent) : Number(existing.spent),
      String(req.body?.notes ?? existing.notes),
      String(req.params.id),
      uid(req)
    );
    res.json({ ok: true });
  });

  router.delete('/campaigns/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM marketing_campaigns WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- CONTENT DRAFTS ----------------
  router.get('/content-drafts', (req: AuthenticatedRequest, res) => {
    const rows = db.prepare('SELECT * FROM content_drafts WHERE user_id = ? ORDER BY created_at DESC').all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        language: r.language,
        topic: r.topic,
        tone: r.tone,
        generatedText: r.generated_text,
        createdAt: r.created_at,
      }))
    );
  });

  router.delete('/content-drafts/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM content_drafts WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  // ---------------- WORKSPACE JSON BACKUP EXPORT ----------------
  router.get('/export', (req: AuthenticatedRequest, res) => {
    const userId = uid(req);
    const tables = [
      'memories',
      'tasks',
      'reminders',
      'calendar_events',
      'notes',
      'goals',
      'customers',
      'business_projects',
      'transactions',
      'services',
      'pricing_tiers',
      'invoices',
      'marketing_campaigns',
      'content_drafts',
    ];
    const exportObj: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      owner: req.user?.displayName,
      organization: req.user?.organization,
    };
    for (const table of tables) {
      exportObj[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).all(userId);
    }
    res.setHeader('Content-Disposition', `attachment; filename="mesa-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportObj);
  });

  return router;
}
