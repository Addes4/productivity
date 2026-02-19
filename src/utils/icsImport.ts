import { addDays, addMinutes } from 'date-fns'

// Enkel iCal-parser som extraherar event för import till appens modell.
export interface ParsedIcsEvent {
  title: string
  start: string
  end: string
  category: string
}

export interface ParseIcsResult {
  events: ParsedIcsEvent[]
  warnings: string[]
}

interface ParsedProperty {
  name: string
  params: Record<string, string>
  value: string
}

// Avkodar escaped text enligt iCal-konvention.
function decodeIcsText(value: string): string {
  return value
    .replace(/\\\\/g, '\\')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim()
}

// Fäller ihop "folded lines" där en fortsättningsrad börjar med mellanslag/tab.
function unfoldIcsLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const unfolded: string[] = []
  for (const raw of rawLines) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += raw.slice(1)
    } else {
      unfolded.push(raw)
    }
  }
  return unfolded
}

// Parsar en property-rad som NAME;PARAM=...:VALUE.
function parsePropertyLine(line: string): ParsedProperty | null {
  const idx = line.indexOf(':')
  if (idx <= 0) return null
  const left = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const [nameRaw, ...paramParts] = left.split(';')
  const name = nameRaw.trim().toUpperCase()
  const params: Record<string, string> = {}
  for (const part of paramParts) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const k = part.slice(0, eq).trim().toUpperCase()
    const v = part.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')
    params[k] = v
  }
  return { name, params, value }
}

// Hämtar tidszons-offset (minuter) för ett visst datum i en given TZID.
function parseTimeZoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
    })
    const tzPart = formatter
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')
      ?.value
    if (!tzPart) return null
    if (/^(GMT|UTC)$/i.test(tzPart)) return 0
    const m = tzPart.match(/([+-])(\d{1,2})(?::?(\d{2}))?/)
    if (!m) return null
    const sign = m[1] === '-' ? -1 : 1
    const hours = Number(m[2] ?? '0')
    const mins = Number(m[3] ?? '0')
    return sign * (hours * 60 + mins)
  } catch {
    return null
  }
}

// Konverterar lokal tid i en specifik tidszon till ett UTC-baserat Date-objekt.
function zonedDateTimeToDate(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tzid: string
): Date {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s, 0)
  const first = new Date(utcGuess)
  const offset1 = parseTimeZoneOffsetMinutes(first, tzid)
  if (offset1 == null) return new Date(y, mo - 1, d, h, mi, s, 0)
  const candidate = new Date(utcGuess - offset1 * 60 * 1000)
  const offset2 = parseTimeZoneOffsetMinutes(candidate, tzid)
  if (offset2 == null || offset2 === offset1) return candidate
  return new Date(utcGuess - offset2 * 60 * 1000)
}

// Tolkar iCal datumformat (DATE och DATE-TIME, med/utan TZID/Z).
function parseIcsDateValue(value: string, params: Record<string, string>): Date | null {
  const trimmed = value.trim()

  if (/^\d{8}$/.test(trimmed)) {
    const y = Number(trimmed.slice(0, 4))
    const mo = Number(trimmed.slice(4, 6))
    const d = Number(trimmed.slice(6, 8))
    if (!Number.isFinite(y + mo + d)) return null
    return new Date(y, mo - 1, d, 0, 0, 0, 0)
  }

  const m = trimmed.match(/^(\d{8})T(\d{4}|\d{6})(Z?)$/)
  if (!m) return null
  const datePart = m[1]
  const timePart = m[2]
  const isUtc = m[3] === 'Z'

  const y = Number(datePart.slice(0, 4))
  const mo = Number(datePart.slice(4, 6))
  const d = Number(datePart.slice(6, 8))
  const h = Number(timePart.slice(0, 2))
  const mi = Number(timePart.slice(2, 4))
  const s = timePart.length >= 6 ? Number(timePart.slice(4, 6)) : 0
  if (![y, mo, d, h, mi, s].every(Number.isFinite)) return null

  if (isUtc) return new Date(Date.UTC(y, mo - 1, d, h, mi, s, 0))

  const tzid = params.TZID
  if (tzid) return zonedDateTimeToDate(y, mo, d, h, mi, s, tzid)

  return new Date(y, mo - 1, d, h, mi, s, 0)
}

// Parsar hela .ics-innehållet och returnerar importerbara event + varningar.
export function parseIcsCalendar(text: string): ParseIcsResult {
  const lines = unfoldIcsLines(text)
  const events: ParsedIcsEvent[] = []
  const warnings: string[] = []

  let inEvent = false
  let startValue: string | null = null
  let startParams: Record<string, string> = {}
  let endValue: string | null = null
  let endParams: Record<string, string> = {}
  let summary = ''
  let category = 'Import'
  let hasRRule = false

  const resetCurrentEvent = () => {
    // Nollställ temporära fält inför nästa VEVENT.
    startValue = null
    startParams = {}
    endValue = null
    endParams = {}
    summary = ''
    category = 'Import'
    hasRRule = false
  }

  for (const line of lines) {
    if (!line) continue
    const upper = line.trim().toUpperCase()

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      resetCurrentEvent()
      continue
    }
    if (upper === 'END:VEVENT') {
      if (startValue) {
        const startDate = parseIcsDateValue(startValue, startParams)
        let endDate = endValue ? parseIcsDateValue(endValue, endParams) : null
        const isAllDay =
          (startParams.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(startValue)

        if (!startDate) {
          warnings.push('Ett event hoppades över: ogiltig DTSTART.')
        } else {
          // Fyll rimliga defaultvärden om DTEND saknas eller är ogiltig.
          if (!endDate) {
            endDate = isAllDay ? addDays(startDate, 1) : addMinutes(startDate, 60)
          }
          if (endDate <= startDate) {
            if (isAllDay) {
              endDate = addDays(startDate, 1)
            } else {
              endDate = addMinutes(startDate, 60)
            }
          }
          events.push({
            title: summary || 'Importerad bokning',
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            category,
          })
          if (hasRRule) {
            warnings.push(
              `Återkommande regel upptäcktes för "${summary || 'event'}" (RRULE). Minst första förekomsten importerades.`
            )
          }
        }
      }
      inEvent = false
      continue
    }

    if (!inEvent) continue
    const prop = parsePropertyLine(line)
    if (!prop) continue

    if (prop.name === 'DTSTART') {
      startValue = prop.value
      startParams = prop.params
    } else if (prop.name === 'DTEND') {
      endValue = prop.value
      endParams = prop.params
    } else if (prop.name === 'SUMMARY') {
      summary = decodeIcsText(prop.value)
    } else if (prop.name === 'CATEGORIES') {
      category = decodeIcsText(prop.value.split(',')[0] ?? 'Import') || 'Import'
    } else if (prop.name === 'RRULE') {
      hasRRule = true
    }
  }

  return { events, warnings }
}
