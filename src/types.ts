/**
 * Data-modell för produktivitetsappen.
 * CalendarEvent = manuella/importbokningar.
 * ActivityGoal = mål (t.ex. "Träna 2h/vecka").
 * PlannedBlock = ett schemalagt block kopplat till ett mål.
 * Settings = globala inställningar.
 */

export type EventSource = 'manual' | 'import'

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = söndag

export type Priority = 'low' | 'medium' | 'high'

export type PreferredTimeOfDay = 'morning' | 'lunch' | 'evening' | 'any'

export type Location = 'home' | 'gym' | 'office' | 'any'

export type BlockStatus = 'planned' | 'done' | 'missed' | 'partial'

export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO datetime
  end: string
  source: EventSource
  locked: boolean
  category: string
}

export interface ActivityGoal {
  id: string
  name: string
  category: string
  weeklyTargetMinutes: number
  sessionMinutes: number
  minWeeklyMinutes: number
  maxWeeklyMinutes: number
  sessionsPerWeek?: number
  priority: Priority
  allowedDays: DayOfWeek[] // 0=sön, 1=mån, ...
  earliestStart: string // "HH:mm"
  latestEnd: string
  preferredTimeOfDay: PreferredTimeOfDay
  location: Location
  equipment?: string
  travelBufferMinutes: number
  isFixed: boolean
  color: string
}

export interface PlannedBlock {
  id: string
  goalId: string
  start: string
  end: string
  status: BlockStatus
  locked: boolean
  isMini?: boolean // true = 10-min minimum viable session
}

export interface SleepWindow {
  start: string // "HH:mm"
  end: string
  days: DayOfWeek[]
}

export interface WorkHours {
  start: string
  end: string
  days: DayOfWeek[]
  enabled: boolean
}

export interface Settings {
  workHours: WorkHours
  sleepWindow: SleepWindow
  minBreakMinutes: number
  maxActivitiesPerDay: number
  officeDays: DayOfWeek[]
  timezone: string
}

export interface ConflictReport {
  goalId: string
  reason: string
  suggestion?: string
}

export interface WeekScheduleVersion {
  weekStart: string // ISO date (monday)
  plannedBlocks: PlannedBlock[]
  conflictReports: ConflictReport[]
  createdAt: string
}

export interface AppState {
  calendarEvents: CalendarEvent[]
  goals: ActivityGoal[]
  plannedBlocks: PlannedBlock[]
  settings: Settings
  currentWeekStart: string
  conflictReports: ConflictReport[]
  minimumViableDay: boolean
  scheduleVersion: number
}
