"use client";

import { useState } from "react";

type RunSummary = {
  month: string;
  status: string;
  grantsFound: number;
  grantsPublished: number;
  duplicatesSkipped: number;
  errors: string[];
};

export default function GrantPipelineButton({ isAdmin }: { isAdmin: boolean }) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  if (!isAdmin) return null;

  const runPipeline = async () => {
    setPhase("running");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/grants/collect", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.success) {
        const detail =
          body?.errors?.[0] || body?.message || `Request failed (${res.status})`;
        setErrorMsg(String(detail));
        setPhase("error");
        return;
      }
      setSummary(body.data as RunSummary);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setPhase("error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        onClick={runPipeline}
        disabled={phase === "running"}
        className="bg-[#002155] text-white text-[11px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-[#00337a] disabled:opacity-50 disabled:cursor-wait"
      >
        {phase === "running" ? "Running…" : "Run Pipeline"}
      </button>
      {phase === "done" && summary && (
        <p className="text-[11px] text-[#434651] text-right">
          {summary.month}: {summary.grantsPublished} published
          {summary.duplicatesSkipped > 0 &&
            `, ${summary.duplicatesSkipped} duplicates skipped`}
          {summary.status === "PARTIAL" && " (partial)"}
        </p>
      )}
      {phase === "error" && (
        <p className="text-[11px] text-red-700 text-right max-w-[220px]">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
