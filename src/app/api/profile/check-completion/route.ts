import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/profile/check-completion
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        isComplete: true,
        skills: true,
        experience: true,
        interests: true,
        resumeUrl: true,
      },
    });

    if (!profile) {
      // No profile exists yet
      return successRes(
        {
          profileExists: false,
          isComplete: false,
          profile: null,
        },
        'Profile check completed.'
      );
    }

    return successRes(
      {
        profileExists: true,
        isComplete: profile.isComplete,
        profile: {
          id: profile.id,
          skills: profile.skills,
          experience: profile.experience,
          interests: profile.interests,
          resumeUrl: profile.resumeUrl,
        },
      },
      'Profile check completed.'
    );
  } catch (err) {
    console.error('Profile check error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
