import { useDroppable } from '@dnd-kit/core'
import { parseISO, setHours, setMinutes, setSeconds, setMilliseconds, addHours } from 'date-fns'
import type { CalendarEvent, PlannedBlock, ActivityGoal } from '../types'
import { CalendarBlock } from './CalendarBlock'

export type OnBlockClick = (block: PlannedBlock, goal: ActivityGoal) => void

function toHourStart(day: Date, hour: number): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(day, hour), 0), 0), 0)
}

function getRenderPosition(
  start: Date,
  end: Date,
  day: Date,
  hour: number,
  hourHeight: number,
  firstHour: number,
  lastHour: number
): { top: number; height: number } | null {
  const displayStart = toHourStart(day, firstHour)
  const displayEnd = toHourStart(day, lastHour + 1)
  const renderStart = new Date(Math.max(start.getTime(), displayStart.getTime()))
  const renderEnd = new Date(Math.min(end.getTime(), displayEnd.getTime()))
  if (renderEnd <= renderStart) return null

  const dayStart = setMilliseconds(setSeconds(setMinutes(setHours(day, hour), 0), 0), 0)
  const dayEnd = addHours(dayStart, 1)
  const blockStart = renderStart.getTime()
  const blockEnd = renderEnd.getTime()
  const slotStart = dayStart.getTime()
  const slotEnd = dayEnd.getTime()
  if (blockStart < slotStart || blockStart >= slotEnd) return null

  const top = (blockStart - slotStart) / (60 * 60 * 1000) * hourHeight
  const height = (blockEnd - blockStart) / (60 * 60 * 1000) * hourHeight
  return { top, height }
}

export function CalendarColumn({
  day,
  hour,
  hourHeight,
  firstHour,
  lastHour,
  calendarEvents,
  plannedBlocks,
  getGoal,
  categoryFilter,
  onBlockClick,
  onBlockStatusChange,
}: {
  day: Date
  hour: number
  hourHeight: number
  firstHour: number
  lastHour: number
  calendarEvents: CalendarEvent[]
  plannedBlocks: PlannedBlock[]
  getGoal: (id: string) => ActivityGoal | undefined
  categoryFilter: string[]
  onBlockClick?: OnBlockClick
  onBlockStatusChange?: (blockId: string, status: 'done' | 'missed' | 'partial') => void
}) {
  const slotId = `col-${day.toISOString()}-${hour}`
  const { setNodeRef, isOver } = useDroppable({ id: slotId })

  const showCategory = (cat: string) =>
    categoryFilter.length === 0 || categoryFilter.includes(cat)

  return (
    <div
      ref={setNodeRef}
      className={`border-l border-slate-100/80 relative ${isOver ? 'bg-sky-100/70' : 'bg-transparent'}`}
      style={{ height: hourHeight }}
    >
      {calendarEvents.map((ev) => {
        if (!showCategory(ev.category)) return null
        const start = parseISO(ev.start)
        const end = parseISO(ev.end)
        const pos = getRenderPosition(start, end, day, hour, hourHeight, firstHour, lastHour)
        if (!pos) return null
        return (
          <div
            key={ev.id}
            className="absolute left-1 right-1 rounded-xl bg-slate-100 border border-slate-300/80 text-xs p-2 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
            style={{ top: pos.top, height: Math.max(8, pos.height - 2), zIndex: 20 }}
          >
            <span className="font-medium text-slate-700">{ev.title}</span>
          </div>
        )
      })}
      {plannedBlocks.map((block) => {
        const goal = getGoal(block.goalId)
        if (!goal || !showCategory(goal.category)) return null
        const start = parseISO(block.start)
        const end = parseISO(block.end)
        const pos = getRenderPosition(start, end, day, hour, hourHeight, firstHour, lastHour)
        if (!pos) return null
        return (
          <CalendarBlock
            key={block.id}
            block={block}
            goal={goal}
            top={pos.top}
            height={pos.height}
            onBlockClick={onBlockClick}
            onStatusChange={onBlockStatusChange}
          />
        )
      })}
    </div>
  )
}
