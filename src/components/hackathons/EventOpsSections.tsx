"use client";

import { useCallback, useEffect, useState } from "react";

type Api<T> = { success: boolean; message: string; data: T };
type NoticeRow = { id: number; title: string; body: string; pinned: boolean; createdAt: string };
type MediaRow = { id: number; kind: string; fileKey: string; caption: string | null; createdAt: string };

const storageUrl = (fileKey: string) =>
  `/api/storage/${fileKey.split("/").map(encodeURIComponent).join("/")}`;

const sectionCls = "mt-6 border border-[#c4c6d3] bg-white p-5";

export default function EventOpsSections({
  eventId,
  status,
  ops,
}: {
  eventId: number;
  status: string;
  ops: { notices?: boolean; feedback?: boolean; mediaReport?: boolean };
}) {
  const [notices, setNotices] = useState<NoticeRow[] | null>(null);
  const [media, setMedia] = useState<MediaRow[] | null>(null);
  const [mine, setMine] = useState<{ rating: number; comment: string | null } | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(() => {
    if (ops.notices) {
      void fetch(`/api/innovation/events/${eventId}/ops/notices`, { credentials: "include" })
        .then((r) => r.json())
        .then((b: Api<{ notices: NoticeRow[] }>) => {
          if (b.success) setNotices(b.data.notices);
        });
    }
    if (ops.mediaReport) {
      void fetch(`/api/innovation/events/${eventId}/ops/media`, { credentials: "include" })
        .then((r) => r.json())
        .then((b: Api<{ media: MediaRow[] }>) => {
          if (b.success) setMedia(b.data.media);
        });
    }
    if (ops.feedback) {
      void fetch(`/api/innovation/events/${eventId}/feedback`, { credentials: "include" })
        .then((r) => r.json())
        .then((b: Api<{ mine: { rating: number; comment: string | null } | null }>) => {
          if (b.success && b.data.mine) setMine(b.data.mine);
        });
    }
  }, [eventId, ops.notices, ops.mediaReport, ops.feedback]);
  useEffect(load, [load]);

  const submitFeedback = async () => {
    if (rating < 1 || rating > 5) {
      notify("Pick a rating (1–5 stars)");
      return;
    }
    const res = await fetch(`/api/innovation/events/${eventId}/feedback`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating, comment: comment.trim() }),
    });
    const b = (await res.json()) as Api<{ feedback: { rating: number; comment: string | null } }>;
    notify(b.success ? "Thank you — feedback submitted" : b.message);
    if (b.success) setMine(b.data.feedback);
  };

  const visibleNotices = notices ?? [];
  const reports = (media ?? []).filter((m) => m.kind === "REPORT");
  const photos = (media ?? []).filter((m) => m.kind === "PHOTO");
  const videos = (media ?? []).filter((m) => m.kind === "VIDEO");

  return (
    <>
      {toast ? (
        <div className="fixed right-4 top-4 z-50 border border-[#0b6b2e] bg-[#f2fbf4] px-4 py-3 text-sm font-semibold text-[#0b6b2e] shadow-lg">
          {toast}
        </div>
      ) : null}

      {ops.notices && visibleNotices.length > 0 ? (
        <section className={sectionCls}>
          <h3 className="font-headline text-xl text-[#002155]">Notices</h3>
          <div className="mt-3 space-y-3">
            {visibleNotices.map((n) => (
              <div key={n.id} className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                <p className="font-semibold text-[#002155]">
                  {n.pinned ? "📌 " : ""}
                  {n.title}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#434651]">{n.body}</p>
                <p className="mt-1 text-[11px] text-[#747782]">
                  {new Date(n.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {ops.feedback && status === "CLOSED" ? (
        <section className={sectionCls}>
          <h3 className="font-headline text-xl text-[#002155]">Event Feedback</h3>
          {mine ? (
            <div className="mt-3">
              <p className="text-sm text-[#0b6b2e]">{"★".repeat(mine.rating)}{"☆".repeat(5 - mine.rating)} — submitted, thank you!</p>
              {mine.comment ? <p className="mt-1 text-sm text-[#434651]">{mine.comment}</p> : null}
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`text-2xl ${n <= rating ? "text-[#fd9923]" : "text-[#c4c6d3]"}`}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                className="mt-3 w-full border border-[#c4c6d3] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#002155]"
                placeholder="What did you think of the hackathon? (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void submitFeedback()}
                className="mt-2 bg-[#002155] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90"
              >
                Submit Feedback
              </button>
            </div>
          )}
        </section>
      ) : null}

      {ops.mediaReport && (media ?? []).length > 0 ? (
        <section className={sectionCls}>
          <h3 className="font-headline text-xl text-[#002155]">Event Report & Gallery</h3>
          {reports.length > 0 ? (
            <div className="mt-3 space-y-2">
              {reports.map((m) => (
                <a
                  key={m.id}
                  href={`${storageUrl(m.fileKey)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block border border-[#e3e2df] bg-[#faf9f5] px-4 py-3 text-sm font-semibold text-[#002155] hover:border-[#002155]"
                >
                  📄 {m.caption ?? "Final Report"}
                </a>
              ))}
            </div>
          ) : null}
          {photos.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {photos.map((m) => (
                <a key={m.id} href={`${storageUrl(m.fileKey)}`} target="_blank" rel="noreferrer">
                  <div className="aspect-video border border-[#e3e2df] bg-[#f4f6fa]" />
                  <p className="mt-1 text-center text-[11px] text-[#747782]">{m.caption ?? "Photo"}</p>
                </a>
              ))}
            </div>
          ) : null}
          {videos.length > 0 ? (
            <div className="mt-3 space-y-3">
              {videos.map((m) => (
                <video key={m.id} controls className="w-full border border-[#e3e2df]" src={`${storageUrl(m.fileKey)}`} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
