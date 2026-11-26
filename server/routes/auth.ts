import { Router } from 'express';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  createSessionToken,
  hashPassword,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifySessionToken,
  type AuthenticatedRequest,
} from '../security.js';
import type { UserProfile } from '../../shared/types.js';

export function mapUserRow(row: Record<string, unknown> | undefined): UserProfile | null {
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    organization: String(row.organization),
    role: String(row.role),
    preferredLanguage: String(row.preferred_language) as UserProfile['preferredLanguage'],
    currency: String(row.currency),
    createdAt: String(row.created_at),
  };
}

export function getUserById(db: DatabaseSync, id: string): UserProfile | null {
  const row = db
    .prepare(
      'SELECT id, username, display_name, organization, role, preferred_language, currency, created_at FROM users WHERE id = ?'
    )
    .get(id) as Record<string, unknown> | undefined;
  return mapUserRow(row);
}

export function createAuthRouter(db: DatabaseSync): Router {
  const router = Router();

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: '/',
  };

  router.get('/status', (req, res) => {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    const initialized = Number(countRow.cnt) > 0;
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    const payload = verifySessionToken(token);
    const user = payload ? getUserById(db, payload.userId) : null;
    res.json({
      initialized,
      authenticated: Boolean(user),
      user,
    });
  });

  router.post('/setup', (req, res) => {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    if (Number(countRow.cnt) > 0) {
      res.status(409).json({ error: 'Workspace owner is already initialized. Please sign in.' });
      return;
    }

    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || 'Shoven').trim();
    const organization = String(req.body?.organization || 'SLBSK DIGITAL CREATION').trim();
    const preferredLanguage = String(req.body?.preferredLanguage || 'auto');
    const currency = String(req.body?.currency || 'LKR').trim().toUpperCase();

    if (username.length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, organization, role, preferred_language, currency, created_at)
       VALUES (?, ?, ?, ?, ?, 'Owner', ?, ?, ?)`
    ).run(id, username, passwordHash, displayName, organization, preferredLanguage, currency, now);

    const defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'gemini';
    const defaultModel = process.env.DEFAULT_AI_MODEL || 'gemini-2.5-flash';
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    db.prepare(
      `INSERT INTO ai_settings (user_id, active_provider, active_model, custom_base_url, ollama_base_url, temperature, system_notes, updated_at)
       VALUES (?, ?, ?, '', ?, 0.7, '', ?)`
    ).run(id, defaultProvider, defaultModel, ollamaUrl, now);

    // Seed initial foundational identity memories for Mesa
    db.prepare(
      `INSERT INTO memories (id, user_id, category, title, content, importance, source, created_at, updated_at)
       VALUES (?, ?, 'business', ?, ?, 5, 'system_init', ?, ?)`
    ).run(
      crypto.randomUUID(),
      id,
      'Owner & Organization Profile',
      `Owner is ${displayName}. Organization is ${organization}. Currency preference is ${currency}.`,
      now,
      now
    );

    const token = createSessionToken(id, username);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions);
    res.status(201).json({ user: getUserById(db, id) });
  });

  router.post('/login', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | Record<string, unknown>
      | undefined;

    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const userId = String(row.id);
    const token = createSessionToken(userId, String(row.username));
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions);
    res.json({ user: mapUserRow(row) });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  router.patch('/profile', (req: AuthenticatedRequest, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const displayName = String(req.body?.displayName ?? row.display_name).trim();
    const organization = String(req.body?.organization ?? row.organization).trim();
    const preferredLanguage = String(req.body?.preferredLanguage ?? row.preferred_language);
    const currency = String(req.body?.currency ?? row.currency).trim().toUpperCase();

    if (req.body?.newPassword) {
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body.newPassword);
      if (!verifyPassword(currentPassword, String(row.password_hash))) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(newPassword),
        payload.userId
      );
    }

    db.prepare(
      `UPDATE users SET display_name = ?, organization = ?, preferred_language = ?, currency = ? WHERE id = ?`
    ).run(displayName, organization, preferredLanguage, currency, payload.userId);

    res.json({ user: getUserById(db, payload.userId) });
  });

  return router;
}
