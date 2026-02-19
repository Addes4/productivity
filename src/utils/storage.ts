import type { AppState } from '../types'

// Nyckel/version för lokallagring av hela app-state.
export const STORAGE_KEY = 'productivity-app-state'
const VERSION = 1

interface StoredState {
  version: number
  data: AppState
}

// Läser state från localStorage och ignorerar okänd version.
export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: StoredState = JSON.parse(raw)
    if (parsed.version !== VERSION) return null
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

// Importerar state från JSON-sträng, med enkel validering.
export function importState(json: string): AppState | null {
  try {
    const parsed = JSON.parse(json) as StoredState
    if (!parsed.data) return null
    return parsed.data
  } catch {
    return null
  }
}
