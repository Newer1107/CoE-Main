import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import CreateProblemModal from './CreateProblemModal';

export default async function IndustryInternshipDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login?next=%2Findustry-internship%2Fdashboard');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Findustry-internship%2Fdashboard');
  }

  if (!['INDUSTRY_PARTNER', 'ADMIN'].includes(payload.role)) {
    redirect('/industry-internship');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true, industryId: true, industry: { select: { name: true } } },
  });

  const industryId = currentUser?.industryId ?? payload.industryId;
  const industryName = currentUser?.industry?.name ?? null;
  const problemWhere: Record<string, unknown> = {
    problemType: 'INTERNSHIP',
  };

  if (payload.role === 'INDUSTRY_PARTNER') {
    problemWhere.OR = [
      ...(industryId ? [{ industryId }] : []),
      { createdById: payload.id },
    ];
  }

  const problems = await prisma.problem.findMany({
    where: problemWhere,
    orderBy: { createdAt: 'desc' },
    include: { industry: { select: { id: true, name: true } } },
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
              Internship Project Dashboard
            </h1>
            <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
              Open a project workspace to manage participants, tasks, messages, meetings, and documents.
            </p>
          </div>
          <CreateProblemModal
            canCreate={payload.role === 'INDUSTRY_PARTNER'}
            industryName={industryName}
          />
        </div>
      </header>

      {problems.length === 0 ? (
        <section className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium mb-2">No internship projects found yet.</p>
          <p className="text-xs text-[#747782] mb-3">New submissions show as pending until admin approval.</p>
          <Link
            href="/innovation/faculty/applications"
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
                  <p className="text-xs text-[#434651] mt-1">
                    Industry: {problem.industry?.name ?? 'Unassigned'}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Link
                  href={`/industry-internship/${problem.id}`}
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
