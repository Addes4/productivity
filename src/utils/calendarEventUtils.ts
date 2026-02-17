import type { CalendarEvent } from '../types'

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isWeekNumberTitle(title: string): boolean {
  const t = normalizeText(title)
  if (!t) return false
  if (/^(v|vecka|week)\.?\s*\d{1,2}$/.test(t)) return true
  return false
}

function isWeekNumberCategory(category: string): boolean {
  const c = normalizeText(category)
  if (!c) return false
  return (
    c.includes('veckonummer') ||
    c.includes('week number') ||
    c.includes('week numbers') ||
    c.includes('weeknummer')
  )
}

export function isWeekNumberEvent(
  event: Pick<CalendarEvent, 'title' | 'category'>
): boolean {
  return isWeekNumberCategory(event.category) || isWeekNumberTitle(event.title)
}
