from __future__ import annotations

from datetime import date
from pathlib import Path
import textwrap


PAGE_WIDTH = 612
PAGE_HEIGHT = 792
LEFT = 50
RIGHT = 50
TOP = 760
BOTTOM = 42


def pdf_escape(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


class PDFBuilder:
    def __init__(self) -> None:
        self.commands: list[str] = []

    def text(self, x: float, y: float, text: str, font: str = 'F1', size: float = 10) -> None:
        safe = pdf_escape(text)
        self.commands.append(f"BT /{font} {size:.2f} Tf {x:.2f} {y:.2f} Td ({safe}) Tj ET")

    def build(self, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        prolog = [
            # Paint an explicit white page background, then set fill color to black for text.
            f"q 1 1 1 rg 0 0 {PAGE_WIDTH} {PAGE_HEIGHT} re f Q",
            "0 0 0 rg",
        ]
        stream = "\n".join([*prolog, *self.commands]).encode('latin-1', errors='replace')

        objects: list[bytes] = []
        objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
        objects.append(b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n")
        page_obj = (
            f"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >> endobj\n"
        ).encode('ascii')
        objects.append(page_obj)
        objects.append(b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
        objects.append(b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n")
        objects.append(b"6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >> endobj\n")
        objects.append(
            b"7 0 obj << /Length " + str(len(stream)).encode('ascii') + b" >> stream\n" + stream + b"\nendstream endobj\n"
        )

        pdf = bytearray()
        pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        xref_offsets = [0]
        for obj in objects:
            xref_offsets.append(len(pdf))
            pdf.extend(obj)

        xref_start = len(pdf)
        pdf.extend(f"xref\n0 {len(xref_offsets)}\n".encode('ascii'))
        pdf.extend(b"0000000000 65535 f \n")
        for off in xref_offsets[1:]:
            pdf.extend(f"{off:010d} 00000 n \n".encode('ascii'))

        trailer = (
            f"trailer << /Size {len(xref_offsets)} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n"
        )
        pdf.extend(trailer.encode('ascii'))

        output_path.write_bytes(pdf)


class Layout:
    def __init__(self, builder: PDFBuilder) -> None:
        self.builder = builder
        self.y = TOP

    def _ensure_room(self, min_y: float) -> None:
        if self.y < min_y:
            raise RuntimeError('Content overflow: one-page constraint exceeded.')

    def title(self, text: str) -> None:
        self.builder.text(LEFT, self.y, text, font='F2', size=18)
        self.y -= 22

    def subtitle(self, text: str) -> None:
        self.builder.text(LEFT, self.y, text, font='F3', size=9.5)
        self.y -= 16

    def section(self, heading: str) -> None:
        self.builder.text(LEFT, self.y, heading, font='F2', size=11.5)
        self.y -= 14

    def paragraph(self, text: str, width_chars: int = 102) -> None:
        for line in textwrap.wrap(text, width=width_chars):
            self._ensure_room(BOTTOM)
            self.builder.text(LEFT, self.y, line, font='F1', size=9.5)
            self.y -= 12

    def bullet(self, text: str, width_chars: int = 96) -> None:
        wrapped = textwrap.wrap(text, width=width_chars)
        if not wrapped:
            return
        self._ensure_room(BOTTOM)
        self.builder.text(LEFT + 2, self.y, f"- {wrapped[0]}", font='F1', size=9.5)
        self.y -= 12
        for line in wrapped[1:]:
            self._ensure_room(BOTTOM)
            self.builder.text(LEFT + 14, self.y, line, font='F1', size=9.5)
            self.y -= 12

    def gap(self, pts: float = 7) -> None:
        self.y -= pts


def build_summary_pdf(output_path: Path) -> None:
    b = PDFBuilder()
    l = Layout(b)

    l.title('Productivity App - Repo Summary')
    l.subtitle(f'Generated on {date.today().isoformat()} from repository evidence only')

    l.section('What it is')
    l.paragraph(
        'Produktivitetsplanerare is a local-first web app for weekly planning, built with React, TypeScript, and Vite.'
    )
    l.paragraph(
        'It schedules activity goals into free time around existing bookings and tracks completion status and weekly outcomes.'
    )
    l.gap()

    l.section("Who it's for")
    l.bullet('Primary user/persona (explicit): Not found in repo.')
    l.bullet(
        'Inferred from README and UI flows: people planning weekly activity goals around calendar commitments.'
    )
    l.gap()

    l.section('What it does')
    l.bullet('Adds manual calendar bookings and supports recurring events in the weekly calendar.')
    l.bullet('Creates activity goals with target minutes, session length, allowed days, and priority.')
    l.bullet('Auto-plans weekly sessions using free slots, sleep/work constraints, and conflict reporting.')
    l.bullet('Offers "Minimum viable day" fallback with 10-minute mini sessions when weeks are full.')
    l.bullet('Imports busy events from iCal (.ics) and deduplicates overlapping duplicates by key.')
    l.bullet('Integrates Google Calendar through OAuth and a local backend proxy for secure import.')
    l.bullet('Persists state in localStorage and supports JSON export/import backups.')
    l.gap()

    l.section('How it works (repo-backed architecture)')
    l.bullet('Frontend: React SPA (src/App.tsx) with CalendarGrid, SidePanel, settings/report/detail modals.')
    l.bullet('State: useStore (src/store/useStore.ts) centralizes CRUD, planning triggers, and week navigation.')
    l.bullet('Planner: planWeek (src/utils/planWeek.ts) computes blocked intervals and places sessions by score.')
    l.bullet('Storage: src/utils/storage.ts saves/loads versioned app state in browser localStorage.')
    l.bullet('Imports: src/utils/icsImport.ts parses .ics; server/googleCalendarProxy.mjs handles OAuth/API proxy.')
    l.bullet('Data flow: UI actions -> useStore -> planner/import helpers -> state -> localStorage -> rendered calendar.')
    l.gap()

    l.section('How to run (minimal)')
    l.bullet('Install and start frontend: `npm install` then `npm run dev`.')
    l.bullet('Open the printed Vite URL (example: http://localhost:5173).')
    l.bullet('Optional Google sync: configure `.env.server`, run `npm run dev:server`, keep frontend running.')

    if l.y < BOTTOM:
        raise RuntimeError('Content overflow: one-page constraint exceeded.')

    b.build(output_path)


if __name__ == '__main__':
    out = Path('output/pdf/productivity-app-summary.pdf')
    build_summary_pdf(out)
    print(out)
