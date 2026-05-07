import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import IndustryInternshipClient from './IndustryInternshipClient';

export default async function IndustryInternshipPage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Findustry-internship');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Findustry-internship');
  }

  if (!['INDUSTRY_PARTNER', 'ADMIN'].includes(payload.role)) {
    redirect('/industry-internship');
  }

  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    redirect('/industry-internship');
  }

  return <IndustryInternshipClient problemId={problemId} />;
}
