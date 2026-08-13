"use client";

import { useEffect, useState } from "react";

type Stats = {
  views: number;
  refreshes: number;
  captchaAsks: number;
  passwordSaves: number;
  usersLinked: number;
  queue: { queued: number; running: number; awaitingCaptcha: number; failed: number };
  erpPaused: boolean;
};

/** ERP attendance usage counters for the admin Analytics tab. */
export default function ErpStatsCard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void fetch("/api/admin/attendance-stats", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => {
        if (b?.data) setStats(b.data);
      })
      .catch(() => null);
  }, []);

  if (!stats) return null;

  const items = [
    { label: "Users linked ERP password", value: stats.usersLinked },
    { label: "Attendance tab views", value: stats.views },
    { label: "Refresh presses", value: stats.refreshes },
    { label: "Captcha asks (OCR failed)", value: stats.captchaAsks },
    { label: "Password saves", value: stats.passwordSaves },
  ];

  const queueItems = [
    { label: "Queued", value: stats.queue.queued },
    { label: "Running", value: stats.queue.running },
    { label: "Awaiting captcha", value: stats.queue.awaitingCaptcha },
    { label: "Failed", value: stats.queue.failed },
  ];

  return (
    <section className="mb-5 border border-[#c4c6d3] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-headline text-xl text-[#002155]">ERP Attendance Stats</h3>
          <p className="text-sm text-[#434651]">
            Usage counters for the attendance sync feature — aggregate counts only.
          </p>
        </div>
        <span
          className={`border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] ${
            stats.erpPaused
              ? "border-amber-300 bg-amber-100 text-amber-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-700"
          }`}
        >
          {stats.erpPaused ? "ERP paused — not responding" : "ERP reachable"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="border border-[#c4c6d3] bg-[#f4f6fa] p-4">
            <p className="font-headline text-3xl font-bold tabular-nums text-[#002155]">{item.value}</p>
            <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#434651]">
              {item.label}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-[#c4c6d3] pt-4">
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#002155]">
          Sync queue — live
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {queueItems.map((item) => (
            <div key={item.label} className="border border-[#c4c6d3] bg-[#f4f6fa] p-4">
              <p className="font-headline text-3xl font-bold tabular-nums text-[#002155]">{item.value}</p>
              <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#434651]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
