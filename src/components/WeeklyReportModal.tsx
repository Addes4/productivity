import type { ActivityGoal, PlannedBlock, ConflictReport } from '../types'
import { differenceInMinutes } from 'date-fns'
import { parseISO } from 'date-fns'

// Summerad vy av veckans utfall per mål.
export function WeeklyReportModal({
  goals,
  plannedBlocks,
  conflictReports,
  onClose,
}: {
  goals: ActivityGoal[]
  plannedBlocks: PlannedBlock[]
  conflictReports: ConflictReport[]
  onClose: () => void
}) {
  // Beräknar planerat/gjort/missat samt om målet anses uppnått.
  const goalStats = goals.map((goal) => {
    const blocks = plannedBlocks.filter((b) => b.goalId === goal.id)
    const target = goal.weeklyTargetMinutes
    const planned = blocks.reduce(
      (sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)),
      0
    )
    const done = blocks
      .filter((b) => b.status === 'done')
      .reduce(
        (sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)),
        0
      )
    const partial = blocks
      .filter((b) => b.status === 'partial')
      .reduce(
        (sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)) * 0.5,
        0
      )
    const missed = blocks
      .filter((b) => b.status === 'missed')
      .reduce(
        (sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)),
        0
      )
    const effectiveDone = done + partial
    const reached = target > 0 && effectiveDone >= target * 0.9
    return {
      goal,
      target,
      planned,
      done: effectiveDone,
      missed,
      reached,
    }
  })

  const reachedCount = goalStats.filter((s) => s.reached).length
  const totalGoals = goals.length
  // Enkel textrekommendation utifrån resultat och konflikter.
  const suggestion =
    conflictReports.length > 0
      ? 'Justera tidsfönster eller aktivera "Minimum viable day" för att få in fler pass.'
      : reachedCount === totalGoals && totalGoals > 0
        ? 'Bra jobbat! Alla mål nådda.'
        : 'Fortsätt checka av block eller planera om veckan för bättre fördelning.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">Veckorapport</h2>
          <p className="text-slate-600 mt-1">
            Du klarade {reachedCount} av {totalGoals} mål. Föreslagen justering: {suggestion}
          </p>
        </div>
        <div className="p-6 overflow-auto flex-1 space-y-4">
          {goalStats.map(({ goal, target, planned, done, missed, reached }) => (
            <div
              key={goal.id}
              className="p-3 rounded-xl border border-slate-200 bg-slate-50/50"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium" style={{ color: goal.color }}>
                  {goal.name}
                </span>
                {reached ? (
                  <span className="text-green-600 text-sm font-medium">✓ Nådd</span>
                ) : (
                  <span className="text-amber-600 text-sm">Ej nådd</span>
                )}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Mål: {target} min · Planerat: {planned.toFixed(0)} min · Gjort: {done.toFixed(0)} min
                {missed > 0 && ` · Missat: ${missed.toFixed(0)} min`}
              </div>
            </div>
          ))}
          {conflictReports.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50">
              <h4 className="font-medium text-amber-800 mb-2">Konflikter / för få luckor</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                {conflictReports.map((r, i) => (
                  <li key={i}>
                    {r.reason} {r.suggestion && `→ ${r.suggestion}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-slate-200">
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
