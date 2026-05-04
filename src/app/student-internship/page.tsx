import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';

async function backfillStudentInternship(studentId: number) {
  const selected = await prisma.application.findFirst({
    where: {
      userId: studentId,
      status: 'SELECTED',
      problem: { problemType: 'INTERNSHIP' },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      userId: true,
      problem: {
        select: {
          id: true,
          title: true,
          createdById: true,
          industryId: true,
        },
      },
    },
  });

  if (!selected) return;

  let industryPartnerOwnerId = selected.problem.createdById;
  const problemOwner = await prisma.user.findUnique({
    where: { id: selected.problem.createdById },
    select: { id: true, role: true },
  });

  if (problemOwner?.role !== 'INDUSTRY_PARTNER' && selected.problem.industryId) {
    const partnerFromIndustry = await prisma.user.findFirst({
      where: { industryId: selected.problem.industryId, role: 'INDUSTRY_PARTNER' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (partnerFromIndustry) {
      industryPartnerOwnerId = partnerFromIndustry.id;
    }
  }

  let internship = await prisma.internship.findFirst({
    where: {
      problemStatementId: selected.problem.id,
      industryPartnerId: industryPartnerOwnerId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  if (!internship) {
    internship = await prisma.internship.create({
      data: {
        title: selected.problem.title,
        industryPartnerId: industryPartnerOwnerId,
        problemStatementId: selected.problem.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  }

  await prisma.internshipParticipant.upsert({
    where: {
      internshipId_studentId: {
        internshipId: internship.id,
        studentId,
      },
    },
    update: {},
    create: {
      internshipId: internship.id,
      studentId,
    },
  });
}

export default async function StudentInternshipLandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login?next=%2Fstudent-internship');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Fstudent-internship');
  }

  if (payload.role !== 'STUDENT') {
    redirect('/industry-internship');
  }

  await backfillStudentInternship(payload.id);

  const internship = await prisma.internship.findFirst({
    where: {
      participants: {
        some: {
          studentId: payload.id,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!internship) {
    redirect('/innovation/my-applications');
  }

  redirect(`/student-internship/${internship.id}`);
}
