"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type BookingStudent = {
  id: number;
  name: string;
  email: string;
  uid: string | null;
};

type Booking = {
  id: number;
  purpose: string;
  date: string;
  timeSlot: string;
  lab: string;
  facilities: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
  student: BookingStudent;
};

type FacultyUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  uid: string | null;
  isVerified: boolean;
  status: string;
  createdAt: string;
};

type Stats = {
  totalStudents: number;
  totalFaculty: number;
  pendingBookings: number;
  confirmedBookings: number;
  activeGrants: number;
  newsCount: number;
};

type HeroSlide = {
  id: number;
  title: string;
  caption: string;
  imageUrl: string | null;
  createdAt: string;
};

type InnovationSubmission = {
  id: number;
  teamName: string | null;
  status: string;
  updatedAt: string;
  problem: {
    id: number;
    title: string;
    event: { id: number; title: string; status: string } | null;
  };
};

type InnovationEvent = {
  id: number;
  title: string;
  status: "UPCOMING" | "ACTIVE" | "JUDGING" | "CLOSED";
  startTime: string;
  endTime: string;
};

type InnovationLeaderboardRow = {
  rank: number;
  teamName: string;
  score: number;
  members: { id: number; name: string; email: string; role: string }[];
};

type AdminPanelClientProps = {
  stats: Stats;
  pendingBookings: Booking[];
  upcomingConfirmedBookings: Booking[];
  pendingFaculty: FacultyUser[];
  users: FacultyUser[];
  heroSlides: HeroSlide[];
  innovationSubmissions: InnovationSubmission[];
  innovationEvents: InnovationEvent[];
};

const apiCall = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    credentials: "include",
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || "Request failed");
  }
  return payload;
};

