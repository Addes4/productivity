export interface OverlapRange {
  id: string
  start: Date
  end: Date
}

export interface OverlapLayout {
  column: number
  columns: number
}

// Halvöppet intervall: [start, end). Touchande tider räknas inte som krock.
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart
}

function normalizeRanges(ranges: OverlapRange[]): OverlapRange[] {
  return ranges.filter((r) => {
    const s = r.start.getTime()
    const e = r.end.getTime()
    return Number.isFinite(s) && Number.isFinite(e) && e > s
  })
}

// True om någon tidpunkt får fler samtidiga intervall än angiven limit.
export function exceedsConcurrentLimit(ranges: OverlapRange[], limit: number): boolean {
  if (limit < 1) return true
  const points: Array<{ time: number; delta: number }> = []
  for (const r of normalizeRanges(ranges)) {
    points.push({ time: r.start.getTime(), delta: 1 })
    points.push({ time: r.end.getTime(), delta: -1 })
  }

  points.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time
    // End först, sedan start: [start, end) så att touchande block inte räknas som överlapp.
    return a.delta - b.delta
  })

  let active = 0
  for (const p of points) {
    active += p.delta
    if (active > limit) return true
  }
  return false
}

function splitIntoOverlapGroups(ranges: OverlapRange[]): OverlapRange[][] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => {
    const startDiff = a.start.getTime() - b.start.getTime()
    if (startDiff !== 0) return startDiff
    return a.end.getTime() - b.end.getTime()
  })

  const groups: OverlapRange[][] = []
  let current: OverlapRange[] = []
  let currentMaxEnd = -Infinity

  for (const r of sorted) {
    const start = r.start.getTime()
    const end = r.end.getTime()
    if (current.length === 0 || start < currentMaxEnd) {
      current.push(r)
      if (end > currentMaxEnd) currentMaxEnd = end
      continue
    }

    groups.push(current)
    current = [r]
    currentMaxEnd = end
  }

  if (current.length > 0) groups.push(current)
  return groups
}

// Skapar kolumnlayout för krockande intervall (1/2, 1/3, 1/4 bredder).
export function buildOverlapLayout(
  ranges: OverlapRange[],
  maxColumns: number
): Record<string, OverlapLayout> {
  const safeMaxColumns = Math.max(1, maxColumns)
  const cleanRanges = normalizeRanges(ranges)
  const layoutById: Record<string, OverlapLayout> = {}

  for (const group of splitIntoOverlapGroups(cleanRanges)) {
    const sorted = [...group].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime()
      if (startDiff !== 0) return startDiff
      return a.end.getTime() - b.end.getTime()
    })

    const active: Array<{ end: number; column: number }> = []
    const columnById: Record<string, number> = {}
    let usedColumns = 1

    for (const item of sorted) {
      const start = item.start.getTime()
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].end <= start) active.splice(i, 1)
      }

      const occupied = new Set(active.map((a) => a.column))
      let column = 0
      while (occupied.has(column) && column < safeMaxColumns - 1) column++

      columnById[item.id] = column
      active.push({ end: item.end.getTime(), column })
      if (column + 1 > usedColumns) usedColumns = column + 1
    }

    const columns = Math.min(safeMaxColumns, Math.max(1, usedColumns))
    for (const item of sorted) {
      const rawColumn = columnById[item.id] ?? 0
      layoutById[item.id] = {
        column: Math.min(rawColumn, columns - 1),
        columns,
      }
    }
  }

  return layoutById
}
