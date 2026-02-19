import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { PlannedBlock, ActivityGoal, DayOfWeek } from '../types'

// Label-mappningar för läsbar presentation i detaljvyn.
const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Söndag',
  1: 'Måndag',
  2: 'Tisdag',
  3: 'Onsdag',
  4: 'Torsdag',
  5: 'Fredag',
  6: 'Lördag',
}

const PRIORITY_LABEL = { low: 'Låg', medium: 'Medel', high: 'Hög' }
const PREFERRED_LABEL = { morning: 'Morgon', lunch: 'Lunch', evening: 'Kväll', any: 'Valfri' }
const LOCATION_LABEL = { home: 'Hemma', gym: 'Gym', office: 'Kontor', any: 'Valfri' }

// Visar detaljer om ett planerat block + snabbåtgärder för status/redigering.
export function BlockDetailModal({
  block,
  goal,
  onStatusChange,
  onEditGoal,
  onClose,
}: {
  block: PlannedBlock
  goal: ActivityGoal
  onStatusChange?: (blockId: string, status: 'done' | 'missed' | 'partial') => void
  onEditGoal?: (goalId: string) => void
  onClose: () => void
}) {
  // Sammanhängande text för tillåtna dagar.
  const allowedDaysStr = goal.allowedDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(', ')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-4 border-b shrink-0"
          style={{ borderLeftWidth: 4, borderLeftColor: goal.color }}
        >
          <h2 className="text-xl font-bold text-slate-800">{goal.name}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(block.start), 'EEEE d MMMM', { locale: sv })} ·{' '}
            {format(new Date(block.start), 'HH:mm')}–{format(new Date(block.end), 'HH:mm')}
            {block.isMini && ' · 10 min mini-pass'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Status: {block.status === 'planned' && 'Planerad'}
            {block.status === 'done' && '✓ Gjort'}
            {block.status === 'partial' && '~ Delvis'}
            {block.status === 'missed' && '✗ Missat'}
          </p>
        </div>

        <div className="p-4 overflow-auto flex-1 space-y-4 text-sm">
          <section>
            <h3 className="font-semibold text-slate-700 mb-2">Det här blocket</h3>
            <ul className="space-y-1 text-slate-600">
              <li>Start: {format(new Date(block.start), 'HH:mm')}</li>
              <li>Slut: {format(new Date(block.end), 'HH:mm')}</li>
              <li>Låst: {block.locked ? 'Ja' : 'Nej'}</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-slate-700 mb-2">Aktivitetsmål</h3>
            <ul className="space-y-1 text-slate-600">
              <li>Kategori: {goal.category}</li>
              <li>Veckomål: {goal.weeklyTargetMinutes} min</li>
              <li>Passlängd: {goal.sessionMinutes} min</li>
              <li>Min–max/vecka: {goal.minWeeklyMinutes}–{goal.maxWeeklyMinutes} min</li>
              {goal.sessionsPerWeek != null && (
                <li>Frekvens: {goal.sessionsPerWeek} pass/vecka</li>
              )}
              <li>Prioritet: {PRIORITY_LABEL[goal.priority]}</li>
              <li>Tillåtna dagar: {allowedDaysStr}</li>
              <li>Tid: {goal.earliestStart}–{goal.latestEnd}</li>
              <li>Preferens: {PREFERRED_LABEL[goal.preferredTimeOfDay]}</li>
              <li>Plats: {LOCATION_LABEL[goal.location]}</li>
              {goal.equipment && <li>Utrustning: {goal.equipment}</li>}
              {goal.travelBufferMinutes > 0 && (
                <li>Restidsbuffert: {goal.travelBufferMinutes} min</li>
              )}
              <li>Typ: {goal.isFixed ? 'FAST (låst)' : 'RÖRLIG (flyttbar)'}</li>
            </ul>
          </section>

          {onStatusChange && !block.locked && (
            <section>
              <h3 className="font-semibold text-slate-700 mb-2">Markera status</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onStatusChange(block.id, 'done')
                    onClose()
                  }}
                  className="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 font-medium hover:bg-green-200"
                >
                  ✓ Gjort
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStatusChange(block.id, 'partial')
                    onClose()
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 font-medium hover:bg-amber-200"
                >
                  ~ Delvis
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStatusChange(block.id, 'missed')
                    onClose()
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-100 text-red-800 font-medium hover:bg-red-200"
                >
                  ✗ Missat
                </button>
              </div>
            </section>
          )}

          {onEditGoal && (
            <button
              type="button"
              onClick={() => {
                onEditGoal(goal.id)
                onClose()
              }}
              className="w-full py-2 px-4 border border-indigo-300 text-indigo-700 rounded-xl font-medium hover:bg-indigo-50"
            >
              Redigera aktivitet
            </button>
          )}
        </div>

        <div className="p-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700"
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  )
}
