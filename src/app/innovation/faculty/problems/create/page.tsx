import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import CreateProblemClient from './CreateProblemClient';

export default async function CreateProblemPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Finnovation%2Ffaculty%2Fproblems%2Fcreate');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Finnovation%2Ffaculty%2Fproblems%2Fcreate');
  }

  if (!['FACULTY', 'INDUSTRY_PARTNER', 'ADMIN'].includes(payload.role)) redirect('/facility-booking');

  return <CreateProblemClient role={payload.role as 'FACULTY' | 'INDUSTRY_PARTNER' | 'ADMIN'} />;
}
