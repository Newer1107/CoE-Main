import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import InnovationProblemsClient from './InnovationProblemsClient';

export default async function InnovationProblemsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  if (!['STUDENT', 'FACULTY', 'ADMIN'].includes(payload.role)) redirect('/login');

  return <InnovationProblemsClient role={payload.role as 'STUDENT' | 'FACULTY' | 'ADMIN'} userId={payload.id} />;
}
