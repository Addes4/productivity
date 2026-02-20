# Productivity Planner

A local-first weekly planner that converts activity goals into scheduled calendar blocks. The UI is in Swedish.

## Features

- **Auto-scheduling** — define goals with constraints (priority, session length, preferred time, location, travel buffer, allowed weekdays) and let the planner fill your week
- **Manual bookings** — add one-off or recurring bookings directly in the calendar
- **Recurring events** — move or delete individual instances without touching the whole series
- **Drag-and-drop** — reschedule both planned blocks and bookings; concurrency and sleep-window constraints are enforced
- **Calendar import** — `.ics` file import or Google Calendar OAuth sync
- **Weekly report** — mark blocks as done/partial/missed and view a weekly outcome summary

## Tech Stack

React 18 · TypeScript · Vite 5 · Tailwind CSS · date-fns · @dnd-kit/core · Node.js (backend proxy)

## Getting Started

### Frontend only

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

### Frontend + Google Calendar sync

Run each in a separate terminal:

```bash
# Terminal A — backend proxy
cp .env.server.example .env.server
# fill in Google credentials (see below)
npm run dev:server

# Terminal B — frontend
npm run dev
```

Vite proxies all `/api/*` requests to `http://127.0.0.1:8787`.

## Google Calendar Setup

1. Create a Google Cloud project and enable **Google Calendar API**.
2. Create an OAuth 2.0 Client ID (Web application).
3. Add authorized redirect URI: `http://localhost:8787/api/google-calendar/auth/callback`
4. Fill in `.env.server`:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8787/api/google-calendar/auth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=   # long random secret for AES-256-GCM token storage
```

If your OAuth consent screen is in testing mode, add your Google account as a test user.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend dev server |
| `npm run dev:server` | Start Google OAuth proxy |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build |

## Scheduling Behavior

Implemented in `src/utils/planWeek.ts`.

- Week starts on Monday.
- Locked blocks in the current week are preserved; unlocked blocks are regenerated.
- Blocked intervals are built from: calendar events, locked planned blocks, travel buffers, sleep window (including cross-midnight), and work-hour boundaries (if enabled).
- Goals are sorted by priority (high → low), then by shorter session length first.
- Slots are scored by preferred time of day and fit quality.
- **Gym rule:** max one gym session per day (global cap).
- If `sessionsPerWeek` is set on a goal, that count overrides the minutes-derived count.
- **Minimum Viable Day mode:** if a full session doesn't fit, the planner tries 10-minute mini-sessions before reporting a conflict.

## Concurrency and Drag-and-Drop Rules

- Maximum **4 simultaneous items** in any time slot — enforced on create, edit, and drag.
- Overlapping items render at shared widths (1/2, 1/3, 1/4) so all remain visible.
- Drag targets are day+hour cells; moves are constrained to grid hours `06:00–22:00`.
- Dragging a recurring booking instance adds an exception to the parent series and creates a detached one-off event.

## Data Persistence

| Layer | Storage |
|---|---|
| Frontend | `localStorage` key `productivity-app-state` |
| Google tokens | `server/data/google-connections.json` (AES-256-GCM encrypted, gitignored) |
| Full backup | Export/import app state as JSON |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci && npm run build` on every push to `main` and on pull requests.

## Troubleshooting

**`ECONNREFUSED` on `/api/*` calls** — the backend proxy is not running. Start it with `npm run dev:server`.

**"Google OAuth is not configured"** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` are missing from `.env.server`.

**Google 403: Calendar API not enabled** — enable Google Calendar API in your Google Cloud project.

**Google 403: access denied / app not verified** — add your account as a test user in the OAuth consent screen settings.

## Contributing

- Keep features local-first; only involve the backend when strictly necessary.
- Preserve the 4-concurrent-item guard unless intentionally redesigning concurrency handling.
- When changing calendar logic, validate edge cases: all-day events, cross-midnight windows, and recurrence exceptions.
