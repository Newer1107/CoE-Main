"use client";

import { useEffect, useState } from "react";

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

type ItemBase = {
  id: number;
};

type NewsItem = ItemBase & {
  title: string;
  caption: string;
  imageUrl?: string | null;
  publishedAt?: string;
};

type EventItem = ItemBase & {
  title: string;
  description: string;
  date: string;
  mode: "ONLINE" | "OFFLINE" | "HYBRID";
  registrationLink?: string | null;
  posterUrl?: string | null;
};

type GrantItem = ItemBase & {
  title: string;
  issuingBody: string;
  category: "GOVT_GRANT" | "SCHOLARSHIP" | "RESEARCH_FUND" | "INDUSTRY_GRANT";
  description: string;
  deadline: string;
  referenceLink?: string | null;
  attachmentUrl?: string | null;
};

type AnnouncementItem = ItemBase & {
  text: string;
  link?: string | null;
  expiresAt: string;
  createdAt?: string;
};

const eventModes = ["ONLINE", "OFFLINE", "HYBRID"] as const;
const grantCategories = ["GOVT_GRANT", "SCHOLARSHIP", "RESEARCH_FUND", "INDUSTRY_GRANT"] as const;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const doFetch = async () => {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  };

  let res = await doFetch();

  if (res.status === 401) {
    const refreshRes = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      res = await doFetch();
    }
  }

  const payload = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.message || "Request failed");
  }
  return payload.data;
}

