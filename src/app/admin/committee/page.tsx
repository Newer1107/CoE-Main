import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import AdminCommitteeClient from './AdminCommitteeClient';

export default async function AdminCommitteePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fadmin%2Fcommittee');

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'ADMIN') {
      if (payload.role === 'FACULTY') redirect('/faculty');
      if (payload.role === 'EVALUATOR') redirect('/evaluator/dashboard');
      redirect('/facility-booking');
    }
  } catch {
    redirect('/login?next=%2Fadmin%2Fcommittee');
  }

  return <AdminCommitteeClient />;
}
