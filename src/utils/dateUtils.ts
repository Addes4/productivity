import {
  addDays,
  startOfDay,
  startOfWeek,
  format,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  differenceInCalendarDays,
  min as minDate,
  max as maxDate,
} from 'date-fns'
import type { DayOfWeek } from '../types'

const TIME_FORMAT = 'HH:mm'

/** Returnerar måndag för den vecka som innehåller date */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function getWeekStartISO(date: Date): string {
  return format(getWeekStart(date), 'yyyy-MM-dd')
}

/** Parsar "HH:mm" till Date (idag som bas, bara tid används) */
export function parseTime(timeStr: string, refDate: Date): Date {
  const [h, m] = timeStr.split(':').map(Number)
  return setMilliseconds(setSeconds(setMinutes(setHours(refDate, h), m ?? 0), 0), 0)
}

export function formatTime(d: Date): string {
  return format(d, TIME_FORMAT)
}

/** Dag 0 = söndag i JS; vi använder 0=sön, 1=mån... */
export function getDayOfWeek(d: Date): DayOfWeek {
  return getDay(d) as DayOfWeek
}

/** Genererar alla datum för veckan (mån–sön) */
export function getWeekDates(weekStart: Date): Date[] {
  const out: Date[] = []
  for (let i = 0; i < 7; i++) {
    out.push(addDays(weekStart, i))
  }
  return out
}

export function isAllDayEventRange(start: Date, end: Date): boolean {
  if (!(end > start)) return false
  const startIsMidnight =
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    start.getSeconds() === 0 &&
    start.getMilliseconds() === 0
  const endIsMidnight =
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getMilliseconds() === 0
  if (!startIsMidnight || !endIsMidnight) return false
  return differenceInCalendarDays(end, start) >= 1
}

export function doesRangeOverlapDay(start: Date, end: Date, day: Date): boolean {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  return start < dayEnd && end > dayStart
}

/** Slots: { start, end }[] för en given dag, mellan dayStart och dayEnd, minus blockerade intervall */
export interface TimeSlot {
  start: Date
  end: Date
}

export function getFreeSlotsForDay(
  day: Date,
  dayStart: Date,
  dayEnd: Date,
  blocked: { start: Date; end: Date }[]
): TimeSlot[] {
  let current = maxDate([dayStart, setSeconds(setMinutes(setHours(day, 0), 0), 0)])
  const endOfDay = minDate([dayEnd, setSeconds(setMinutes(setHours(day, 23), 59), 59)])
  const sorted = [...blocked].sort((a, b) => a.start.getTime() - b.start.getTime())
  const slots: TimeSlot[] = []

  for (const b of sorted) {
    if (b.end <= current || b.start >= endOfDay) continue
    const blockStart = maxDate([b.start, current])
    const blockEnd = minDate([b.end, endOfDay])
    if (blockStart > current) {
      slots.push({ start: new Date(current), end: new Date(blockStart) })
    }
    current = maxDate([current, blockEnd])
  }
  if (current < endOfDay) {
    slots.push({ start: new Date(current), end: new Date(endOfDay) })
  }
  return slots
}
