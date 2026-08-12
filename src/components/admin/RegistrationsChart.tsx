"use client";

import { useEffect, useState } from "react";

type DayPoint = { date: string; count: number };

/** Student registrations per day — hand-rolled SVG bar chart (last 30 days). */
export default function RegistrationsChart() {
  const [points, setPoints] = useState<DayPoint[] | null>(null);

  useEffect(() => {
    void fetch("/api/admin/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => {
        if (Array.isArray(b?.data?.registrationsByDay)) setPoints(b.data.registrationsByDay);
      })
      .catch(() => null);
  }, []);

  if (!points) {
    return (
      <section className="mb-8 border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Student Registrations (last 30 days)</h3>
        <div className="mt-4 h-[220px] animate-pulse bg-[#f4f6fa]" aria-busy="true" />
      </section>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.count));
  const W = 720;
  const H = 220;
  const PAD_L = 34;
  const PAD_B = 26;
  const PAD_T = 14;
  const plotW = W - PAD_L - 8;
  const plotH = H - PAD_T - PAD_B;
  const barW = Math.max(3, plotW / points.length - 2);
  const total = points.reduce((s, p) => s + p.count, 0);
  const short = (date: string) => {
    const [, m, d] = date.split("-");
    return `${d}/${m}`;
  };

  return (
    <section className="mb-8 border border-[#c4c6d3] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-headline text-xl text-[#002155]">Student Registrations</h3>
          <p className="text-sm text-[#434651]">New student accounts per day — last 30 days</p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#434651]">
          {total} total · peak {max}/day
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Student registrations per day, last 30 days">
        {/* y gridlines + labels */}
        {[0, 0.5, 1].map((f) => {
          const y = PAD_T + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={W - 8} y2={y} stroke="#e5e7f0" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#747782">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        {/* bars */}
        {points.map((p, i) => {
          const h = Math.max(p.count === 0 ? 1 : (p.count / max) * plotH, 1.5);
          const x = PAD_L + i * ((plotW) / points.length);
          const y = PAD_T + plotH - h;
          const peak = p.count === max;
          return (
            <g key={p.date}>
              <title>{`${p.date}: ${p.count} registration${p.count === 1 ? "" : "s"}`}</title>
              <rect
                x={x + 1}
                y={y}
                width={barW}
                height={h}
                fill={peak ? "#fd9923" : "#002155"}
                rx="1"
                className="cursor-pointer transition-opacity hover:opacity-70"
              />
              {p.count > 0 ? (
                <text x={x + 1 + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fill="#002155" fontWeight="700">
                  {p.count}
                </text>
              ) : null}
              {i % 5 === 0 ? (
                <text x={x + 1 + barW / 2} y={H - 8} textAnchor="middle" fontSize="8" fill="#747782">
                  {short(p.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-[#9aa0b5]">
        Gold = peak day
      </p>
    </section>
  );
}
