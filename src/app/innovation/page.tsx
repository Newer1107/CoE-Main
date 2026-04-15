import Link from 'next/link';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/jwt';

const formatIstDateTime = (value: Date | null) => {
  if (!value) return 'Not set';
  return value.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

export default async function InnovationLandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  let role: string | null = null;
  if (token) {
    try {
      role = verifyAccessToken(token).role;
    } catch {
      role = null;
    }
  }

  const canSeeFacultyWorkspace = role === 'FACULTY' || role === 'ADMIN' || role === 'INDUSTRY_PARTNER';
  const canSeeMySubmissions = role === 'STUDENT';
  const canManagePrograms = role === 'ADMIN';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const programs = await prisma.innovationProgram.findMany({
    where: {
      eventDate: {
        gte: today,
      },
    },
    include: {
      _count: { select: { interests: true } },
    },
    orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
    take: 6,
  });

  const events = await prisma.hackathonEvent.findMany({
    where: { status: { in: ['ACTIVE', 'UPCOMING'] } },
    include: {
      _count: { select: { problems: true } },
    },
    orderBy: [{ startTime: 'asc' }],
    take: 8,
  });

  const archivedEvents = await prisma.hackathonEvent.findMany({
    where: { status: 'CLOSED' },
    include: {
      _count: { select: { problems: true } },
    },
    orderBy: [{ endTime: 'desc' }],
    take: 8,
  });

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Continuous Innovation Platform
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Explore open innovation problems, join hackathon events, and track submission outcomes from a single workspace.
        </p>
      </header>

      <section className="mb-8 flex flex-wrap gap-3">
        <Link
          href="/innovation"
          className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          Innovation Home
        </Link>

        <Link
          href="/innovation/problems"
          className="border border-[#0b6b2e] text-[#0b6b2e] px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          Open Problem Statements
        </Link>
        <Link
          href="/industry-internship"
          className="border border-[#8c4f00] text-[#8c4f00] px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          Industry Internship
        </Link>
        {canSeeMySubmissions ? (
          <Link
            href="/innovation/my-submissions"
            className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            My Submissions
          </Link>
        ) : null}
        {canSeeFacultyWorkspace ? (
          <Link
            href="/innovation/faculty"
            className="border border-[#8c4f00] text-[#8c4f00] px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            {role === 'INDUSTRY_PARTNER' ? 'Industry Workspace' : 'Faculty Workspace'}
          </Link>
        ) : null}
        <Link
          href="/innovation/programs"
          className="border border-[#0b6b2e] text-[#0b6b2e] px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          Innovation Programs
        </Link>
        {canManagePrograms ? (
          <Link
            href="/innovation/admin/programs"
            className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            Manage Programs
          </Link>
        ) : null}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Upcoming Innovation Programs</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{programs.length} programs</span>
        </div>

        {programs.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No upcoming programs right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {programs.map((program) => (
              <article key={program.id} className="border border-[#c4c6d3] bg-white p-5">
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{program.programType}</p>
                <h3 className="mt-1 text-lg font-bold text-[#002155]">{program.title}</h3>
                <p className="mt-2 text-xs text-[#434651]">Venue: {program.venue}</p>
                <p className="mt-1 text-xs text-[#434651]">Date: {formatIstDateTime(program.eventDate)}</p>
                <p className="mt-1 text-xs text-[#434651]">Interested: {program._count.interests}</p>
                <Link
                  href={`/innovation/programs/${program.id}`}
                  className="inline-flex mt-4 bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  View Program
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Active Hackathon Events</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{events.length} events</span>
        </div>

        {events.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No active or upcoming hackathon events right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((event) => (
              <article key={event.id} className="border border-[#c4c6d3] bg-white p-5">
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{event.status}</p>
                <h3 className="mt-1 text-lg font-bold text-[#002155]">{event.title}</h3>
                {event.description ? <p className="mt-2 text-sm text-[#434651] line-clamp-3">{event.description}</p> : null}
                <p className="mt-2 text-xs text-[#434651]">Problems: {event._count.problems}</p>
                <p className="mt-1 text-xs text-[#434651]">Starts: {formatIstDateTime(event.startTime)}</p>
                <p className="mt-1 text-xs text-[#434651]">Ends: {formatIstDateTime(event.endTime)}</p>
                <p className="mt-1 text-xs text-[#434651]">
                  Submission lock: {formatIstDateTime(event.submissionLockAt)}
                </p>
                <Link
                  href={`/innovation/events/${event.id}`}
                  className="inline-flex mt-4 bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  View Event
                </Link>
                <Link
                  href={`/innovation/events/${event.id}#register-team`}
                  className="inline-flex mt-2 ml-2 border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  Register
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Archived Hackathon Events</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{archivedEvents.length} events</span>
        </div>

        {archivedEvents.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No archived events yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {archivedEvents.map((event) => (
              <article key={event.id} className="border border-[#c4c6d3] bg-[#f5f4f0] p-5">
                <p className="text-xs uppercase tracking-widest text-[#747782]">ARCHIVED</p>
                <h3 className="mt-1 text-lg font-bold text-[#002155]">{event.title}</h3>
                {event.description ? <p className="mt-2 text-sm text-[#434651] line-clamp-3">{event.description}</p> : null}
                <p className="mt-2 text-xs text-[#434651]">Problems: {event._count.problems}</p>
                <p className="mt-1 text-xs text-[#434651]">Started: {formatIstDateTime(event.startTime)}</p>
                <p className="mt-1 text-xs text-[#434651]">Closed: {formatIstDateTime(event.endTime)}</p>
                <p className="mt-1 text-xs text-[#434651]">
                  Submission lock: {formatIstDateTime(event.submissionLockAt)}
                </p>
                <Link
                  href={`/innovation/events/${event.id}`}
                  className="inline-flex mt-4 border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  View Event Details
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}