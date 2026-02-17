import { useEffect, useState } from 'react'
import type { CalendarEvent, DayOfWeek } from '../types'

const DAY_OPTIONS: { day: DayOfWeek; label: string }[] = [
  { day: 1, label: 'Mån' },
  { day: 2, label: 'Tis' },
  { day: 3, label: 'Ons' },
  { day: 4, label: 'Tor' },
  { day: 5, label: 'Fre' },
  { day: 6, label: 'Lör' },
  { day: 0, label: 'Sön' },
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toTimeInputValue(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseLocalDayOfWeek(dateValue: string): DayOfWeek {
  const [y, mo, d] = dateValue.split('-').map(Number)
  return new Date(y, (mo ?? 1) - 1, d ?? 1, 12, 0, 0, 0).getDay() as DayOfWeek
}

function normalizeRecurringDays(days: DayOfWeek[]): DayOfWeek[] {
  const uniq = Array.from(new Set(days)).filter(
    (day): day is DayOfWeek => Number.isInteger(day) && day >= 0 && day <= 6
  )
  return uniq.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

export function AddEventModal({
  weekStart,
  existingEvent,
  onSave,
  onDelete,
  onClose,
}: {
  weekStart: string
  existingEvent?: CalendarEvent | null
  onSave: (event: Omit<CalendarEvent, 'id'>, existingId?: string) => void
  onDelete?: (event: CalendarEvent) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(existingEvent?.title ?? '')
  const [date, setDate] = useState(existingEvent ? toDateInputValue(existingEvent.start) : weekStart)
  const [startTime, setStartTime] = useState(
    existingEvent ? toTimeInputValue(existingEvent.start) : '09:00'
  )
  const [endTime, setEndTime] = useState(
    existingEvent ? toTimeInputValue(existingEvent.end) : '10:00'
  )
  const [category, setCategory] = useState(existingEvent?.category ?? 'Övrigt')
  const [isRecurring, setIsRecurring] = useState(
    Boolean(existingEvent?.recurrenceDays && existingEvent.recurrenceDays.length > 0)
  )
  const [recurrenceDays, setRecurrenceDays] = useState<DayOfWeek[]>(
    existingEvent?.recurrenceDays ? normalizeRecurringDays(existingEvent.recurrenceDays) : []
  )
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!existingEvent) {
      setTitle('')
      setDate(weekStart)
      setStartTime('09:00')
      setEndTime('10:00')
      setCategory('Övrigt')
      setIsRecurring(false)
      setRecurrenceDays([])
      setFormError(null)
      return
    }
    setTitle(existingEvent.title)
    setDate(toDateInputValue(existingEvent.start))
    setStartTime(toTimeInputValue(existingEvent.start))
    setEndTime(toTimeInputValue(existingEvent.end))
    setCategory(existingEvent.category)
    const recurring = Boolean(existingEvent.recurrenceDays && existingEvent.recurrenceDays.length > 0)
    setIsRecurring(recurring)
    setRecurrenceDays(
      recurring && existingEvent.recurrenceDays
        ? normalizeRecurringDays(existingEvent.recurrenceDays)
        : []
    )
    setFormError(null)
  }, [existingEvent, weekStart])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    // Använd lokalt datum/tid så att bokningen visas rätt i kalendern
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const [y, mo, d] = date.split('-').map(Number)
    const start = new Date(y, mo - 1, d, sh, sm || 0, 0, 0)
    const end = new Date(y, mo - 1, d, eh, em || 0, 0, 0)
    if (end <= start) {
      setFormError('Sluttiden måste vara efter starttiden.')
      return
    }
    const normalizedDays = normalizeRecurringDays(recurrenceDays)
    if (isRecurring && normalizedDays.length === 0) {
      setFormError('Välj minst en veckodag för återkommande bokning.')
      return
    }

    onSave({
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      recurrenceDays: isRecurring ? normalizedDays : undefined,
      recurrenceParentId: undefined,
      source: existingEvent?.source ?? 'manual',
      locked: existingEvent?.locked ?? false,
      category,
    }, existingEvent?.recurrenceParentId ?? existingEvent?.id)
    onClose()
  }

  const toggleRecurringDay = (day: DayOfWeek) => {
    setRecurrenceDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
      return normalizeRecurringDays(next)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          {existingEvent ? 'Redigera bokning' : 'Lägg till bokning'}
        </h2>
        {existingEvent && existingEvent.source !== 'manual' && (
          <p className="mb-3 text-xs text-slate-500">
            Importerad bokning: lokala ändringar kan ersättas vid nästa synk.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Slut</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Kategori</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/60">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => {
                  const enabled = e.target.checked
                  setIsRecurring(enabled)
                  if (enabled && recurrenceDays.length === 0) {
                    setRecurrenceDays([parseLocalDayOfWeek(date)])
                  }
                }}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Återkommande varje vecka
            </label>
            {isRecurring && (
              <div className="mt-2 flex flex-wrap gap-2">
                {DAY_OPTIONS.map((option) => (
                  <button
                    key={option.day}
                    type="button"
                    onClick={() => toggleRecurringDay(option.day)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      recurrenceDays.includes(option.day)
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {formError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
              {formError}
            </p>
          )}
          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              Spara
            </button>
            {existingEvent && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(existingEvent)
                  onClose()
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700"
              >
                {existingEvent.recurrenceParentId ? 'Ta bort denna gång' : 'Ta bort'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
