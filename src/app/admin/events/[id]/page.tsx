import prisma from '@/lib/prisma';
import { authenticate } from '@/lib/api-helpers';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import CoordinatorPanel from '@/components/admin/CoordinatorPanel';
import { redirect } from 'next/navigation';

export default async function EventOpsPage({ params }: { params: Promise<{ id: string }> }) {
  const eventId = Number((await params).id);
  if (!Number.isInteger(eventId)) redirect('/admin');

  // admin-only gate via the shared cookie auth
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  const fakeReq = {
    headers: { get: (name: string) => (name === 'cookie' ? `accessToken=${token ?? ''}` : null) },
    cookies: { get: (name: string) => (name === 'accessToken' && token ? { value: token } : undefined) },
  } as unknown as NextRequest;
  const user = token ? authenticate(fakeReq) : null;
  if (!user || user.role !== 'ADMIN') redirect('/login?next=' + encodeURIComponent(`/admin/events/${eventId}`));

  const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
  if (!event) redirect('/admin');

  return <CoordinatorPanel eventId={eventId} eventTitle={event.title} />;
}
