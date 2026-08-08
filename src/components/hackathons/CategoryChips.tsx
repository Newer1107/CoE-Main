"use client";

import Link from "next/link";

export type ChipCategory = { key: string; label: string };

/**
 * Horizontal category chip row.
 *
 * Button mode (default): `onChange(key)` fires on selection — used by the
 * browse page. When `hrefPrefix` is provided, chips render as links to
 * `${hrefPrefix}?type=<key>` — used by the landing page.
 */
export default function CategoryChips({
  categories,
  active,
  onChange,
  hrefPrefix,
}: {
  categories: ChipCategory[];
  active: string;
  onChange?: (key: string) => void;
  hrefPrefix?: string;
}) {
  const chipClass = (isActive: boolean) =>
    [
      "inline-flex items-center border px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors",
      isActive
        ? "border-primary bg-primary text-white"
        : "border-outline-variant bg-white text-on-surface-variant hover:border-primary hover:bg-surface-container-low hover:text-primary",
    ].join(" ");

  const allChip = hrefPrefix ? (
    <Link key="all" href={hrefPrefix} className={chipClass(active === "")}>
      All
    </Link>
  ) : (
    <button
      key="all"
      type="button"
      onClick={() => onChange?.("")}
      className={chipClass(active === "")}
    >
      All
    </button>
  );

  return (
    <div className="flex flex-wrap gap-2" role={hrefPrefix ? undefined : "group"}>
      {allChip}
      {categories.map((category) => {
        if (hrefPrefix) {
          return (
            <Link
              key={category.key}
              href={`${hrefPrefix}?type=${encodeURIComponent(category.key)}`}
              className={chipClass(active === category.key)}
            >
              {category.label}
            </Link>
          );
        }
        return (
          <button
            key={category.key}
            type="button"
            onClick={() => onChange?.(category.key)}
            aria-pressed={active === category.key}
            className={chipClass(active === category.key)}
          >
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
