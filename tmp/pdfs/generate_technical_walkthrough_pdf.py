from __future__ import annotations

from datetime import datetime
from pathlib import Path
import subprocess
import textwrap


PAGE_WIDTH = 612
PAGE_HEIGHT = 792
LEFT = 48
RIGHT = 48
TOP = 760
BOTTOM = 46


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class PDFBuilder:
    """Small multi-page PDF writer using standard Type1 fonts only."""

    def __init__(self) -> None:
        self.pages: list[list[str]] = [[]]

    @property
    def page_index(self) -> int:
        return len(self.pages) - 1

    def new_page(self) -> None:
        self.pages.append([])

    def text(self, x: float, y: float, text: str, font: str = "F1", size: float = 10.0) -> None:
        safe = pdf_escape(text)
        self.pages[self.page_index].append(
            f"BT /{font} {size:.2f} Tf {x:.2f} {y:.2f} Td ({safe}) Tj ET"
        )

    def build(self, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Object map (obj_num -> obj_bytes)
        objects: dict[int, bytes] = {}
        objects[1] = b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"

        # Fonts (Helvetica family + Courier for code-like lines)
        objects[3] = b"3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        objects[4] = b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n"
        objects[5] = b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >> endobj\n"
        objects[6] = b"6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj\n"

        page_kids: list[str] = []
        next_obj = 7

        for idx, commands in enumerate(self.pages, start=1):
            page_obj = next_obj
            content_obj = next_obj + 1
            next_obj += 2
            page_kids.append(f"{page_obj} 0 R")

            prolog = [
                f"q 1 1 1 rg 0 0 {PAGE_WIDTH} {PAGE_HEIGHT} re f Q",
                "0 0 0 rg",
            ]
            footer = [
                f"BT /F1 9 Tf {LEFT:.2f} 26.00 Td (Page {idx} of {len(self.pages)}) Tj ET",
            ]
            stream = "\n".join([*prolog, *commands, *footer]).encode("latin-1", errors="replace")

            objects[page_obj] = (
                f"{page_obj} 0 obj << /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> "
                f"/Contents {content_obj} 0 R >> endobj\n"
            ).encode("ascii")
            objects[content_obj] = (
                f"{content_obj} 0 obj << /Length {len(stream)} >> stream\n".encode("ascii")
                + stream
                + b"\nendstream endobj\n"
            )

        objects[2] = (
            f"2 0 obj << /Type /Pages /Count {len(page_kids)} /Kids [{' '.join(page_kids)}] >> endobj\n"
        ).encode("ascii")

        max_obj = max(objects.keys())
        pdf = bytearray()
        pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

        xref_offsets = [0] * (max_obj + 1)
        for obj_num in range(1, max_obj + 1):
            obj = objects.get(obj_num)
            if obj is None:
                continue
            xref_offsets[obj_num] = len(pdf)
            pdf.extend(obj)

        xref_start = len(pdf)
        pdf.extend(f"xref\n0 {max_obj + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")
        for obj_num in range(1, max_obj + 1):
            off = xref_offsets[obj_num]
            if off == 0:
                pdf.extend(b"0000000000 65535 f \n")
            else:
                pdf.extend(f"{off:010d} 00000 n \n".encode("ascii"))

        trailer = (
            f"trailer << /Size {max_obj + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n"
        )
        pdf.extend(trailer.encode("ascii"))
        output_path.write_bytes(pdf)


class Layout:
    def __init__(self, builder: PDFBuilder) -> None:
        self.builder = builder
        self.y = TOP

    def _next_page_if_needed(self, required_height: float) -> None:
        if self.y - required_height < BOTTOM:
            self.builder.new_page()
            self.y = TOP

    def title(self, text: str) -> None:
        self._next_page_if_needed(26)
        self.builder.text(LEFT, self.y, text, font="F2", size=19)
        self.y -= 24

    def subtitle(self, text: str) -> None:
        self._next_page_if_needed(15)
        self.builder.text(LEFT, self.y, text, font="F3", size=10)
        self.y -= 15

    def section(self, text: str) -> None:
        self._next_page_if_needed(18)
        self.builder.text(LEFT, self.y, text, font="F2", size=13)
        self.y -= 16

    def subsection(self, text: str) -> None:
        self._next_page_if_needed(15)
        self.builder.text(LEFT, self.y, text, font="F2", size=11)
        self.y -= 14

    def paragraph(self, text: str, width_chars: int = 104) -> None:
        lines = textwrap.wrap(text, width=width_chars)
        for line in lines:
            self._next_page_if_needed(12)
            self.builder.text(LEFT, self.y, line, font="F1", size=10)
            self.y -= 12

    def bullet(self, text: str, width_chars: int = 98) -> None:
        wrapped = textwrap.wrap(text, width=width_chars)
        if not wrapped:
            return
        self._next_page_if_needed(12)
        self.builder.text(LEFT + 2, self.y, f"- {wrapped[0]}", font="F1", size=10)
        self.y -= 12
        for line in wrapped[1:]:
            self._next_page_if_needed(12)
            self.builder.text(LEFT + 16, self.y, line, font="F1", size=10)
            self.y -= 12

    def code_line(self, text: str) -> None:
        self._next_page_if_needed(12)
        self.builder.text(LEFT + 8, self.y, text, font="F4", size=9.4)
        self.y -= 12

    def gap(self, pts: float = 8) -> None:
        self.y -= pts


def git_head() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except Exception:
        return "unknown"


def write_walkthrough(output_path: Path) -> None:
    b = PDFBuilder()
    l = Layout(b)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    head = git_head()

    l.title("Productivity App - Technical Walkthrough")
    l.subtitle(f"Repository: addes4/productivity | Commit: {head} | Generated: {generated_at}")
    l.gap(4)

    l.section("1. What Was Built")
    l.paragraph(
        "This project is a local-first weekly planning application that combines goal planning, calendar booking management,"
        " recurrence support, drag-and-drop editing, overlap visualization, and secure Google Calendar import."
    )
    l.paragraph(
        "The app is designed to help a user translate weekly goals (for example study, exercise, or work sessions) into concrete"
        " time blocks while respecting existing commitments and user-defined constraints."
    )
    l.bullet("Frontend stack: React 18 + TypeScript + Vite + Tailwind CSS + date-fns + dnd-kit.")
    l.bullet("Backend helper: a dedicated Node server for OAuth and Google Calendar API proxying.")
    l.bullet("Persistence model: browser localStorage for app state, encrypted token file for Google refresh tokens.")
    l.gap()

    l.section("2. High-Level Architecture")
    l.subsection("2.1 Frontend Application Shell")
    l.paragraph(
        "The frontend is orchestrated from src/App.tsx. It composes the calendar grid, side panel, settings modal,"
        " event modal, and report modal. App.tsx also wires UI actions to store operations and import/sync flows."
    )
    l.bullet("Main route and interaction hub: src/App.tsx.")
    l.bullet("Central state and mutators: src/store/useStore.ts.")
    l.bullet("View components: src/components/*.tsx.")
    l.gap(5)

    l.subsection("2.2 Data and Domain Model")
    l.paragraph(
        "The data model in src/types.ts separates three core concepts: CalendarEvent (bookings), ActivityGoal (intent),"
        " and PlannedBlock (scheduled output). This separation keeps planning logic deterministic and UI rendering predictable."
    )
    l.bullet("CalendarEvent supports source tags (manual/import/google), all-day flags, and recurrence metadata.")
    l.bullet("ActivityGoal supports weekly targets, sessions-per-week mode, day/time preferences, travel buffer, and color.")
    l.bullet("PlannedBlock stores status (planned/done/missed/partial), lock state, and mini-session markers.")
    l.gap()

    l.section("3. Scheduling Engine (How Planning Actually Works)")
    l.subsection("3.1 Entry Point and Scope")
    l.paragraph(
        "Planning runs through planWeek(...) in src/utils/planWeek.ts, triggered by runPlanWeek(...) in useStore."
        " The week start is normalized to Monday to keep day indexing consistent across all calculations."
    )
    l.bullet("Locked blocks in the active week are preserved.")
    l.bullet("Unlocked blocks in the active week are regenerated.")
    l.bullet("Blocks outside the active week are kept unchanged.")
    l.gap(5)

    l.subsection("3.2 Constraint Synthesis")
    l.paragraph(
        "For each day, the planner builds blocked intervals from existing calendar events, locked planned blocks,"
        " travel buffers after locked blocks, and sleep windows (including cross-midnight handling)."
    )
    l.bullet("Work-hour framing can limit scheduling to a configured daily interval.")
    l.bullet("Allowed days, earliest start, and latest end are enforced per goal.")
    l.bullet("Minimum break minutes are applied when selecting and reserving slots.")
    l.gap(5)

    l.subsection("3.3 Goal Ordering and Slot Scoring")
    l.paragraph(
        "Goals are sorted by priority (high to low), then by shorter session duration first. Candidate slots are"
        " scored by preferred time of day (morning/lunch/evening/any) and basic duration fit."
    )
    l.bullet("This strategy increases success for high-priority and tighter-fit goals.")
    l.bullet("The algorithm greedily places one session at a time in the best available slot.")
    l.gap(5)

    l.subsection("3.4 Session Count Logic and Fallback")
    l.paragraph(
        "Each goal computes intended session count using sessionsPerWeek when provided, otherwise via weeklyTargetMinutes/sessionMinutes."
        " If the week is full and Minimum Viable Day is enabled, the planner attempts 10-minute mini sessions."
    )
    l.bullet("Unschedulable remainder generates a ConflictReport with actionable suggestion text.")
    l.bullet("Mini sessions are labeled (isMini=true) for transparent UX.")
    l.gap(5)

    l.subsection("3.5 Key Behavioral Rule: Gym Distribution")
    l.paragraph(
        "A dedicated daily cap ensures gym goals are not scheduled multiple times on the same day."
        " The implementation tracks gym sessions per day globally and also per goal where sessionsPerWeek is explicit."
    )
    l.bullet("Outcome: selecting 3 gym sessions per week spreads sessions across different days when possible.")
    l.gap()

    l.section("4. Calendar Rendering and Interaction Model")
    l.subsection("4.1 Week Grid and All-Day Lane")
    l.paragraph(
        "src/components/CalendarGrid.tsx renders a fixed header, a dedicated all-day row, and an hourly timeline."
        " Week-number pseudo-events are filtered out from normal event rendering."
    )
    l.bullet("Timed events and planned blocks are rendered in day columns.")
    l.bullet("All-day events are shown in compact chips at the top day lane.")
    l.gap(5)

    l.subsection("4.2 Overlap Visualization (1/2, 1/3, 1/4 Splits)")
    l.paragraph(
        "The utility src/utils/overlapLayout.ts computes overlap groups and assigns per-item columns."
        " CalendarGrid applies this to both bookings and planned blocks so collisions remain visible."
    )
    l.bullet("Two overlaps: each item gets roughly half width.")
    l.bullet("Three overlaps: each item gets roughly one third.")
    l.bullet("Four overlaps: each item gets roughly one fourth.")
    l.bullet("A hard guard rejects operations that would create more than 4 concurrent items.")
    l.gap(5)

    l.subsection("4.3 Drag-and-Drop Editing")
    l.paragraph(
        "Drag-and-drop is unified for planned blocks and calendar events. Drop targets are hour cells"
        " encoded as day+hour identifiers. On drop, new ranges are validated before persistence."
    )
    l.bullet("Planned block move validates sleep-window overlap and 4-way concurrency limit.")
    l.bullet("Calendar event move also respects the global 4-way concurrency limit.")
    l.bullet("Dragging across days is supported by target-cell interpretation, not just vertical delta.")
    l.gap(5)

    l.subsection("4.4 Compact Rendering for Short Blocks")
    l.paragraph(
        "Very short visual blocks now prioritize activity/event name instead of time text."
        " This avoids clipped or unreadable labels and preserves semantic clarity in dense schedules."
    )
    l.gap()

    l.section("5. Booking Lifecycle: Manual, Recurring, Import, Google")
    l.subsection("5.1 Manual and Recurring Bookings")
    l.paragraph(
        "AddEventModal supports weekly recurrence by weekday selection. Recurring templates store recurrenceDays"
        " and optional recurrenceExDates (date exceptions)."
    )
    l.bullet("When recurrence is enabled, at least one weekday is required.")
    l.bullet("Single-instance deletion writes an exception date instead of deleting the whole series.")
    l.bullet(
        "When a single recurring instance is dragged, the parent series receives an exception and a detached one-off event is created."
    )
    l.gap(5)

    l.subsection("5.2 Weekly Expansion of Recurrence")
    l.paragraph(
        "src/utils/recurringEvents.ts expands recurrence templates into concrete instances for the visible week."
        " Each instance carries recurrenceParentId and recurrenceInstanceDate for targeted edits."
    )
    l.gap(5)

    l.subsection("5.3 iCal Import")
    l.paragraph(
        "ICS import parses incoming events and deduplicates against existing entries using a normalized key"
        " based on lowercase title + start + end. Imported events are marked source='import'."
    )
    l.gap(5)

    l.subsection("5.4 Google Calendar Import")
    l.paragraph(
        "Google events are fetched for the active week through the backend proxy, normalized into the app schema,"
        " categorized by source calendar, deduplicated, and merged into state as source='google'."
    )
    l.bullet("Auto-sync is attempted once per week navigation while connected.")
    l.bullet("Manual sync remains available for explicit refresh.")
    l.gap()

    l.section("6. Security and Backend Design for Google OAuth")
    l.paragraph(
        "server/googleCalendarProxy.mjs exists to avoid exposing secrets in the frontend. OAuth client secret and token"
        " encryption key remain server-side. The frontend only uses /api/* endpoints."
    )
    l.bullet("OAuth session state uses short-lived server memory + HttpOnly cookie.")
    l.bullet("Return URL is sanitized to frontend origin to prevent open redirects.")
    l.bullet("Refresh tokens are encrypted at rest using AES-256-GCM with key material derived from env secret.")
    l.bullet("Connections are persisted in server/data/google-connections.json via atomic write.")
    l.bullet("Disconnect revokes token (best effort), removes stored connection, and clears cookie.")
    l.bullet("CORS is restricted to configured frontend origin.")
    l.gap()

    l.section("7. User-Configurable Behavior")
    l.paragraph(
        "Settings allow work-hour boundaries, sleep windows, minimum break, max activities per day, office days,"
        " and distinct color themes per booking source (manual/import/google)."
    )
    l.bullet("Color values are validated to strict #RRGGBB format before storage.")
    l.bullet("Goal forms support location, priority, allowed days, and time-of-day preference tuning.")
    l.gap()

    l.section("8. Reliability Guards and Edge Cases")
    l.bullet("Concurrency guard prevents creating or moving into >4 overlapping items.")
    l.bullet("Invalid ranges (end <= start) are filtered during processing and rendering.")
    l.bullet("Week-number helper events are excluded from normal booking logic.")
    l.bullet("Cross-midnight sleep windows are treated as true blocked ranges.")
    l.bullet("Google invalid_grant clears stale connection and prompts reconnect flow.")
    l.gap()

    l.section("9. File-Level Map for Key Responsibilities")
    l.code_line("src/App.tsx                              -> top-level orchestration and import/sync wiring")
    l.code_line("src/store/useStore.ts                    -> state CRUD, persistence, planner trigger")
    l.code_line("src/utils/planWeek.ts                    -> scheduling algorithm and conflict reporting")
    l.code_line("src/utils/overlapLayout.ts               -> overlap math, column layout, concurrency cap")
    l.code_line("src/utils/recurringEvents.ts             -> weekly recurrence expansion")
    l.code_line("src/components/CalendarGrid.tsx          -> calendar render pipeline + drag/drop logic")
    l.code_line("src/components/AddEventModal.tsx         -> booking and recurrence authoring UI")
    l.code_line("src/components/SettingsPanel.tsx         -> behavior and color configuration UI")
    l.code_line("server/googleCalendarProxy.mjs           -> OAuth flow, token storage, Google API proxy")
    l.gap()

    l.section("10. End-to-End Flow (Practical Sequence)")
    l.bullet("User adds bookings manually or imports via ICS/Google.")
    l.bullet("User defines goals with constraints and preferences.")
    l.bullet("Planner computes free slots, places sessions, and emits conflicts if needed.")
    l.bullet("Calendar shows schedule with overlap splitting and source-specific colors.")
    l.bullet("User drags blocks/events to adjust plan; validators enforce rules.")
    l.bullet("User tracks completion states and reviews weekly progress report.")
    l.gap()

    l.section("11. How to Run and Verify")
    l.subsection("Frontend")
    l.code_line("npm install")
    l.code_line("npm run dev")
    l.subsection("Google proxy (optional)")
    l.code_line("cp .env.server.example .env.server")
    l.code_line("npm run dev:server")
    l.subsection("Production build check")
    l.code_line("npm run build")
    l.gap()

    l.section("12. Summary")
    l.paragraph(
        "The implemented system is more than a static calendar UI: it is a constraint-aware planning engine with interactive"
        " schedule editing, recurrence management, overlap-safe layout, and secure Google synchronization. The architecture keeps"
        " planning logic isolated, state transitions explicit, and sensitive credentials off the client."
    )

    b.build(output_path)


if __name__ == "__main__":
    out = Path("output/pdf/productivity-app-technical-walkthrough.pdf")
    write_walkthrough(out)
    print(out)
