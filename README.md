# Productivity Planner

A local-first weekly planner that turns high-level activity goals into concrete calendar blocks.

The app combines:

- goal-based auto-scheduling,
- manual and imported calendar bookings,
- recurring booking support,
- drag-and-drop schedule editing,
- overlap-safe rendering,
- and secure Google Calendar sync through a backend OAuth proxy.

The UI language is currently Swedish, but this README is fully in English.

## What It Can Do

### Planning and Scheduling

- Define activity goals with:
  - weekly target minutes,
  - session length,
  - optional `sessions per week`,
  - priority,
  - allowed weekdays,
  - earliest start / latest end,
  - preferred time of day,
  - location (`home`, `gym`, `office`, `any`),
  - travel buffer,
  - fixed vs movable behavior,
  - custom color.
- Auto-plan the current week with conflict reporting.
- Optional fallback mode: **Minimum Viable Day** (10-minute mini sessions).

### Calendar and Events

- Add manual bookings.
- Add weekly recurring bookings with selected weekdays.
- Delete only one instance of a recurring booking (exception date), not the whole series.
- Drag both:
  - planned activity blocks,
  - calendar bookings (manual/import/Google).
- Move recurring instances independently: the parent series gets an exception and a detached one-off event is created.

### Imports and Sync

- Import `.ics` (iCal) files.
- Connect Google Calendar via OAuth 2.0 (no public/private ICS URL required).
- Auto-sync Google events when changing week (once per week key), plus manual sync button.
- Export/import full app state as JSON.

### Visualization and UX

- Weekly grid with all-day row.
- Overlap layout for simultaneous items (half/third/quarter width).
- Hard concurrency cap at **4 simultaneous items**.
- Source-specific event colors (manual/import/google), configurable in settings.
- Short blocks prioritize displaying the activity/event name for readability.

## Tech Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- date-fns
- @dnd-kit/core
- Node.js backend proxy for Google OAuth and Calendar API

## Scripts

From `package.json`:

- `npm run dev` - start frontend (Vite)
- `npm run dev:app` - same as `dev`
- `npm run dev:server` - start Google OAuth proxy (`server/googleCalendarProxy.mjs`)
- `npm run build` - TypeScript build + Vite production build
- `npm run preview` - preview production build

## Quick Start

## 1) Frontend only (no Google)

```bash
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## 2) Frontend + Google sync

Run backend and frontend in separate terminals.

Terminal A:

```bash
cp .env.server.example .env.server
npm run dev:server
```

Terminal B:

```bash
npm run dev
```

Vite proxies `/api/*` to `http://127.0.0.1:8787` (see `vite.config.ts`).

## Google OAuth Setup (Required for Google Sync)

Configure Google Cloud before connecting in the app.

1. Create/select a Google Cloud project.
2. Enable **Google Calendar API**.
3. Create an OAuth 2.0 Client ID (Web application).
4. Add authorized redirect URI:
   - `http://localhost:8787/api/google-calendar/auth/callback`
   - (or your custom `CALENDAR_SERVER_HOST/PORT` if changed)
5. Put values in `.env.server`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY` (long random secret)

If your OAuth consent screen is in testing mode, add your Google account as a test user.

## Core Usage Flow

1. Add bookings in the calendar (`+ Lägg till bokning`) or import `.ics` / Google.
2. Add activity goals in the side panel (`+ Lägg till aktivitet`).
3. Click `Planera veckan` to run auto-scheduling.
4. Click a planned block to mark status (`done`, `partial`, `missed`).
5. Open `Veckorapport` for weekly outcome summary.

## Scheduling Rules (Current Behavior)

Implemented in `src/utils/planWeek.ts` and related utilities.

- Week is normalized to Monday start.
- Locked blocks in the current week are preserved.
- Unlocked current-week blocks are regenerated.
- Blocked time is built from:
  - calendar events,
  - locked planned blocks,
  - travel buffers,
  - sleep window (including cross-midnight),
  - work-hour boundaries (if enabled).
- Goals are sorted by:
  - priority (high -> low),
  - then shorter session length first.
- Slot scoring uses preferred time of day + fit quality.
- If a goal has `sessionsPerWeek`, that count is used; otherwise derived from target minutes.
- **Gym rule:** max one gym session per day (global cap, not based on goal name).
- If not enough room and Minimum Viable Day is on, planner tries 10-minute mini sessions.
- If still not enough room, conflict reports are generated.

## Overlap and Capacity Rules

- Max **4** concurrent items allowed.
- This is enforced when:
  - creating/editing bookings,
  - dragging planned blocks,
  - dragging timed bookings.
- Overlaps are rendered with shared width so all concurrent items remain visible.

## Drag-and-Drop Rules

In `src/components/CalendarGrid.tsx`:

- Drag targets are day+hour cells.
- Moves are constrained to visible grid hours (`06:00` to `22:00`).
- Planned block moves additionally respect sleep-window constraints.
- Event moves respect concurrency cap and weekly recurrence exception logic.

## Data Persistence

### Browser (frontend)

- Stored in `localStorage` under key: `productivity-app-state`.
- Full app state is persisted automatically.

### Backend (Google)

- Refresh tokens are encrypted at rest (AES-256-GCM with key derived from `GOOGLE_TOKEN_ENCRYPTION_KEY`).
- Stored in:
  - `server/data/google-connections.json`
- This folder is gitignored (`server/data/`).

## Security Notes

- Google client secret is kept server-side only.
- Frontend talks to backend through `/api/*`.
- OAuth return URL is sanitized to configured frontend origin.
- Cookies used for OAuth/session are `HttpOnly` with `SameSite=Lax`.

## Project Structure

- `src/App.tsx` - app orchestration, modals, imports, Google flow wiring
- `src/store/useStore.ts` - central state CRUD, persistence hooks, planner trigger
- `src/utils/planWeek.ts` - scheduling engine
- `src/utils/overlapLayout.ts` - overlap grouping/layout + concurrency detection
- `src/utils/recurringEvents.ts` - recurring event expansion per week
- `src/utils/icsImport.ts` - iCal parser
- `src/components/CalendarGrid.tsx` - calendar rendering + DnD logic
- `src/components/AddEventModal.tsx` - create/edit bookings (including recurrence)
- `src/components/SettingsPanel.tsx` - planner and color settings
- `server/googleCalendarProxy.mjs` - OAuth + Google API proxy

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs:

- `npm ci`
- `npm run build`

on pushes to `main` and on pull requests.

## Troubleshooting

### `ECONNREFUSED` for `/api/*`

Your backend proxy is not running. Start:

```bash
npm run dev:server
```

### "Google OAuth is not configured"

Set in `.env.server`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

### Google 403: Calendar API not enabled

Enable **Google Calendar API** for your Google Cloud project.

### Google 403: app not verified / access denied

If app is in testing mode, add your account as a test user in OAuth consent settings.

## Notes for Contributors

- Keep features local-first unless backend is explicitly required.
- Preserve the 4-concurrent-item guard unless intentionally redesigned.
- Validate date/time edge cases (all-day, cross-midnight, recurrence exceptions) when changing calendar logic.
