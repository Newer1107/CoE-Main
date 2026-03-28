import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import InnovationFacultyClient from './InnovationFacultyClient';

export default async function InnovationFacultyPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Finnovation%2Ffaculty');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Finnovation%2Ffaculty');
  }

  if (!['FACULTY', 'ADMIN'].includes(payload.role)) redirect('/facility-booking');

  return <InnovationFacultyClient role={payload.role as 'FACULTY' | 'ADMIN'} userId={payload.id} />;
}
