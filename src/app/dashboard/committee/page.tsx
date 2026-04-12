import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import CommitteeDashboardClient from './CommitteeDashboardClient';

export default async function CommitteeDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fdashboard%2Fcommittee');

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'STUDENT') {
      if (payload.role === 'EVALUATOR') redirect('/evaluator/dashboard');
      if (payload.role === 'ADMIN') redirect('/admin/committee');
      if (payload.role === 'FACULTY') redirect('/faculty');
      redirect('/facility-booking');
    }
  } catch {
    redirect('/login?next=%2Fdashboard%2Fcommittee');
  }

  return <CommitteeDashboardClient />;
}