export default function FacultyPortalClient() {
  const [activeTab, setActiveTab] = useState<"news" | "events" | "grants" | "announcements">("news");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [eventList, setEventList] = useState<EventItem[]>([]);
  const [grantList, setGrantList] = useState<GrantItem[]>([]);
  const [announcementList, setAnnouncementList] = useState<AnnouncementItem[]>([]);

  const [newsTitle, setNewsTitle] = useState("");
  const [newsCaption, setNewsCaption] = useState("");
  const [newsImage, setNewsImage] = useState<File | null>(null);

  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventMode, setEventMode] = useState<(typeof eventModes)[number]>("ONLINE");
  const [eventRegistrationLink, setEventRegistrationLink] = useState("");
  const [eventPoster, setEventPoster] = useState<File | null>(null);

  const [grantTitle, setGrantTitle] = useState("");
  const [grantIssuingBody, setGrantIssuingBody] = useState("");
  const [grantCategory, setGrantCategory] = useState<(typeof grantCategories)[number]>("GOVT_GRANT");
  const [grantDescription, setGrantDescription] = useState("");
  const [grantDeadline, setGrantDeadline] = useState("");
  const [grantReferenceLink, setGrantReferenceLink] = useState("");
  const [grantAttachment, setGrantAttachment] = useState<File | null>(null);

  const [announcementText, setAnnouncementText] = useState("");
  const [announcementLink, setAnnouncementLink] = useState("");
  const [announcementExpiresAt, setAnnouncementExpiresAt] = useState("");

  const loadAll = async () => {
    setErrorMessage("");
    try {
      const [newsData, eventData, grantData, announcementData] = await Promise.all([
        fetchJson<NewsItem[]>("/api/news"),
        fetchJson<EventItem[]>("/api/events"),
        fetchJson<GrantItem[]>("/api/grants"),
        fetchJson<AnnouncementItem[]>("/api/announcements"),
      ]);
      setNewsList(newsData);
      setEventList(eventData);
      setGrantList(grantData);
      setAnnouncementList(announcementData);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load data.");
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await action();
      await loadAll();
      setStatusMessage(successMessage);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitNews = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const formData = new FormData();
      formData.set("title", newsTitle);
      formData.set("caption", newsCaption);
      if (newsImage) formData.set("image", newsImage);
      await fetchJson<unknown>("/api/news", {
        method: "POST",
        body: formData,
      });
      setNewsTitle("");
      setNewsCaption("");
      setNewsImage(null);
    }, "News post created.");
  };

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const formData = new FormData();
      formData.set("title", eventTitle);
      formData.set("description", eventDescription);
      formData.set("date", eventDate);
      formData.set("mode", eventMode);
      formData.set("registrationLink", eventRegistrationLink);
      if (eventPoster) formData.set("poster", eventPoster);
      await fetchJson<unknown>("/api/events", {
        method: "POST",
        body: formData,
      });
      setEventTitle("");
      setEventDescription("");
      setEventDate("");
      setEventMode("ONLINE");
      setEventRegistrationLink("");
      setEventPoster(null);
    }, "Event created.");
  };

  const submitGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      const formData = new FormData();
      formData.set("title", grantTitle);
      formData.set("issuingBody", grantIssuingBody);
      formData.set("category", grantCategory);
      formData.set("description", grantDescription);
      formData.set("deadline", grantDeadline);
      formData.set("referenceLink", grantReferenceLink);
      if (grantAttachment) formData.set("attachment", grantAttachment);
      await fetchJson<unknown>("/api/grants", {
        method: "POST",
        body: formData,
      });
      setGrantTitle("");
      setGrantIssuingBody("");
      setGrantCategory("GOVT_GRANT");
      setGrantDescription("");
      setGrantDeadline("");
      setGrantReferenceLink("");
      setGrantAttachment(null);
    }, "Grant created.");
  };

  const submitAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      await fetchJson<unknown>("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: announcementText,
          link: announcementLink,
          expiresAt: announcementExpiresAt,
        }),
      });
      setAnnouncementText("");
      setAnnouncementLink("");
      setAnnouncementExpiresAt("");
    }, "Announcement published.");
  };

  const renderList = () => {
    if (activeTab === "news") {
      return (
        <div className="space-y-3">
          {newsList.map((item) => (
            <article key={item.id} className="border border-[#c4c6d3] bg-white p-4">
              <p className="font-bold text-[#002155]">{item.title}</p>
              <p className="text-sm text-[#434651] mt-1">{item.caption}</p>
            </article>
          ))}
          {newsList.length === 0 ? <p className="text-sm text-[#434651]">No news posts yet.</p> : null}
        </div>
      );
    }

    if (activeTab === "events") {
      return (
        <div className="space-y-3">
          {eventList.map((item) => (
            <article key={item.id} className="border border-[#c4c6d3] bg-white p-4">
              <p className="font-bold text-[#002155]">{item.title}</p>
              <p className="text-xs text-[#434651] mt-1">{new Date(item.date).toLocaleString()} • {item.mode}</p>
              <p className="text-sm text-[#434651] mt-2">{item.description}</p>
            </article>
          ))}
          {eventList.length === 0 ? <p className="text-sm text-[#434651]">No events found.</p> : null}
        </div>
      );
    }

    if (activeTab === "grants") {
      return (
        <div className="space-y-3">
          {grantList.map((item) => (
            <article key={item.id} className="border border-[#c4c6d3] bg-white p-4">
              <p className="font-bold text-[#002155]">{item.title}</p>
              <p className="text-xs text-[#434651] mt-1">{item.issuingBody} • {item.category}</p>
              <p className="text-sm text-[#434651] mt-2">{item.description}</p>
            </article>
          ))}
          {grantList.length === 0 ? <p className="text-sm text-[#434651]">No active grants found.</p> : null}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {announcementList.map((item) => (
          <article key={item.id} className="border border-[#c4c6d3] bg-white p-4">
            <p className="font-bold text-[#002155]">{item.text}</p>
            <p className="text-xs text-[#434651] mt-1">Expires: {new Date(item.expiresAt).toLocaleString()}</p>
          </article>
        ))}
        {announcementList.length === 0 ? <p className="text-sm text-[#434651]">No announcements found.</p> : null}
      </div>
    );
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Faculty Content Portal
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Publish and review News, Events, Grants, and Announcements from a single dashboard.
        </p>
      </header>

      {statusMessage ? <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      <section className="mb-8 flex flex-wrap gap-2">
        <button className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${activeTab === "news" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"}`} onClick={() => setActiveTab("news")}>News</button>
        <button className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${activeTab === "events" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"}`} onClick={() => setActiveTab("events")}>Events</button>
        <button className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${activeTab === "grants" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"}`} onClick={() => setActiveTab("grants")}>Grants</button>
        <button className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${activeTab === "announcements" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"}`} onClick={() => setActiveTab("announcements")}>Announcements</button>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="border border-[#c4c6d3] bg-white p-6">
          <h2 className="font-headline text-2xl text-[#002155] mb-4">Create</h2>

          {activeTab === "news" ? (
            <form className="space-y-4" onSubmit={submitNews}>
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Title" value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} required />
              <textarea className="w-full border border-[#747782] p-3 text-sm min-h-[110px]" placeholder="Caption" value={newsCaption} onChange={(e) => setNewsCaption(e.target.value)} required />
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setNewsImage(e.target.files?.[0] ?? null)} required />
              <button type="submit" disabled={busy} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-70">{busy ? "Submitting..." : "POST /api/news"}</button>
            </form>
          ) : null}

          {activeTab === "events" ? (
            <form className="space-y-4" onSubmit={submitEvent}>
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required />
              <textarea className="w-full border border-[#747782] p-3 text-sm min-h-[110px]" placeholder="Description" value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} required />
              <input type="datetime-local" className="w-full border border-[#747782] p-3 text-sm" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
              <select className="w-full border border-[#747782] p-3 text-sm" value={eventMode} onChange={(e) => setEventMode(e.target.value as (typeof eventModes)[number])}>
                {eventModes.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Registration Link (optional)" value={eventRegistrationLink} onChange={(e) => setEventRegistrationLink(e.target.value)} />
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setEventPoster(e.target.files?.[0] ?? null)} />
              <button type="submit" disabled={busy} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-70">{busy ? "Submitting..." : "POST /api/events"}</button>
            </form>
          ) : null}

          {activeTab === "grants" ? (
            <form className="space-y-4" onSubmit={submitGrant}>
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Title" value={grantTitle} onChange={(e) => setGrantTitle(e.target.value)} required />
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Issuing Body" value={grantIssuingBody} onChange={(e) => setGrantIssuingBody(e.target.value)} required />
              <select className="w-full border border-[#747782] p-3 text-sm" value={grantCategory} onChange={(e) => setGrantCategory(e.target.value as (typeof grantCategories)[number])}>
                {grantCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <textarea className="w-full border border-[#747782] p-3 text-sm min-h-[110px]" placeholder="Description" value={grantDescription} onChange={(e) => setGrantDescription(e.target.value)} required />
              <input type="date" className="w-full border border-[#747782] p-3 text-sm" value={grantDeadline} onChange={(e) => setGrantDeadline(e.target.value)} required />
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Reference Link (optional)" value={grantReferenceLink} onChange={(e) => setGrantReferenceLink(e.target.value)} />
              <input type="file" accept="application/pdf" onChange={(e) => setGrantAttachment(e.target.files?.[0] ?? null)} />
              <button type="submit" disabled={busy} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-70">{busy ? "Submitting..." : "POST /api/grants"}</button>
            </form>
          ) : null}

          {activeTab === "announcements" ? (
            <form className="space-y-4" onSubmit={submitAnnouncement}>
              <textarea className="w-full border border-[#747782] p-3 text-sm min-h-[110px]" placeholder="Announcement text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} required />
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Link (optional)" value={announcementLink} onChange={(e) => setAnnouncementLink(e.target.value)} />
              <input type="datetime-local" className="w-full border border-[#747782] p-3 text-sm" value={announcementExpiresAt} onChange={(e) => setAnnouncementExpiresAt(e.target.value)} required />
              <button type="submit" disabled={busy} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-70">{busy ? "Submitting..." : "POST /api/announcements"}</button>
            </form>
          ) : null}
        </div>

        <div className="border border-[#c4c6d3] bg-[#f5f4f0] p-6">
          <h2 className="font-headline text-2xl text-[#002155] mb-4">View</h2>
          <p className="text-xs uppercase tracking-widest text-[#434651] mb-4">
            {activeTab === "news" ? "GET /api/news" : activeTab === "events" ? "GET /api/events" : activeTab === "grants" ? "GET /api/grants" : "GET /api/announcements"}
          </p>
          {renderList()}
        </div>
      </section>
    </main>
  );
}
