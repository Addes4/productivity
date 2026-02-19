import type { CalendarEvent, ActivityGoal, Settings } from '../types'
import { getWeekStart, getWeekStartISO } from '../utils/dateUtils'
import { addDays, setHours, setMinutes } from 'date-fns'
import { DEFAULT_EVENT_COLORS } from '../utils/eventColors'

// Standardvärden som används första gången appen öppnas.
const WEEKDAYS: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5]

export const defaultSettings: Settings = {
  workHours: {
    start: '09:00',
    end: '17:00',
    days: WEEKDAYS,
    enabled: true,
  },
  sleepWindow: {
    start: '23:00',
    end: '07:00',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  minBreakMinutes: 15,
  maxActivitiesPerDay: 5,
  officeDays: [1, 2, 3],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  eventColors: DEFAULT_EVENT_COLORS,
}

// Demo-bokningar för att göra UI:t användbart direkt vid första start.
function createDemoEvents(weekStart: Date): CalendarEvent[] {
  const mon = addDays(weekStart, 0)
  const tue = addDays(weekStart, 1)
  const wed = addDays(weekStart, 2)
  return [
    {
      id: 'demo-event-1',
      title: 'Morgonmöte',
      start: setHours(setMinutes(mon, 0), 9).toISOString(),
      end: setHours(setMinutes(mon, 30), 9).toISOString(),
      source: 'manual',
      locked: false,
      category: 'Arbete',
    },
    {
      id: 'demo-event-2',
      title: 'Lunch',
      start: setHours(setMinutes(tue, 0), 12).toISOString(),
      end: setHours(setMinutes(tue, 30), 12).toISOString(),
      source: 'manual',
      locked: false,
      category: 'Övrigt',
    },
    {
      id: 'demo-event-3',
      title: 'Projekt X',
      start: setHours(setMinutes(wed, 0), 14).toISOString(),
      end: setHours(setMinutes(wed, 0), 16).toISOString(),
      source: 'manual',
      locked: false,
      category: 'Arbete',
    },
  ]
}

// Demo-mål som visar hur olika måltyper kan konfigureras.
export function createDemoGoals(): ActivityGoal[] {
  return [
    {
      id: 'demo-goal-1',
      name: 'Träna',
      category: 'Hälsa',
      weeklyTargetMinutes: 120,
      sessionMinutes: 45,
      minWeeklyMinutes: 60,
      maxWeeklyMinutes: 180,
      sessionsPerWeek: 3,
      priority: 'high',
      allowedDays: [1, 2, 3, 4, 5],
      earliestStart: '06:00',
      latestEnd: '21:00',
      preferredTimeOfDay: 'evening',
      location: 'gym',
      travelBufferMinutes: 15,
      isFixed: false,
      color: '#22c55e',
    },
    {
      id: 'demo-goal-2',
      name: 'Läsa',
      category: 'Utveckling',
      weeklyTargetMinutes: 90,
      sessionMinutes: 30,
      minWeeklyMinutes: 30,
      maxWeeklyMinutes: 120,
      priority: 'medium',
      allowedDays: [0, 1, 2, 3, 4, 5, 6],
      earliestStart: '07:00',
      latestEnd: '22:00',
      preferredTimeOfDay: 'morning',
      location: 'home',
      travelBufferMinutes: 0,
      isFixed: false,
      color: '#8b5cf6',
    },
    {
      id: 'demo-goal-3',
      name: 'Stretching',
      category: 'Hälsa',
      weeklyTargetMinutes: 60,
      sessionMinutes: 15,
      minWeeklyMinutes: 30,
      maxWeeklyMinutes: 90,
      sessionsPerWeek: 4,
      priority: 'low',
      allowedDays: [1, 2, 3, 4, 5, 6],
      earliestStart: '06:00',
      latestEnd: '22:00',
      preferredTimeOfDay: 'any',
      location: 'home',
      travelBufferMinutes: 0,
      isFixed: false,
      color: '#f59e0b',
    },
  ]
}

// Skapar initial appdata med aktuell veckostart.
export function createDemoData(): {
  calendarEvents: CalendarEvent[]
  goals: ActivityGoal[]
  currentWeekStart: string
} {
  const now = new Date()
  const weekStart = getWeekStart(now)
  const currentWeekStart = getWeekStartISO(weekStart)

  return {
    calendarEvents: createDemoEvents(weekStart),
    goals: createDemoGoals(),
    currentWeekStart,
  }
}
