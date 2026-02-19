import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, getISOWeek } from 'date-fns'
import { useStore } from './store/useStore'
import { CalendarGrid } from './components/CalendarGrid'
import { SidePanel } from './components/SidePanel'
import { AddEventModal } from './components/AddEventModal'
import { WeeklyReportModal } from './components/WeeklyReportModal'
import { SettingsPanel } from './components/SettingsPanel'
import { exportState, importState } from './utils/storage'
import type { CalendarEvent, ActivityGoal, PlannedBlock } from './types'
import { BlockDetailModal } from './components/BlockDetailModal'
import { parseIcsCalendar } from './utils/icsImport'
import { isWeekNumberEvent } from './utils/calendarEventUtils'
import { expandCalendarEventsForWeek } from './utils/recurringEvents'
import { isAllDayEventRange } from './utils/dateUtils'
import { exceedsConcurrentLimit } from './utils/overlapLayout'

// Gemensam summering som visas efter importflöden.
interface CalendarImportResult {
  imported: number
  skipped: number
  warnings: string[]
}

interface GoogleAuthStatus {
  connected: boolean
  email: string | null
}

// Hjälpare för att tolka "yyyy-MM-dd" till lokalt datum.
function parseWeekStart(weekStart: string): Date {
  const [y, m, d] = weekStart.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

function rangesOverlap(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  return start < rangeEnd && end > rangeStart
}

function buildTimedOverlapRangesForWeek(
  calendarEvents: CalendarEvent[],
  plannedBlocks: PlannedBlock[],
  weekStart: string
): Array<{ id: string; start: Date; end: Date }> {
  const weekStartDate = parseWeekStart(weekStart)
  const weekEndDate = addDays(weekStartDate, 7)
  const ranges: Array<{ id: string; start: Date; end: Date }> = []

  for (const event of calendarEvents) {
    if (isWeekNumberEvent(event)) continue
    const start = new Date(event.start)
    const end = new Date(event.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue
    if (event.allDay === true || isAllDayEventRange(start, end)) continue
    if (!rangesOverlap(start, end, weekStartDate, weekEndDate)) continue
    ranges.push({ id: `event:${event.id}`, start, end })
  }

  for (const block of plannedBlocks) {
    const start = new Date(block.start)
    const end = new Date(block.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue
    if (!rangesOverlap(start, end, weekStartDate, weekEndDate)) continue
    ranges.push({ id: `block:${block.id}`, start, end })
  }

  return ranges
}

function App() {
  const {
    state,
    addCalendarEvent,
    addCalendarEvents,
    replaceGoogleCalendarEventsForWeek,
    clearGoogleCalendarEvents,
    updateCalendarEvent,
    removeCalendarEvent,
    updatePlannedBlock,
    addGoal,
    updateGoal,
    removeGoal,
    setSettings,
    setMinimumViableDay,
    runPlanWeek,
    goToNextWeek,
    goToPrevWeek,
    replaceState,
  } = useStore()

  // UI-state för modaler, filter och val.
  const [addEventOpen, setAddEventOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [selectedBlock, setSelectedBlock] = useState<PlannedBlock | null>(null)
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEvent | null>(null)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus>({
    connected: false,
    email: null,
  })
  // Förhindrar dubbel autosynk för samma vecka.
  const autoSyncedWeekRef = useRef<string | null>(null)

  // Uppdatering när användaren drar ett planerat block.
  const handleBlockMove = useCallback(
    (blockId: string, newStart: string, newEnd: string) => {
      updatePlannedBlock(blockId, { start: newStart, end: newEnd })
    },
    [updatePlannedBlock]
  )

  // Flytta kalenderbokning via drag-and-drop i griden.
  const handleCalendarEventMove = useCallback(
    (eventToMove: CalendarEvent, newStart: string, newEnd: string) => {
      // Dras en instans av återkommande event: skapa undantag + frikopplad engångsbokning.
      if (eventToMove.recurrenceParentId && eventToMove.recurrenceInstanceDate) {
        const parent = state.calendarEvents.find((e) => e.id === eventToMove.recurrenceParentId)
        if (parent) {
          const existingExDates = parent.recurrenceExDates ?? []
          const nextExDates = Array.from(
            new Set([...existingExDates, eventToMove.recurrenceInstanceDate])
          ).sort()
          updateCalendarEvent(parent.id, { recurrenceExDates: nextExDates })
        }

        addCalendarEvent({
          ...eventToMove,
          id: `event-${Date.now()}`,
          start: newStart,
          end: newEnd,
          recurrenceDays: undefined,
          recurrenceExDates: undefined,
          recurrenceParentId: undefined,
          recurrenceInstanceDate: undefined,
        })
        return
      }

      updateCalendarEvent(eventToMove.id, { start: newStart, end: newEnd })
    },
    [addCalendarEvent, state.calendarEvents, updateCalendarEvent]
  )

  // Wrapper för att skapa nya mål från sidopanelen.
  const handleAddGoal = useCallback(
    (g: ActivityGoal) => {
      addGoal(g)
    },
    [addGoal]
  )

  // Skapa ny bokning eller uppdatera befintlig (inkl. återkommande parent).
  const handleSaveEvent = useCallback(
    (event: Omit<CalendarEvent, 'id'>, existingId?: string) => {
      const baseCalendarEvents = existingId
        ? state.calendarEvents.filter((e) => e.id !== existingId)
        : state.calendarEvents
      const nextCalendarEvents = [
        ...baseCalendarEvents,
        {
          id: existingId ?? `event-${Date.now()}`,
          ...event,
          recurrenceParentId: undefined,
          recurrenceInstanceDate: undefined,
        },
      ]

      const expandedForWeek = expandCalendarEventsForWeek(
        nextCalendarEvents,
        state.currentWeekStart
      )
      const overlapRanges = buildTimedOverlapRangesForWeek(
        expandedForWeek,
        state.plannedBlocks,
        state.currentWeekStart
      )
      if (exceedsConcurrentLimit(overlapRanges, 4)) {
        return {
          ok: false as const,
          error:
            'Max 4 samtidiga bokningar/aktiviteter tillåts. Välj en annan tid eller flytta ett befintligt block.',
        }
      }

      if (existingId) {
        updateCalendarEvent(existingId, {
          ...event,
          recurrenceParentId: undefined,
          recurrenceInstanceDate: undefined,
        })
        setSelectedCalendarEvent(null)
      } else {
        addCalendarEvent({
          ...event,
          recurrenceParentId: undefined,
          recurrenceInstanceDate: undefined,
          id: `event-${Date.now()}`,
        })
      }
      setAddEventOpen(false)
      return { ok: true as const }
    },
    [
      addCalendarEvent,
      expandCalendarEventsForWeek,
      state.calendarEvents,
      state.currentWeekStart,
      state.plannedBlocks,
      updateCalendarEvent,
    ]
  )

  // Radering: en instans av återkommande event => exDate, annars vanlig delete.
  const handleDeleteEvent = useCallback(
    (eventToDelete: CalendarEvent) => {
      if (eventToDelete.recurrenceParentId && eventToDelete.recurrenceInstanceDate) {
        const parent = state.calendarEvents.find((e) => e.id === eventToDelete.recurrenceParentId)
        if (parent) {
          // Ta bort endast vald instans genom att lägga datumet i undantagslistan.
          const existingExDates = parent.recurrenceExDates ?? []
          const nextExDates = Array.from(
            new Set([...existingExDates, eventToDelete.recurrenceInstanceDate])
          ).sort()
          updateCalendarEvent(parent.id, {
            recurrenceExDates: nextExDates,
          })
        }
      } else {
        removeCalendarEvent(eventToDelete.id)
      }
      setSelectedCalendarEvent((current) => (current?.id === eventToDelete.id ? null : current))
      setAddEventOpen(false)
    },
    [removeCalendarEvent, state.calendarEvents, updateCalendarEvent]
  )

  // Exporterar hela state till JSON-fil.
  const handleExport = useCallback(() => {
    const json = exportState(state)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `productivity-export-${state.currentWeekStart}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [state])

  // Ersätter app-state med importerad JSON om formatet är giltigt.
  const handleImport = useCallback(
    (json: string) => {
      const imported = importState(json)
      if (imported) replaceState(imported)
    },
    [replaceState]
  )

  // Import av .ics: parse, dedupe och lägg till som låsta import-event.
  const importIcsText = useCallback(
    (icsText: string): CalendarImportResult => {
      const parsed = parseIcsCalendar(icsText)
      const keyOf = (title: string, start: string, end: string) =>
        `${title.trim().toLowerCase()}|${start}|${end}`

      const existingKeys = new Set(
        state.calendarEvents.map((e) => keyOf(e.title, e.start, e.end))
      )
      const newEvents: CalendarEvent[] = []
      let skipped = 0

      parsed.events.forEach((ev, index) => {
        if (isWeekNumberEvent({ title: ev.title, category: ev.category || 'Import' })) {
          skipped++
          return
        }
        const key = keyOf(ev.title, ev.start, ev.end)
        if (existingKeys.has(key)) {
          skipped++
          return
        }
        existingKeys.add(key)
        newEvents.push({
          id: `event-import-${Date.now()}-${index}`,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          source: 'import',
          locked: true,
          category: ev.category || 'Import',
        })
      })

      addCalendarEvents(newEvents)
      return {
        imported: newEvents.length,
        skipped,
        warnings: parsed.warnings,
      }
    },
    [addCalendarEvents, state.calendarEvents]
  )

  // Hämtar OAuth-anslutningsstatus för Google.
  const refreshGoogleAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/google-calendar/auth/status', {
        credentials: 'include',
      })
      if (!response.ok) return
      const data = (await response.json()) as {
        connected?: boolean
        email?: string | null
      }
      setGoogleAuthStatus({
        connected: Boolean(data.connected),
        email: data.email ?? null,
      })
    } catch {
      // ignore transient network errors in UI status refresh
    }
  }, [])

  // Körs vid mount: uppdaterar auth-status och städar oauth query-param.
  useEffect(() => {
    refreshGoogleAuthStatus()
    const url = new URL(window.location.href)
    const oauthResult = url.searchParams.get('google_oauth')
    if (oauthResult === 'success') {
      autoSyncedWeekRef.current = null
    }
    if (oauthResult) {
      url.searchParams.delete('google_oauth')
      window.history.replaceState({}, '', url.toString())
    }
  }, [refreshGoogleAuthStatus])

  // Startar OAuth-flödet via backend-proxy.
  const connectGoogleCalendar = useCallback(() => {
    const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`
    window.location.href = `/api/google-calendar/auth/start?returnTo=${encodeURIComponent(returnTo)}`
  }, [])

  // Hämtar Google-event för vald vecka och ersätter tidigare Google-event i samma vecka.
  const importGoogleCalendar = useCallback(
    async (): Promise<CalendarImportResult> => {
      const response = await fetch(
        `/api/google-calendar/events?weekStart=${encodeURIComponent(state.currentWeekStart)}`,
        { credentials: 'include' }
      )
      if (!response.ok) {
        let message = 'Kunde inte importera från Google.'
        try {
          const err = (await response.json()) as { error?: string }
          if (err.error) message = err.error
        } catch {
          // ignore json parse errors
        }
        throw new Error(message)
      }

      const data = (await response.json()) as {
        events: { title: string; start: string; end: string; category?: string; allDay?: boolean }[]
        warnings?: string[]
      }

      const weekStartDate = parseWeekStart(state.currentWeekStart)
      const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      const overlapsWeek = (event: CalendarEvent) => {
        const start = new Date(event.start)
        const end = new Date(event.end)
        return start < weekEndDate && end > weekStartDate
      }

      const keyOf = (title: string, start: string, end: string) =>
        `${title.trim().toLowerCase()}|${start}|${end}`

      const existingKeys = new Set(
        state.calendarEvents
          .filter((e) => !(e.source === 'google' && overlapsWeek(e)))
          .map((e) => keyOf(e.title, e.start, e.end))
      )
      const googleEvents: CalendarEvent[] = []
      let skipped = 0

      data.events.forEach((ev, index) => {
        if (isWeekNumberEvent({ title: ev.title, category: ev.category || 'Google' })) {
          skipped++
          return
        }
        const key = keyOf(ev.title, ev.start, ev.end)
        if (existingKeys.has(key)) {
          skipped++
          return
        }
        existingKeys.add(key)
        googleEvents.push({
          id: `event-google-${Date.now()}-${index}`,
          title: ev.title || 'Google-bokning',
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay === true,
          source: 'google',
          locked: true,
          category: ev.category || 'Google',
        })
      })

      replaceGoogleCalendarEventsForWeek(state.currentWeekStart, googleEvents)
      return {
        imported: googleEvents.length,
        skipped,
        warnings: data.warnings ?? [],
      }
    },
    [replaceGoogleCalendarEventsForWeek, state.calendarEvents, state.currentWeekStart]
  )

  // Kopplar från Google-konto via backend och uppdaterar auth-status.
  const disconnectGoogleCalendar = useCallback(async () => {
    const response = await fetch('/api/google-calendar/auth/disconnect', {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      let message = 'Kunde inte koppla från Google.'
      try {
        const err = (await response.json()) as { error?: string }
        if (err.error) message = err.error
      } catch {
        // ignore json parse errors
      }
      throw new Error(message)
    }
    await refreshGoogleAuthStatus()
  }, [refreshGoogleAuthStatus])

  const handleConnectGoogleCalendar = useCallback(() => {
    connectGoogleCalendar()
  }, [connectGoogleCalendar])

  const handleImportGoogleCalendar = useCallback(async () => {
    const result = await importGoogleCalendar()
    await refreshGoogleAuthStatus()
    return result
  }, [importGoogleCalendar, refreshGoogleAuthStatus])

  // Frånkoppling i UI: rensa lokala Google-event och återställ autosynkspårning.
  const handleDisconnectGoogleCalendar = useCallback(async () => {
    await disconnectGoogleCalendar()
    setGoogleAuthStatus({ connected: false, email: null })
    clearGoogleCalendarEvents()
    autoSyncedWeekRef.current = null
  }, [clearGoogleCalendarEvents, disconnectGoogleCalendar])

  // Autosynk vid veckobyte när kontot är anslutet.
  useEffect(() => {
    if (!googleAuthStatus.connected) {
      autoSyncedWeekRef.current = null
      return
    }
    const weekKey = state.currentWeekStart
    if (autoSyncedWeekRef.current === weekKey) return
    autoSyncedWeekRef.current = weekKey
    void (async () => {
      try {
        await importGoogleCalendar()
      } catch {
        // Allow retry if the auto-sync request fails.
        autoSyncedWeekRef.current = null
      }
    })()
  }, [googleAuthStatus.connected, importGoogleCalendar, state.currentWeekStart])

  // Aktivitet kopplad till markerat block (för blockdetalj-modal).
  const selectedGoal = selectedBlock
    ? state.goals.find((g) => g.id === selectedBlock.goalId)
    : null

  const categories = Array.from(
    new Set([
      ...state.goals.map((g) => g.category),
      ...state.calendarEvents
        .filter((e) => !isWeekNumberEvent(e))
        .map((e) => e.category),
    ])
  ).filter(Boolean)

  // Återkommande bokningar expanderas till veckans instanser innan render.
  const weekCalendarEvents = useMemo(
    () => expandCalendarEventsForWeek(state.calendarEvents, state.currentWeekStart),
    [state.calendarEvents, state.currentWeekStart]
  )
  const currentWeekNumber = useMemo(
    () => getISOWeek(parseWeekStart(state.currentWeekStart)),
    [state.currentWeekStart]
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-sky-100/60 flex flex-col">
      <header className="backdrop-blur bg-white/85 border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-800">Produktivitetsplanerare</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goToPrevWeek}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
            >
              ← Föregående vecka
            </button>
            <span className="py-1.5 px-2 text-sm font-semibold text-slate-600 rounded-lg bg-slate-100/80">
              Vecka {currentWeekNumber}
            </span>
            <button
              type="button"
              onClick={goToNextWeek}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Nästa vecka →
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCalendarEvent(null)
                setAddEventOpen(true)
              }}
              className="px-3 py-1.5 text-sm bg-sky-600 text-white rounded-xl hover:bg-sky-700 font-semibold shadow-sm transition-colors"
            >
              + Lägg till bokning
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setCategoryFilter((prev) =>
                  prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                )
              }
              className={`px-2 py-1 text-xs rounded-full ${
                categoryFilter.includes(cat)
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-200/90 text-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-xl hover:bg-slate-50 font-medium transition-colors"
          >
            Inställningar
          </button>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="px-3 py-1.5 text-sm bg-slate-700 text-white rounded-xl hover:bg-slate-600 font-medium transition-colors"
          >
            Veckorapport
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 gap-4 p-4 flex-col xl:flex-row xl:overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 overflow-auto xl:overflow-hidden">
          <CalendarGrid
            weekStart={state.currentWeekStart}
            calendarEvents={weekCalendarEvents}
            plannedBlocks={state.plannedBlocks}
            goals={state.goals}
            settings={state.settings}
            onBlockMove={handleBlockMove}
            onCalendarEventMove={handleCalendarEventMove}
            onBlockClick={(block) => setSelectedBlock(block)}
            onCalendarEventClick={(event) => {
              setAddEventOpen(false)
              setSelectedCalendarEvent(event)
            }}
            onAddEvent={() => {
              setSelectedCalendarEvent(null)
              setAddEventOpen(true)
            }}
            categoryFilter={categoryFilter}
          />
        </main>
        <SidePanel
          goals={state.goals}
          plannedBlocks={state.plannedBlocks}
          minimumViableDay={state.minimumViableDay}
          conflictReports={state.conflictReports}
          editingGoalId={editingGoalId}
          onClearEditingGoalId={() => setEditingGoalId(null)}
          onAddGoal={handleAddGoal}
          onUpdateGoal={updateGoal}
          onRemoveGoal={removeGoal}
          onPlanWeek={() => runPlanWeek()}
          onToggleMVD={setMinimumViableDay}
          onExport={handleExport}
          onImport={handleImport}
          onImportIcsText={importIcsText}
          onConnectGoogleCalendar={handleConnectGoogleCalendar}
          onImportGoogleCalendar={handleImportGoogleCalendar}
          onDisconnectGoogleCalendar={handleDisconnectGoogleCalendar}
          googleCalendarConnected={googleAuthStatus.connected}
          googleCalendarEmail={googleAuthStatus.email}
        />
      </div>

      {(addEventOpen || selectedCalendarEvent) && (
        <AddEventModal
          weekStart={state.currentWeekStart}
          existingEvent={selectedCalendarEvent}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={() => {
            setAddEventOpen(false)
            setSelectedCalendarEvent(null)
          }}
        />
      )}

      {reportOpen && (
        <WeeklyReportModal
          goals={state.goals}
          plannedBlocks={state.plannedBlocks}
          conflictReports={state.conflictReports}
          onClose={() => setReportOpen(false)}
        />
      )}

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <SettingsPanel
              settings={state.settings}
              onSave={setSettings}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}

      {selectedBlock && selectedGoal && (
        <BlockDetailModal
          block={selectedBlock}
          goal={selectedGoal}
          onStatusChange={(id, status) => {
            updatePlannedBlock(id, { status })
            setSelectedBlock(null)
          }}
          onEditGoal={(goalId) => {
            setEditingGoalId(goalId)
            setSelectedBlock(null)
          }}
          onClose={() => setSelectedBlock(null)}
        />
      )}
    </div>
  )
}

export default App