export default function AdminPanelClient({
  stats,
  pendingBookings,
  upcomingConfirmedBookings,
  pendingFaculty,
  users,
  heroSlides,
  innovationSubmissions,
  innovationEvents,
}: AdminPanelClientProps) {
  const router = useRouter();

  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [busyFacultyId, setBusyFacultyId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroCaption, setHeroCaption] = useState("");
  const [heroImage, setHeroImage] = useState<File | null>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [activeView, setActiveView] = useState<"operations" | "innovation">("operations");
  const [busyInnovationEventId, setBusyInnovationEventId] = useState<number | null>(null);
  const [selectedInnovationEventId, setSelectedInnovationEventId] = useState<number | null>(null);
  const [innovationLeaderboard, setInnovationLeaderboard] = useState<InnovationLeaderboardRow[]>([]);
  const [loadingInnovationLeaderboard, setLoadingInnovationLeaderboard] = useState(false);

  const recentUsers = useMemo(() => users.slice(0, 12), [users]);
  const prepBookings = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return upcomingConfirmedBookings
      .filter((booking) => new Date(booking.date) >= todayStart)
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return a.timeSlot.localeCompare(b.timeSlot);
      })
      .slice(0, 20);
  }, [upcomingConfirmedBookings]);

  const handleConfirmBooking = async (id: number) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyBookingId(id);
      await apiCall(`/api/admin/bookings/${id}/confirm`, { method: "PATCH" });
      setStatusMessage(`Booking #${id} confirmed.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not confirm booking.");
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRejectBooking = async (id: number) => {
    const adminNote = window.prompt("Optional rejection note for the student:", "") ?? "";

    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyBookingId(id);
      await apiCall(`/api/admin/bookings/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ adminNote }),
      });
      setStatusMessage(`Booking #${id} rejected.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not reject booking.");
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleApproveFaculty = async (id: number) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyFacultyId(id);
      await apiCall(`/api/admin/faculty/${id}/approve`, { method: "PATCH" });
      setStatusMessage(`Faculty user #${id} approved.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not approve faculty user.");
    } finally {
      setBusyFacultyId(null);
    }
  };

  const handleRejectFaculty = async (id: number) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyFacultyId(id);
      await apiCall(`/api/admin/faculty/${id}/reject`, { method: "PATCH" });
      setStatusMessage(`Faculty user #${id} rejected.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not reject faculty user.");
    } finally {
      setBusyFacultyId(null);
    }
  };

  const handleHeroUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!heroImage) {
      setErrorMessage("Please select an image for the hero slide.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setHeroUploading(true);

      const formData = new FormData();
      formData.set("title", heroTitle);
      formData.set("caption", heroCaption);
      formData.set("image", heroImage);

      const res = await fetch("/api/hero-slides", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || "Could not upload hero slide.");
      }

      setHeroTitle("");
      setHeroCaption("");
      setHeroImage(null);
      setStatusMessage("Hero slide uploaded successfully.");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not upload hero slide.");
    } finally {
      setHeroUploading(false);
    }
  };

  const handleInnovationEventStatus = async (eventId: number, status: "ACTIVE" | "JUDGING" | "CLOSED") => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyInnovationEventId(eventId);

      await apiCall(`/api/innovation/admin/events/${eventId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setStatusMessage(`Innovation event #${eventId} moved to ${status}.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update event status.");
    } finally {
      setBusyInnovationEventId(null);
    }
  };

  const handleLoadInnovationLeaderboard = async (eventId: number) => {
    try {
      setErrorMessage("");
      setSelectedInnovationEventId(eventId);
      setLoadingInnovationLeaderboard(true);
      const payload = await apiCall(`/api/innovation/events/${eventId}/leaderboard`, { method: "GET" });
      setInnovationLeaderboard((payload?.data || []) as InnovationLeaderboardRow[]);
    } catch (err) {
      setInnovationLeaderboard([]);
      setErrorMessage(err instanceof Error ? err.message : "Could not load innovation leaderboard.");
    } finally {
      setLoadingInnovationLeaderboard(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Admin Control Room
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Review pending booking requests, approve faculty registrations, and track platform metrics.
        </p>
      </header>

      {statusMessage ? (
        <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {errorMessage}
        </p>
      ) : null}

      <section className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveView("operations")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
            activeView === "operations" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
          }`}
        >
          Operations
        </button>
        <button
          onClick={() => setActiveView("innovation")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
            activeView === "innovation" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
          }`}
        >
          Innovation
        </button>
      </section>

      {activeView === "operations" ? (
        <>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Total Students</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.totalStudents}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Total Faculty</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.totalFaculty}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Pending Bookings</p>
          <p className="mt-2 text-3xl font-bold text-[#8c4f00]">{stats.pendingBookings}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Confirmed Bookings</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.confirmedBookings}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Active Grants</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.activeGrants}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Visible News Posts</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.newsCount}</p>
        </div>
      </section>

      <section className="mb-10 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155] mb-4">Homepage Hero Upload</h2>
          <p className="text-sm text-[#434651] mb-4">
            Upload slides for the home hero carousel (title, caption, image).
          </p>

          <form className="space-y-4" onSubmit={handleHeroUpload}>
            <div>
              <label className="block text-xs uppercase tracking-widest text-[#434651] font-label mb-2">Title</label>
              <input
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                required
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                placeholder="Slide title"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-[#434651] font-label mb-2">Caption</label>
              <textarea
                value={heroCaption}
                onChange={(e) => setHeroCaption(e.target.value)}
                required
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm min-h-[100px]"
                placeholder="Slide caption"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-[#434651] font-label mb-2">Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={heroUploading}
              className="bg-[#002155] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {heroUploading ? "Uploading..." : "Upload Hero Slide"}
            </button>
          </form>
        </div>

        <div className="border border-[#c4c6d3] bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-2xl text-[#002155]">Recent Hero Slides</h2>
            <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{heroSlides.length} total</span>
          </div>

          {heroSlides.length === 0 ? (
            <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-4">
              No hero slides uploaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {heroSlides.slice(0, 5).map((slide) => (
                <article key={slide.id} className="border border-[#e3e2df] p-3 bg-[#faf9f5]">
                  <p className="text-sm font-bold text-[#002155]">{slide.title}</p>
                  <p className="text-xs text-[#434651] mt-1 line-clamp-2">{slide.caption}</p>
                  <p className="text-[10px] uppercase tracking-widest text-[#747782] mt-2">
                    {new Date(slide.createdAt).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Upcoming Confirmed Bookings</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {prepBookings.length} upcoming
          </span>
        </div>

        {prepBookings.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No upcoming confirmed bookings.</p>
        ) : (
          <div className="space-y-4">
            {prepBookings.map((booking) => (
              <article key={booking.id} className="border border-[#c4c6d3] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">
                      #{booking.id} • {booking.lab} • {new Date(booking.date).toLocaleDateString()} • {booking.timeSlot}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">
                      Student: {booking.student.name} ({booking.student.email})
                    </p>
                    <p className="mt-1 text-sm text-[#434651]">{booking.purpose}</p>
                    {booking.facilities?.length ? (
                      <p className="mt-1 text-xs text-[#434651]">Preparation checklist: {booking.facilities.join(", ")}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[#434651]">Preparation checklist: No extra facilities requested.</p>
                    )}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-green-700 border border-green-200 bg-green-50 px-3 py-2 h-fit">
                    Confirmed
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Pending Bookings</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {pendingBookings.length} requests
          </span>
        </div>

        {pendingBookings.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No pending bookings.</p>
        ) : (
          <div className="space-y-4">
            {pendingBookings.map((booking) => (
              <article key={booking.id} className="border border-[#c4c6d3] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">
                      #{booking.id} • {booking.lab} • {new Date(booking.date).toLocaleDateString()} • {booking.timeSlot}
                    </p>
                    <p className="mt-1 text-sm text-[#434651]">{booking.purpose}</p>
                    <p className="mt-2 text-xs text-[#434651]">
                      Student: {booking.student.name} ({booking.student.email})
                    </p>
                    {booking.facilities?.length ? (
                      <p className="mt-1 text-xs text-[#434651]">
                        Facilities: {booking.facilities.join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleConfirmBooking(booking.id)}
                      disabled={busyBookingId === booking.id}
                      className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:bg-opacity-50"
                    >
                      {busyBookingId === booking.id ? "Working..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => handleRejectBooking(booking.id)}
                      disabled={busyBookingId === booking.id}
                      className="border border-[#ba1a1a] text-[#ba1a1a] px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Pending Faculty Approvals</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {pendingFaculty.length} pending
          </span>
        </div>

        {pendingFaculty.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No pending faculty approvals.</p>
        ) : (
          <div className="space-y-4">
            {pendingFaculty.map((faculty) => (
              <article key={faculty.id} className="border border-[#c4c6d3] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">
                      #{faculty.id} • {faculty.name}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">{faculty.email}</p>
                    {faculty.phone ? <p className="text-xs text-[#434651]">{faculty.phone}</p> : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleApproveFaculty(faculty.id)}
                      disabled={busyFacultyId === faculty.id}
                      className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:bg-opacity-50"
                    >
                      {busyFacultyId === faculty.id ? "Working..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleRejectFaculty(faculty.id)}
                      disabled={busyFacultyId === faculty.id}
                      className="border border-[#ba1a1a] text-[#ba1a1a] px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Recent Users</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{users.length} total</span>
        </div>

        <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Verified</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((user) => (
                <tr key={user.id} className="border-t border-[#e3e2df]">
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">{user.status}</td>
                  <td className="px-4 py-3">{user.isVerified ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      </>
      ) : null}

      {activeView === "innovation" ? (
        <section className="space-y-8">
          <section className="flex flex-wrap gap-3">
            <Link href="/innovation" className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
              Innovation Home
            </Link>
            <Link href="/innovation/faculty" className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider">
              Faculty Review Workspace
            </Link>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Pending Innovation Submissions</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
                {innovationSubmissions.length} submitted
              </span>
            </div>

            {innovationSubmissions.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No submitted innovation claims.</p>
            ) : (
              <div className="space-y-3">
                {innovationSubmissions.map((submission) => (
                  <article key={submission.id} className="border border-[#c4c6d3] bg-white p-5">
                    <p className="text-sm font-bold text-[#002155]">Claim #{submission.id} • {submission.problem.title}</p>
                    <p className="mt-1 text-xs text-[#434651]">Team: {submission.teamName || "Individual"}</p>
                    <p className="mt-1 text-xs text-[#434651]">
                      Event: {submission.problem.event ? submission.problem.event.title : "Continuous Mode"}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">Updated: {new Date(submission.updatedAt).toLocaleString()}</p>
                    {submission.problem.event ? (
                      <Link
                        href={`/innovation/events/${submission.problem.event.id}`}
                        className="inline-flex mt-3 border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        View Event Page
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Innovation Event Status Controls</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
                {innovationEvents.length} events
              </span>
            </div>

            {innovationEvents.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No innovation events found.</p>
            ) : (
              <div className="space-y-3">
                {innovationEvents.map((event) => (
                  <article key={event.id} className="border border-[#c4c6d3] bg-white p-5">
                    <p className="text-sm font-bold text-[#002155]">#{event.id} • {event.title}</p>
                    <p className="mt-1 text-xs text-[#434651]">Status: {event.status}</p>
                    <p className="mt-1 text-xs text-[#434651]">{new Date(event.startTime).toLocaleString()} to {new Date(event.endTime).toLocaleString()}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.status === "UPCOMING" ? (
                        <button
                          onClick={() => handleInnovationEventStatus(event.id, "ACTIVE")}
                          disabled={busyInnovationEventId === event.id}
                          className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                        >
                          Mark ACTIVE
                        </button>
                      ) : null}
                      {event.status === "ACTIVE" ? (
                        <button
                          onClick={() => handleInnovationEventStatus(event.id, "JUDGING")}
                          disabled={busyInnovationEventId === event.id}
                          className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                        >
                          Mark JUDGING
                        </button>
                      ) : null}
                      {event.status === "JUDGING" ? (
                        <button
                          onClick={() => handleInnovationEventStatus(event.id, "CLOSED")}
                          disabled={busyInnovationEventId === event.id}
                          className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                        >
                          Mark CLOSED
                        </button>
                      ) : null}

                      <button
                        onClick={() => void handleLoadInnovationLeaderboard(event.id)}
                        className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        Leaderboard
                      </button>
                      <Link
                        href={`/innovation/events/${event.id}`}
                        className="border border-[#8c4f00] text-[#8c4f00] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        View Event Page
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Leaderboard Overview</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
                {selectedInnovationEventId ? `event #${selectedInnovationEventId}` : "select event"}
              </span>
            </div>

            {loadingInnovationLeaderboard ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">Loading leaderboard...</p>
            ) : innovationLeaderboard.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No leaderboard rows loaded yet.</p>
            ) : (
              <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">Rank</th>
                      <th className="text-left px-4 py-3">Team</th>
                      <th className="text-left px-4 py-3">Score</th>
                      <th className="text-left px-4 py-3">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {innovationLeaderboard.map((row) => (
                      <tr key={`${row.rank}-${row.teamName}`} className="border-t border-[#e3e2df]">
                        <td className="px-4 py-3">#{row.rank}</td>
                        <td className="px-4 py-3">{row.teamName}</td>
                        <td className="px-4 py-3">{row.score}</td>
                        <td className="px-4 py-3">{row.members.map((m) => m.name).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}
