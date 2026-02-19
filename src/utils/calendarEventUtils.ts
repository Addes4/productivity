import type { CalendarEvent } from '../types'

// Normaliserar text för robust matchning (accenter, case, whitespace).
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Matchar titlar som "v7", "vecka 7", "week 7".
function isWeekNumberTitle(title: string): boolean {
  const t = normalizeText(title)
  if (!t) return false
  if (/^(v|vecka|week)\.?\s*\d{1,2}$/.test(t)) return true
  return false
}

// Matchar kategorier som representerar veckonummer-kalendrar.
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

// Hjälpfunktion för att filtrera bort veckonummer från vanliga bokningar i UI/schemaläggning.
export function isWeekNumberEvent(
  event: Pick<CalendarEvent, 'title' | 'category'>
): boolean {
  return isWeekNumberCategory(event.category) || isWeekNumberTitle(event.title)
}
