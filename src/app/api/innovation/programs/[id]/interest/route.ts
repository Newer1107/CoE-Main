import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';

const getCounts = async (programId: string, userId?: number) => {
  const [interestCount, existing] = await Promise.all([
    prisma.programInterest.count({ where: { programId } }),
    userId
      ? prisma.programInterest.findUnique({
          where: {
            userId_programId: {
              userId,
              programId,
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    interestCount,
    isInterested: Boolean(existing),
  };
};

// GET /api/innovation/programs/[id]/interest
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: programId } = await params;
    const program = await prisma.innovationProgram.findUnique({ where: { id: programId }, select: { id: true } });
    if (!program) return errorRes('Program not found', [], 404);

    const user = authenticate(req);
    const summary = await getCounts(programId, user?.id);
    return successRes(summary, 'Interest summary retrieved successfully.');
  } catch (err) {
    console.error('Program interest GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/programs/[id]/interest
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const { id: programId } = await params;
    const program = await prisma.innovationProgram.findUnique({ where: { id: programId }, select: { id: true } });
    if (!program) return errorRes('Program not found', [], 404);

    try {
      await prisma.programInterest.create({
        data: {
          userId: user.id,
          programId,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') {
        throw err;
      }
    }

    const summary = await getCounts(programId, user.id);
    return successRes(summary, 'Interest added successfully.');
  } catch (err) {
    console.error('Program interest POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/innovation/programs/[id]/interest
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const { id: programId } = await params;
    const program = await prisma.innovationProgram.findUnique({ where: { id: programId }, select: { id: true } });
    if (!program) return errorRes('Program not found', [], 404);

    await prisma.programInterest.deleteMany({
      where: {
        userId: user.id,
        programId,
      },
    });

    const summary = await getCounts(programId, user.id);
    return successRes(summary, 'Interest removed successfully.');
  } catch (err) {
    console.error('Program interest DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
