import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { syncHackathonTicketUsageStatus } from '@/lib/tickets';
import { logActivity } from '@/lib/activity-log';

type TeamMemberAction = 'ADD_MEMBER' | 'REMOVE_MEMBER' | 'SET_LEAD';

class TeamMemberMutationError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status = 400, details: string[] = []) {
    super(message);
    this.name = 'TeamMemberMutationError';
    this.status = status;
    this.details = details;
  }
}

const manageTeamMemberSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ADD_MEMBER'),
    identifier: z.string().trim().min(3, 'Please provide a valid UID or email'),
  }),
  z.object({
    action: z.literal('REMOVE_MEMBER'),
    claimMemberId: z.coerce.number().int().positive(),
  }),
  z.object({
    action: z.literal('SET_LEAD'),
    claimMemberId: z.coerce.number().int().positive(),
  }),
]);

const getActionMessage = (action: TeamMemberAction) => {
  switch (action) {
    case 'ADD_MEMBER':
      return 'Team member added successfully.';
    case 'REMOVE_MEMBER':
      return 'Team member removed successfully.';
    case 'SET_LEAD':
      return 'Team lead updated successfully.';
    default:
      return 'Team updated successfully.';
  }
};

const ensureEventMembershipConflict = async (tx: Prisma.TransactionClient, userId: number, claimId: number, eventId: number | null) => {
  if (!eventId) return;

  const existingInEvent = await tx.claimMember.findFirst({
    where: {
      userId,
      claimId: { not: claimId },
      claim: {
        problem: {
          eventId,
        },
      },
    },
    select: {
      claimId: true,
    },
  });

  if (existingInEvent) {
    throw new TeamMemberMutationError(
      'User already registered in this event',
      409,
      ['This user already belongs to another team in the selected hackathon event.']
    );
  }
};

