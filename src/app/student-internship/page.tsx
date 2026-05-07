import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';

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

  const application = await prisma.application.findFirst({
    where: {
      userId: payload.id,
      status: 'SELECTED',
      problem: { problemType: 'INTERNSHIP' },
    },
    orderBy: { createdAt: 'desc' },
    select: { problemId: true },
  });

  if (!application) {
    redirect('/innovation/my-applications');
  }

  redirect(`/student-internship/${application.problemId}`);
}
