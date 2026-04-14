import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import FacultyApplicationsClient from './FacultyApplicationsClient';

export default async function FacultyApplicationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Finnovation%2Ffaculty%2Fapplications');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Finnovation%2Ffaculty%2Fapplications');
  }

  if (!['FACULTY', 'INDUSTRY_PARTNER', 'ADMIN'].includes(payload.role)) redirect('/facility-booking');

  return <FacultyApplicationsClient />;
}
