import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import CreateFacultyProblemModal from './CreateFacultyProblemModal';

export default async function FacultyInternshipDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login?next=%2Ffaculty-internship%2Fdashboard');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Ffaculty-internship%2Fdashboard');
  }

  if (payload.role !== 'ADMIN') {
    redirect('/faculty-internship');
  }

  const problems = await prisma.problem.findMany({
    where: { problemType: 'FACULTY_INTERNSHIP' },
    orderBy: { createdAt: 'desc' },
  });

  const counts = await prisma.application.groupBy({
    by: ['problemId'],
    where: { status: 'SELECTED', problemId: { in: problems.map((row) => row.id) } },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((row) => [row.problemId, row._count._all]));

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
              Faculty Internship Dashboard
            </h1>
            <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
              Manage faculty internship workspaces and review selected participants.
            </p>
          </div>
          <CreateFacultyProblemModal canCreate={payload.role === 'ADMIN'} />
        </div>
      </header>

      {problems.length === 0 ? (
        <section className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium mb-2">No faculty internships found yet.</p>
          <p className="text-xs text-[#747782] mb-3">Create a faculty internship to start collecting applications.</p>
          <Link
            href="/faculty-internship/decisions"
            className="inline-block px-4 py-2 text-xs font-semibold bg-[#002155] text-white rounded"
          >
            Go to Applicant Decisions
          </Link>
        </section>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {problems.map((problem) => (
            <article key={problem.id} className="border border-[#c4c6d3] bg-white rounded p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#002155]">{problem.title}</h2>
                  <p className="text-xs text-[#747782] mt-1">
                    Created {new Date(problem.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-[#434651] mt-1">
                    Status: {problem.status} • Approval: {problem.approvalStatus.replaceAll('_', ' ')} • Participants:{' '}
                    {countMap.get(problem.id) ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Link
                  href={`/faculty-internship/${problem.id}`}
                  className="inline-block px-4 py-2 text-xs font-semibold border border-[#002155] text-[#002155] rounded hover:bg-[#002155] hover:text-white transition"
                >
                  Open Workspace
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
