import { addDays, parseISO } from 'date-fns'
import type { CalendarEvent, DayOfWeek } from '../types'

// Parsar "yyyy-MM-dd" till lokalt datum vid midnatt.
function parseWeekStart(weekStart: string): Date {
  const [y, m, d] = weekStart.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

// Överlappning mellan två tidsintervall.
function overlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return start < rangeEnd && end > rangeStart
}

// Konverterar dag (0=sön...6=lör) till index i en måndag-startad vecka.
function dayToOffsetFromMonday(day: DayOfWeek): number {
  return (day + 6) % 7
}

// Typvakt för återkommande event.
function hasRecurringDays(event: CalendarEvent): event is CalendarEvent & { recurrenceDays: DayOfWeek[] } {
  return Array.isArray(event.recurrenceDays) && event.recurrenceDays.length > 0
}

// Tar bort dubletter och ogiltiga dagvärden.
function uniqueDays(days: DayOfWeek[]): DayOfWeek[] {
  return Array.from(new Set(days)).filter(
    (d): d is DayOfWeek => Number.isInteger(d) && d >= 0 && d <= 6
  )
}

// Datumnyckel som används i recurrenceExDates.
function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Expanderar veckovisa återkommande bokningar till konkreta instanser för den valda veckan.
export function expandCalendarEventsForWeek(
  events: CalendarEvent[],
  weekStart: string
): CalendarEvent[] {
  const weekStartDate = parseWeekStart(weekStart)
  const weekEndDate = addDays(weekStartDate, 7)
  const out: CalendarEvent[] = []

  for (const event of events) {
    const start = parseISO(event.start)
    const end = parseISO(event.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      continue
    }

    if (!hasRecurringDays(event)) {
      if (overlapsRange(start, end, weekStartDate, weekEndDate)) {
        out.push(event)
      }
      continue
    }

    // Rendera endast veckans instanser av en återkommande bokning.
    const durationMs = end.getTime() - start.getTime()
    const excludedDates = new Set(event.recurrenceExDates ?? [])
    for (const day of uniqueDays(event.recurrenceDays)) {
      const targetDay = addDays(weekStartDate, dayToOffsetFromMonday(day))
      const dayKey = toDateKey(targetDay)
      if (excludedDates.has(dayKey)) continue
      const occurrenceStart = new Date(targetDay)
      occurrenceStart.setHours(
        start.getHours(),
        start.getMinutes(),
        start.getSeconds(),
        start.getMilliseconds()
      )
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs)
      if (!overlapsRange(occurrenceStart, occurrenceEnd, weekStartDate, weekEndDate)) continue

      out.push({
        ...event,
        id: `${event.id}__rec-${targetDay.toISOString().slice(0, 10)}`,
        start: occurrenceStart.toISOString(),
        end: occurrenceEnd.toISOString(),
        recurrenceParentId: event.id,
        recurrenceInstanceDate: dayKey,
      })
    }
  }

  return out
}
