import { useState } from 'react'
import type { ActivityGoal, DayOfWeek, Priority, PreferredTimeOfDay, Location } from '../types'

const DAY_LABELS: { value: DayOfWeek; label: string }[] = [
  { value: 0, label: 'Sön' },
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tor' },
  { value: 5, label: 'Fre' },
  { value: 6, label: 'Lör' },
]

const COLORS = [
  '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
]

export function GoalForm({
  goal,
  onSubmit,
  onCancel,
}: {
  goal?: ActivityGoal | null
  onSubmit: (g: Omit<ActivityGoal, 'id'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(goal?.name ?? '')
  const [category, setCategory] = useState(goal?.category ?? '')
  const [weeklyTargetMinutes, setWeeklyTargetMinutes] = useState(goal?.weeklyTargetMinutes ?? 120)
  const [sessionMinutes, setSessionMinutes] = useState(goal?.sessionMinutes ?? 40)
  const [minWeeklyMinutes, setMinWeeklyMinutes] = useState(goal?.minWeeklyMinutes ?? 60)
  const [maxWeeklyMinutes, setMaxWeeklyMinutes] = useState(goal?.maxWeeklyMinutes ?? 180)
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number | ''>(goal?.sessionsPerWeek ?? '')
  const [priority, setPriority] = useState<Priority>(goal?.priority ?? 'medium')
  const [allowedDays, setAllowedDays] = useState<DayOfWeek[]>(goal?.allowedDays ?? [1, 2, 3, 4, 5])
  const [earliestStart, setEarliestStart] = useState(goal?.earliestStart ?? '06:00')
  const [latestEnd, setLatestEnd] = useState(goal?.latestEnd ?? '22:00')
  const [preferredTimeOfDay, setPreferredTimeOfDay] = useState<PreferredTimeOfDay>(goal?.preferredTimeOfDay ?? 'any')
  const [location, setLocation] = useState<Location>(goal?.location ?? 'any')
  const [equipment, setEquipment] = useState(goal?.equipment ?? '')
  const [travelBufferMinutes, setTravelBufferMinutes] = useState(goal?.travelBufferMinutes ?? 0)
  const [isFixed, setIsFixed] = useState(goal?.isFixed ?? false)
  const [color, setColor] = useState(goal?.color ?? COLORS[0])

  const toggleDay = (d: DayOfWeek) => {
    setAllowedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name,
      category: category || 'Övrigt',
      weeklyTargetMinutes,
      sessionMinutes,
      minWeeklyMinutes,
      maxWeeklyMinutes,
      sessionsPerWeek: sessionsPerWeek === '' ? undefined : Number(sessionsPerWeek),
      priority,
      allowedDays,
      earliestStart,
      latestEnd,
      preferredTimeOfDay,
      location,
      equipment: equipment || undefined,
      travelBufferMinutes,
      isFixed,
      color,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div>
        <label className="block font-medium text-slate-700 mb-1">Namn</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Kategori</label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
          placeholder="t.ex. Hälsa, Arbete"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block font-medium text-slate-700 mb-1">Veckomål (min)</label>
          <input
            type="number"
            min={1}
            value={weeklyTargetMinutes}
            onChange={(e) => setWeeklyTargetMinutes(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 mb-1">Passlängd (min)</label>
          <input
            type="number"
            min={1}
            value={sessionMinutes}
            onChange={(e) => setSessionMinutes(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block font-medium text-slate-700 mb-1">Min min/vecka</label>
          <input
            type="number"
            min={0}
            value={minWeeklyMinutes}
            onChange={(e) => setMinWeeklyMinutes(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 mb-1">Max min/vecka</label>
          <input
            type="number"
            min={0}
            value={maxWeeklyMinutes}
            onChange={(e) => setMaxWeeklyMinutes(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Frekvens (pass/vecka, valfritt)</label>
        <input
          type="number"
          min={0}
          value={sessionsPerWeek}
          onChange={(e) => setSessionsPerWeek(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
          placeholder="t.ex. 3"
        />
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Prioritet</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        >
          <option value="low">Låg</option>
          <option value="medium">Medel</option>
          <option value="high">Hög</option>
        </select>
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Tillåtna dagar</label>
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleDay(value)}
              className={`px-2 py-1 rounded text-xs font-medium ${
                allowedDays.includes(value)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block font-medium text-slate-700 mb-1">Tidigast start</label>
          <input
            type="time"
            value={earliestStart}
            onChange={(e) => setEarliestStart(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 mb-1">Senast slut</label>
          <input
            type="time"
            value={latestEnd}
            onChange={(e) => setLatestEnd(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Preferens (tid på dagen)</label>
        <select
          value={preferredTimeOfDay}
          onChange={(e) => setPreferredTimeOfDay(e.target.value as PreferredTimeOfDay)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        >
          <option value="any">Valfri</option>
          <option value="morning">Morgon</option>
          <option value="lunch">Lunch</option>
          <option value="evening">Kväll</option>
        </select>
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Plats</label>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value as Location)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        >
          <option value="any">Valfri</option>
          <option value="home">Hemma</option>
          <option value="gym">Gym</option>
          <option value="office">Kontor</option>
        </select>
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Utrustning (valfritt)</label>
        <input
          type="text"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
          placeholder="t.ex. yogamatta"
        />
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Restidsbuffert (min)</label>
        <input
          type="number"
          min={0}
          value={travelBufferMinutes}
          onChange={(e) => setTravelBufferMinutes(Number(e.target.value))}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        />
      </div>
      <div>
        <label className="block font-medium text-slate-700 mb-1">Färg</label>
        <div className="flex gap-1 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-slate-800' : 'border-slate-300'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isFixed"
          checked={isFixed}
          onChange={(e) => setIsFixed(e.target.checked)}
          className="rounded border-slate-300"
        />
        <label htmlFor="isFixed" className="font-medium text-slate-700">
          FAST (låst) – annars RÖRLIG (flyttbar)
        </label>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
        >
          {goal ? 'Spara' : 'Lägg till'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50"
        >
          Avbryt
        </button>
      </div>
    </form>
  )
}
