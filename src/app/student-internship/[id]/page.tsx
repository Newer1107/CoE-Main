import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import StudentInternshipClient from './StudentInternshipClient';

export default async function StudentInternshipPage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fstudent-internship');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Fstudent-internship');
  }

  if (payload.role !== 'STUDENT') {
    redirect('/industry-internship');
  }

  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    redirect('/industry-internship');
  }

  return <StudentInternshipClient problemId={problemId} />;
}
