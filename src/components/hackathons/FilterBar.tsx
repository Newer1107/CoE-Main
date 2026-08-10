"use client";

export type HackathonFilters = {
  search: string;
  status: string;
  sort: string;
};

export const EMPTY_FILTERS: HackathonFilters = { search: "", status: "", sort: "" };

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "ACTIVE", label: "Active" },
  { value: "JUDGING", label: "Judging" },
  { value: "CLOSED", label: "Closed" },
];

const SORT_OPTIONS = [
  { value: "", label: "Soonest" },
  { value: "newest", label: "Newest" },
];

/**
 * Search + status + sort toolbar. Object-driven: `onChange` receives the full
 * next filter state so callers can push it to URL params (browse page).
 *
 * Carbon-inspired: bottom-border search field, segmented status/sort controls
 * with underline-active states, hairlines instead of boxes.
 */
export default function FilterBar({
  value,
  onChange,
}: {
  value: HackathonFilters;
  onChange: (next: HackathonFilters) => void;
}) {
  return (
    <div className="border-y border-hairline bg-white">
      <div className="flex flex-col gap-px md:flex-row md:items-stretch">
        {/* Search — Carbon bottom-border field */}
        <label className="flex flex-1 items-center gap-2.5 border-b-2 border-transparent px-1 transition-colors focus-within:border-primary">
          <svg
            className="h-4 w-4 shrink-0 text-muted"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            name="search"
            autoComplete="off"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            placeholder="Search events or problem statements…"
            className="w-full bg-transparent py-3.5 text-sm text-on-surface outline-none placeholder:text-muted"
            aria-label="Search events"
          />
        </label>

        {/* Status — segmented control */}
        <div
          className="flex items-stretch overflow-x-auto md:border-l md:border-hairline"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((option) => {
            const isActive = value.status === option.value;
            return (
              <button
                key={option.value || "all-status"}
                type="button"
                onClick={() => onChange({ ...value, status: option.value })}
                aria-pressed={isActive}
                className={`whitespace-nowrap border-b-2 px-3.5 py-3.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Sort — segmented control */}
        <div
          className="flex items-stretch md:border-l md:border-hairline"
          role="group"
          aria-label="Sort events"
        >
          {SORT_OPTIONS.map((option) => {
            const isActive = value.sort === option.value;
            return (
              <button
                key={option.value || "sort-default"}
                type="button"
                onClick={() => onChange({ ...value, sort: option.value })}
                aria-pressed={isActive}
                className={`whitespace-nowrap border-b-2 px-3.5 py-3.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
