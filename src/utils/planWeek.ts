/**
 * Schemaläggningsalgoritm: planWeek(goals, existingEvents, settings, weekStartDate).
 * Skapar lediga luckor, sorterar mål, fördelar sessioner i luckor.
 */
import {
  addMinutes,
  addDays,
  parseISO,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  differenceInMinutes,
  min as minDate,
  max as maxDate,
} from 'date-fns'
import type {
  ActivityGoal,
  CalendarEvent,
  PlannedBlock,
  Settings,
  ConflictReport,
} from '../types'
import type { TimeSlot } from './dateUtils'
import {
  getWeekStart,
  getWeekDates,
  getDayOfWeek,
  parseTime,
  getFreeSlotsForDay,
} from './dateUtils'
import { isWeekNumberEvent } from './calendarEventUtils'

const MINI_SESSION_MINUTES = 10

// ISO-sträng -> Date.
function toDate(iso: string): Date {
  return parseISO(iso)
}

// Start på kalenderdag.
function startOfDay(date: Date): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(date, 0), 0), 0), 0)
}

// Standardkontroll för intervallöverlappning.
function overlapsInterval(
  start: Date,
  end: Date,
  windowStart: Date,
  windowEndExclusive: Date
): boolean {
  return start < windowEndExclusive && end > windowStart
}

/** Bygger blockerade tider för en dag: events + låsta block + sleep + (valfritt) utanför workHours */
function getBlockedIntervalsForDay(
  day: Date,
  calendarEvents: CalendarEvent[],
  lockedBlocks: PlannedBlock[],
  settings: Settings,
  travelBuffers: Map<string, number>
): { start: Date; end: Date }[] {
  const blocks: { start: Date; end: Date }[] = []

  const dayStart = startOfDay(day)
  const dayEndExclusive = addDays(dayStart, 1)
  const dayOfWeek = getDayOfWeek(day)
  const prevDay = addDays(day, -1)
  const prevDayOfWeek = getDayOfWeek(prevDay)

  // Sömnfönster
  const sleep = settings.sleepWindow
  const sleepStart = parseTime(sleep.start, day)
  const sleepEndSameDay = parseTime(sleep.end, day)
  const sleepCrossesMidnight = sleepEndSameDay <= sleepStart

  if (sleep.days.includes(dayOfWeek)) {
    let sleepEnd = sleepEndSameDay
    if (sleepCrossesMidnight) sleepEnd = addMinutes(sleepEnd, 24 * 60)
    blocks.push({ start: sleepStart, end: sleepEnd })
  }
  if (sleepCrossesMidnight && sleep.days.includes(prevDayOfWeek)) {
    const prevSleepStart = parseTime(sleep.start, prevDay)
    let prevSleepEnd = parseTime(sleep.end, prevDay)
    prevSleepEnd = addMinutes(prevSleepEnd, 24 * 60)
    blocks.push({ start: prevSleepStart, end: prevSleepEnd })
  }

  // Calendar events som överlappar denna dag
  for (const e of calendarEvents) {
    if (isWeekNumberEvent(e)) continue
    const start = toDate(e.start)
    const end = toDate(e.end)
    if (end <= start) continue
    if (overlapsInterval(start, end, dayStart, dayEndExclusive)) {
      blocks.push({ start, end })
    }
  }

  // Låsta planned blocks som överlappar denna dag
  for (const b of lockedBlocks) {
    const start = toDate(b.start)
    const end = toDate(b.end)
    if (end <= start) continue
    if (overlapsInterval(start, end, dayStart, dayEndExclusive)) {
      blocks.push({ start, end })
      const buf = travelBuffers.get(b.goalId) ?? 0
      if (buf > 0) {
        const bufferStart = addMinutes(end, 0)
        const bufferEnd = addMinutes(end, buf)
        if (overlapsInterval(bufferStart, bufferEnd, dayStart, dayEndExclusive)) {
          blocks.push({ start: bufferStart, end: bufferEnd })
        }
      }
    }
  }

  return blocks
}

