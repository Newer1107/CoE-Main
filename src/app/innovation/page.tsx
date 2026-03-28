import Link from 'next/link';
import prisma from '@/lib/prisma';
import CountdownTimer from '@/components/CountdownTimer';

export default async function InnovationLandingPage() {
  const now = new Date();

  const events = await prisma.hackathonEvent.findMany({
    where: { status: { in: ['ACTIVE', 'UPCOMING'] } },
    include: {
      _count: { select: { problems: true } },
    },
    orderBy: [{ startTime: 'asc' }],
    take: 8,
  });

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
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
          Hackathon Events
        </Link>
        <Link
          href="/innovation/my-submissions"
          className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          My Submissions
        </Link>
        <Link
          href="/innovation/faculty"
          className="border border-[#8c4f00] text-[#8c4f00] px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          Faculty Workspace
        </Link>
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
                <p className="mt-1 text-xs text-[#434651]">Starts: {event.startTime.toLocaleString()}</p>
                <p className="mt-1 text-xs text-[#434651]">Ends: {event.endTime.toLocaleString()}</p>
                {event.status === 'ACTIVE' ? (
                  <CountdownTimer
                    targetISO={event.endTime.toISOString()}
                    className="mt-2 text-xs font-bold uppercase tracking-wider text-[#002155]"
                    prefix="Submission lock"
                  />
                ) : event.status === 'UPCOMING' && event.startTime > now ? (
                  <CountdownTimer
                    targetISO={event.startTime.toISOString()}
                    className="mt-2 text-xs font-bold uppercase tracking-wider text-[#002155]"
                    prefix="Starts in"
                  />
                ) : null}
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
    </main>
  );
}
