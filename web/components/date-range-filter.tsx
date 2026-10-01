import Form from "next/form";
import Link from "next/link";

import { type DateRange, PRESETS, isSameRange } from "@/lib/date-range";

const inputClass =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink [color-scheme:light] dark:[color-scheme:dark]";

/** Presets first, then a custom range. Plain links and a GET form: no client JS needed. */
export function DateRangeFilter({ range }: { range: DateRange }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <nav aria-label="Période" className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const active = isSameRange(preset.range(), range);
          return (
            <Link
              key={preset.id}
              href={`/?preset=${preset.id}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast"
                  : "rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink-secondary hover:text-ink"
              }
            >
              {preset.label}
            </Link>
          );
        })}
      </nav>

      {/* Keyed by range so the inputs reset when a preset is picked. */}
      <Form key={`${range.from}:${range.to}`} action="/" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">
          Du
          <input type="date" name="from" defaultValue={range.from} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">
          Au
          <input type="date" name="to" defaultValue={range.to} required className={inputClass} />
        </label>
        <button
          type="submit"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-ink-muted"
        >
          Appliquer
        </button>
      </Form>
    </div>
  );
}
