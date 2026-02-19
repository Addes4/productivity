import { useCallback, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { addMinutes, parseISO, format, differenceInMinutes } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { CalendarEvent, PlannedBlock, ActivityGoal, Settings } from '../types'
import { doesRangeOverlapDay, getWeekDates, isAllDayEventRange } from '../utils/dateUtils'
import { isWeekNumberEvent } from '../utils/calendarEventUtils'
import { getEventSourceColor } from '../utils/eventColors'
import {
  buildOverlapLayout,
  exceedsConcurrentLimit,
  rangesOverlap,
} from '../utils/overlapLayout'
import { CalendarColumn, type OnBlockClick } from './CalendarColumn'

// Visuell layout för tidsaxeln i veckovyn.
const HOUR_HEIGHT = 52
const FIRST_HOUR = 6
const LAST_HOUR = 22

interface SlotTarget {
  dayIso: string
  hour: number
}

function toHourStart(day: Date, hour: number): Date {
  const out = new Date(day)
  out.setHours(hour, 0, 0, 0)
  return out
}

function parseSlotTarget(id: string): SlotTarget | null {
  const [prefix, dayIso, hourText] = id.split('|')
  if (prefix !== 'col' || !dayIso || !hourText) return null
  const hour = Number(hourText)
  if (!Number.isInteger(hour)) return null
  return { dayIso, hour }
}

function getNewRangeFromSlot(
  originalStart: Date,
  originalEnd: Date,
  slot: SlotTarget
): { start: Date; end: Date } | null {
  const slotDay = parseISO(slot.dayIso)
  if (Number.isNaN(slotDay.getTime())) return null

  const durationMinutes = differenceInMinutes(originalEnd, originalStart)
  if (durationMinutes <= 0) return null

  const start = new Date(slotDay)
  start.setHours(slot.hour, originalStart.getMinutes(), 0, 0)
  const end = addMinutes(start, durationMinutes)

  const dayStart = new Date(slotDay)
  dayStart.setHours(FIRST_HOUR, 0, 0, 0)
  const dayEnd = new Date(slotDay)
  dayEnd.setHours(LAST_HOUR, 0, 0, 0)
  if (start < dayStart || end > dayEnd) return null

  return { start, end }
}

export interface CalendarGridProps {
  weekStart: string
  calendarEvents: CalendarEvent[]
  plannedBlocks: PlannedBlock[]
  goals: ActivityGoal[]
  settings: Settings
  onBlockMove?: (blockId: string, newStart: string, newEnd: string) => void
  onCalendarEventMove?: (event: CalendarEvent, newStart: string, newEnd: string) => void
  onBlockClick?: OnBlockClick
  onCalendarEventClick?: (event: CalendarEvent) => void
  onAddEvent?: () => void
  categoryFilter?: string[]
}

// Huvudgrid för veckoschema med heldagsrad, timmar och drag/drop.
export function CalendarGrid({
  weekStart,
  calendarEvents,
  plannedBlocks,
  goals,
  settings,
  onBlockMove,
  onCalendarEventMove,
  onBlockClick,
  onCalendarEventClick,
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

  // Veckonummer-events hanteras separat och ska inte visas som vanliga bokningar.
  const visibleCalendarEvents = calendarEvents.filter((event) => !isWeekNumberEvent(event))

  const calendarEventRanges = visibleCalendarEvents.map((event) => {
    const start = parseISO(event.start)
    const end = parseISO(event.end)
    return {
      event,
      start,
      end,
      isAllDay: event.allDay === true || isAllDayEventRange(start, end),
    }
  })

  const timedCalendarEvents = calendarEventRanges
    .filter((entry) => !entry.isAllDay)
    .map((entry) => entry.event)

  const showCategory = (cat: string) =>
    categoryFilter.length === 0 || categoryFilter.includes(cat)

  const allDayEventsByDay = weekDates.map((day) =>
    calendarEventRanges
      .filter(
        ({ event, start, end, isAllDay }) =>
          isAllDay && showCategory(event.category) && doesRangeOverlapDay(start, end, day)
      )
      .map(({ event }) => event)
  )

  const dayOverlapLayouts = useMemo(
    () =>
      weekDates.map((day) => {
        const displayStart = toHourStart(day, FIRST_HOUR)
        const displayEnd = toHourStart(day, LAST_HOUR + 1)
        const dayRanges = [
          ...timedCalendarEvents.flatMap((event) => {
            if (!showCategory(event.category)) return []
            const start = parseISO(event.start)
            const end = parseISO(event.end)
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
              return []
            }
            if (!rangesOverlap(start, end, displayStart, displayEnd)) return []
            return [{ id: `event:${event.id}`, start, end }]
          }),
          ...plannedBlocks.flatMap((block) => {
            const goal = getGoal(block.goalId)
            if (!goal || !showCategory(goal.category)) return []
            const start = parseISO(block.start)
            const end = parseISO(block.end)
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
              return []
            }
            if (!rangesOverlap(start, end, displayStart, displayEnd)) return []
            return [{ id: `block:${block.id}`, start, end }]
          }),
        ]
        return buildOverlapLayout(dayRanges, 4)
      }),
    [getGoal, plannedBlocks, timedCalendarEvents, weekDates, categoryFilter]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const activeId = String(active.id)
      const slotTarget = over ? parseSlotTarget(String(over.id)) : null
      if (!slotTarget) return

      const movedBlockId = activeId.startsWith('block:') ? activeId.slice(6) : null
      const movedEventId = activeId.startsWith('event:') ? activeId.slice(6) : null
      if (!movedBlockId && !movedEventId) return

      const movedBlock = movedBlockId
        ? plannedBlocks.find((b) => b.id === movedBlockId)
        : null
      const movedEvent = movedEventId
        ? timedCalendarEvents.find((ev) => ev.id === movedEventId)
        : null
      if (!movedBlock && !movedEvent) return

      if (movedBlock && !onBlockMove) return
      if (movedEvent && !onCalendarEventMove) return

      const sourceStart = parseISO(movedBlock ? movedBlock.start : movedEvent!.start)
      const sourceEnd = parseISO(movedBlock ? movedBlock.end : movedEvent!.end)
      const nextRange = getNewRangeFromSlot(sourceStart, sourceEnd, slotTarget)
      if (!nextRange) return
      const { start: newStart, end: newEnd } = nextRange

      // Blockera drag som hamnar i sömnfönster (även över midnatt).
      if (movedBlock) {
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
      }

      const overlapRanges = [
        ...timedCalendarEvents.flatMap((ev) => {
          if (movedEventId && ev.id === movedEventId) return []
          const evStart = parseISO(ev.start)
          const evEnd = parseISO(ev.end)
          if (Number.isNaN(evStart.getTime()) || Number.isNaN(evEnd.getTime()) || evEnd <= evStart) {
            return []
          }
          return [{ id: `event:${ev.id}`, start: evStart, end: evEnd }]
        }),
        ...plannedBlocks.flatMap((existingBlock) => {
          if (movedBlockId && existingBlock.id === movedBlockId) return []
          const existingStart = parseISO(existingBlock.start)
          const existingEnd = parseISO(existingBlock.end)
          if (
            Number.isNaN(existingStart.getTime()) ||
            Number.isNaN(existingEnd.getTime()) ||
            existingEnd <= existingStart
          ) {
            return []
          }
          return [{ id: `block:${existingBlock.id}`, start: existingStart, end: existingEnd }]
        }),
        {
          id: movedBlockId ? `block:${movedBlockId}` : `event:${movedEventId}`,
          start: newStart,
          end: newEnd,
        },
      ]
      if (exceedsConcurrentLimit(overlapRanges, 4)) return

      if (movedBlockId) {
        onBlockMove?.(movedBlockId, newStart.toISOString(), newEnd.toISOString())
        return
      }
      if (movedEvent) {
        onCalendarEventMove?.(movedEvent, newStart.toISOString(), newEnd.toISOString())
      }
    },
    [
      onBlockMove,
      onCalendarEventMove,
      plannedBlocks,
      settings.sleepWindow,
      timedCalendarEvents,
    ]
  )

  const hours: number[] = []
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) hours.push(h)

  return (
    <div className="flex flex-col min-h-0 xl:h-full rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.08)] overflow-hidden">
      <div className="grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/70 sticky top-0 z-10">
        <div className="p-2 flex flex-col justify-center text-left leading-tight">
          <span className="text-[10px] font-semibold text-slate-500 tracking-wide uppercase">Tid</span>
        </div>
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

      <div className="grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-200 bg-slate-50/70">
        <div className="px-2 py-2 text-[10px] font-semibold text-slate-500 tracking-wide uppercase">
          Heldag
        </div>
        {weekDates.map((day, dayIndex) => {
          const dayEvents = allDayEventsByDay[dayIndex]
          const firstEvent = dayEvents[0]
          const accentColor = firstEvent
            ? getEventSourceColor(firstEvent.source, settings.eventColors)
            : null
          return (
            <div
              key={`${day.toISOString()}-all-day`}
              className="border-l border-slate-200/80 px-1.5 py-1.5 h-9 flex items-center"
            >
              {firstEvent ? (
                <div className="w-full flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onCalendarEventClick?.(firstEvent)}
                    className="h-5 leading-5 px-2 rounded-md border text-[11px] font-medium text-slate-800 truncate flex-1 min-w-0 text-left cursor-pointer transition-colors hover:brightness-[0.98]"
                    style={{
                      backgroundColor: accentColor ? `${accentColor}1f` : undefined,
                      borderColor: accentColor ? `${accentColor}cc` : undefined,
                      borderLeftColor: accentColor ?? undefined,
                      borderLeftWidth: accentColor ? 3 : undefined,
                    }}
                  >
                    {firstEvent.title}
                  </button>
                  {dayEvents.length > 1 ? (
                    <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                      +{dayEvents.length - 1}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 overflow-auto bg-white" style={{ minHeight: (LAST_HOUR - FIRST_HOUR + 1) * HOUR_HEIGHT }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-100"
              style={{ height: HOUR_HEIGHT }}
            >
              <div className="text-xs text-slate-400 pr-3 text-right pt-1 font-medium">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDates.map((day, dayIndex) => (
                <CalendarColumn
                  key={day.toISOString()}
                  day={day}
                  hour={hour}
                  hourHeight={HOUR_HEIGHT}
                  firstHour={FIRST_HOUR}
                  lastHour={LAST_HOUR}
                  calendarEvents={timedCalendarEvents}
                  plannedBlocks={plannedBlocks}
                  getGoal={getGoal}
                  eventColors={settings.eventColors}
                  categoryFilter={categoryFilter}
                  overlapLayoutById={dayOverlapLayouts[dayIndex] ?? {}}
                  onBlockClick={onBlockClick}
                  onCalendarEventClick={onCalendarEventClick}
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
