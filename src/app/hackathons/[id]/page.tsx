import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifyAccessToken } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { getSignedUrl } from "@/lib/minio";
import EventHero from "@/components/hackathons/EventHero";
import EventDetailClient from "./EventDetailClient";

export type RubricCategoryPayload = {
  id: number;
  key: string;
  label: string;
  weight: number;
};

export type ProblemPayload = {
  id: number;
  title: string;
  description: string;
  tags: string | null;
  isIndustryProblem: boolean;
  industryName: string | null;
  difficulty: string | null;
  sdgTags: unknown;
  supportDocumentUrl: string | null;
  mode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ClaimPayload = {
  id: number;
  status: string;
  teamName: string | null;
  problemId: number;
} | null;

export type EventDetailPayload = {
  id: number;
  title: string;
  description: string | null;
  eventType: string;
  status: string;
  registrationOpen: boolean;
  featured: boolean;
  startTime: string;
  endTime: string;
  submissionLockAt: string | null;
  totalSessions: number;
  totalInterested: number;
  config: unknown;
  department: { id: number; name: string } | null;
  _count: { problems: number; interests: number };
  problems: ProblemPayload[];
  rubricCategories: RubricCategoryPayload[];
};

export default async function HackathonEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) notFound();

  const event = await prisma.hackathonEvent.findUnique({
    where: { id: eventId },
    include: {
      _count: { select: { problems: true, interests: true } },
      problems: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          tags: true,
          isIndustryProblem: true,
          industryName: true,
          difficulty: true,
          sdgTags: true,
          supportDocumentKey: true,
          mode: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      rubrics: {
        orderBy: { order: "asc" },
        select: { id: true, key: true, label: true, weight: true },
      },
      department: { select: { id: true, name: true } },
    },
  });

  if (!event) notFound();

  const problemsWithUrls: ProblemPayload[] = await Promise.all(
    event.problems.map(async (problem) => ({
      ...problem,
      sdgTags: problem.sdgTags,
      createdAt: problem.createdAt.toISOString(),
      updatedAt: problem.updatedAt.toISOString(),
      supportDocumentUrl: problem.supportDocumentKey
        ? await getSignedUrl(problem.supportDocumentKey).catch(() => null)
        : null,
    })),
  );

  // Auth-aware extras — mirrors /api/innovation/events/[id].
  let viewerRole: "STUDENT" | "FACULTY" | "ADMIN" | null = null;
  let viewerUserId: number | null = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (token) {
      const payload = verifyAccessToken(token);
      if (["STUDENT", "FACULTY", "ADMIN"].includes(payload.role)) {
        viewerRole = payload.role as "STUDENT" | "FACULTY" | "ADMIN";
        viewerUserId = payload.id;
      }
    }
  } catch {
    viewerRole = null;
    viewerUserId = null;
  }

  let myClaim: ClaimPayload = null;
  let myInterest: boolean = false;
  if (viewerRole === "STUDENT" && viewerUserId) {
    const [claimMember, interest] = await Promise.all([
      prisma.claimMember.findFirst({
        where: {
          userId: viewerUserId,
          claim: { problem: { eventId: event.id } },
        },
        select: {
          claim: { select: { id: true, status: true, teamName: true, problemId: true } },
        },
      }),
      prisma.hackathonInterest.findUnique({
        where: { userId_eventId: { userId: viewerUserId, eventId: event.id } },
        select: { id: true },
      }),
    ]);

    if (claimMember) {
      myClaim = {
        id: claimMember.claim.id,
        status: claimMember.claim.status,
        teamName: claimMember.claim.teamName,
        problemId: claimMember.claim.problemId,
      };
    }
    myInterest = interest != null;
  }

  const payload: EventDetailPayload = {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    status: event.status,
    registrationOpen: event.registrationOpen,
    featured: event.featured,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    submissionLockAt: event.submissionLockAt ? event.submissionLockAt.toISOString() : null,
    totalSessions: event.totalSessions,
    totalInterested: event._count.interests,
    config: event.config,
    department: event.department,
    _count: { problems: event._count.problems, interests: event._count.interests },
    problems: problemsWithUrls,
    rubricCategories: event.rubrics,
  };

  return (
    <main className="min-h-screen bg-surface pb-16">
      <div>
        <EventHero event={payload} />

        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <EventDetailClient
            event={payload}
            viewerRole={viewerRole}
            initialMyClaim={myClaim}
            initialMyInterest={myInterest}
          />
        </div>
      </div>
    </main>
  );
}
