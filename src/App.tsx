import { useCallback, useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { CalendarGrid } from './components/CalendarGrid'
import { SidePanel } from './components/SidePanel'
import { AddEventModal } from './components/AddEventModal'
import { WeeklyReportModal } from './components/WeeklyReportModal'
import { exportState, importState } from './utils/storage'
import type { CalendarEvent, ActivityGoal, PlannedBlock } from './types'
import { BlockDetailModal } from './components/BlockDetailModal'
import { parseIcsCalendar } from './utils/icsImport'

interface CalendarImportResult {
  imported: number
  skipped: number
  warnings: string[]
}

interface GoogleAuthStatus {
  connected: boolean
  email: string | null
}

function App() {
  const {
    state,
    addCalendarEvent,
    addCalendarEvents,
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

  const [addEventOpen, setAddEventOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [selectedBlock, setSelectedBlock] = useState<PlannedBlock | null>(null)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus>({
    connected: false,
    email: null,
  })

  const handleBlockMove = useCallback(
    (blockId: string, newStart: string, newEnd: string) => {
      updatePlannedBlock(blockId, { start: newStart, end: newEnd })
    },
    [updatePlannedBlock]
  )

  const handleAddGoal = useCallback(
    (g: ActivityGoal) => {
      addGoal(g)
    },
    [addGoal]
  )

  const handleSaveEvent = useCallback(
    (event: Omit<CalendarEvent, 'id'>) => {
      addCalendarEvent({ ...event, id: `event-${Date.now()}` })
      setAddEventOpen(false)
    },
    [addCalendarEvent]
  )

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

  const handleImport = useCallback(
    (json: string) => {
      const imported = importState(json)
      if (imported) replaceState(imported)
    },
    [replaceState]
  )

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

  useEffect(() => {
    refreshGoogleAuthStatus()
    const url = new URL(window.location.href)
    if (url.searchParams.has('google_oauth')) {
      url.searchParams.delete('google_oauth')
      window.history.replaceState({}, '', url.toString())
    }
  }, [refreshGoogleAuthStatus])

  const connectGoogleCalendar = useCallback(() => {
    const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`
    window.location.href = `/api/google-calendar/auth/start?returnTo=${encodeURIComponent(returnTo)}`
  }, [])

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
        events: { title: string; start: string; end: string; category?: string }[]
        warnings?: string[]
      }

      const keyOf = (title: string, start: string, end: string) =>
        `${title.trim().toLowerCase()}|${start}|${end}`

      const existingKeys = new Set(
        state.calendarEvents.map((e) => keyOf(e.title, e.start, e.end))
      )
      const newEvents: CalendarEvent[] = []
      let skipped = 0

      data.events.forEach((ev, index) => {
        const key = keyOf(ev.title, ev.start, ev.end)
        if (existingKeys.has(key)) {
          skipped++
          return
        }
        existingKeys.add(key)
        newEvents.push({
          id: `event-google-${Date.now()}-${index}`,
          title: ev.title || 'Google-bokning',
          start: ev.start,
          end: ev.end,
          source: 'import',
          locked: true,
          category: ev.category || 'Google',
        })
      })

      addCalendarEvents(newEvents)
      return {
        imported: newEvents.length,
        skipped,
        warnings: data.warnings ?? [],
      }
    },
    [addCalendarEvents, state.calendarEvents, state.currentWeekStart]
  )

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

  const handleDisconnectGoogleCalendar = useCallback(async () => {
    await disconnectGoogleCalendar()
    setGoogleAuthStatus({ connected: false, email: null })
  }, [disconnectGoogleCalendar])

  const selectedGoal = selectedBlock
    ? state.goals.find((g) => g.id === selectedBlock.goalId)
    : null

  const categories = Array.from(
    new Set([
      ...state.goals.map((g) => g.category),
      ...state.calendarEvents.map((e) => e.category),
    ])
  ).filter(Boolean)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-sky-100/60 flex flex-col">
      <header className="backdrop-blur bg-white/85 border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2 sticky top-0 z-20">
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
              Vecka {state.currentWeekStart}
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
              onClick={() => setAddEventOpen(true)}
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
            onClick={() => setReportOpen(true)}
            className="px-3 py-1.5 text-sm bg-slate-700 text-white rounded-xl hover:bg-slate-600 font-medium transition-colors"
          >
            Veckorapport
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 gap-4 p-4 flex-col xl:flex-row">
        <main className="flex-1 min-w-0 overflow-auto">
          <CalendarGrid
            weekStart={state.currentWeekStart}
            calendarEvents={state.calendarEvents}
            plannedBlocks={state.plannedBlocks}
            goals={state.goals}
            settings={state.settings}
            onBlockMove={handleBlockMove}
            onBlockClick={(block) => setSelectedBlock(block)}
            onBlockStatusChange={(id, status) => updatePlannedBlock(id, { status })}
            onAddEvent={() => setAddEventOpen(true)}
            categoryFilter={categoryFilter}
          />
        </main>
        <SidePanel
          goals={state.goals}
          plannedBlocks={state.plannedBlocks}
          settings={state.settings}
          minimumViableDay={state.minimumViableDay}
          conflictReports={state.conflictReports}
          editingGoalId={editingGoalId}
          onClearEditingGoalId={() => setEditingGoalId(null)}
          onAddGoal={handleAddGoal}
          onUpdateGoal={updateGoal}
          onRemoveGoal={removeGoal}
          onPlanWeek={() => runPlanWeek()}
          onToggleMVD={setMinimumViableDay}
          onSaveSettings={setSettings}
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

      {addEventOpen && (
        <AddEventModal
          weekStart={state.currentWeekStart}
          onSave={handleSaveEvent}
          onClose={() => setAddEventOpen(false)}
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
