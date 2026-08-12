"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AttendanceRow = {
  subject: string;
  type: string;
  present: number;
  total: number;
  percentage: number;
  periodStart: string | null;
  periodEnd: string | null;
};
type JobInfo = { id: number; status: string; attempts: number; lastError: string | null } | null;
type ApiData = {
  eligible: boolean;
  hasPassword: boolean;
  erpPaused: boolean;
  rows: AttendanceRow[];
  lastSyncedAt: string | null;
  job: JobInfo;
};

const STALE_MS = 24 * 3600 * 1000;
const POLL_MS = 5000;
const MAX_POLLS = 24;

const fmtDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
};

const buttonCls =
  "inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50";

export default function AttendanceSection() {
  const [data, setData] = useState<ApiData | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveJob, setLiveJob] = useState<JobInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasPassword, setHasPassword] = useState(false);
  const [pwForm, setPwForm] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [capValue, setCapValue] = useState("");
  const [capSaving, setCapSaving] = useState(false);
  const [capError, setCapError] = useState("");
  const [limitUntil, setLimitUntil] = useState(0); // epoch ms until refresh allowed again
  const [limitLeft, setLimitLeft] = useState(0);
  const [syncStuck, setSyncStuck] = useState(false);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (maxTicks = MAX_POLLS) => {
    stopPolling();
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await fetch("/api/attendance/status", { credentials: "include" }).then((r) => r.json());
        const status = st?.data?.job?.status;
        setLiveJob(st?.data?.job ?? null);
        if (status === "AWAITING_CAPTCHA") return; // user solving — no cap
        ticks += 1;
        setElapsed(ticks * 5);
        // Honest stuck state: a job that has been QUEUED/RUNNING for >3 min
        // means the ERP/worker isn't responding — tell the student.
        const jobAgeMs = st?.data?.job?.createdAt
          ? Date.now() - new Date(st.data.job.createdAt).getTime()
          : 0;
        setSyncStuck(
          !!st?.data?.erpPaused ||
            ((status === "QUEUED" || status === "RUNNING") && jobAgeMs > 60_000),
        );
        if (status === "SUCCESS" || status === "FAILED") {
          stopPolling();
          setQueued(false);
          setPending(false);
          await load();
        } else if (ticks >= maxTicks) {
          // Never poll forever: if the job is still pending after the cap,
          // show an honest "still syncing in background" state instead.
          stopPolling();
          setQueued(false);
          setPending(true);
        }
      } catch {
        if (ticks >= maxTicks) {
          stopPolling();
          setQueued(false);
          setPending(true);
        }
      }
    }, POLL_MS);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance", { credentials: "include" });
      if (res.status === 403) return setHidden(true);
      const body = await res.json();
      if (!body?.data?.eligible) return setHidden(true);
      setData(body.data);
      setLiveJob(body.data.job ?? null);
      setHasPassword(!!body.data.hasPassword);
      const running =
        body.data.job?.status === "QUEUED" ||
        body.data.job?.status === "RUNNING" ||
        body.data.job?.status === "AWAITING_CAPTCHA";
      if (running && body.data.job?.createdAt) {
        const jobAgeMs = Date.now() - new Date(body.data.job.createdAt).getTime();
        setSyncStuck(
          !!body.data.erpPaused ||
            (body.data.job.status !== "AWAITING_CAPTCHA" && jobAgeMs > 60_000),
        );
      } else {
        setSyncStuck(!!body.data.erpPaused);
      }
      setQueued(running);
      setPending(false);
      if (running) startPolling(); // job enqueued elsewhere — poll until it settles
    } catch {
      /* keep last rendered state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return stopPolling;
  }, [load]);

  const startSync = async () => {
    setBusy(true);
    setElapsed(0);
    try {
      const res = await fetch("/api/attendance/refresh", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => null);
      if (res.status === 429) {
        const wait = Math.max(1, Number(body?.retryAfterSeconds ?? 60));
        setLimitUntil(Date.now() + wait * 1000);
        setLimitLeft(wait);
        return;
      }
      if (!body?.data?.jobId) return;
      setQueued(true);
      startPolling();
    } finally {
      setBusy(false);
    }
  };

  // Live countdown for the refresh limit (server-enforced, 2 presses / 5 min).
  useEffect(() => {
    if (limitUntil <= Date.now()) return;
    const t = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((limitUntil - Date.now()) / 1000));
      setLimitLeft(left);
      if (left <= 0) setLimitUntil(0);
    }, 1000);
    return () => window.clearInterval(t);
  }, [limitUntil]);

  const savePassword = async () => {
    setPwSaving(true);
    setPwError("");
    try {
      const res = await fetch("/api/attendance/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwValue }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setPwError(body?.message || "Could not save the password — try again.");
        return;
      }
      setHasPassword(true);
      setPwForm(false);
      setPwValue("");
      await startSync();
    } catch {
      setPwError("Could not reach the server — try again.");
    } finally {
      setPwSaving(false);
    }
  };

  const submitCaptcha = async () => {
    if (!liveJob) return;
    setCapSaving(true);
    setCapError("");
    try {
      const res = await fetch("/api/attendance/captcha", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: liveJob.id, captcha: capValue }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setCapError(body?.message || "Could not submit — try again.");
        return;
      }
      setCapValue("");
    } catch {
      setCapError("Could not reach the server — try again.");
    } finally {
      setCapSaving(false);
    }
  };

  if (hidden) return null;
  const rows = data?.rows ?? [];
  const job = data?.job ?? null;
  const failed = job?.status === "FAILED";
  const awaitingCaptcha = liveJob?.status === "AWAITING_CAPTCHA";
  const pwRejected =
    failed &&
    !job?.lastError?.startsWith("SOLVE_REJECTED") &&
    /LOGIN FAILED|PASSWORD|REJECTED/i.test(job?.lastError ?? "");
  const needsPassword = !hasPassword || pwRejected;
  const hasData = rows.length > 0;
  const lastSynced = data?.lastSyncedAt ?? null;
  const stale = !!lastSynced && Date.now() - new Date(lastSynced).getTime() > STALE_MS;
  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalAll = rows.reduce((s, r) => s + r.total, 0);
  const overall = totalAll > 0 ? ((totalPresent / totalAll) * 100).toFixed(1) : null;
  const periodStart = fmtDate(rows[0]?.periodStart ?? null);
  const periodEnd = fmtDate(rows[0]?.periodEnd ?? null);

  const errInfo = (e: string | null | undefined) => {
    if (!e) return { title: "ERP unreachable", body: "Attendance sync failed. Try again in a few minutes." };
    if (e === "PARSE_EMPTY")
      return {
        title: "ERP attendance is temporarily unavailable",
        body: "The ERP isn't returning attendance data right now — it usually recovers on its own. Try again in a while. Your last synced data is shown below.",
      };
    if (e === "PARSE_NO_RECORD")
      return {
        title: "No ERP record for this account",
        body: "The ERP has no attendance record for this account — contact the office.",
      };
    if (e === "SOLVE_REJECTED")
      return {
        title: "That code wasn't right",
        body: "The code you entered didn't match — start a new sync and try again.",
      };
    if (e === "CAPTCHA_TIMEOUT")
      return {
        title: "The code expired",
        body: "The code expired before you entered it — start a new sync.",
      };
    if (e.startsWith("PARSE_UNKNOWN"))
      return {
        title: "We couldn't read the ERP report",
        body: "The ERP returned an unexpected format — try again in a while.",
      };
    return { title: "Can't reach the ERP", body: "We couldn't reach the ERP server. Check again in a few minutes — your sync will retry automatically." };
  };
  const err = errInfo(job?.lastError);

  const failedBox = failed ? (
    <div className="border border-outline-variant bg-surface-container p-5">
      <p className="text-sm font-semibold text-primary">{err.title}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{err.body}</p>
      {!pwRejected ? (
        <button
          type="button"
          onClick={() => void startSync()}
          disabled={busy || limitUntil > Date.now()}
          className={`${buttonCls} mt-3`}
        >
          {limitUntil > Date.now() ? `Wait ${limitLeft}s` : "Retry ↻"}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 border-b border-hairline pb-3">
        <h2 className="font-headline text-xl font-bold text-primary">Attendance</h2>
        {stale ? (
          <span className="border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            Stale
          </span>
        ) : null}
        <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      </div>

      <div role="note" className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
          Under development — testing phase
        </p>
        <p className="mt-0.5 text-xs text-amber-900/80">
          This feature is still in testing. Data may be incomplete or temporarily unavailable — don't rely on it yet.
        </p>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse border border-outline-variant bg-surface-container" aria-busy="true" />
      ) : needsPassword ? (
        <div className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">
            {pwRejected ? "ERP password rejected" : "Link your ERP account"}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {pwRejected
              ? "The ERP rejected the saved password. Enter it again to re-enable sync."
              : "Enter your ERP password once — it's encrypted and used only to fetch your attendance."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void savePassword();
              }}
              placeholder="ERP password"
              aria-label="ERP password"
              autoComplete="off"
              className="w-full min-w-0 flex-1 border border-outline-variant bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            <button type="button" onClick={() => void savePassword()} disabled={pwSaving || !pwValue} className={buttonCls}>
              {pwSaving ? "Checking…" : "Save & sync"}
            </button>
          </div>
          {pwError ? <p className="mt-2 text-xs text-error">{pwError}</p> : null}
        </div>
      ) : awaitingCaptcha ? (
        <div role="status" aria-live="polite" className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">Type the code from the image</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            The automatic reader couldn't read the ERP captcha — type the characters exactly as shown.
          </p>
          <p className="mt-1 text-[11px] text-muted">
            If the report comes back empty, we'll retry automatically on a fresh connection — no need to do anything.
          </p>
          <img
            src={`/api/attendance/captcha?jobId=${liveJob.id}`}
            alt="ERP captcha"
            className="mt-3 border border-outline-variant bg-white p-2"
            style={{ imageRendering: "pixelated", maxHeight: 96 }}
          />
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={capValue}
              onChange={(e) => setCapValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCaptcha();
              }}
              placeholder="Code from image"
              aria-label="Captcha code"
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full min-w-0 flex-1 border border-outline-variant bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
            />
            <button type="button" onClick={() => void submitCaptcha()} disabled={capSaving || !capValue} className={buttonCls}>
              {capSaving ? "Submitting…" : "Submit"}
            </button>
          </div>
          {capError ? <p className="mt-2 text-xs text-error">{capError}</p> : null}
        </div>
      ) : pending ? (
        <div role="status" aria-live="polite" className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">Still syncing in the background…</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            The ERP can take a couple of minutes. Refresh this page to check — your last
            data stays visible until the new sync lands.
          </p>
        </div>
      ) : queued ? (
        <div role="status" aria-live="polite" className="border border-outline-variant bg-surface-container p-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            <div>
              <p className="text-sm font-semibold text-primary">
                {syncStuck ? "ERP not responding" : "Syncing with ERP…"}
              </p>
              {syncStuck ? (
                <>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    The ERP isn't responding right now — your sync is queued and will run automatically once it's back.
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    Check back in a few minutes — nothing else needed from you.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {liveJob?.status === "RUNNING"
                      ? `Fetching your attendance from the ERP${liveJob.attempts > 1 ? ` — attempt ${liveJob.attempts}/2` : ""}. Usually under a minute; the ERP is sometimes slow.`
                      : liveJob?.status === "QUEUED"
                        ? "Queued — waiting for the sync worker."
                        : "Connecting to the ERP…"}
                  </p>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed — updates automatically
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : hasData ? (
        <div className="border-y border-hairline">
          {failedBox}
          {periodStart ? (
            <p className="border-b border-hairline px-1 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Period: {periodStart} — {periodEnd ?? "now"}
            </p>
          ) : null}
          {(["TH", "PR", "TU"] as const).map((type) => {
            const group = rows.filter((r) => r.type === type);
            if (group.length === 0) return null;
            const gp = group.reduce((s, r) => s + r.present, 0);
            const gt = group.reduce((s, r) => s + r.total, 0);
            const label = { TH: "Theory", PR: "Practical", TU: "Tutorial" }[type];
            return (
              <div key={type}>
                <p className="flex items-center justify-between border-b border-hairline bg-surface-container px-1 py-2">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {label}
                  </span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-secondary">
                    {gt > 0 ? `${((gp / gt) * 100).toFixed(2)}%` : "—"} · {gp}/{gt}
                  </span>
                </p>
                <ul className="divide-y divide-hairline">
                  {group.map((r) => (
                    <li key={`${r.subject}-${r.type}`} className="flex items-center justify-between gap-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-primary">{r.subject}</p>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold tabular-nums text-primary">
                          {r.present}/{r.total}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-secondary">{r.percentage}%</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface-container px-1 py-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                Overall · synced {fmtDate(lastSynced)}
              </p>
              <p className="font-headline text-2xl font-bold tabular-nums text-primary">
                {overall !== null ? `${overall}%` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasPassword ? (
                <button
                  type="button"
                  onClick={() => void startSync()}
                  disabled={busy || limitUntil > Date.now()}
                  className={buttonCls}
                >
                  {limitUntil > Date.now() ? `Wait ${limitLeft}s` : failed ? "Retry ↻" : "Refresh ↻"}
                </button>
              ) : null}
              {limitUntil > Date.now() ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-error">
                  Limit reached — 2 refreshes / 5 min
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : failed ? (
        failedBox
      ) : (
        <div className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">No attendance synced yet</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Your ERP attendance (Theory / Practical / Tutorial) appears here after the first sync.
          </p>
          <button type="button" onClick={() => void startSync()} disabled={busy} className={`${buttonCls} mt-3`}>
            Sync attendance
          </button>
        </div>
      )}
    </div>
  );
}
