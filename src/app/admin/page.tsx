import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminPanelClient from "./AdminPanelClient";
import { verifyAccessToken } from "@/lib/jwt";

type AdminApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

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

type AdminUser = {
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
  imageKey: string;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  status: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED';
  startTime: string;
  endTime: string;
};

function getRequestBaseUrl(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") || "http";

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function fetchAdmin<T>(baseUrl: string, path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Network request failed";
    throw new Error(`Request to ${path} failed: ${reason}`);
  }

  const payload = (await res.json()) as AdminApiResponse<T>;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.message || "Admin request failed");
  }

  return payload.data;
}

function AdminMessage({ title, body, actionLabel, actionHref }: { title: string; body: string; actionLabel?: string; actionHref?: string }) {
  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
      <div className="border border-[#c4c6d3] bg-white p-6 md:p-8">
        <h1 className="font-headline text-3xl text-[#002155]">{title}</h1>
        <p className="mt-3 text-[#434651]">{body}</p>
        {actionLabel && actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex mt-6 bg-[#002155] text-white px-5 py-3 text-xs font-bold uppercase tracking-widest"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </main>
  );
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const baseUrl = getRequestBaseUrl(headerStore);
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    redirect("/login?next=%2Fadmin");
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect("/login?next=%2Fadmin");
  }

  if (payload.role !== "ADMIN") {
    if (payload.role === "FACULTY") redirect("/faculty");
    redirect("/facility-booking");
  }

  let stats: Stats;
  let pendingBookings: Booking[];
  let upcomingConfirmedBookings: Booking[];
  let pendingFaculty: AdminUser[];
  let users: AdminUser[];
  let heroSlides: HeroSlide[];
  let innovationSubmissions: InnovationSubmission[];
  let innovationEvents: InnovationEvent[];

  try {
    [stats, pendingBookings, upcomingConfirmedBookings, pendingFaculty, users, heroSlides, innovationSubmissions, innovationEvents] = await Promise.all([
      fetchAdmin<Stats>(baseUrl, "/api/admin/stats", token),
      fetchAdmin<Booking[]>(baseUrl, "/api/admin/bookings?status=PENDING", token),
      fetchAdmin<Booking[]>(baseUrl, "/api/admin/bookings?status=CONFIRMED", token),
      fetchAdmin<AdminUser[]>(baseUrl, "/api/admin/users?role=FACULTY&status=PENDING", token),
      fetchAdmin<AdminUser[]>(baseUrl, "/api/admin/users", token),
      fetchAdmin<HeroSlide[]>(baseUrl, "/api/hero-slides", token),
      fetchAdmin<InnovationSubmission[]>(baseUrl, "/api/innovation/admin/submissions", token),
      fetchAdmin<InnovationEvent[]>(baseUrl, "/api/innovation/events", token),
    ]);
  } catch (err) {
    return (
      <main className="max-w-3xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
        <div className="border border-red-300 bg-red-50 p-6 md:p-8">
          <h1 className="font-headline text-3xl text-[#002155]">Admin Panel Error</h1>
          <p className="mt-3 text-red-700 text-sm">
            {err instanceof Error ? err.message : "Could not load admin data."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <AdminPanelClient
      stats={stats}
      pendingBookings={pendingBookings}
      upcomingConfirmedBookings={upcomingConfirmedBookings}
      pendingFaculty={pendingFaculty}
      users={users}
      heroSlides={heroSlides}
      innovationSubmissions={innovationSubmissions}
      innovationEvents={innovationEvents}
    />
  );
}
