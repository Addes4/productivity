/**
 * Data-modell för produktivitetsappen.
 * CalendarEvent = manuella/importbokningar.
 * ActivityGoal = mål (t.ex. "Träna 2h/vecka").
 * PlannedBlock = ett schemalagt block kopplat till ett mål.
 * Settings = globala inställningar.
 */

// Ursprung för en kalenderbokning.
export type EventSource = 'manual' | 'import' | 'google'

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = söndag

// Prioritering som påverkar sortering i schemaläggaren.
export type Priority = 'low' | 'medium' | 'high'

// Tidspreferens som används i slot-scoring.
export type PreferredTimeOfDay = 'morning' | 'lunch' | 'evening' | 'any'

// Kontext/plats för aktivitet (framtida constraints).
export type Location = 'home' | 'gym' | 'office' | 'any'

// Utfall för ett planerat block.
export type BlockStatus = 'planned' | 'done' | 'missed' | 'partial'

// Kalenderbokning, manuellt skapad eller importerad.
export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO datetime
  end: string
  allDay?: boolean
  recurrenceDays?: DayOfWeek[] // veckovis återkommande på valda veckodagar
  recurrenceExDates?: string[] // lokala datum-nycklar ("yyyy-MM-dd") som ska hoppas över
  recurrenceEndDate?: string // "yyyy-MM-dd" — inga instanser genereras efter detta datum
  recurrenceParentId?: string // används endast för renderade instanser
  recurrenceInstanceDate?: string // används endast för renderade instanser
  source: EventSource
  locked: boolean
  category: string
}

// Konfiguration för ett aktivitetsmål som ska planeras ut.
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

// Konkret placerat pass i schemat.
export interface PlannedBlock {
  id: string
  goalId: string
  start: string
  end: string
  status: BlockStatus
  locked: boolean
  isMini?: boolean // true = 10-min minimum viable session
}

// Skyddat tidsfönster som planeringen inte får använda.
export interface SleepWindow {
  start: string // "HH:mm"
  end: string
  days: DayOfWeek[]
}

// Arbetstidsram för schemaläggning (kan inaktiveras).
export interface WorkHours {
  start: string
  end: string
  days: DayOfWeek[]
  enabled: boolean
}

// Färgtema per bokningskälla.
export interface EventColors {
  manual: string
  import: string
  google: string
}

// Globala appinställningar för planering och rendering.
export interface Settings {
  workHours: WorkHours
  sleepWindow: SleepWindow
  minBreakMinutes: number
  maxActivitiesPerDay: number
  officeDays: DayOfWeek[]
  timezone: string
  eventColors: EventColors
}

// Varning när hela målet inte kunde schemaläggas.
export interface ConflictReport {
  goalId: string
  reason: string
  suggestion?: string
}

// Standardiserad återkoppling från importflöden (JSON/iCal/Google).
export interface CalendarImportResult {
  imported: number
  skipped: number
  warnings: string[]
}

// Hela persistenta app-state.
export interface AppState {
  calendarEvents: CalendarEvent[]
  goals: ActivityGoal[]
  plannedBlocks: PlannedBlock[]
  settings: Settings
  currentWeekStart: string
  conflictReports: ConflictReport[]
  minimumViableDay: boolean
  scheduleVersion: number
  deletedGoogleEventKeys: string[] // "title|start|end"-nycklar för manuellt raderade Google-event
}
