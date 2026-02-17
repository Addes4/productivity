import type { ActivityGoal, PlannedBlock } from '../types'
import { differenceInMinutes } from 'date-fns'
import { parseISO } from 'date-fns'

export function ProgressBars({
  goals,
  plannedBlocks,
}: {
  goals: ActivityGoal[]
  plannedBlocks: PlannedBlock[]
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-800">Progress per mål</h3>
      {goals.map((goal) => {
        const target = goal.weeklyTargetMinutes
        const blocks = plannedBlocks.filter((b) => b.goalId === goal.id)
        const doneMinutes = blocks
          .filter((b) => b.status === 'done')
          .reduce((sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)), 0)
        const partialMinutes = blocks
          .filter((b) => b.status === 'partial')
          .reduce((sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)) * 0.5, 0)
        const plannedMinutes = blocks
          .filter((b) => b.status === 'planned')
          .reduce((sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)), 0)
        const missedMinutes = blocks
          .filter((b) => b.status === 'missed')
          .reduce((sum, b) => sum + differenceInMinutes(parseISO(b.end), parseISO(b.start)), 0)

        const effectiveDone = doneMinutes + partialMinutes
        const percent = target > 0 ? Math.min(100, Math.round((effectiveDone / target) * 100)) : 0

        return (
          <div key={goal.id} className="text-sm">
            <div className="flex justify-between mb-0.5">
              <span className="font-medium text-slate-700 truncate" style={{ color: goal.color }}>
                {goal.name}
              </span>
              <span className="text-slate-500 tabular-nums">
                {effectiveDone.toFixed(0)} / {target} min ({percent}%)
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  backgroundColor: goal.color,
                }}
              />
            </div>
            {(plannedMinutes > 0 || missedMinutes > 0) && (
              <div className="text-xs text-slate-400 mt-0.5">
                Planerat: {plannedMinutes.toFixed(0)} min · Missat: {missedMinutes.toFixed(0)} min
              </div>
            )}
          </div>
        )
      })}
      {goals.length === 0 && (
        <p className="text-slate-500 text-sm">Lägg till aktivitetsmål för att se progress.</p>
      )}
    </div>
  )
}
