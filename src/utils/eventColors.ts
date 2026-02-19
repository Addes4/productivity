import type { EventColors, EventSource } from '../types'

// Fallback-färger för respektive källa.
export const DEFAULT_EVENT_COLORS: EventColors = {
  manual: '#0ea5e9',
  import: '#f59e0b',
  google: '#22c55e',
}

// Tillåter endast #RRGGBB för att undvika ogiltiga CSS-värden.
function sanitizeHexColor(input: string | undefined, fallback: string): string {
  if (!input) return fallback
  const value = input.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  return fallback
}

// Säkerställer att alla tre källfärger alltid finns och är validerade.
export function normalizeEventColors(colors?: Partial<EventColors> | null): EventColors {
  return {
    manual: sanitizeHexColor(colors?.manual, DEFAULT_EVENT_COLORS.manual),
    import: sanitizeHexColor(colors?.import, DEFAULT_EVENT_COLORS.import),
    google: sanitizeHexColor(colors?.google, DEFAULT_EVENT_COLORS.google),
  }
}

// Returnerar rätt färg baserat på eventets källa.
export function getEventSourceColor(source: EventSource, colors: EventColors): string {
  if (source === 'google') return colors.google
  if (source === 'import') return colors.import
  return colors.manual
}
