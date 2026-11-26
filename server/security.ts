import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { getDataDir } from './db.js';
import type { UserProfile } from '../shared/types.js';

interface RuntimeSecrets {
  sessionSecret: string;
  vaultKeyHex: string;
}

let cachedSecrets: RuntimeSecrets | null = null;

function getSecrets(): RuntimeSecrets {
  if (cachedSecrets) return cachedSecrets;

  const envSession = process.env.MESA_SESSION_SECRET?.trim();
  const envVault = process.env.MESA_VAULT_KEY?.trim();

  if (envSession && envVault) {
    cachedSecrets = {
      sessionSecret: envSession,
      vaultKeyHex: crypto.createHash('sha256').update(envVault).digest('hex'),
    };
    return cachedSecrets;
  }

  const keyFile = path.join(getDataDir(), '.mesa-keys.json');
  let stored: Partial<RuntimeSecrets> = {};
  if (fs.existsSync(keyFile)) {
    try {
      stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    } catch {
      stored = {};
    }
  }

  const sessionSecret = envSession || stored.sessionSecret || crypto.randomBytes(32).toString('hex');
  const vaultKeyHex = envVault
    ? crypto.createHash('sha256').update(envVault).digest('hex')
    : stored.vaultKeyHex || crypto.randomBytes(32).toString('hex');

  if (!stored.sessionSecret || !stored.vaultKeyHex) {
    fs.writeFileSync(keyFile, JSON.stringify({ sessionSecret, vaultKeyHex }, null, 2), { mode: 0o600 });
  }

  cachedSecrets = { sessionSecret, vaultKeyHex };
  return cachedSecrets;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function encryptSecret(plaintext: string): string {
  const { vaultKeyHex } = getSecrets();
  const key = Buffer.from(vaultKeyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) return '';
  const { vaultKeyHex } = getSecrets();
  const key = Buffer.from(vaultKeyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface SessionPayload {
  userId: string;
  username: string;
  exp: number;
}

export function createSessionToken(userId: string, username: string): string {
  const { sessionSecret } = getSecrets();
  const payload: SessionPayload = {
    userId,
    username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const { sessionSecret } = getSecrets();
  const expected = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = 'mesa_session';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

export function requireAuth(getUserById: (id: string) => UserProfile | null) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const user = getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'Session invalid or user not found' });
      return;
    }
    req.user = user;
    next();
  };
}
