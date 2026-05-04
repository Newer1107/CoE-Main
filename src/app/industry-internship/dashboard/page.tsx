import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';

async function backfillIndustryInternshipsForUser(user: { id: number; role: string; industryId?: number | null }) {
  if (user.role !== 'INDUSTRY_PARTNER' || !user.industryId) return;

  const selectedApps = await prisma.application.findMany({
    where: {
      status: 'SELECTED',
      problem: {
        problemType: 'INTERNSHIP',
        industryId: user.industryId,
      },
    },
    select: {
      userId: true,
      problem: { select: { id: true, title: true } },
    },
  });

  for (const app of selectedApps) {
    let internship = await prisma.internship.findFirst({
      where: {
        problemStatementId: app.problem.id,
        industryPartnerId: user.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!internship) {
      internship = await prisma.internship.create({
        data: {
          title: app.problem.title,
          industryPartnerId: user.id,
          problemStatementId: app.problem.id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
    }

    await prisma.internshipParticipant.upsert({
      where: {
        internshipId_studentId: {
          internshipId: internship.id,
          studentId: app.userId,
        },
      },
      update: {},
      create: {
        internshipId: internship.id,
        studentId: app.userId,
      },
    });
  }
}

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

  await backfillIndustryInternshipsForUser({ id: payload.id, role: payload.role, industryId: payload.industryId });

  const where = payload.role === 'ADMIN' ? {} : { industryPartnerId: payload.id };

  const internships = await prisma.internship.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      participants: { select: { id: true } },
      industryPartner: { select: { id: true, name: true, email: true } },
    },
  });

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Internship Project Dashboard
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Open a project workspace to manage participants, tasks, messages, meetings, and documents.
        </p>
      </header>

      {internships.length === 0 ? (
        <section className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium mb-3">No internship projects found yet.</p>
          <Link
            href="/innovation/faculty/applications"
            className="inline-block px-4 py-2 text-xs font-semibold bg-[#002155] text-white rounded"
          >
            Go to Applicant Decisions
          </Link>
        </section>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {internships.map((internship) => (
            <article key={internship.id} className="border border-[#c4c6d3] bg-white rounded p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#002155]">{internship.title}</h2>
                  <p className="text-xs text-[#747782] mt-1">
                    Created {new Date(internship.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-[#434651] mt-1">
                    Status: {internship.status} • Participants: {internship.participants.length}
                  </p>
                  <p className="text-xs text-[#434651] mt-1">
                    Industry: {internship.industryPartner.name}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Link
                  href={`/industry-internship/${internship.id}`}
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
