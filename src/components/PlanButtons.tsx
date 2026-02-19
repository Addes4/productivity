// Knappar för att köra schemaläggning och toggla mini-pass-fallback.
export function PlanButtons({
  onPlanWeek,
  minimumViableDay,
  onToggleMVD,
}: {
  onPlanWeek: () => void
  minimumViableDay: boolean
  onToggleMVD: (on: boolean) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onPlanWeek}
          className="w-full px-4 py-3 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 shadow-md transition-colors"
        >
          Planera veckan
        </button>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={minimumViableDay}
          onChange={(e) => onToggleMVD(e.target.checked)}
          className="rounded border-slate-300"
        />
        <span className="text-sm font-medium text-slate-700">
          Minimum viable day (10-min mini-pass när veckan är full)
        </span>
      </label>
    </div>
  )
}
