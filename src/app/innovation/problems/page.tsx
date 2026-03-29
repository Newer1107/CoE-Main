import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import InnovationProblemsClient from './InnovationProblemsClient';

export default async function InnovationProblemsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  let role: 'STUDENT' | 'FACULTY' | 'ADMIN' | null = null;

  if (token) {
    try {
      const payload = verifyAccessToken(token);

      if (
        payload.role === 'STUDENT' ||
        payload.role === 'FACULTY' ||
        payload.role === 'ADMIN'
      ) {
        role = payload.role;
      }
    } catch {
      role = null;
    }
  }

  return <InnovationProblemsClient role={role} />;
}