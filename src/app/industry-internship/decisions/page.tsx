import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import DecisionEngineClient from './DecisionEngineClient';

export default async function InternshipDecisionsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Findustry-internship%2Fdecisions');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Findustry-internship%2Fdecisions');
  }

  if (!['INDUSTRY_PARTNER', 'ADMIN'].includes(payload.role)) {
    redirect('/industry-internship');
  }

  return <DecisionEngineClient />;
}
