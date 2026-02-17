import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  AppState,
  CalendarEvent,
  ActivityGoal,
  PlannedBlock,
  Settings,
  ConflictReport,
} from '../types'
import { planWeek, type PlanWeekResult } from '../utils/planWeek'
import { getWeekStartISO } from '../utils/dateUtils'
import { parseISO, addDays } from 'date-fns'
import { defaultSettings, createDemoData } from '../data/demoData'
import { loadState, saveState } from '../utils/storage'

const initial: AppState = {
  calendarEvents: [],
  goals: [],
  plannedBlocks: [],
  settings: defaultSettings,
  currentWeekStart: getWeekStartISO(new Date()),
  conflictReports: [],
  minimumViableDay: false,
  scheduleVersion: 0,
}

export function useStore() {
  const [state, setState] = useState<AppState>(() => {
    const loaded = loadState()
    if (loaded) return loaded
    const demo = createDemoData()
    return { ...initial, ...demo }
  })

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    saveState(state)
  }, [state])

  const setCurrentWeekStart = useCallback((weekStart: string) => {
    setState((s) => ({ ...s, currentWeekStart: weekStart }))
  }, [])

  const addCalendarEvent = useCallback((event: CalendarEvent) => {
    setState((s) => ({
      ...s,
      calendarEvents: [...s.calendarEvents, event],
    }))
  }, [])

  const addCalendarEvents = useCallback((events: CalendarEvent[]) => {
    if (events.length === 0) return
    setState((s) => ({
      ...s,
      calendarEvents: [...s.calendarEvents, ...events],
    }))
  }, [])

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

  const setPlannedBlocks = useCallback((blocks: PlannedBlock[]) => {
    setState((s) => ({
      ...s,
      plannedBlocks: blocks,
      scheduleVersion: s.scheduleVersion + 1,
    }))
  }, [])

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

  const setSettings = useCallback((settings: Settings) => {
    setState((s) => ({ ...s, settings }))
  }, [])

  const setConflictReports = useCallback((reports: ConflictReport[]) => {
    setState((s) => ({ ...s, conflictReports: reports }))
  }, [])

  const setMinimumViableDay = useCallback((on: boolean) => {
    setState((s) => ({ ...s, minimumViableDay: on }))
  }, [])

  const runPlanWeek = useCallback((forWeekStart?: string) => {
    const s = stateRef.current
    const weekStartStr = forWeekStart ?? s.currentWeekStart
    const [y, m, d] = weekStartStr.split('-').map(Number)
    const weekStartDate = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
    try {
      const result: PlanWeekResult = planWeek(
        s.goals,
        s.calendarEvents,
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

  const replaceState = useCallback((newState: AppState) => {
    setState(newState)
  }, [])

  return {
    state,
    setCurrentWeekStart,
    addCalendarEvent,
    addCalendarEvents,
    updateCalendarEvent,
    removeCalendarEvent,
    addGoal,
    updateGoal,
    removeGoal,
    setPlannedBlocks,
    updatePlannedBlock,
    setSettings,
    setConflictReports,
    setMinimumViableDay,
    runPlanWeek,
    goToNextWeek,
    goToPrevWeek,
    replaceState,
  }
}

export type Store = ReturnType<typeof useStore>