/** Dagens "ram": antingen workHours eller 00:00–23:59 */
function getDayBounds(day: Date, settings: Settings): { start: Date; end: Date } {
  const dayOfWeek = getDayOfWeek(day)
  if (settings.workHours.enabled && settings.workHours.days.includes(dayOfWeek)) {
    return {
      start: parseTime(settings.workHours.start, day),
      end: parseTime(settings.workHours.end, day),
    }
  }
  return {
    start: startOfDay(day),
    end: setMilliseconds(setSeconds(setMinutes(setHours(day, 23), 59), 59), 999),
  }
}

/** Filtrerar slots som matchar goal (earliestStart, latestEnd, allowedDays) och applicerar minBreak */
function getAvailableSlotsForGoal(
  weekStart: Date,
  goal: ActivityGoal,
  settings: Settings,
  blockedPerDay: Map<number, { start: Date; end: Date }[]>,
  minBreak: number
): { dayIndex: number; slot: TimeSlot }[] {
  const weekDates = getWeekDates(weekStart)
  const result: { dayIndex: number; slot: TimeSlot }[] = []

  for (let i = 0; i < 7; i++) {
    const day = weekDates[i]
    const dow = getDayOfWeek(day)
    if (!goal.allowedDays.includes(dow)) continue

    const bounds = getDayBounds(day, settings)
    const blocked = blockedPerDay.get(i) ?? []
    const slots = getFreeSlotsForDay(day, bounds.start, bounds.end, blocked)

    const earliest = parseTime(goal.earliestStart, day)
    const latest = parseTime(goal.latestEnd, day)
    if (latest <= earliest) {
      const latestNext = addMinutes(latest, 24 * 60)
      for (const slot of slots) {
        const start = maxDate([slot.start, earliest])
        const end = minDate([slot.end, latestNext])
        if (differenceInMinutes(end, start) >= goal.sessionMinutes + minBreak) {
          result.push({ dayIndex: i, slot: { start, end } })
        }
      }
    } else {
      for (const slot of slots) {
        const start = maxDate([slot.start, earliest])
        const end = minDate([slot.end, latest])
        if (differenceInMinutes(end, start) >= goal.sessionMinutes + minBreak) {
          result.push({ dayIndex: i, slot: { start, end } })
        }
      }
    }
  }
  return result
}

/** Poäng för att placera en session i en slot (högre = bättre). Föredrar preferredTimeOfDay och större slot. */
function slotScore(goal: ActivityGoal, slot: TimeSlot, _dayIndex: number): number {
  const start = slot.start
  const hour = start.getHours() + start.getMinutes() / 60
  let timeScore = 0
  switch (goal.preferredTimeOfDay) {
    case 'morning':
      timeScore = hour <= 12 ? 10 : (hour <= 14 ? 5 : 0)
      break
    case 'lunch':
      timeScore = hour >= 11 && hour <= 14 ? 10 : (hour >= 9 && hour <= 17 ? 5 : 0)
      break
    case 'evening':
      timeScore = hour >= 17 ? 10 : (hour >= 14 ? 5 : 0)
      break
    default:
      timeScore = 5
  }
  const duration = differenceInMinutes(slot.end, slot.start)
  const fitScore = duration >= goal.sessionMinutes ? 10 : 0
  return timeScore + fitScore
}

export interface PlanWeekResult {
  plannedBlocks: PlannedBlock[]
  conflictReports: ConflictReport[]
}

