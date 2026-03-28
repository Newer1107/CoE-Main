import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { getSignedUrl } from '@/lib/minio';
import InnovationEventClient from './InnovationEventClient';

export default async function InnovationEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) notFound();

  const event = await prisma.hackathonEvent.findUnique({
    where: { id: eventId },
    include: {
      problems: {
        where: { status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          title: true,
          description: true,
          mode: true,
          status: true,
        },
      },
    },
  });

  if (!event) notFound();

  const eventBriefUrl = event.pptFileKey
    ? await getSignedUrl(event.pptFileKey).catch(() => null)
    : null;

  let viewerRole: 'STUDENT' | 'FACULTY' | 'ADMIN' | null = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (token) {
      const payload = verifyAccessToken(token);
      if (['STUDENT', 'FACULTY', 'ADMIN'].includes(payload.role)) {
        viewerRole = payload.role as 'STUDENT' | 'FACULTY' | 'ADMIN';
      }
    }
  } catch {
    viewerRole = null;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Innovation Event Detail
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Track event timeline, review problem statements, and monitor leaderboard progress.
        </p>
      </header>

      <InnovationEventClient
        eventId={event.id}
        title={event.title}
        description={event.description}
        status={event.status}
        registrationOpen={event.registrationOpen}
        startTimeISO={event.startTime.toISOString()}
        endTimeISO={event.endTime.toISOString()}
        registrationCloseISO={event.endTime.toISOString()}
        eventBriefUrl={eventBriefUrl}
        problems={event.problems}
        viewerRole={viewerRole}
      />
    </main>
  );
}