// PATCH /api/innovation/admin/teams/[id]/members
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      return errorRes('Invalid team id', [], 400);
    }

    const body = await req.json();
    const parsed = manageTeamMemberSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const payload = parsed.data;
    const action = payload.action;

    const updatedClaim = await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({
        where: { id: claimId },
        select: {
          id: true,
          teamName: true,
          problem: {
            select: {
              event: {
                select: {
                  id: true,
                  totalSessions: true,
                },
              },
            },
          },
          tickets: {
            where: { type: 'HACKATHON_SELECTION' },
            select: { id: true, ticketId: true, status: true },
            take: 1,
          },
          members: {
            select: {
              id: true,
              userId: true,
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  uid: true,
                  phone: true,
                },
              },
            },
            orderBy: [{ role: 'asc' }, { id: 'asc' }],
          },
        },
      });

      if (!claim) {
        throw new TeamMemberMutationError('Team not found', 404);
      }

      const eventId = claim.problem.event?.id ?? null;
      const totalSessions = claim.problem.event?.totalSessions ?? 1;
      const ticket = claim.tickets[0] || null;

      if (payload.action === 'ADD_MEMBER') {
        const identifier = payload.identifier.trim();
        const normalizedUid = identifier.toUpperCase();
        const normalizedEmail = identifier.toLowerCase();

        const targetUser = await tx.user.findFirst({
          where: {
            role: 'STUDENT',
            status: 'ACTIVE',
            isVerified: true,
            OR: [
              { uid: normalizedUid },
              { email: normalizedEmail },
            ],
          },
          select: {
            id: true,
            name: true,
            email: true,
            uid: true,
          },
        });

        if (!targetUser) {
          throw new TeamMemberMutationError(
            'Student not found',
            404,
            ['Provide a valid active student UID or email.']
          );
        }

        const alreadyInSameTeam = claim.members.some((member) => member.userId === targetUser.id);
        if (alreadyInSameTeam) {
          throw new TeamMemberMutationError('User already exists in this team', 409, ['This user is already part of this team.']);
        }

        await ensureEventMembershipConflict(tx, targetUser.id, claim.id, eventId);

        const createdMember = await tx.claimMember.create({
          data: {
            claimId: claim.id,
            userId: targetUser.id,
            role: claim.members.length === 0 ? 'LEAD' : 'MEMBER',
          },
          select: {
            id: true,
          },
        });

        if (ticket) {
          await tx.ticketAttendance.createMany({
            data: Array.from({ length: totalSessions }, (_, index) => ({
              ticketId: ticket.id,
              claimId: claim.id,
              userId: targetUser.id,
              claimMemberId: createdMember.id,
              session: index + 1,
              status: 'NOT_PRESENT',
            })),
            skipDuplicates: true,
          });
        }
      }

      if (payload.action === 'REMOVE_MEMBER') {
        const targetMember = claim.members.find((member) => member.id === payload.claimMemberId);
        if (!targetMember) {
          throw new TeamMemberMutationError('Member not found in this team', 404);
        }

        if (claim.members.length <= 1) {
          throw new TeamMemberMutationError('Cannot remove final member', 400, ['A team must have at least one member.']);
        }

        await tx.claimMember.delete({ where: { id: targetMember.id } });

        if (targetMember.role === 'LEAD') {
          const nextLead = claim.members.find((member) => member.id !== targetMember.id);
          if (nextLead) {
            await tx.claimMember.update({
              where: { id: nextLead.id },
              data: { role: 'LEAD' },
            });
          }
        }
      }

      if (payload.action === 'SET_LEAD') {
        const targetMember = claim.members.find((member) => member.id === payload.claimMemberId);
        if (!targetMember) {
          throw new TeamMemberMutationError('Member not found in this team', 404);
        }

        await tx.claimMember.updateMany({
          where: { claimId: claim.id },
          data: { role: 'MEMBER' },
        });

        await tx.claimMember.update({
          where: { id: targetMember.id },
          data: { role: 'LEAD' },
        });
      }

      return tx.claim.findUnique({
        where: { id: claim.id },
        select: {
          id: true,
          teamName: true,
          problem: {
            select: {
              event: {
                select: {
                  totalSessions: true,
                },
              },
            },
          },
          tickets: {
            where: { type: 'HACKATHON_SELECTION' },
            select: { id: true, ticketId: true, status: true },
            take: 1,
          },
          members: {
            select: {
              id: true,
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  uid: true,
                  phone: true,
                },
              },
            },
            orderBy: [{ role: 'asc' }, { id: 'asc' }],
          },
        },
      });
    });

    if (!updatedClaim) {
      return errorRes('Team not found', [], 404);
    }

    const ticket = updatedClaim.tickets[0] || null;
    let nextTicketStatus = ticket?.status ?? null;
    if (ticket) {
      const totalMembers = updatedClaim.members.length;
      const totalSessions = updatedClaim.problem.event?.totalSessions ?? 1;
      const syncResult = await syncHackathonTicketUsageStatus(ticket.id, totalMembers, totalSessions);
      nextTicketStatus = syncResult.status ?? ticket.status;
    }

    logActivity('INNOVATION_ADMIN_TEAM_MEMBER_UPDATED', {
      adminUserId: user.id,
      claimId: updatedClaim.id,
      action,
      totalMembers: updatedClaim.members.length,
    });

    return successRes(
      {
        teamId: updatedClaim.id,
        teamName: updatedClaim.teamName || `Team-${updatedClaim.id}`,
        members: updatedClaim.members.map((member) => ({
          claimMemberId: member.id,
          role: member.role,
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            uid: member.user.uid,
            phone: member.user.phone,
          },
        })),
        ticket: ticket
          ? {
              id: ticket.id,
              ticketId: ticket.ticketId,
              status: nextTicketStatus,
            }
          : null,
      },
      getActionMessage(action)
    );
  } catch (err) {
    if (err instanceof TeamMemberMutationError) {
      return errorRes(err.message, err.details, err.status);
    }

    console.error('Innovation admin team members PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}