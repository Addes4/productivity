import { useState } from 'react'
import type { CalendarEvent } from '../types'

export function AddEventModal({
  weekStart,
  onSave,
  onClose,
}: {
  weekStart: string
  onSave: (event: Omit<CalendarEvent, 'id'>) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(weekStart)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [category, setCategory] = useState('Övrigt')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Använd lokalt datum/tid så att bokningen visas rätt i kalendern
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const [y, mo, d] = date.split('-').map(Number)
    const start = new Date(y, mo - 1, d, sh, sm || 0, 0, 0)
    const end = new Date(y, mo - 1, d, eh, em || 0, 0, 0)
    if (end <= start) return
    onSave({
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      source: 'manual',
      locked: false,
      category,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Lägg till bokning</h2>
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
          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              Spara
            </button>
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
