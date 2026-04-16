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
  ticket: {
    id: number;
    ticketId: string;
    status: string;
    usedAt: string | null;
  } | null;
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
  description: string | null;
  title: string;
  status: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED';
  registrationOpen: boolean;
  startTime: string;
  endTime: string;
  submissionLockAt: string | null;
  totalSessions: number;
  sessionUploadLocks?: Array<{
    session: number;
    isOpen: boolean;
    updatedAt: string;
  }>;
  totalInterested: number;
  totalInterestedWithDetails: number;
};

type InnovationEventInterest = {
  eventId: number;
  eventTitle: string;
  eventStatus: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED';
  totalInterested: number;
  totalWithDetails: number;
  interestedStudents: Array<{
    id: number;
    userId: number;
    hasDetails: boolean;
    teamName: string | null;
    teamSize: number | null;
    createdAt: string;
    user: {
      id: number;
      name: string;
      email: string;
      uid: string | null;
      phone: string | null;
    };
  }>;
};

function getRequestBaseUrl(headerStore: Headers): string {
  const normalizeForwardedValue = (value: string | null): string | null => {
    if (!value) return null;
    const first = value.split(",")[0]?.trim();
    return first || null;
  };

  const host = normalizeForwardedValue(headerStore.get("x-forwarded-host")) || normalizeForwardedValue(headerStore.get("host"));
  const proto = normalizeForwardedValue(headerStore.get("x-forwarded-proto")) || "http";

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
}

function getRequestBaseUrlCandidates(headerStore: Headers): string[] {
  const baseCandidates: string[] = [];
  const preferred = getRequestBaseUrl(headerStore);
  baseCandidates.push(preferred);

  if (process.env.NEXT_PUBLIC_APP_URL) baseCandidates.push(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.FRONTEND_URL) baseCandidates.push(process.env.FRONTEND_URL);

  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const normalizedHost = host?.split(",")[0]?.trim();
  const portFromHost = normalizedHost?.includes(":") ? normalizedHost.split(":").at(-1) : process.env.PORT || "3000";

  baseCandidates.push(`http://127.0.0.1:${portFromHost}`);
  baseCandidates.push(`http://localhost:${portFromHost}`);

  return Array.from(
    new Set(
      baseCandidates
        .map((url) => url.replace(/\/+$/, ""))
        .filter((url) => url.length > 0)
    )
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAdmin<T>(baseUrls: string[], path: string, token: string): Promise<T> {
  const networkErrors: string[] = [];

  for (const baseUrl of baseUrls) {
    const endpoint = `${baseUrl}${path}`;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let res: Response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          res = await fetch(endpoint, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Network request failed";
        networkErrors.push(`${endpoint} attempt ${attempt}: ${reason}`);
        if (attempt < 2) {
          await wait(150 * attempt);
        }
        continue;
      }

      const payload = (await res.json().catch(() => null)) as AdminApiResponse<T> | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.message || `Admin request failed (${res.status})`);
      }

      return payload.data;
    }
  }

  const reason = networkErrors.at(-1)?.split(": ").slice(1).join(": ") || "fetch failed";
  throw new Error(`Request to ${path} failed: ${reason}`);
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const baseUrls = getRequestBaseUrlCandidates(headerStore);
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
  let innovationEventInterests: InnovationEventInterest[];

  try {
    [
      stats,
      pendingBookings,
      upcomingConfirmedBookings,
      pendingFaculty,
      users,
      heroSlides,
      innovationSubmissions,
      innovationEvents,
      innovationEventInterests,
    ] = await Promise.all([
      fetchAdmin<Stats>(baseUrls, "/api/admin/stats", token),
      fetchAdmin<Booking[]>(baseUrls, "/api/admin/bookings?status=PENDING", token),
      fetchAdmin<Booking[]>(baseUrls, "/api/admin/bookings?status=CONFIRMED", token),
      fetchAdmin<AdminUser[]>(baseUrls, "/api/admin/users?role=FACULTY&status=PENDING", token),
      fetchAdmin<AdminUser[]>(baseUrls, "/api/admin/users", token),
      fetchAdmin<HeroSlide[]>(baseUrls, "/api/hero-slides", token),
      fetchAdmin<InnovationSubmission[]>(baseUrls, "/api/innovation/admin/submissions", token),
      fetchAdmin<InnovationEvent[]>(baseUrls, "/api/innovation/events", token),
      fetchAdmin<InnovationEventInterest[]>(baseUrls, "/api/innovation/admin/interests", token),
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
      innovationEventInterests={innovationEventInterests}
    />
  );
}
