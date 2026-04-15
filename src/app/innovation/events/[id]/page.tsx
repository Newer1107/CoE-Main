import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { getSignedUrl } from '@/lib/minio';
import InnovationEventClient from './InnovationEventClient';

type ExistingRegistrationSummary = {
  claimId: number;
  teamName: string;
  problem: {
    id: number;
    title: string;
  };
  teamLeader: {
    id: number;
    name: string;
    email: string;
    uid: string | null;
  } | null;
  members: Array<{
    role: string;
    user: {
      id: number;
      name: string;
      email: string;
      uid: string | null;
    };
  }>;
  submissionFileUrl: string | null;
  submittedAt: string;
  createdAt: string;
};

type ViewerInterestSummary = {
  id: number;
  hasDetails: boolean;
  teamName: string | null;
  teamSize: number | null;
};

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
          isIndustryProblem: true,
          industryName: true,
          mode: true,
          status: true,
          supportDocumentKey: true,
        },
      },
    },
  });

  if (!event) notFound();

  const eventBriefUrl = event.pptFileKey
    ? await getSignedUrl(event.pptFileKey).catch(() => null)
    : null;

  const eventProblems = await Promise.all(
    event.problems.map(async (problem) => ({
      ...problem,
      supportDocumentUrl: problem.supportDocumentKey
        ? await getSignedUrl(problem.supportDocumentKey).catch(() => null)
        : null,
    }))
  );

  let viewerRole: 'STUDENT' | 'FACULTY' | 'ADMIN' | null = null;
  let viewerUserId: number | null = null;
  let existingRegistration: ExistingRegistrationSummary | null = null;
  let viewerInterest: ViewerInterestSummary | null = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    if (token) {
      const payload = verifyAccessToken(token);
      if (['STUDENT', 'FACULTY', 'ADMIN'].includes(payload.role)) {
        viewerRole = payload.role as 'STUDENT' | 'FACULTY' | 'ADMIN';
        viewerUserId = payload.id;
      }
    }
  } catch {
    viewerRole = null;
    viewerUserId = null;
  }

  if (viewerRole === 'STUDENT' && viewerUserId) {
    const [existingClaimMember, existingInterest] = await Promise.all([
      prisma.claimMember.findFirst({
        where: {
          userId: viewerUserId,
          claim: {
            problem: {
              eventId: event.id,
            },
          },
        },
        include: {
          claim: {
            include: {
              problem: {
                select: {
                  id: true,
                  title: true,
                },
              },
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      uid: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.hackathonInterest.findUnique({
        where: {
          userId_eventId: {
            userId: viewerUserId,
            eventId: event.id,
          },
        },
        select: {
          id: true,
          hasDetails: true,
          teamName: true,
          teamSize: true,
        },
      }),
    ]);

    if (existingInterest) {
      viewerInterest = {
        id: existingInterest.id,
        hasDetails: existingInterest.hasDetails,
        teamName: existingInterest.teamName,
        teamSize: existingInterest.teamSize,
      };
    }

    if (existingClaimMember) {
      const leader = existingClaimMember.claim.members.find((member) => member.role === 'LEAD') || existingClaimMember.claim.members[0] || null;
      const submissionFileUrl = existingClaimMember.claim.submissionFileKey
        ? await getSignedUrl(existingClaimMember.claim.submissionFileKey).catch(() => null)
        : null;

      existingRegistration = {
        claimId: existingClaimMember.claim.id,
        teamName: existingClaimMember.claim.teamName || `Team-${existingClaimMember.claim.id}`,
        problem: {
          id: existingClaimMember.claim.problem.id,
          title: existingClaimMember.claim.problem.title,
        },
        teamLeader: leader
          ? {
              id: leader.user.id,
              name: leader.user.name,
              email: leader.user.email,
              uid: leader.user.uid,
            }
          : null,
        members: existingClaimMember.claim.members.map((member) => ({
          role: member.role,
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            uid: member.user.uid,
          },
        })),
        submissionFileUrl,
        submittedAt: existingClaimMember.claim.updatedAt.toISOString(),
        createdAt: existingClaimMember.claim.createdAt.toISOString(),
      };
    }
  }

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
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
        submissionLockISO={event.submissionLockAt ? event.submissionLockAt.toISOString() : null}
        registrationCloseISO={event.endTime.toISOString()}
        eventBriefUrl={eventBriefUrl}
        problems={eventProblems}
        viewerRole={viewerRole}
        initialRegistration={existingRegistration}
        initialInterest={viewerInterest}
      />
    </main>
  );
}
