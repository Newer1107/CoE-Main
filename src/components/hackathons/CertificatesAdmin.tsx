"use client";

import { useCallback, useEffect, useState } from "react";

type CertRow = {
  id: number;
  userId: number;
  type: string;
  title: string;
  detail: string | null;
  serial: string;
  issuedAt: string;
  nameOverride: string | null;
  user: { id: number; name: string; uid: string | null };
  event: { id: number; title: string };
};

type EventOption = { id: number; title: string };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function CertificatesAdmin() {
  const [rows, setRows] = useState<CertRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // issue-later form
  const [issueEventId, setIssueEventId] = useState("");
  const [issueUid, setIssueUid] = useState("");

  // inline name edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      if (eventFilter) params.set("eventId", eventFilter);
      params.set("page", String(page));
      params.set("pageSize", "100");
      const res = await fetch(`/api/innovation/admin/certificates?${params.toString()}`, { credentials: "include" });
      const payload = await res.json();
      if (res.ok && payload.success) {
        setRows(payload.data.rows);
        setTotal(payload.data.total);
      }
      else setMessage({ ok: false, text: payload.message || "Failed to load certificates" });
    } catch {
      setMessage({ ok: false, text: "Could not load certificates" });
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, eventFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, eventFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/innovation/events", { credentials: "include" })
      .then((r) => r.json())
      .then((p) => {
        if (p?.success && Array.isArray(p.data)) {
          setEvents(p.data.map((e: { id: number; title: string }) => ({ id: e.id, title: e.title })));
        }
      })
      .catch(() => null);
  }, []);

  const issueLater = async () => {
    if (!issueEventId || !issueUid.trim()) {
      setMessage({ ok: false, text: "Select an event and enter the student UID." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/innovation/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "issue", eventId: Number(issueEventId), uid: issueUid.trim() }),
      });
      const payload = await res.json();
      setMessage({ ok: res.ok && payload.success, text: payload.message || payload.errors?.[0] || "Issue failed" });
      if (res.ok) {
        setIssueUid("");
        load();
      }
    } catch {
      setMessage({ ok: false, text: "Issue request failed" });
    } finally {
      setLoading(false);
    }
  };

  const reissue = async (row: CertRow) => {
    setLoading(true);
    try {
      const res = await fetch("/api/innovation/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "reissue", certificateId: row.id, nameOverride: editName.trim() || null }),
      });
      const payload = await res.json();
      setMessage({ ok: res.ok && payload.success, text: payload.message || payload.errors?.[0] || "Reissue failed" });
      setEditingId(null);
      if (res.ok) load();
    } catch {
      setMessage({ ok: false, text: "Reissue request failed" });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (row: CertRow) => {
    if (!window.confirm(`Delete certificate ${row.serial} (${row.nameOverride || row.user.name})? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/innovation/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", certificateId: row.id }),
      });
      const payload = await res.json();
      setMessage({ ok: res.ok && payload.success, text: payload.message || payload.errors?.[0] || "Delete failed" });
      if (res.ok) load();
    } catch {
      setMessage({ ok: false, text: "Delete request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border border-[#c4c6d3] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold uppercase tracking-wider text-[#002155]">Certificates</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#747782]">
          {total} total
        </span>
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 px-3 py-2 text-xs font-semibold ${message.ok ? "bg-green-50 text-[#0b6b2e]" : "bg-red-50 text-[#b3261e]"}`}>
          {message.text}
        </p>
      ) : null}

      {/* Issue later */}
      <div className="mt-4 border border-[#e6e5e1] bg-[#faf9f5] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">Issue certificate for a missed student</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#747782]">
            Event
            <select
              value={issueEventId}
              onChange={(e) => setIssueEventId(e.target.value)}
              className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs text-[#002155]"
            >
              <option value="">Select event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-[#747782]">
            Student UID
            <input
              value={issueUid}
              onChange={(e) => setIssueUid(e.target.value)}
              placeholder="e.g. 24-COMPD14-28"
              className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs text-[#002155]"
            />
          </label>
          <button
            onClick={issueLater}
            disabled={loading}
            className="border border-[#002155] bg-[#002155] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#1a438e] disabled:opacity-50"
          >
            Issue
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[#747782]">
          Issues what the student actually earned: achievement (top-3 team) or participation (present). Idempotent — existing certificates are kept.
        </p>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, UID, serial"
          className="w-64 border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs text-[#002155]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs text-[#002155]"
        >
          <option value="">All types</option>
          <option value="ACHIEVEMENT">Achievement</option>
          <option value="PARTICIPATION">Participation</option>
        </select>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs text-[#002155]"
        >
          <option value="">All events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {total > 100 ? (
        <div className="mt-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#747782]">
            Page {page} of {Math.max(1, Math.ceil(total / 100))}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="border border-[#c4c6d3] px-3 py-1 text-[10px] font-bold uppercase text-[#002155] hover:bg-[#002155] hover:text-white disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 100) || loading}
              className="border border-[#c4c6d3] px-3 py-1 text-[10px] font-bold uppercase text-[#002155] hover:bg-[#002155] hover:text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#e6e5e1] font-mono text-[10px] uppercase tracking-[0.14em] text-[#747782]">
              <th className="py-2 pr-3">Student</th>
              <th className="py-2 pr-3">UID</th>
              <th className="py-2 pr-3">Event</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Serial</th>
              <th className="py-2 pr-3">Issued</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e6e5e1]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[#747782]">
                  {loading ? "Loading…" : "No certificates match."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-[#002155]">
                      {row.nameOverride || row.user.name}
                      {row.nameOverride ? <span className="ml-1 font-normal text-[#747782]">({row.user.name})</span> : null}
                    </p>
                    {editingId === row.id ? (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Corrected name for certificate"
                          className="w-52 border border-[#c4c6d3] px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => reissue(row)}
                          disabled={loading}
                          className="border border-[#002155] bg-[#002155] px-2 py-1 text-[10px] font-bold uppercase text-white hover:bg-[#1a438e] disabled:opacity-50"
                        >
                          Save + reissue
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-1 text-[10px] font-bold uppercase text-[#747782] hover:text-[#002155]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[10px] text-[#747782]">{row.user.uid ?? "—"}</td>
                  <td className="py-2 pr-3 text-[#434651]">{row.event.title}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-block px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${
                        row.type === "ACHIEVEMENT" ? "bg-[#fd9923] text-white" : "border border-[#002155] text-[#002155]"
                      }`}
                    >
                      {row.type === "ACHIEVEMENT" ? "Achievement" : "Participation"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-[10px] text-[#747782]">{row.serial}</td>
                  <td className="py-2 pr-3 text-[#434651]">{formatDate(row.issuedAt)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingId(row.id);
                          setEditName(row.nameOverride ?? row.user.name);
                        }}
                        className="border border-[#002155] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#002155] hover:bg-[#002155] hover:text-white"
                      >
                        Edit name + reissue
                      </button>
                      <button
                        onClick={() => remove(row)}
                        disabled={loading}
                        className="border border-[#b3261e] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#b3261e] hover:bg-[#b3261e] hover:text-white disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
