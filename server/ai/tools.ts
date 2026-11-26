import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AvatarExpression, LanguageMode, UserProfile } from '../../shared/types.js';

export interface MesaActionReceipt {
  tool: string;
  status: 'executed' | 'failed' | 'unavailable';
  summary: string;
}

export function buildMesaSystemPrompt(
  db: DatabaseSync,
  user: UserProfile,
  language: LanguageMode,
  customSystemNotes: string
): string {
  const memories = db
    .prepare('SELECT category, title, content, importance FROM memories WHERE user_id = ? ORDER BY importance DESC, updated_at DESC LIMIT 25')
    .all(user.id) as Array<{ category: string; title: string; content: string; importance: number }>;

  const tasks = db
    .prepare("SELECT id, title, priority, status, due_date FROM tasks WHERE user_id = ? AND status != 'completed' ORDER BY created_at DESC LIMIT 12")
    .all(user.id) as Array<{ id: string; title: string; priority: string; status: string; due_date: string | null }>;

  const reminders = db
    .prepare("SELECT title, remind_at FROM reminders WHERE user_id = ? AND status = 'pending' ORDER BY remind_at ASC LIMIT 8")
    .all(user.id) as Array<{ title: string; remind_at: string }>;

  const projects = db
    .prepare("SELECT title, status, deadline, budget FROM business_projects WHERE user_id = ? AND status != 'completed' ORDER BY created_at DESC LIMIT 10")
    .all(user.id) as Array<{ title: string; status: string; deadline: string | null; budget: number }>;

  const langDirective =
    language === 'si'
      ? 'Respond naturally in Sinhala (සිංහල Unicode script) unless technical terms are clearer in English.'
      : language === 'en'
      ? 'Respond in clear, warm, professional English.'
      : language === 'mixed'
      ? 'Respond naturally in Sinhala-English mixed conversational style (natural Sri Lankan bilingual speech).'
      : 'Match the user’s language automatically: Sinhala (සිංහල), English, or natural Sinhala-English mixed conversation.';

  return `You are MESA (version 2.0), a futuristic, intelligent female personal AI assistant, voice companion, productivity manager, and digital secretary created for ${user.displayName} at ${user.organization}.

IDENTITY & PERSONALITY:
- Warm, sharp, proactive, respectful, and executive-ready.
- You understand ${user.displayName}'s personal workflow and ${user.organization} business operations.
- Currency preference: ${user.currency}. Current UTC date/time: ${new Date().toISOString()}.
- ${langDirective}

STRICT HONESTY & TOOL EXECUTION RULES:
1. NEVER pretend to have completed an action when the required tool or external integration is unavailable (for example: sending emails, WhatsApp messages, phone calls, bank transfers, or browsing external live accounts). If you do not have an integration for an action, clearly explain what is unavailable and offer what you CAN do inside MESA (e.g., draft the message, create a task, record an invoice).
2. To actually execute supported workspace actions in the MESA database, append a JSON array inside <mesa_actions>[...]</mesa_actions> at the very end of your response.
Supported action objects:
- {"tool":"create_task","title":"...","priority":"low|medium|high|urgent","dueDate":"YYYY-MM-DD or null","category":"...","description":"..."}
- {"tool":"complete_task","titleMatch":"..."}
- {"tool":"create_reminder","title":"...","remindAt":"ISO-8601 datetime","notes":"..."}
- {"tool":"create_calendar_event","title":"...","startAt":"ISO-8601","endAt":"ISO-8601","type":"meeting|deadline|personal|schedule","location":"..."}
- {"tool":"create_note","title":"...","content":"...","tags":["..."]}
- {"tool":"save_memory","category":"conversation|business|project|preference|task|decision","title":"...","content":"...","importance":1-5}
- {"tool":"create_customer","name":"...","company":"...","email":"...","phone":"..."}
- {"tool":"create_project","title":"...","status":"planning|in_progress|review|pending","priority":"low|medium|high","budget":0,"deadline":"YYYY-MM-DD or null"}
- {"tool":"record_transaction","type":"income|expense","category":"...","amount":0,"description":"...","date":"YYYY-MM-DD"}
- {"tool":"create_invoice_draft","customerName":"...","docType":"invoice|quotation","items":[{"description":"...","quantity":1,"unitPrice":0}],"notes":"..."}

3. Also include one avatar expression tag at the end: <mesa_expression>happy|neutral|listening|thinking|alert</mesa_expression> matching your response tone.
4. Keep voice-friendly responses concise and natural unless detailed analysis or content is requested.

PERSISTENT MEMORIES:
${memories.length ? memories.map((m) => `- [${m.category}|★${m.importance}] ${m.title}: ${m.content}`).join('\n') : '- No additional memories stored yet.'}

ACTIVE TASKS (${tasks.length}):
${tasks.length ? tasks.map((t) => `- ${t.title} [${t.priority}, ${t.status}${t.due_date ? `, due ${t.due_date}` : ''}]`).join('\n') : '- None'}

UPCOMING REMINDERS (${reminders.length}):
${reminders.length ? reminders.map((r) => `- ${r.title} at ${r.remind_at}`).join('\n') : '- None'}

ACTIVE SLBSK PROJECTS (${projects.length}):
${projects.length ? projects.map((p) => `- ${p.title} [${p.status}, budget ${p.budget} ${user.currency}${p.deadline ? `, deadline ${p.deadline}` : ''}]`).join('\n') : '- None'}

${customSystemNotes ? `OWNER CUSTOM INSTRUCTIONS:\n${customSystemNotes}` : ''}`;
}

