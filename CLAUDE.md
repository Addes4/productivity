# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (port 5173)
npm run dev

# Backend Google Calendar proxy (port 8787) — required for Google Calendar sync
npm run dev:server

# Production build (runs tsc typecheck first, then vite build)
npm run build

# Preview production build
npm run preview
```

No lint or test scripts are configured.

## Architecture

This is a Swedish-language weekly productivity planner built with React 18 + TypeScript + Vite + Tailwind CSS.

### State Management

All app state lives in a single custom hook `src/store/useStore.ts`. No Redux or Zustand — just `useState`/`useCallback`/`useEffect`. State is automatically persisted to `localStorage` (key: `productivity-app-state`, version 1). On first load it falls back to demo data from `src/data/demoData.ts`. All type definitions are in `src/types.ts`.

`App.tsx` is the single orchestrator: it calls `useStore`, owns modal/selection UI state, and passes everything down via props. There are no context providers.

### Scheduling Engine

`src/utils/planWeek.ts` exports a pure function `planWeek(goals, events, existingBlocks, settings, weekStart, minimumViableDay)` that:
1. Preserves locked blocks, regenerates unlocked ones
2. Builds blocked intervals per day (sleep, work hours, calendar events, travel buffers)
3. Sorts goals: high priority first, then shorter session first
4. Scores available slots via `slotScore()` (preferred time-of-day + fit)
5. Places sessions greedily; uses 10-min mini-sessions when `minimumViableDay` is on

### Recurring Events

Parent events are stored once with `recurrenceDays: DayOfWeek[]`. `expandCalendarEventsForWeek()` in `src/utils/recurringEvents.ts` produces virtual instances at render time. Exceptions are stored as `recurrenceExDates: string[]` (format: `"yyyy-MM-dd"`). Dragging a recurring instance adds an exception to the parent and creates a detached one-off event.

### Overlap Layout

`src/utils/overlapLayout.ts` uses a sweep-line algorithm to assign column positions for concurrent events, capped at 4 simultaneous items, resulting in fractional widths (1/2, 1/3, 1/4).

### Backend Proxy

`server/googleCalendarProxy.mjs` is a plain Node.js ESM server that handles Google OAuth 2.0 and proxies Google Calendar API calls. Refresh tokens are stored AES-256-GCM encrypted in `server/data/google-connections.json` (gitignored). Vite proxies all `/api/*` requests to `http://127.0.0.1:8787`.

Backend environment variables (see `.env.server.example`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `CALENDAR_SERVER_PORT` (default 8787), `FRONTEND_ORIGIN` (default `http://localhost:5173`).

### Path Alias

Use `@/` to import from `src/` — e.g., `import { Foo } from '@/components/Foo'`.

### TypeScript

Strict mode is enabled with `noUnusedLocals` and `noUnusedParameters`. Fix all type errors before committing — `npm run build` will fail on type errors.
