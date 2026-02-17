import { useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { parseISO, format, differenceInMinutes } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { CalendarEvent, PlannedBlock, ActivityGoal, Settings } from '../types'
import { getWeekDates } from '../utils/dateUtils'
import { CalendarColumn, type OnBlockClick } from './CalendarColumn'

const HOUR_HEIGHT = 52
const FIRST_HOUR = 6
const LAST_HOUR = 22

export interface CalendarGridProps {
  weekStart: string
  calendarEvents: CalendarEvent[]
  plannedBlocks: PlannedBlock[]
  goals: ActivityGoal[]
  settings: Settings
  onBlockMove?: (blockId: string, newStart: string, newEnd: string) => void
  onBlockClick?: OnBlockClick
  onBlockStatusChange?: (blockId: string, status: 'done' | 'missed' | 'partial') => void
  onAddEvent?: () => void
  categoryFilter?: string[]
}

export function CalendarGrid({
  weekStart,
  calendarEvents,
  plannedBlocks,
  goals,
  settings,
  onBlockMove,
  onBlockClick,
  onBlockStatusChange,
  onAddEvent,
  categoryFilter = [],
}: CalendarGridProps) {
  const weekStartDate = parseISO(weekStart)
  const weekDates = getWeekDates(weekStartDate)

  const getGoal = useCallback(
    (goalId: string) => goals.find((g) => g.id === goalId),
    [goals]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event
      const id = active.id as string
      const block = plannedBlocks.find((b) => b.id === id)
      if (!block || block.locked || !onBlockMove) return

      const start = parseISO(block.start)
      const minutes = differenceInMinutes(parseISO(block.end), start)
      const deltaMinutes = Math.round(delta.y / HOUR_HEIGHT) * 60
      const newStart = new Date(start.getTime() + deltaMinutes * 60 * 1000)
      const newEnd = new Date(newStart.getTime() + minutes * 60 * 1000)

      const dayStart = new Date(newStart)
      dayStart.setHours(FIRST_HOUR, 0, 0, 0)
      const dayEnd = new Date(newStart)
      dayEnd.setHours(LAST_HOUR, 0, 0, 0)
      if (newStart < dayStart || newEnd > dayEnd) return

      const sleep = settings.sleepWindow
      const dow = newStart.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
      const [sh, sm] = sleep.start.split(':').map(Number)
      const [eh, em] = sleep.end.split(':').map(Number)
      const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
        aStart < bEnd && aEnd > bStart
      const getSleepInterval = (baseDate: Date) => {
        const sleepStart = new Date(baseDate)
        sleepStart.setHours(sh, sm, 0, 0)
        const sleepEnd = new Date(baseDate)
        sleepEnd.setHours(eh, em, 0, 0)
        if (sleepEnd <= sleepStart) sleepEnd.setDate(sleepEnd.getDate() + 1)
        return { sleepStart, sleepEnd }
      }

      if (sleep.days.includes(dow)) {
        const { sleepStart, sleepEnd } = getSleepInterval(newStart)
        if (overlaps(newStart, newEnd, sleepStart, sleepEnd)) return
      }

      const prevDay = new Date(newStart)
      prevDay.setDate(prevDay.getDate() - 1)
      const prevDow = prevDay.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
      if (sleep.days.includes(prevDow)) {
        const { sleepStart, sleepEnd } = getSleepInterval(prevDay)
        if (overlaps(newStart, newEnd, sleepStart, sleepEnd)) return
      }

      onBlockMove(id, newStart.toISOString(), newEnd.toISOString())
    },
    [plannedBlocks, onBlockMove, settings.sleepWindow]
  )

  const hours: number[] = []
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) hours.push(h)

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.08)] overflow-hidden">
      <div className="grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/70 sticky top-0 z-10">
        <div className="p-3 text-xs font-semibold text-slate-500 tracking-wide">TID</div>
        {weekDates.map((d) => (
          <div
            key={d.toISOString()}
            className="p-3 text-center text-sm font-semibold text-slate-700 border-l border-slate-200/80"
          >
            {format(d, 'EEE', { locale: sv })}
            <br />
            <span className="text-slate-500 text-xs">{format(d, 'd/M')}</span>
          </div>
        ))}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-auto bg-white" style={{ minHeight: (LAST_HOUR - FIRST_HOUR + 1) * HOUR_HEIGHT }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-100"
              style={{ height: HOUR_HEIGHT }}
            >
              <div className="text-xs text-slate-400 pr-3 text-right pt-1 font-medium">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDates.map((day) => (
                <CalendarColumn
                  key={day.toISOString()}
                  day={day}
                  hour={hour}
                  hourHeight={HOUR_HEIGHT}
                  firstHour={FIRST_HOUR}
                  lastHour={LAST_HOUR}
                  calendarEvents={calendarEvents}
                  plannedBlocks={plannedBlocks}
                  getGoal={getGoal}
                  categoryFilter={categoryFilter}
                  onBlockClick={onBlockClick}
                  onBlockStatusChange={onBlockStatusChange}
                />
              ))}
            </div>
          ))}
        </div>
      </DndContext>

      {onAddEvent && (
        <div className="p-2 border-t border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={onAddEvent}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Lägg till bokning
          </button>
        </div>
      )}
    </div>
  )
}
