import { Router } from 'express';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { encryptSecret, type AuthenticatedRequest } from '../security.js';
import { AIConfigError, callAIModel, getAIStatusForClient, type ChatTurn } from '../ai/providers.js';
import { buildMesaSystemPrompt, parseAndExecuteMesaResponse } from '../ai/tools.js';
import type { AIProviderId, LanguageMode } from '../../shared/types.js';

export function createAIRouter(db: DatabaseSync): Router {
  const router = Router();
  const uid = (req: AuthenticatedRequest) => req.user!.id;

  // ---------------- AI CONFIG (NEVER EXPOSES KEYS) ----------------
  router.get('/config', (req: AuthenticatedRequest, res) => {
    res.json(getAIStatusForClient(db, uid(req)));
  });

  router.put('/config', (req: AuthenticatedRequest, res) => {
    const userId = uid(req);
    const now = new Date().toISOString();
    const activeProvider = String(req.body?.activeProvider || 'gemini') as AIProviderId;
    const activeModel = String(req.body?.activeModel || 'gemini-2.5-flash').trim();
    const customBaseUrl = String(req.body?.customBaseUrl || '').trim();
    const ollamaBaseUrl = String(req.body?.ollamaBaseUrl || 'http://localhost:11434').trim();
    const temperature = Math.max(0, Math.min(2, Number(req.body?.temperature ?? 0.7)));
    const systemNotes = String(req.body?.systemNotes || '');

    db.prepare(
      `INSERT INTO ai_settings (user_id, active_provider, active_model, custom_base_url, ollama_base_url, temperature, system_notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         active_provider = excluded.active_provider,
         active_model = excluded.active_model,
         custom_base_url = excluded.custom_base_url,
         ollama_base_url = excluded.ollama_base_url,
         temperature = excluded.temperature,
         system_notes = excluded.system_notes,
         updated_at = excluded.updated_at`
    ).run(userId, activeProvider, activeModel, customBaseUrl, ollamaBaseUrl, temperature, systemNotes, now);

    const apiKeyInput = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const keyProvider = (req.body?.keyProvider as AIProviderId) || activeProvider;
    if (apiKeyInput) {
      db.prepare(
        `INSERT INTO api_vault (id, user_id, provider, encrypted_key, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, provider) DO UPDATE SET
           encrypted_key = excluded.encrypted_key,
           updated_at = excluded.updated_at`
      ).run(crypto.randomUUID(), userId, keyProvider, encryptSecret(apiKeyInput), now);
    }

    if (req.body?.clearKeyProvider) {
      db.prepare('DELETE FROM api_vault WHERE user_id = ? AND provider = ?').run(userId, String(req.body.clearKeyProvider));
    }

    res.json(getAIStatusForClient(db, userId));
  });

  router.post('/test', async (req: AuthenticatedRequest, res) => {
    try {
      const result = await callAIModel(db, uid(req), [
        { role: 'system', content: 'You are MESA AI. Reply with a single brief confirmation sentence.' },
        { role: 'user', content: 'Confirm online status.' },
      ]);
      res.json({ ok: true, provider: result.provider, model: result.model, reply: result.text });
    } catch (err) {
      const code = err instanceof AIConfigError ? err.code : 'PROVIDER_ERROR';
      res.status(code === 'NOT_CONFIGURED' ? 400 : 502).json({
        ok: false,
        code,
        error: err instanceof Error ? err.message : 'AI connection test failed.',
      });
    }
  });

  // ---------------- CONVERSATION THREADS ----------------
  router.get('/threads', (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC')
      .all(uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        language: r.language,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  });

  router.post('/threads', (req: AuthenticatedRequest, res) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = String(req.body?.title || 'New Conversation').trim();
    const language = String(req.body?.language || req.user!.preferredLanguage || 'auto');
    db.prepare(
      `INSERT INTO chat_threads (id, user_id, title, language, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, uid(req), title, language, now, now);
    res.status(201).json({ id, title, language, createdAt: now, updatedAt: now });
  });

  router.delete('/threads/:id', (req: AuthenticatedRequest, res) => {
    db.prepare('DELETE FROM chat_threads WHERE id = ? AND user_id = ?').run(String(req.params.id), uid(req));
    res.json({ ok: true });
  });

  router.get('/threads/:id/messages', (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM chat_messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC')
      .all(String(req.params.id), uid(req)) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        threadId: r.thread_id,
        role: r.role,
        content: r.content,
        expression: r.expression || 'neutral',
        actionsTaken: r.actions_json ? JSON.parse(String(r.actions_json)) : [],
        createdAt: r.created_at,
      }))
    );
  });

  // ---------------- LIVE AI CHAT ----------------
  router.post('/chat', async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const userMessage = String(req.body?.message || '').trim();
    const language = (req.body?.language || user.preferredLanguage || 'auto') as LanguageMode;
    let threadId = String(req.body?.threadId || '').trim();

    if (!userMessage) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const now = new Date().toISOString();
    if (!threadId) {
      threadId = crypto.randomUUID();
      const autoTitle = userMessage.length > 44 ? `${userMessage.slice(0, 44)}...` : userMessage;
      db.prepare(
        `INSERT INTO chat_threads (id, user_id, title, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(threadId, user.id, autoTitle, language, now, now);
    } else {
      const existingThread = db.prepare('SELECT id FROM chat_threads WHERE id = ? AND user_id = ?').get(threadId, user.id);
      if (!existingThread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      db.prepare('UPDATE chat_threads SET updated_at = ?, language = ? WHERE id = ?').run(now, language, threadId);
    }

    const userMsgId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO chat_messages (id, thread_id, user_id, role, content, expression, actions_json, created_at)
       VALUES (?, ?, ?, 'user', ?, NULL, NULL, ?)`
    ).run(userMsgId, threadId, user.id, userMessage, now);

    const historyRows = db
      .prepare('SELECT role, content FROM chat_messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 16')
      .all(threadId, user.id) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const settingsRow = db.prepare('SELECT system_notes FROM ai_settings WHERE user_id = ?').get(user.id) as { system_notes?: string } | undefined;
    const systemPrompt = buildMesaSystemPrompt(db, user, language, settingsRow?.system_notes || '');

    const turns: ChatTurn[] = [
      { role: 'system', content: systemPrompt },
      ...historyRows.reverse().map((r) => ({ role: r.role, content: r.content })),
    ];

    try {
      const aiReply = await callAIModel(db, user.id, turns);
      const { cleanText, expression, actionsTaken } = parseAndExecuteMesaResponse(db, user, aiReply.text);
      const assistantNow = new Date().toISOString();
      const assistantMsgId = crypto.randomUUID();

      db.prepare(
        `INSERT INTO chat_messages (id, thread_id, user_id, role, content, expression, actions_json, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`
      ).run(assistantMsgId, threadId, user.id, cleanText, expression, JSON.stringify(actionsTaken), assistantNow);

      res.json({
        threadId,
        provider: aiReply.provider,
        model: aiReply.model,
        userMessage: {
          id: userMsgId,
          threadId,
          role: 'user',
          content: userMessage,
          createdAt: now,
        },
        assistantMessage: {
          id: assistantMsgId,
          threadId,
          role: 'assistant',
          content: cleanText,
          expression,
          actionsTaken,
          createdAt: assistantNow,
        },
      });
    } catch (err) {
      const code = err instanceof AIConfigError ? err.code : 'PROVIDER_ERROR';
      res.status(code === 'NOT_CONFIGURED' ? 400 : 502).json({
        threadId,
        code,
        error: err instanceof Error ? err.message : 'AI generation failed.',
      });
    }
  });

  // ---------------- AI CONTENT STUDIO ----------------
  router.post('/content', async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const platform = String(req.body?.platform || 'facebook_post');
    const language = (req.body?.language || 'auto') as LanguageMode;
    const topic = String(req.body?.topic || '').trim();
    const tone = String(req.body?.tone || 'Futuristic, Executive & Engaging').trim();
    const details = String(req.body?.details || '').trim();

    if (!topic) {
      res.status(400).json({ error: 'Topic or brief is required.' });
      return;
    }

    const platformLabelMap: Record<string, string> = {
      facebook_post: 'Facebook Post (hook, engaging body, call-to-action, hashtags)',
      instagram_caption: 'Instagram Caption (scroll-stopping opening, concise story, emojis, targeted hashtags)',
      tiktok_caption: 'TikTok Caption + Hook Overlay ideas (punchy short-form, viral hashtags)',
      youtube_description: 'YouTube Video Description (SEO summary, timestamps template, links CTA, tags)',
      ad_script: 'Advertisement Script (visual scenes, voiceover lines, 30s/60s pacing, CTA)',
      business_promotion: 'Business Promotion Copy for SLBSK DIGITAL CREATION (value proposition, offer, CTA)',
      ai_video_prompt: 'AI Video Generation Prompt (cinematic camera, lighting, subject, motion, aspect ratio, mood)',
      content_ideas: '10 Strategic Social Media Content Ideas with hooks and formats',
    };

    const langRule =
      language === 'si'
        ? 'Write in natural, modern Sri Lankan Sinhala (සිංහල).'
        : language === 'mixed'
        ? 'Write in engaging Sinhala + English mixed style suitable for modern Sri Lankan digital audiences.'
        : language === 'en'
        ? 'Write in crisp, persuasive English.'
        : 'Choose the best language (English, Sinhala, or Mixed) matching the topic language.';

    const prompt = `Create high-converting content for ${user.organization} (Owner: ${user.displayName}).
Format: ${platformLabelMap[platform] || platform}
Topic/Brief: ${topic}
Tone: ${tone}
Language Instruction: ${langRule}
${details ? `Additional Details / Offer: ${details}` : ''}

Deliver ready-to-publish output without meta-chatter.`;

    try {
      const result = await callAIModel(db, user.id, [
        {
          role: 'system',
          content: `You are MESA Content Director for ${user.organization}, specializing in Sri Lankan and global digital marketing in Sinhala, English, and Singlish.`,
        },
        { role: 'user', content: prompt },
      ]);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO content_drafts (id, user_id, platform, language, topic, tone, generated_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, user.id, platform, language, topic, tone, result.text.trim(), now);

      res.status(201).json({
        id,
        platform,
        language,
        topic,
        tone,
        generatedText: result.text.trim(),
        createdAt: now,
      });
    } catch (err) {
      const code = err instanceof AIConfigError ? err.code : 'PROVIDER_ERROR';
      res.status(code === 'NOT_CONFIGURED' ? 400 : 502).json({
        code,
        error: err instanceof Error ? err.message : 'AI content generation failed.',
      });
    }
  });

  return router;
}
