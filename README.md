# Produktivitetsplanerare

En webbapp för att planera veckan utifrån aktivitetsmål och befintliga bokningar. Appen kör lokalt i webbläsaren med React, TypeScript och Vite.

## Starta appen

```bash
npm install
npm run dev
```

Öppna sedan den URL som visas (t.ex. http://localhost:5173) i webbläsaren.

## Säker Google-integration (OAuth + backend)

För att importera Google Calendar utan att exponera hemliga iCal-länkar:

1. Kopiera `.env.server.example` till `.env.server` och fyll i värden.
2. Lägg till `http://localhost:8787/api/google-calendar/auth/callback` som **Authorized redirect URI** i Google Cloud Console.
3. Starta backend-proxyn i en terminal:

```bash
npm run dev:server
```

4. Starta frontend i en annan terminal:

```bash
npm run dev
```

Frontend anropar backend via `/api/*` (Vite-proxy), och refresh tokens lagras krypterat i `server/data/google-connections.json`.
Om du får `ECONNREFUSED` på `/api/*`, kontrollera att backend faktiskt kör på `127.0.0.1:8787` och starta om båda processerna.

## Så funkar det

1. **Lägg till upptagna tider** – Klicka på "+ Lägg till bokning" i headern eller under kalendern. Fyll i titel, datum och tid. Du kan också importera bokningar via **Import iCal (.ics)** eller via **Google OAuth-koppling** i högerpanelen. Bokningar visas som grå block i veckovyn och används som blockerade tider när du planerar.
2. **Skapa aktivitetsmål** – I högerpanelen: "Lägg till aktivitet". Ange t.ex. namn, veckomål (minuter), passlängd, prioritet, tillåtna dagar och tidsfönster. Markera som FAST (låst) eller RÖRLIG (flyttbar).
3. **Planera veckan** – I högerpanelen: klicka på "Planera veckan". Algoritmen beräknar lediga luckor (minus sömnfönster, arbetstider och befintliga bokningar), sorterar mål efter prioritet och placerar pass i lämpliga slots. Om något inte får plats visas en konfliktrapport med förslag. Vid fel visas meddelande i samma panel.
4. **Minimum viable day** – Aktivera checkboxen för att få 10-minuters mini-pass i små luckor när veckan är full.
5. **Checka av** – Klicka på ett planerat block i kalendern och välj Gjort / Delvis / Missat. Progress per mål och veckorapport uppdateras.

## Schemaläggningsalgoritmen (kort)

- **Lediga luckor**: Per dag tas arbetstider (om aktiverat), sömnfönster och befintliga events/block bort. Kvarvarande intervall blir "free slots".
- **Sortering**: Mål sorteras efter prioritet (hög först), sedan kortast pass först.
- **Fördeling**: För varje mål beräknas antal pass (veckomål / passlängd eller `sessionsPerWeek`). Varje pass placeras i den slot som ger bäst poäng (tid på dagen + preferens morgon/lunch/kväll).
- **Låsta block**: Fasta aktiviteter och låsta block flyttas aldrig. Rörliga block kan dras i kalendern (validering mot sömn och krock).
- **Konfliktrapport**: Om inte alla pass får plats skrivs ett meddelande med förslag (korta pass, fler dagar, "Minimum viable day"). Vid tekniskt fel visas felmeddelandet i konfliktrapporten.

## Teknik

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** för styling
- **date-fns** för datum/tid
- **@dnd-kit** för drag-and-drop av planerade block
- **localStorage** för persistering (ingen backend)
- Export/Import som JSON för backup och delning
- iCal-import (`.ics`)
- Säker Google Calendar-import via OAuth 2.0 + backend-proxy

## Projektstruktur

- `src/types.ts` – Typer (CalendarEvent, ActivityGoal, PlannedBlock, Settings)
- `src/utils/dateUtils.ts` – Veckostart, lediga slots, datum-hjälp (lokalt datum)
- `src/utils/planWeek.ts` – Schemaläggningsalgoritmen `planWeek()`
- `src/utils/icsImport.ts` – Parser för iCal (`.ics`) till kalenderbokningar
- `src/store/useStore.ts` – Global state, persistence, planering med senaste state
- `src/data/demoData.ts` – Demo-mål och -events vid första start
- `src/components/` – CalendarGrid, SidePanel, GoalForm, SettingsPanel, PlanButtons, ProgressBars, WeeklyReportModal, AddEventModal
- `server/googleCalendarProxy.mjs` – OAuth-login, krypterad refresh token-lagring och Google Calendar API-proxy
