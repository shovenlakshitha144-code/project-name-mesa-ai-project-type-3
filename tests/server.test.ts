import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/index.js';
import { closeDb, getDb } from '../server/db.js';
import { parseAndExecuteMesaResponse } from '../server/ai/tools.js';

let server: http.Server;
let baseUrl: string;
let sessionCookie = '';

async function req(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0];
  }
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, json };
}

beforeAll(async () => {
  process.env.MESA_DB_PATH = ':memory:';
  process.env.MESA_SESSION_SECRET = 'test-session-secret-12345';
  process.env.MESA_VAULT_KEY = 'test-vault-key-12345';
  const app = createApp(':memory:');
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
});

describe('MESA AI v2.0 Security, Business OS & Tool Engine', () => {
  it('blocks unauthenticated requests to private routes', async () => {
    const res1 = await req('/api/tasks');
    const res2 = await req('/api/customers');
    const res3 = await req('/api/ai/config');
    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
    expect(res3.status).toBe(401);
  });

  it('initializes owner account and authenticates session', async () => {
    const statusBefore = await req('/api/auth/status');
    expect((statusBefore.json as { initialized: boolean }).initialized).toBe(false);

    const setup = await req('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'shoven',
        password: 'supersecurepassword',
        displayName: 'Shoven',
        organization: 'SLBSK DIGITAL CREATION',
        currency: 'LKR',
      }),
    });
    expect(setup.status).toBe(201);
    expect(sessionCookie).toContain('mesa_session=');

    const statusAfter = await req('/api/auth/status');
    expect((statusAfter.json as { authenticated: boolean; user: { displayName: string } }).authenticated).toBe(true);
    expect((statusAfter.json as { user: { displayName: string } }).user.displayName).toBe('Shoven');
  });

  it('encrypts API keys in server vault without ever returning plaintext to frontend', async () => {
    const secret = 'AIzaSyTestSecretKeyNeverExpose';
    const putRes = await req('/api/ai/config', {
      method: 'PUT',
      body: JSON.stringify({
        activeProvider: 'gemini',
        activeModel: 'gemini-2.5-flash',
        keyProvider: 'gemini',
        apiKey: secret,
      }),
    });
    expect(putRes.status).toBe(200);
    const bodyText = JSON.stringify(putRes.json);
    expect(bodyText).not.toContain(secret);
    expect((putRes.json as { configuredProviders: { gemini: boolean } }).configuredProviders.gemini).toBe(true);
  });

  it('creates real personal tasks and SLBSK invoices with automatic income ledger recording', async () => {
    const taskRes = await req('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Review SLBSK branding kit', priority: 'high' }),
    });
    expect(taskRes.status).toBe(201);

    const custRes = await req('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Nimal Perera', company: 'Lanka Tech', email: 'nimal@example.com' }),
    });
    expect(custRes.status).toBe(201);

    const invRes = await req('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        docType: 'invoice',
        customerName: 'Nimal Perera',
        items: [{ description: 'AI Website Package', quantity: 1, unitPrice: 85000 }],
      }),
    });
    expect(invRes.status).toBe(201);
    const invoiceId = (invRes.json as { id: string }).id;

    const paidRes = await req(`/api/invoices/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid', recordIncome: true }),
    });
    expect(paidRes.status).toBe(200);

    const summary = await req('/api/dashboard/summary');
    expect(summary.status).toBe(200);
    const data = summary.json as {
      personal: { totalTasks: number };
      business: { totalCustomers: number; totalIncome: number };
    };
    expect(data.personal.totalTasks).toBe(1);
    expect(data.business.totalCustomers).toBe(1);
    expect(data.business.totalIncome).toBe(85000);
  });

  it('executes valid Mesa AI actions and honestly marks unavailable tools', async () => {
    const statusRes = await req('/api/auth/status');
    const user = (statusRes.json as { user: Parameters<typeof parseAndExecuteMesaResponse>[1] }).user;
    const db = getDb();

    const raw = `Sure Shoven! I have added your reminder and noted the unavailable email action.
<mesa_actions>
[
  {"tool":"create_task","title":"Prepare Q4 proposal","priority":"urgent"},
  {"tool":"send_whatsapp_message","to":"client"}
]
</mesa_actions>
<mesa_expression>happy</mesa_expression>`;

    const parsed = parseAndExecuteMesaResponse(db, user, raw);
    expect(parsed.expression).toBe('happy');
    expect(parsed.cleanText).not.toContain('<mesa_actions>');
    expect(parsed.actionsTaken).toHaveLength(2);
    expect(parsed.actionsTaken[0].status).toBe('executed');
    expect(parsed.actionsTaken[1].status).toBe('unavailable');
  });
});