export function planWeek(
  goals: ActivityGoal[],
  calendarEvents: CalendarEvent[],
  existingPlannedBlocks: PlannedBlock[],
  settings: Settings,
  weekStartDate: Date,
  minimumViableDay: boolean
): PlanWeekResult {
  // Normalisera så att vi alltid planerar från veckans måndag.
  const weekStart = getWeekStart(weekStartDate)
  const weekDates = getWeekDates(weekStart)

  // Endast rörliga block som tillhör denna vecka tas bort; låsta behålls
  const lockedBlocks = existingPlannedBlocks.filter(
    (b) => b.locked && isBlockInWeek(b, weekStart)
  )
  const otherBlocks = existingPlannedBlocks.filter(
    (b) => !isBlockInWeek(b, weekStart)
  )

  // Hjälpare för att avgöra om blocket tillhör aktuell vecka.
  function isBlockInWeek(block: PlannedBlock, start: Date): boolean {
    const d = toDate(block.start)
    return d >= start && d < addDays(start, 7)
  }

  const travelBuffers = new Map<string, number>()
  goals.forEach((g) => travelBuffers.set(g.id, g.travelBufferMinutes))
  const goalById = new Map(goals.map((g) => [g.id, g] as const))

  const blockedPerDay = new Map<number, { start: Date; end: Date }[]>()
  for (let i = 0; i < 7; i++) {
    const day = weekDates[i]
    blockedPerDay.set(
      i,
      getBlockedIntervalsForDay(
        day,
        calendarEvents,
        lockedBlocks,
        settings,
        travelBuffers
      )
    )
  }

  const minBreak = settings.minBreakMinutes
  const maxPerDay = settings.maxActivitiesPerDay

  // Sortera mål: prioritet (hög först), sedan kortast session först
  const sortedGoals = [...goals].sort((a, b) => {
    const p = { high: 3, medium: 2, low: 1 }
    if (p[a.priority] !== p[b.priority]) return p[b.priority] - p[a.priority]
    return a.sessionMinutes - b.sessionMinutes
  })

  const newBlocks: PlannedBlock[] = [...lockedBlocks]
  const conflictReports: ConflictReport[] = []

  // Per dag räknar vi antal nya block (för maxActivitiesPerDay)
  const blocksPerDay = new Array(7).fill(0)
  // Global spärr: högst ett gym-pass per dag (även om flera gymmål finns).
  const gymSessionsPerDay = new Array(7).fill(0)
  lockedBlocks.forEach((b) => {
    const d = toDate(b.start)
    const idx = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
    if (idx >= 0 && idx < 7) {
      blocksPerDay[idx]++
      const blockGoal = goalById.get(b.goalId)
      if (blockGoal?.location === 'gym') gymSessionsPerDay[idx]++
    }
  })

  let idCounter = 1
  // Lokalt unikt block-id inom en planeringskörning.
  function nextId(): string {
    return `block-${Date.now()}-${idCounter++}`
  }

  // Planera mål ett i taget i prioriterad ordning.
  for (const goal of sortedGoals) {
    if (goal.isFixed) continue
    if (goal.sessionMinutes < 1) continue
    let targetMinutes = Math.min(
      goal.weeklyTargetMinutes,
      goal.maxWeeklyMinutes
    )
    targetMinutes = Math.max(targetMinutes, goal.minWeeklyMinutes)
    if (targetMinutes < 1) continue

    const sessionLen = goal.sessionMinutes
    let numSessions: number
    if (goal.sessionsPerWeek != null && goal.sessionsPerWeek > 0) {
      numSessions = goal.sessionsPerWeek
    } else {
      numSessions = Math.ceil(targetMinutes / sessionLen)
    }
    const isGymGoal = goal.location === 'gym'

    // För gymmål (och mål med explicit sessionsPerWeek) tillåts max 1 pass per dag.
    const maxSessionsPerDayForGoal =
      isGymGoal || (goal.sessionsPerWeek != null && goal.sessionsPerWeek > 0)
        ? 1
        : Number.POSITIVE_INFINITY
    const sessionsPerDayForGoal = new Array(7).fill(0)
    lockedBlocks.forEach((b) => {
      if (b.goalId !== goal.id) return
      const d = toDate(b.start)
      const idx = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
      if (idx >= 0 && idx < 7) sessionsPerDayForGoal[idx]++
    })

    const placed: PlannedBlock[] = []
    let remainingToPlace = numSessions

    // Försök lägga fullstora pass först.
    for (let s = 0; s < numSessions && remainingToPlace > 0; s++) {
      const slotsForGoal = getAvailableSlotsForGoal(
        weekStart,
        goal,
        settings,
        blockedPerDay,
        minBreak
      )

      // Sortera tillgängliga slots efter poäng (bäst först)
      slotsForGoal.sort(
        (a, b) => slotScore(goal, b.slot, b.dayIndex) - slotScore(goal, a.slot, a.dayIndex)
      )

      const sessionDuration =
        s === numSessions - 1 && numSessions * sessionLen > targetMinutes
          ? targetMinutes - (numSessions - 1) * sessionLen
          : sessionLen

      let best: { dayIndex: number; slot: TimeSlot } | null = null

      for (const { dayIndex, slot } of slotsForGoal) {
        if (blocksPerDay[dayIndex] >= maxPerDay) continue
        if (isGymGoal && gymSessionsPerDay[dayIndex] >= 1) continue
        if (sessionsPerDayForGoal[dayIndex] >= maxSessionsPerDayForGoal) continue
        const duration = differenceInMinutes(slot.end, slot.start)
        if (duration < sessionDuration + minBreak) continue

        if (!best || slotScore(goal, slot, dayIndex) > slotScore(goal, best.slot, best.dayIndex)) {
          best = { dayIndex, slot }
        }
      }

      if (best) {
        const start = best.slot.start
        const end = addMinutes(start, sessionDuration)
        placed.push({
          id: nextId(),
          goalId: goal.id,
          start: start.toISOString(),
          end: end.toISOString(),
          status: 'planned',
          locked: false,
          isMini: false,
        })
        blocksPerDay[best.dayIndex]++
        if (isGymGoal) gymSessionsPerDay[best.dayIndex]++
        sessionsPerDayForGoal[best.dayIndex]++

        // Lägg till block som "upptagen" för nästa mål (respekt för minBreak)
        const blockInterval = { start, end: addMinutes(end, minBreak) }
        const existing = blockedPerDay.get(best.dayIndex) ?? []
        blockedPerDay.set(best.dayIndex, [...existing, blockInterval])
        remainingToPlace--
      } else {
        break
      }
    }

    // Om veckan är full: försök fylla med mini-pass (10 min).
    if (remainingToPlace > 0 && minimumViableDay) {
      const miniLen = MINI_SESSION_MINUTES
      while (remainingToPlace > 0) {
        const miniSlots = getAvailableSlotsForGoal(
          weekStart,
          { ...goal, sessionMinutes: miniLen },
          settings,
          blockedPerDay,
          minBreak
        )
        miniSlots.sort(
          (a, b) => slotScore(goal, b.slot, b.dayIndex) - slotScore(goal, a.slot, a.dayIndex)
        )

        let best: { dayIndex: number; slot: TimeSlot } | null = null
        for (const { dayIndex, slot } of miniSlots) {
          if (blocksPerDay[dayIndex] >= maxPerDay) continue
          if (isGymGoal && gymSessionsPerDay[dayIndex] >= 1) continue
          if (sessionsPerDayForGoal[dayIndex] >= maxSessionsPerDayForGoal) continue
          const duration = differenceInMinutes(slot.end, slot.start)
          if (duration < miniLen + minBreak) continue
          if (!best || slotScore(goal, slot, dayIndex) > slotScore(goal, best.slot, best.dayIndex)) {
            best = { dayIndex, slot }
          }
        }
        if (best) {
          const start = best.slot.start
          const end = addMinutes(start, miniLen)
          placed.push({
            id: nextId(),
            goalId: goal.id,
            start: start.toISOString(),
            end: end.toISOString(),
            status: 'planned',
            locked: false,
            isMini: true,
          })
          blocksPerDay[best.dayIndex]++
          if (isGymGoal) gymSessionsPerDay[best.dayIndex]++
          sessionsPerDayForGoal[best.dayIndex]++
          const blockInterval = { start, end: addMinutes(end, minBreak) }
          const existing = blockedPerDay.get(best.dayIndex) ?? []
          blockedPerDay.set(best.dayIndex, [...existing, blockInterval])
          remainingToPlace--
        } else {
          break
        }
      }
    }

    if (placed.length < numSessions) {
      conflictReports.push({
        goalId: goal.id,
        reason: `Kunde bara schemalägga ${placed.length} av ${numSessions} pass för "${goal.name}".`,
        suggestion:
          'Prova kortare pass, fler tillåtna dagar, eller aktivera "Minimum viable day" för 10-minuters mini-pass.',
      })
    }

    newBlocks.push(...placed)
  }

  return {
    plannedBlocks: [...otherBlocks, ...newBlocks],
    conflictReports,
  }
}
