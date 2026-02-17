import { useState } from 'react'
import type { Settings, DayOfWeek } from '../types'

const DAY_LABELS: { value: DayOfWeek; label: string }[] = [
  { value: 0, label: 'Sön' },
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
  { value: 6, label: 'Lör' },
]

export function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings
  onSave: (s: Settings) => void
  onClose: () => void
}) {
  const [workEnabled, setWorkEnabled] = useState(settings.workHours.enabled)
  const [workStart, setWorkStart] = useState(settings.workHours.start)
  const [workEnd, setWorkEnd] = useState(settings.workHours.end)
  const [workDays, setWorkDays] = useState<DayOfWeek[]>(settings.workHours.days)
  const [minBreak, setMinBreak] = useState(settings.minBreakMinutes)
  const [maxPerDay, setMaxPerDay] = useState(settings.maxActivitiesPerDay)
  const [sleepStart, setSleepStart] = useState(settings.sleepWindow.start)
  const [sleepEnd, setSleepEnd] = useState(settings.sleepWindow.end)
  const [sleepDays, setSleepDays] = useState<DayOfWeek[]>(settings.sleepWindow.days)
  const [officeDays, setOfficeDays] = useState<DayOfWeek[]>(settings.officeDays)

  const toggleWorkDay = (d: DayOfWeek) => {
    setWorkDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    )
  }
  const toggleSleepDay = (d: DayOfWeek) => {
    setSleepDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    )
  }
  const toggleOfficeDay = (d: DayOfWeek) => {
    setOfficeDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    )
  }

  const handleSave = () => {
    onSave({
      ...settings,
      workHours: {
        enabled: workEnabled,
        start: workStart,
        end: workEnd,
        days: workDays,
      },
      sleepWindow: { start: sleepStart, end: sleepEnd, days: sleepDays },
      minBreakMinutes: minBreak,
      maxActivitiesPerDay: maxPerDay,
      officeDays,
    })
    onClose()
  }

  return (
    <div className="space-y-4 text-sm">
      <h3 className="font-semibold text-slate-800">Arbetstider</h3>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={workEnabled}
          onChange={(e) => setWorkEnabled(e.target.checked)}
          className="rounded border-slate-300"
        />
        Använd arbetstider som ram
      </label>
      {workEnabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-600 mb-1">Start</label>
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Slut</label>
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleWorkDay(value)}
                className={`px-2 py-0.5 rounded text-xs ${
                  workDays.includes(value) ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="font-semibold text-slate-800 pt-2">Skyddat sömnfönster</h3>
      <p className="text-slate-600 text-xs">Bokas aldrig. T.ex. 23:00–07:00.</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-slate-600 mb-1">Start</label>
          <input
            type="time"
            value={sleepStart}
            onChange={(e) => setSleepStart(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-slate-600 mb-1">Slut</label>
          <input
            type="time"
            value={sleepEnd}
            onChange={(e) => setSleepEnd(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {DAY_LABELS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleSleepDay(value)}
            className={`px-2 py-0.5 rounded text-xs ${
              sleepDays.includes(value) ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <div>
          <label className="block font-medium text-slate-700 mb-1">Minsta paus mellan block (min)</label>
          <input
            type="number"
            min={0}
            value={minBreak}
            onChange={(e) => setMinBreak(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 mb-1">Max aktiviteter per dag</label>
          <input
            type="number"
            min={1}
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1"
          />
        </div>
      </div>

      <div>
        <label className="block font-medium text-slate-700 mb-1">Kontorsdagar (valfritt)</label>
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleOfficeDay(value)}
              className={`px-2 py-0.5 rounded text-xs ${
                officeDays.includes(value) ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
        >
          Spara inställningar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
        >
          Stäng
        </button>
      </div>
    </div>
  )
}
