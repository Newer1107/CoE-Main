import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import DecisionEngineClient from '@/app/industry-internship/decisions/DecisionEngineClient';

export default async function FacultyInternshipDecisionsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Ffaculty-internship%2Fdecisions');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Ffaculty-internship%2Fdecisions');
  }

  if (payload.role !== 'ADMIN') {
    redirect('/faculty-internship');
  }

  return <DecisionEngineClient problemType="FACULTY_INTERNSHIP" />;
}