export function parseAndExecuteMesaResponse(
  db: DatabaseSync,
  user: UserProfile,
  rawResponse: string
): { cleanText: string; expression: AvatarExpression; actionsTaken: MesaActionReceipt[] } {
  let cleanText = rawResponse;
  let expression: AvatarExpression = 'happy';
  const actionsTaken: MesaActionReceipt[] = [];

  const expMatch = cleanText.match(/<mesa_expression>\s*(neutral|happy|listening|thinking|speaking|alert)\s*<\/mesa_expression>/i);
  if (expMatch) {
    expression = expMatch[1].toLowerCase() as AvatarExpression;
    cleanText = cleanText.replace(expMatch[0], '');
  }

  const actionMatch = cleanText.match(/<mesa_actions>([\s\S]*?)<\/mesa_actions>/i);
  if (actionMatch) {
    cleanText = cleanText.replace(actionMatch[0], '');
    try {
      const parsed = JSON.parse(actionMatch[1].trim());
      if (Array.isArray(parsed)) {
        for (const action of parsed) {
          actionsTaken.push(executeSingleAction(db, user, action));
        }
      }
    } catch {
      actionsTaken.push({
        tool: 'parse_actions',
        status: 'failed',
        summary: 'Assistant emitted malformed action JSON; no database changes applied.',
      });
    }
  }

  return {
    cleanText: cleanText.trim(),
    expression,
    actionsTaken,
  };
}

