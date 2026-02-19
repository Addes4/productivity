import { useState, useEffect } from 'react'
import type { ActivityGoal, PlannedBlock } from '../types'
import { GoalForm } from './GoalForm'
import { PlanButtons } from './PlanButtons'
import { ProgressBars } from './ProgressBars'

// Standardiserad återkoppling från importflöden (JSON/iCal/Google).
interface CalendarImportResult {
  imported: number
  skipped: number
  warnings: string[]
}

// Högerspalten med målhantering, planering, import/export och Google-koppling.
export function SidePanel({
  goals,
  plannedBlocks,
  minimumViableDay,
  conflictReports,
  editingGoalId,
  onClearEditingGoalId,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
  onPlanWeek,
  onToggleMVD,
  onExport,
  onImport,
  onImportIcsText,
  onConnectGoogleCalendar,
  onImportGoogleCalendar,
  onDisconnectGoogleCalendar,
  googleCalendarConnected,
  googleCalendarEmail,
}: {
  goals: ActivityGoal[]
  plannedBlocks: PlannedBlock[]
  minimumViableDay: boolean
  conflictReports: { goalId: string; reason: string; suggestion?: string }[]
  editingGoalId: string | null
  onClearEditingGoalId: () => void
  onAddGoal: (g: ActivityGoal) => void
  onUpdateGoal: (id: string, updates: Partial<ActivityGoal>) => void
  onRemoveGoal: (id: string) => void
  onPlanWeek: () => void
  onToggleMVD: (on: boolean) => void
  onExport: () => void
  onImport: (json: string) => void
  onImportIcsText: (icsText: string) => CalendarImportResult
  onConnectGoogleCalendar: () => void
  onImportGoogleCalendar: () => Promise<CalendarImportResult>
  onDisconnectGoogleCalendar: () => Promise<void>
  googleCalendarConnected: boolean
  googleCalendarEmail: string | null
}) {
  // Lokalt UI-state i panelen.
  const [editingGoal, setEditingGoal] = useState<ActivityGoal | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importingGoogle, setImportingGoogle] = useState(false)
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false)

  // Öppnar målform i redigeringsläge när ett block begär "redigera aktivitet".
  useEffect(() => {
    if (editingGoalId && goals.length) {
      const goal = goals.find((g) => g.id === editingGoalId)
      if (goal) {
        setEditingGoal(goal)
        setShowForm(true)
      }
      onClearEditingGoalId()
    }
  }, [editingGoalId, goals, onClearEditingGoalId])

  // Skapar nytt mål eller uppdaterar befintligt mål.
  const handleSubmitGoal = (g: Omit<ActivityGoal, 'id'>) => {
    if (editingGoal) {
      onUpdateGoal(editingGoal.id, g)
      setEditingGoal(null)
    } else {
      onAddGoal({ ...g, id: `goal-${Date.now()}` } as ActivityGoal)
    }
    setShowForm(false)
  }

  const handleCancelGoalForm = () => {
    setEditingGoal(null)
    setShowForm(false)
  }

  // Import av exporterad JSON-state via filväljare.
  const handleImportClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        onImport(text)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // Enhetlig statusrad efter import.
  const summarizeImportResult = (result: CalendarImportResult): string => {
    const warningText =
      result.warnings.length > 0 ? ` Varningar: ${result.warnings[0]}` : ''
    return `Importerat: ${result.imported}, redan fanns: ${result.skipped}.${warningText}`
  }

  // Importerar lokala iCal-filer.
  const handleIcsFileImport = () => {
    setImportError(null)
    setImportStatus(null)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ics,text/calendar'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '')
          const result = onImportIcsText(text)
          setImportStatus(summarizeImportResult(result))
        } catch (err) {
          setImportError(
            `Kunde inte importera iCal-filen: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // Manuell Google-synk.
  const handleGoogleImport = async () => {
    setImportError(null)
    setImportStatus(null)
    setImportingGoogle(true)
    try {
      const result = await onImportGoogleCalendar()
      setImportStatus(summarizeImportResult(result))
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err)
      setImportError(
        `Kunde inte importera från Google. ${rawMessage}`
      )
    } finally {
      setImportingGoogle(false)
    }
  }

  // Frånkopplar Google-konto.
  const handleGoogleDisconnect = async () => {
    setImportError(null)
    setImportStatus(null)
    setDisconnectingGoogle(true)
    try {
      await onDisconnectGoogleCalendar()
      setImportStatus('Google-kalendern är frånkopplad.')
    } catch (err) {
      setImportError(
        `Kunde inte koppla från Google: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setDisconnectingGoogle(false)
    }
  }

  return (
    <aside className="w-full max-w-none xl:max-w-md xl:h-full flex flex-col bg-white/95 border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] overflow-hidden">
      <div className="p-4 overflow-auto flex-1 space-y-6">
        {/* Så funkar det */}
        <section className="rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 p-4 text-sm text-sky-900">
          <h3 className="font-semibold mb-2">Så funkar det</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Lägg till upptagna tider (bokningar) i kalendern.</li>
            <li>Skapa aktivitetsmål (t.ex. Träna 2h/vecka) – fyll i alla fält du vill.</li>
            <li>Klicka &quot;Planera veckan&quot; så pusslas målen in i lediga luckor.</li>
            <li>Klicka på ett block i schemat för att se info och markera Gjort/Delvis/Missat.</li>
          </ol>
        </section>

        {/* Aktivitetsmål */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800">Aktivitetsmål</h3>
            <button
              type="button"
              onClick={() => {
                setEditingGoal(null)
                setShowForm(true)
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + Lägg till aktivitet
            </button>
          </div>

          {showForm && (
            <div className="mb-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <GoalForm
                key={editingGoal?.id ?? 'new-goal'}
                goal={editingGoal}
                onSubmit={handleSubmitGoal}
                onCancel={handleCancelGoalForm}
              />
            </div>
          )}

          <ul className="space-y-2">
            {goals.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: g.color }}
                  />
                  <span className="font-medium text-slate-800 truncate">{g.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {g.weeklyTargetMinutes} min/v · {g.isFixed ? 'FAST' : 'RÖRLIG'}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGoal(g)
                      setShowForm(true)
                    }}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Redigera
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveGoal(g.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Ta bort
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Planera-knappar */}
        <section>
          <PlanButtons
            onPlanWeek={onPlanWeek}
            minimumViableDay={minimumViableDay}
            onToggleMVD={onToggleMVD}
          />
        </section>

        {/* Konfliktrapporter */}
        {conflictReports.length > 0 && (
          <section className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <h4 className="font-medium mb-1">Schemaläggningsvarningar</h4>
            <ul className="list-disc list-inside space-y-0.5">
              {conflictReports.map((r, i) => (
                <li key={i}>{r.reason}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Progress */}
        <section>
          <ProgressBars goals={goals} plannedBlocks={plannedBlocks} />
        </section>

        {/* Export / Import */}
        <section className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onExport}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Import JSON
            </button>
            <button
              type="button"
              onClick={handleIcsFileImport}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Import iCal (.ics)
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs text-slate-600 font-medium">Google Calendar (säker OAuth-koppling)</p>
            {googleCalendarConnected ? (
              <>
                <p className="text-xs text-emerald-700">
                  Ansluten{googleCalendarEmail ? ` som ${googleCalendarEmail}` : ''}.
                </p>
                <p className="text-xs text-slate-500">
                  Kalendern synkas automatiskt för vald vecka. Du kan även synka manuellt.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGoogleImport}
                    disabled={importingGoogle}
                    className="px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importingGoogle ? 'Synkar...' : 'Synka nu'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    disabled={disconnectingGoogle}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {disconnectingGoogle ? 'Kopplar från...' : 'Koppla från Google'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Koppla Google säkert via OAuth. Ingen hemlig kalenderlänk behövs.
                </p>
                <button
                  type="button"
                  onClick={onConnectGoogleCalendar}
                  className="px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                >
                  Anslut Google Calendar
                </button>
              </>
            )}
          </div>

          {importStatus && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
              {importStatus}
            </p>
          )}
          {importError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
              {importError}
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}
