import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  AppState,
  CalendarEvent,
  ActivityGoal,
  PlannedBlock,
  Settings,
} from '../types'
import { planWeek, type PlanWeekResult } from '../utils/planWeek'
import { getWeekStartISO, parseWeekStartString } from '../utils/dateUtils'
import { parseISO, addDays } from 'date-fns'
import { defaultSettings, createDemoData } from '../data/demoData'
import { loadState, saveState } from '../utils/storage'
import { expandCalendarEventsForWeek } from '../utils/recurringEvents'
import { normalizeEventColors } from '../utils/eventColors'

// Tom baseline-state (överskrivs av loadState eller demoData vid init).
const initial: AppState = {
  calendarEvents: [],
  goals: [],
  plannedBlocks: [],
  settings: defaultSettings,
  currentWeekStart: getWeekStartISO(new Date()),
  conflictReports: [],
  minimumViableDay: false,
  scheduleVersion: 0,
  deletedGoogleEventKeys: [],
}


// Kontrollerar om ett event överlappar ett tidsintervall.
function eventOverlapsRange(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): boolean {
  const start = parseISO(event.start)
  const end = parseISO(event.end)
  return start < rangeEnd && end > rangeStart
}

function normalizeSettings(settings?: Settings): Settings {
  // Säkerställer bakåtkompatibilitet när nya fält läggs till i Settings.
  return {
    ...defaultSettings,
    ...settings,
    workHours: {
      ...defaultSettings.workHours,
      ...(settings?.workHours ?? {}),
    },
    sleepWindow: {
      ...defaultSettings.sleepWindow,
      ...(settings?.sleepWindow ?? {}),
    },
    officeDays: settings?.officeDays ?? defaultSettings.officeDays,
    eventColors: normalizeEventColors(settings?.eventColors),
  }
}

