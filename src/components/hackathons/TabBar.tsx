"use client";

export type HackathonTab = "about" | "problems" | "rubrics" | "leaderboard";

const TABS: { key: HackathonTab; label: string }[] = [
  { key: "about", label: "About" },
  { key: "problems", label: "Problems" },
  { key: "rubrics", label: "Rubrics" },
  { key: "leaderboard", label: "Leaderboard" },
];

/**
 * Section tabs for the event detail page. Active tab gets the navy underline.
 */
export default function TabBar({
  active,
  onChange,
  counts,
  showRubrics = true,
}: {
  active: HackathonTab;
  onChange: (tab: HackathonTab) => void;
  counts?: Partial<Record<HackathonTab, number>>;
  showRubrics?: boolean;
}) {
  const tabs = TABS.filter((tab) => tab.key !== "rubrics" || showRubrics);

  return (
    <nav
      className="flex overflow-x-auto border-b border-outline-variant"
      aria-label="Event sections"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        const count = counts?.[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors md:px-5",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-primary",
            ].join(" ")}
          >
            {tab.label}
            {count != null ? <span className="ml-1.5 font-mono text-[10px] text-muted">({count})</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
