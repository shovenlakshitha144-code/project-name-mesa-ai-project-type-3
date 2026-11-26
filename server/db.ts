import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: DatabaseSync | null = null;

export function getDataDir(): string {
  const dbPath = process.env.MESA_DB_PATH || path.resolve(process.cwd(), 'data', 'mesa.sqlite');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) return dbInstance;

  const dbPath = customPath || process.env.MESA_DB_PATH || path.resolve(process.cwd(), 'data', 'mesa.sqlite');
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  initSchema(db);

  if (!customPath || customPath === ':memory:') {
    dbInstance = db;
  }
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT 'SLBSK DIGITAL CREATION',
      role TEXT NOT NULL DEFAULT 'Owner',
      preferred_language TEXT NOT NULL DEFAULT 'auto',
      currency TEXT NOT NULL DEFAULT 'LKR',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      active_provider TEXT NOT NULL DEFAULT 'gemini',
      active_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
      custom_base_url TEXT NOT NULL DEFAULT '',
      ollama_base_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
      temperature REAL NOT NULL DEFAULT 0.7,
      system_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_vault (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 3,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      expression TEXT,
      actions_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      remind_at TEXT NOT NULL,
      repeat TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'schedule',
      location TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      target_date TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      milestones_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning',
      priority TEXT NOT NULL DEFAULT 'medium',
      budget REAL NOT NULL DEFAULT 0,
      start_date TEXT,
      deadline TEXT,
      deliverables_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'LKR',
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
      project_id TEXT REFERENCES business_projects(id) ON DELETE SET NULL,
      invoice_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Digital Services',
      description TEXT NOT NULL DEFAULT '',
      base_price REAL NOT NULL DEFAULT 0,
      delivery_days INTEGER NOT NULL DEFAULT 7,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_tiers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'one_time',
      price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'LKR',
      features_json TEXT NOT NULL DEFAULT '[]',
      popular INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'invoice',
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'LKR',
      items_json TEXT NOT NULL DEFAULT '[]',
      tax_rate REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES business_projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'other',
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'facebook',
      status TEXT NOT NULL DEFAULT 'planned',
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      target_audience TEXT NOT NULL DEFAULT '',
      start_date TEXT,
      end_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'auto',
      topic TEXT NOT NULL,
      tone TEXT NOT NULL DEFAULT 'Professional & Futuristic',
      generated_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