export function useStore() {
  // Initialisering: försök läsa sparat state, annars skapa demo-state.
  const [state, setState] = useState<AppState>(() => {
    const loaded = loadState()
    if (loaded) {
      return {
        ...initial,
        ...loaded,
        // Bakåtkompatibilitet: äldre sparade states saknar fältet.
        deletedGoogleEventKeys: loaded.deletedGoogleEventKeys ?? [],
        settings: normalizeSettings(loaded.settings),
      }
    }
    const demo = createDemoData()
    return { ...initial, ...demo, settings: normalizeSettings(initial.settings) }
  })

  // Används i callbacks för att alltid läsa senaste state utan stale closures.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    // Persistens efter varje state-ändring.
    saveState(state)
  }, [state])

  // CRUD: kalenderbokningar.
  const addCalendarEvent = useCallback((event: CalendarEvent) => {
    setState((s) => ({
      ...s,
      calendarEvents: [...s.calendarEvents, event],
    }))
  }, [])

  // Batch-tillägg för importflöden.
  const addCalendarEvents = useCallback((events: CalendarEvent[]) => {
    if (events.length === 0) return
    setState((s) => ({
      ...s,
      calendarEvents: [...s.calendarEvents, ...events],
    }))
  }, [])

  // Ersätter Google-event som överlappar en vecka med senaste synkresultat.
  const replaceGoogleCalendarEventsForWeek = useCallback(
    (weekStart: string, googleEvents: CalendarEvent[]) => {
      const rangeStart = parseWeekStartString(weekStart)
      const rangeEnd = addDays(rangeStart, 7)
      setState((s) => {
        const keep = s.calendarEvents.filter(
          (e) => !(e.source === 'google' && eventOverlapsRange(e, rangeStart, rangeEnd))
        )

        // Dedupe mellan befintliga event och ny Google-import för samma vecka.
        const keyOf = (e: CalendarEvent) =>
          `${e.title.trim().toLowerCase()}|${e.start}|${e.end}`
        const existing = new Set(keep.map(keyOf))
        const dedupedNew: CalendarEvent[] = []
        for (const e of googleEvents) {
          const key = keyOf(e)
          if (existing.has(key)) continue
          existing.add(key)
          dedupedNew.push(e)
        }

        return {
          ...s,
          calendarEvents: [...keep, ...dedupedNew],
        }
      })
    },
    []
  )

  // Används vid frånkoppling för att rensa all Google-data och blocklista lokalt.
  const clearGoogleCalendarEvents = useCallback(() => {
    setState((s) => ({
      ...s,
      calendarEvents: s.calendarEvents.filter((e) => e.source !== 'google'),
      deletedGoogleEventKeys: [],
    }))
  }, [])

  // Lägger till en nyckel i blocklistan för manuellt raderade Google-event.
  const markGoogleEventDeleted = useCallback((key: string) => {
    setState((s) => ({
      ...s,
      deletedGoogleEventKeys: Array.from(new Set([...s.deletedGoogleEventKeys, key])),
    }))
  }, [])

  // CRUD: enskild bokning.
  const updateCalendarEvent = useCallback((id: string, updates: Partial<CalendarEvent>) => {
    setState((s) => ({
      ...s,
      calendarEvents: s.calendarEvents.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }))
  }, [])

  const removeCalendarEvent = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      calendarEvents: s.calendarEvents.filter((e) => e.id !== id),
    }))
  }, [])

  // CRUD: mål.
  const addGoal = useCallback((goal: ActivityGoal) => {
    setState((s) => ({ ...s, goals: [...s.goals, goal] }))
  }, [])

  const updateGoal = useCallback((id: string, updates: Partial<ActivityGoal>) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }))
  }, [])

  const removeGoal = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      goals: s.goals.filter((g) => g.id !== id),
      plannedBlocks: s.plannedBlocks.filter((b) => b.goalId !== id),
    }))
  }, [])

  // CRUD: planerade block (status/flytt m.m.).
  const updatePlannedBlock = useCallback(
    (id: string, updates: Partial<PlannedBlock>) => {
      setState((s) => ({
        ...s,
        plannedBlocks: s.plannedBlocks.map((b) =>
          b.id === id ? { ...b, ...updates } : b
        ),
      }))
    },
    []
  )

  // Sparar och normaliserar inställningar för bakåtkompatibilitet.
  const setSettings = useCallback((settings: Settings) => {
    setState((s) => ({ ...s, settings: normalizeSettings(settings) }))
  }, [])

  // Flagga för fallback med mini-pass.
  const setMinimumViableDay = useCallback((on: boolean) => {
    setState((s) => ({ ...s, minimumViableDay: on }))
  }, [])

  // Kör hela schemaläggningen för aktuell eller vald vecka.
  const runPlanWeek = useCallback((forWeekStart?: string) => {
    const s = stateRef.current
    const weekStartStr = forWeekStart ?? s.currentWeekStart
    const weekStartDate = parseWeekStartString(weekStartStr)
    // Expanderar återkommande bokningar till konkreta instanser för veckan.
    const weekCalendarEvents = expandCalendarEventsForWeek(s.calendarEvents, weekStartStr)
    try {
      const result: PlanWeekResult = planWeek(
        s.goals,
        weekCalendarEvents,
        s.plannedBlocks,
        s.settings,
        weekStartDate,
        s.minimumViableDay
      )
      setState((prev) => ({
        ...prev,
        plannedBlocks: result.plannedBlocks,
        conflictReports: result.conflictReports,
        currentWeekStart: forWeekStart ?? prev.currentWeekStart,
        scheduleVersion: prev.scheduleVersion + 1,
      }))
    } catch (err) {
      console.error('planWeek error', err)
      setState((prev) => ({
        ...prev,
        conflictReports: [
          {
            goalId: '',
            reason: `Schemaläggning misslyckades: ${err instanceof Error ? err.message : String(err)}`,
            suggestion: 'Kontrollera inställningar och försök igen.',
          },
        ],
      }))
    }
  }, [])

  // Veckonavigering i UI.
  const goToNextWeek = useCallback(() => {
    const next = addDays(parseISO(state.currentWeekStart), 7)
    setState((s) => ({
      ...s,
      currentWeekStart: getWeekStartISO(next),
    }))
  }, [state.currentWeekStart])

  const goToPrevWeek = useCallback(() => {
    const prev = addDays(parseISO(state.currentWeekStart), -7)
    setState((s) => ({
      ...s,
      currentWeekStart: getWeekStartISO(prev),
    }))
  }, [state.currentWeekStart])

  // Används av import av hela app-state.
  const replaceState = useCallback((newState: AppState) => {
    setState({ ...newState, settings: normalizeSettings(newState.settings) })
  }, [])

  return {
    state,
    addCalendarEvent,
    addCalendarEvents,
    replaceGoogleCalendarEventsForWeek,
    clearGoogleCalendarEvents,
    markGoogleEventDeleted,
    updateCalendarEvent,
    removeCalendarEvent,
    addGoal,
    updateGoal,
    removeGoal,
    updatePlannedBlock,
    setSettings,
    setMinimumViableDay,
    runPlanWeek,
    goToNextWeek,
    goToPrevWeek,
    replaceState,
  }
}

export type Store = ReturnType<typeof useStore>
