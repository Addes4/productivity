import { useDroppable } from '@dnd-kit/core'
import { parseISO, setHours, setMinutes, setSeconds, setMilliseconds, addHours } from 'date-fns'
import type { CalendarEvent, PlannedBlock, ActivityGoal, EventColors } from '../types'
import { isAllDayEventRange } from '../utils/dateUtils'
import { getEventSourceColor } from '../utils/eventColors'
import type { OverlapLayout } from '../utils/overlapLayout'
import { CalendarBlock } from './CalendarBlock'
import { CalendarEventBlock } from './CalendarEventBlock'

// Callback när användaren klickar ett planerat block.
export type OnBlockClick = (block: PlannedBlock, goal: ActivityGoal) => void

// Skapar timslot-start med nollade minuter/sekunder/ms.
function toHourStart(day: Date, hour: number): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(day, hour), 0), 0), 0)
}

// Beräknar position och höjd för ett block inom en specifik timrad.
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

// En kalendercell för en dag+timme, inklusive bokningar och planerade block.
export function CalendarColumn({
  day,
  hour,
  hourHeight,
  firstHour,
  lastHour,
  calendarEvents,
  plannedBlocks,
  getGoal,
  eventColors,
  categoryFilter,
  overlapLayoutById,
  onBlockClick,
  onCalendarEventClick,
}: {
  day: Date
  hour: number
  hourHeight: number
  firstHour: number
  lastHour: number
  calendarEvents: CalendarEvent[]
  plannedBlocks: PlannedBlock[]
  getGoal: (id: string) => ActivityGoal | undefined
  eventColors: EventColors
  categoryFilter: string[]
  overlapLayoutById: Record<string, OverlapLayout>
  onBlockClick?: OnBlockClick
  onCalendarEventClick?: (event: CalendarEvent) => void
}) {
  const slotId = `col|${day.toISOString()}|${hour}`
  const { setNodeRef, isOver } = useDroppable({ id: slotId })

  // Kategorifilter delas mellan events och aktivitetsblock.
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
        if (ev.allDay === true || isAllDayEventRange(start, end)) return null
        const pos = getRenderPosition(start, end, day, hour, hourHeight, firstHour, lastHour)
        if (!pos) return null
        const accentColor = getEventSourceColor(ev.source, eventColors)
        const layout = overlapLayoutById[`event:${ev.id}`] ?? { column: 0, columns: 1 }
        const leftPercent = (layout.column / layout.columns) * 100
        const widthPercent = 100 / layout.columns
        return (
          <CalendarEventBlock
            key={ev.id}
            event={ev}
            top={pos.top}
            height={pos.height}
            leftPercent={leftPercent}
            widthPercent={widthPercent}
            accentColor={accentColor}
            onEventClick={onCalendarEventClick}
          />
        )
      })}
      {plannedBlocks.map((block) => {
        const goal = getGoal(block.goalId)
        if (!goal || !showCategory(goal.category)) return null
        const start = parseISO(block.start)
        const end = parseISO(block.end)
        const pos = getRenderPosition(start, end, day, hour, hourHeight, firstHour, lastHour)
        if (!pos) return null
        const layout = overlapLayoutById[`block:${block.id}`] ?? { column: 0, columns: 1 }
        const leftPercent = (layout.column / layout.columns) * 100
        const widthPercent = 100 / layout.columns
        return (
          <CalendarBlock
            key={block.id}
            block={block}
            goal={goal}
            top={pos.top}
            height={pos.height}
            leftPercent={leftPercent}
            widthPercent={widthPercent}
            onBlockClick={onBlockClick}
          />
        )
      })}
    </div>
  )
}
