import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/jwt';
import { getSignedUrl } from '@/lib/minio';
import InnovationProgramsAdminClient, { type AdminProgramItem } from './InnovationProgramsAdminClient';

export default async function InnovationProgramsAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login?next=/innovation/admin/programs');
  }

  let role: string | null = null;
  try {
    role = verifyAccessToken(token).role;
  } catch {
    role = null;
  }

  if (role !== 'ADMIN') {
    redirect('/innovation');
  }

  const programs = await prisma.innovationProgram.findMany({
    include: {
      _count: { select: { interests: true } },
    },
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
  });

  const initialPrograms: AdminProgramItem[] = await Promise.all(
    programs.map(async (program) => ({
      id: program.id,
      title: program.title,
      description: program.description,
      programType: program.programType,
      venue: program.venue,
      eventDate: program.eventDate.toISOString(),
      startTime: program.startTime.toISOString(),
      endTime: program.endTime.toISOString(),
      noticeFileUrl: program.noticeFileKey ? await getSignedUrl(program.noticeFileKey).catch(() => null) : null,
      interestCount: program._count.interests,
    }))
  );

  return (
    <main className="max-w-6xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Innovation Programs Admin
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Create and manage seminars, workshops, talks, and other innovation programs.
        </p>
      </header>

      <InnovationProgramsAdminClient initialPrograms={initialPrograms} />
    </main>
  );
}
