import Link from 'next/link';
import prisma from '@/lib/prisma';

const formatDate = (value: Date) =>
  value.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

export default async function InnovationProgramsPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const programs = await prisma.innovationProgram.findMany({
    where: {
      eventDate: {
        gte: today,
      },
    },
    include: {
      _count: {
        select: {
          interests: true,
        },
      },
    },
    orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
  });

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Innovation Programs
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Explore upcoming seminars, workshops, and talks from the innovation ecosystem.
        </p>
      </header>

      {programs.length === 0 ? (
        <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No upcoming programs right now.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((program) => (
            <article key={program.id} className="border border-[#c4c6d3] bg-white p-5">
              <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{program.programType}</p>
              <h2 className="mt-1 text-lg font-bold text-[#002155]">{program.title}</h2>
              <p className="mt-2 text-xs text-[#434651]">Date: {formatDate(program.eventDate)}</p>
              <p className="mt-1 text-xs text-[#434651]">Venue: {program.venue}</p>
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
    </main>
  );
}
