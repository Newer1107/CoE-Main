import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';

export default async function EvaluatorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fevaluator%2Fdashboard');

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'EVALUATOR') {
      if (payload.role === 'ADMIN') redirect('/admin/committee');
      if (payload.role === 'FACULTY') redirect('/faculty');
      if (payload.role === 'STUDENT') redirect('/dashboard/committee');
      redirect('/facility-booking');
    }
  } catch {
    redirect('/login?next=%2Fevaluator%2Fdashboard');
  }

  return <>{children}</>;
}
