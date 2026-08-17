import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, normalizeDeptCode, DEPARTMENT_CODES } from '@/lib/hackathon-ops';

// GET  /ops/coordinator — event coordinators (with departmentCode) + candidate teachers
// PUT  /ops/coordinator — add a coordinator { coordinatorId: number, departmentCode?: string|null } (admin only)
// PATCH /ops/coordinator — change a coordinator's department { coordinatorId, fromDepartmentCode, toDepartmentCode } (admin only)
// DELETE /ops/coordinator — remove a coordinator { coordinatorId: number, departmentCode?: string|null } (admin only)
// departmentCode: null/"" = global (all depts), otherwise e.g. "COMP", "AIML"
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: {
        coordinatorId: true,
        coordinators: { select: { userId: true, departmentCode: true } },
        coordinator: { select: { id: true, name: true, email: true } },
      },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const coordinatorRows = [...event.coordinators];
    if (event.coordinator && !coordinatorRows.some((c) => c.userId === event.coordinator!.id && !c.departmentCode)) {
      coordinatorRows.unshift({ userId: event.coordinator.id, departmentCode: null });
    }
    const ids = [...new Set(coordinatorRows.map((c) => c.userId))];
    const users = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const coordinators = coordinatorRows.map((r) => ({
      userId: r.userId,
      departmentCode: r.departmentCode ?? null,
      user: userById.get(r.userId) ?? { id: r.userId, name: 'Unknown', email: '' },
    }));

    const faculty = user.role === 'ADMIN'
      ? await prisma.user.findMany({
          where: { role: { in: ['FACULTY', 'ADMIN'] }, status: 'ACTIVE' },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        })
      : [];
    return successRes({ coordinators, faculty, departmentCodes: DEPARTMENT_CODES });
  } catch (err) {
    console.error('coordinator GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const coordinatorId = body?.coordinatorId == null || body?.coordinatorId === '' ? null : Number(body?.coordinatorId);
    const departmentCode = normalizeDeptCode(body?.departmentCode ?? null);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (coordinatorId === null) return errorRes('coordinatorId is required', [], 400);

    const teacher = await prisma.user.findFirst({ where: { id: coordinatorId, role: { in: ['FACULTY', 'ADMIN'] } } });
    if (!teacher) return errorRes('Teacher not found', ['Pick a FACULTY or ADMIN user'], 400);

    // check duplicate (old unique still blocks same user global; handle via findFirst)
    const existing = await prisma.eventCoordinator.findFirst({
      where: { eventId, userId: coordinatorId, departmentCode },
    });
    if (!existing) {
      // try upsert with new composite key; fall back to create if old unique blocks
      try {
        await prisma.eventCoordinator.create({ data: { eventId, userId: coordinatorId, departmentCode } });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('Duplicate') || msg.includes('UNIQUE') || msg.includes('EventCoordinator_eventId_userId')) {
          return errorRes('Coordinator already exists globally', ['Remove the existing global entry first, or use a department-specific assignment'], 409);
        }
        throw e;
      }
    }
    if (!event.coordinatorId) {
      await prisma.hackathonEvent.update({ where: { id: eventId }, data: { coordinatorId } });
    }
    return successRes({ coordinatorId, departmentCode }, 'Coordinator added');
  } catch (err) {
    console.error('coordinator PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}


export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const coordinatorId = Number(body?.coordinatorId);
    if (!Number.isInteger(coordinatorId)) return errorRes('coordinatorId is required', [], 400);
    const from = normalizeDeptCode(body?.fromDepartmentCode ?? undefined);
    const to = normalizeDeptCode(body?.toDepartmentCode ?? undefined);
    if (from === to) return errorRes('No change', ['Pick a different department'], 400);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    const existing = await prisma.eventCoordinator.findFirst({ where: { eventId, userId: coordinatorId, departmentCode: from } });
    if (!existing) return errorRes('Coordinator not found for that department', [], 404);
    const clash = await prisma.eventCoordinator.findFirst({ where: { eventId, userId: coordinatorId, departmentCode: to } });
    if (clash) return errorRes('Already assigned to that department', [], 409);
    await prisma.eventCoordinator.update({ where: { id: existing.id }, data: { departmentCode: to } });
    return successRes({ coordinatorId, fromDepartmentCode: from, toDepartmentCode: to }, 'Department updated');
  } catch (err) {
    console.error('coordinator PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const coordinatorId = Number(body?.coordinatorId);
    if (!Number.isInteger(coordinatorId)) return errorRes('coordinatorId is required', [], 400);
    const departmentCode = normalizeDeptCode(body?.departmentCode ?? undefined);
    // if departmentCode is provided, delete only that row; otherwise delete all rows for that user (backward-compat)
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);

    if (body?.departmentCode !== undefined) {
      await prisma.eventCoordinator.deleteMany({ where: { eventId, userId: coordinatorId, departmentCode } });
    } else {
      await prisma.eventCoordinator.deleteMany({ where: { eventId, userId: coordinatorId } });
    }
    if (event.coordinatorId === coordinatorId) {
      const remaining = await prisma.eventCoordinator.findFirst({ where: { eventId }, select: { userId: true } });
      await prisma.hackathonEvent.update({
        where: { id: eventId },
        data: { coordinatorId: remaining?.userId ?? null },
      });
    }
    return successRes({ coordinatorId, departmentCode }, 'Coordinator removed');
  } catch (err) {
    console.error('coordinator DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
