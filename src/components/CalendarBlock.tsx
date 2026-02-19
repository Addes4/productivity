import { useDraggable } from '@dnd-kit/core'
import { format } from 'date-fns'
import type { PlannedBlock, ActivityGoal } from '../types'

// Renderar ett planerat aktivitetsblock som är dragbart i kalendern.
export function CalendarBlock({
  block,
  goal,
  top,
  height,
  leftPercent,
  widthPercent,
  onBlockClick,
}: {
  block: PlannedBlock
  goal: ActivityGoal
  top: number
  height: number
  leftPercent?: number
  widthPercent?: number
  onBlockClick?: (block: PlannedBlock, goal: ActivityGoal) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${block.id}`,
  })
  const renderHeight = Math.max(8, height - 2)
  const isCompact = renderHeight < 48
  const isTiny = renderHeight < 30
  const timeLabel = `${format(new Date(block.start), 'HH:mm')}-${format(new Date(block.end), 'HH:mm')}`
  const activityLabel = goal.name.trim() || timeLabel

  // Statusstyrd bakgrund/färgkodning.
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
      className={`absolute rounded-xl border text-xs overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${statusColor} ${isDragging ? 'opacity-90 shadow-xl z-50' : 'shadow-[0_1px_2px_rgba(15,23,42,0.08)]'}`}
      style={{
        top: top + 1,
        height: renderHeight,
        zIndex: 30,
        left:
          leftPercent == null
            ? 4
            : `calc(${leftPercent}% + 2px)`,
        width:
          widthPercent == null
            ? 'calc(100% - 8px)'
            : `calc(${widthPercent}% - 4px)`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onBlockClick?.(block, goal)
      }}
    >
      <div
        className={`h-full flex flex-col ${isCompact ? 'px-2 py-1 justify-center gap-0.5' : 'p-2 justify-between'}`}
        style={{
          backgroundColor: goal.color ? `${goal.color}22` : undefined,
          borderLeftColor: goal.color,
          borderLeftWidth: 4,
        }}
      >
        {isCompact ? (
          <span className={`font-semibold text-slate-800 truncate leading-tight ${isTiny ? 'text-[11px]' : 'text-xs'}`}>
            {activityLabel}
          </span>
        ) : (
          <>
            <span className="font-semibold text-slate-800 truncate leading-tight">{activityLabel}</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-600 tabular-nums text-[11px]">{timeLabel}</span>
              {block.isMini && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 text-slate-600 border border-slate-200">
                  mini
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
