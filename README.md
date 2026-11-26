# MESA AI v2.0 — Personal AI Assistant & SLBSK DIGITAL CREATION Business OS

MESA AI v2.0 is a lightweight, futuristic, installable Progressive Web App (PWA) and secure personal & business operating system built for **Shoven** at **SLBSK DIGITAL CREATION**.

## Core Capabilities
- **Animated Female AI Avatar**: Lightweight real-time SVG/CSS/requestAnimationFrame facial animation (short black hair, glasses, professional attire, natural blinking, eye tracking, expressions, and real-time speech lip-sync) with zero heavy 3D overhead.
- **Bilingual AI Brain & Tool Execution**: Natural Sinhala (සිංහල), English, and Sinhala-English mixed conversations with persistent memory injection and real workspace actions (tasks, reminders, calendar, notes, memories, customers, projects, transactions, invoices). Supports **Gemini**, **Groq (Free Tier)**, **OpenRouter**, **Ollama (100% Free Local LLM)**, **OpenAI**, and custom OpenAI-compatible APIs.
- **Voice Assistant**: Speech-to-Text, natural Text-to-Speech (`si-LK` / `en-US`), interruptible speech, continuous conversation mode, microphone VAD energy meter, and `"Hey Mesa"` wake-phrase listener where supported by the browser/OS.
- **Personal Assistant Dashboard**: Daily Hub, Tasks, Reminders, Interactive Calendar, Notes, Personal Goals, Notifications, and real computed Productivity Reports.
- **SLBSK DIGITAL CREATION Business Suite (All 10 Modules)**:
  1. Business Overview
  2. Customer Management
  3. Project Management
  4. Income & Expenses (with CSV Export)
  5. Service Management
  6. Pricing Management
  7. Invoice & Quotation Generation (Print / Save PDF)
  8. Customer Documents (Upload & Download)
  9. Marketing Management
  10. Business Reports
- **SLBSK AI Content Creation Studio**: Facebook posts, Instagram captions, TikTok captions, YouTube descriptions, Ad scripts, Business promotions, AI video prompts, and Content ideas in Sinhala, English, or Mixed.
- **Security & PWA**: `scrypt` password hashing, HMAC-signed `HttpOnly` sessions, AES-256-GCM encrypted server-side API key vault, SQLite persistence (`node:sqlite`), Service Worker app-shell caching, and IndexedDB offline cache.

## Quick Start
```bash
npm install
npm run dev
```
- Frontend Vite dev server: `http://localhost:5173`
- Backend API server: `http://localhost:4000`

## Production Build & Run
```bash
npm run build
npm start
```

## Verification Tests
```bash
npm test
```
