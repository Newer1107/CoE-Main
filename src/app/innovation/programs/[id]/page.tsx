import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/jwt';
import { getSignedUrl } from '@/lib/minio';
import InnovationProgramDetailClient from './InnovationProgramDetailClient';

const formatDate = (value: Date) =>
  value.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

const formatDateTime = (value: Date) =>
  value.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

export default async function InnovationProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const program = await prisma.innovationProgram.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          interests: true,
        },
      },
    },
  });

  if (!program) notFound();

  const noticeFileUrl = program.noticeFileKey
    ? await getSignedUrl(program.noticeFileKey).catch(() => null)
    : null;

  let viewerUserId: number | null = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (token) {
      const payload = verifyAccessToken(token);
      viewerUserId = payload.id;
    }
  } catch {
    viewerUserId = null;
  }

  const existingInterest = viewerUserId
    ? await prisma.programInterest.findUnique({
        where: {
          userId_programId: {
            userId: viewerUserId,
            programId: program.id,
          },
        },
        select: { id: true },
      })
    : null;

  return (
    <main className="max-w-4xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{program.programType}</p>
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none mt-1">
          {program.title}
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body whitespace-pre-wrap">{program.description}</p>
      </header>

      <section className="border border-[#c4c6d3] bg-white p-5">
        <p className="text-sm text-[#434651]">Venue: {program.venue}</p>
        <p className="text-sm text-[#434651] mt-1">Date: {formatDate(program.eventDate)}</p>
        <p className="text-sm text-[#434651] mt-1">Start: {formatDateTime(program.startTime)}</p>
        <p className="text-sm text-[#434651] mt-1">End: {formatDateTime(program.endTime)}</p>
        {noticeFileUrl ? (
          <a
            href={noticeFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex mt-4 border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            Open Notice PDF
          </a>
        ) : null}
      </section>

      <InnovationProgramDetailClient
        programId={program.id}
        isLoggedIn={Boolean(viewerUserId)}
        initialInterestCount={program._count.interests}
        initialInterested={Boolean(existingInterest)}
      />
    </main>
  );
}
