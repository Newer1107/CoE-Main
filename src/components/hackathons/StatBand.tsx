"use client";

import CountUp from "@/components/CountUp";

export type StatItem = {
  label: string;
  value: number;
  suffix?: string;
};

/**
 * Editorial stat strip with animated counters (CountUp).
 * Carbon-style flat band: hairline rules between cells, mono micro-labels,
 * serif ghost numerals — first stat carries the emphasis, the rest recede.
 */
export default function StatBand({ stats }: { stats: StatItem[] }) {
  return (
    <section className="border-y border-hairline bg-surface-container">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-10 px-4 py-10 md:grid-cols-4 md:px-8 md:py-12">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={
              index === 0
                ? "md:pr-10"
                : "md:border-l md:border-hairline md:pl-10"
            }
          >
            <p
              className={`font-headline font-bold tracking-tight text-primary tabular-nums ${
                index === 0
                  ? "text-5xl md:text-6xl"
                  : "text-4xl md:text-5xl"
              }`}
            >
              <CountUp value={stat.value} />
              {stat.suffix ? <span className="text-secondary">{stat.suffix}</span> : null}
            </p>
            <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
