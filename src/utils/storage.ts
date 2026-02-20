import type { AppState } from '../types'

// Nyckel/version för lokallagring av hela app-state.
export const STORAGE_KEY = 'productivity-app-state'
const VERSION = 1

interface StoredState {
  version: number
  data: AppState
}

// Kontrollerar att obligatoriska fält finns så att trasig JSON inte kraschar appen.
function isValidAppState(data: unknown): data is AppState {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    Array.isArray(d.calendarEvents) &&
    Array.isArray(d.goals) &&
    Array.isArray(d.plannedBlocks) &&
    Array.isArray(d.conflictReports) &&
    typeof d.currentWeekStart === 'string' &&
    typeof d.settings === 'object' &&
    d.settings !== null
  )
}

// Läser state från localStorage och ignorerar okänd version.
export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: StoredState = JSON.parse(raw)
    if (parsed.version !== VERSION) return null
    if (!isValidAppState(parsed.data)) return null
    return parsed.data
  } catch {
    return null
  }
}

// Sparar state till localStorage på varje förändring.
export function saveState(state: AppState): void {
  try {
    const toSave: StoredState = { version: VERSION, data: state }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (e) {
    console.warn('Failed to save state', e)
  }
}

// Exporterar state som läsbar JSON.
export function exportState(state: AppState): string {
  return JSON.stringify({ version: VERSION, data: state }, null, 2)
}

// Importerar state från JSON-sträng med strukturell validering.
export function importState(json: string): AppState | null {
  try {
    const parsed = JSON.parse(json) as StoredState
    if (!parsed.data || !isValidAppState(parsed.data)) return null
    return parsed.data
  } catch {
    return null
  }
}