function executeSingleAction(
  db: DatabaseSync,
  user: UserProfile,
  action: Record<string, unknown>
): MesaActionReceipt {
  const tool = String(action?.tool || 'unknown');
  const now = new Date().toISOString();

  try {
    switch (tool) {
      case 'create_task': {
        const title = String(action.title || '').trim();
        if (!title) return { tool, status: 'failed', summary: 'Missing task title' };
        db.prepare(
          `INSERT INTO tasks (id, user_id, title, description, priority, status, due_date, category, completed_at, created_at)
           VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, NULL, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          title,
          String(action.description || ''),
          String(action.priority || 'medium'),
          action.dueDate ? String(action.dueDate) : null,
          String(action.category || 'General'),
          now
        );
        return { tool, status: 'executed', summary: `Created task "${title}"` };
      }

      case 'complete_task': {
        const match = String(action.titleMatch || '').trim().toLowerCase();
        const tasks = db.prepare("SELECT id, title FROM tasks WHERE user_id = ? AND status != 'completed'").all(user.id) as Array<{ id: string; title: string }>;
        const found = tasks.find((t) => t.title.toLowerCase().includes(match));
        if (!found) return { tool, status: 'failed', summary: `No pending task matching "${match}"` };
        db.prepare("UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ? AND user_id = ?").run(now, found.id, user.id);
        return { tool, status: 'executed', summary: `Completed task "${found.title}"` };
      }

      case 'create_reminder': {
        const title = String(action.title || '').trim();
        const remindAt = String(action.remindAt || '').trim();
        if (!title || !remindAt) return { tool, status: 'failed', summary: 'Missing reminder title or time' };
        db.prepare(
          `INSERT INTO reminders (id, user_id, title, notes, remind_at, repeat, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'none', 'pending', ?)`
        ).run(crypto.randomUUID(), user.id, title, String(action.notes || ''), remindAt, now);
        return { tool, status: 'executed', summary: `Set reminder "${title}" for ${remindAt}` };
      }

      case 'create_calendar_event': {
        const title = String(action.title || '').trim();
        const startAt = String(action.startAt || '').trim();
        if (!title || !startAt) return { tool, status: 'failed', summary: 'Missing event title or startAt' };
        db.prepare(
          `INSERT INTO calendar_events (id, user_id, title, description, start_at, end_at, type, location, created_at)
           VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          title,
          startAt,
          String(action.endAt || startAt),
          String(action.type || 'schedule'),
          String(action.location || ''),
          now
        );
        return { tool, status: 'executed', summary: `Scheduled "${title}" on ${startAt}` };
      }

      case 'create_note': {
        const title = String(action.title || '').trim();
        if (!title) return { tool, status: 'failed', summary: 'Missing note title' };
        db.prepare(
          `INSERT INTO notes (id, user_id, title, content, tags_json, pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          title,
          String(action.content || ''),
          JSON.stringify(Array.isArray(action.tags) ? action.tags : []),
          now,
          now
        );
        return { tool, status: 'executed', summary: `Saved note "${title}"` };
      }

      case 'save_memory': {
        const title = String(action.title || '').trim();
        const content = String(action.content || '').trim();
        if (!title || !content) return { tool, status: 'failed', summary: 'Missing memory title or content' };
        db.prepare(
          `INSERT INTO memories (id, user_id, category, title, content, importance, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'mesa_ai', ?, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          String(action.category || 'conversation'),
          title,
          content,
          Math.max(1, Math.min(5, Number(action.importance || 3))),
          now,
          now
        );
        return { tool, status: 'executed', summary: `Remembered "${title}"` };
      }

      case 'create_customer': {
        const name = String(action.name || '').trim();
        if (!name) return { tool, status: 'failed', summary: 'Missing customer name' };
        db.prepare(
          `INSERT INTO customers (id, user_id, name, company, email, phone, address, status, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, '', 'active', '', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          name,
          String(action.company || ''),
          String(action.email || ''),
          String(action.phone || ''),
          now
        );
        return { tool, status: 'executed', summary: `Added customer "${name}"` };
      }

      case 'create_project': {
        const title = String(action.title || '').trim();
        if (!title) return { tool, status: 'failed', summary: 'Missing project title' };
        db.prepare(
          `INSERT INTO business_projects (id, user_id, title, customer_id, description, status, priority, budget, start_date, deadline, deliverables_json, created_at)
           VALUES (?, ?, ?, NULL, '', ?, ?, ?, ?, ?, '[]', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          title,
          String(action.status || 'planning'),
          String(action.priority || 'medium'),
          Number(action.budget || 0),
          now.slice(0, 10),
          action.deadline ? String(action.deadline) : null,
          now
        );
        return { tool, status: 'executed', summary: `Created SLBSK project "${title}"` };
      }

      case 'record_transaction': {
        const amount = Number(action.amount);
        if (!Number.isFinite(amount) || amount <= 0) return { tool, status: 'failed', summary: 'Invalid amount' };
        const type = action.type === 'expense' ? 'expense' : 'income';
        db.prepare(
          `INSERT INTO transactions (id, user_id, type, category, amount, currency, description, date, payment_method, project_id, invoice_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Bank Transfer', NULL, NULL, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          type,
          String(action.category || (type === 'income' ? 'Client Payment' : 'Operations')),
          amount,
          user.currency,
          String(action.description || ''),
          String(action.date || now.slice(0, 10)),
          now
        );
        return { tool, status: 'executed', summary: `Recorded ${type}: ${amount} ${user.currency}` };
      }

      case 'create_invoice_draft': {
        const customerName = String(action.customerName || '').trim();
        const items = Array.isArray(action.items) ? action.items : [];
        if (!customerName || items.length === 0) return { tool, status: 'failed', summary: 'Missing customer or line items' };
        const docType = action.docType === 'quotation' ? 'quotation' : 'invoice';
        const prefix = docType === 'quotation' ? 'SLBSK-QT' : 'SLBSK-INV';
        const cnt = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE user_id = ?').get(user.id) as { cnt: number };
        const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(Number(cnt.cnt) + 1).padStart(4, '0')}`;
        db.prepare(
          `INSERT INTO invoices (id, user_id, invoice_number, doc_type, customer_id, customer_name, customer_email, customer_address, issue_date, due_date, currency, items_json, tax_rate, discount, status, notes, created_at)
           VALUES (?, ?, ?, ?, NULL, ?, '', '', ?, ?, ?, ?, 0, 0, 'draft', ?, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          invoiceNumber,
          docType,
          customerName,
          now.slice(0, 10),
          new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
          user.currency,
          JSON.stringify(items),
          String(action.notes || ''),
          now
        );
        return { tool, status: 'executed', summary: `Drafted ${invoiceNumber} for ${customerName}` };
      }

      default:
        return {
          tool,
          status: 'unavailable',
          summary: `Tool "${tool}" is not implemented or connected.`,
        };
    }
  } catch (err) {
    return {
      tool,
      status: 'failed',
      summary: err instanceof Error ? err.message : 'Execution error',
    };
  }
}
