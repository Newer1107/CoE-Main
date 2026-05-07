import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { redirect } from 'next/navigation';
import InnovationProblemsClient from '@/app/innovation/problems/InnovationProblemsClient';

export default async function IndustryInternshipPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  let role: 'STUDENT' | 'FACULTY' | 'ADMIN' | 'INDUSTRY_PARTNER' | null = null;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      if (
        payload.role === 'STUDENT' ||
        payload.role === 'FACULTY' ||
        payload.role === 'ADMIN' ||
        payload.role === 'INDUSTRY_PARTNER'
      ) {
        role = payload.role as 'STUDENT' | 'FACULTY' | 'ADMIN' | 'INDUSTRY_PARTNER';
      }
    } catch {
      role = null;
    }
  }

  // Admins and industry partners should land on the internship dashboard (workspace view)
  if (role === 'ADMIN' || role === 'INDUSTRY_PARTNER') {
    return redirect('/industry-internship/dashboard');
  }

  return <InnovationProblemsClient role={role} listingType="internship" />;
}
