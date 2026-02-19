import { useDraggable } from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import type { CalendarEvent } from '../types'

// Renderar en tidsatt kalenderbokning som dragbar och klickbar.
export function CalendarEventBlock({
  event,
  top,
  height,
  leftPercent,
  widthPercent,
  accentColor,
  onEventClick,
}: {
  event: CalendarEvent
  top: number
  height: number
  leftPercent: number
  widthPercent: number
  accentColor: string
  onEventClick?: (event: CalendarEvent) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event:${event.id}`,
  })
  const renderHeight = Math.max(8, height - 2)
  const isCompact = renderHeight < 48
  const isTiny = renderHeight < 30
  const timeLabel = `${format(parseISO(event.start), 'HH:mm')}-${format(parseISO(event.end), 'HH:mm')}`
  const eventLabel = event.title.trim() || timeLabel

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute rounded-xl border text-xs overflow-hidden text-left transition-colors cursor-grab active:cursor-grabbing hover:brightness-[0.98] ${isCompact ? 'px-2 py-1' : 'p-2'} ${isDragging ? 'shadow-xl opacity-90 z-50' : 'shadow-[0_1px_2px_rgba(15,23,42,0.08)]'}`}
      style={{
        top,
        height: renderHeight,
        zIndex: 20,
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        backgroundColor: `${accentColor}1f`,
        borderColor: `${accentColor}cc`,
        borderLeftColor: accentColor,
        borderLeftWidth: 4,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onEventClick?.(event)
      }}
    >
      {isCompact ? (
        <span className={`font-medium text-slate-700 truncate block leading-tight ${isTiny ? 'text-[11px]' : 'text-xs'}`}>
          {eventLabel}
        </span>
      ) : (
        <>
          <span className="font-medium text-slate-700 truncate block leading-tight">{eventLabel}</span>
          <span className="text-slate-500 tabular-nums text-[11px]">{timeLabel}</span>
        </>
      )}
    </button>
  )
}
