import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { redirect } from 'next/navigation';
import InnovationProblemsClient from '@/app/innovation/problems/InnovationProblemsClient';

export default async function FacultyInternshipPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login?next=%2Ffaculty-internship');
  }

  let role: 'FACULTY' | 'ADMIN' | null = null;

  try {
    const payload = verifyAccessToken(token);
    if (payload.role === 'FACULTY' || payload.role === 'ADMIN') {
      role = payload.role as 'FACULTY' | 'ADMIN';
    }
  } catch {
    role = null;
  }

  if (!role) {
    redirect('/innovation');
  }

  if (role === 'ADMIN') {
    return redirect('/faculty-internship/dashboard');
  }

  return <InnovationProblemsClient role={role} listingType="faculty-internship" />;
}
