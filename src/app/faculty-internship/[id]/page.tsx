import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import FacultyInternshipClient from './FacultyInternshipClient';

export default async function FacultyInternshipPage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Ffaculty-internship');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Ffaculty-internship');
  }

  if (!['FACULTY', 'ADMIN'].includes(payload.role)) {
    redirect('/faculty-internship');
  }

  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    redirect('/faculty-internship');
  }

  return <FacultyInternshipClient problemId={problemId} />;
}
