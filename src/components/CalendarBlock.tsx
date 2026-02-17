import { useDraggable } from '@dnd-kit/core'
import { format } from 'date-fns'
import type { PlannedBlock, ActivityGoal } from '../types'

export function CalendarBlock({
  block,
  goal,
  top,
  height,
  onBlockClick,
}: {
  block: PlannedBlock
  goal: ActivityGoal
  top: number
  height: number
  onBlockClick?: (block: PlannedBlock, goal: ActivityGoal) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    disabled: block.locked,
  })

  const statusColor =
    block.status === 'done'
      ? 'bg-emerald-50 border-emerald-400/70'
      : block.status === 'missed'
        ? 'bg-rose-50 border-rose-400/70'
        : block.status === 'partial'
          ? 'bg-amber-50 border-amber-400/70'
          : 'bg-sky-50/95 border-sky-300/80'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute left-1 right-1 rounded-xl border text-xs overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${statusColor} ${isDragging ? 'opacity-90 shadow-xl z-50' : 'shadow-[0_1px_2px_rgba(15,23,42,0.08)]'}`}
      style={{ top: top + 1, height: Math.max(8, height - 2), zIndex: 30 }}
      onClick={(e) => {
        e.stopPropagation()
        onBlockClick?.(block, goal)
      }}
    >
      <div
        className="p-2 h-full flex flex-col justify-between"
        style={{
          backgroundColor: goal.color ? `${goal.color}22` : undefined,
          borderLeftColor: goal.color,
          borderLeftWidth: 4,
        }}
      >
        <span className="font-semibold text-slate-800 truncate leading-tight">{goal.name}</span>
        <div className="flex items-center gap-1">
          <span className="text-slate-600 text-[11px] tabular-nums">
            {format(new Date(block.start), 'HH:mm')}-{format(new Date(block.end), 'HH:mm')}
          </span>
          {block.isMini && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 text-slate-600 border border-slate-200">
              mini
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
