import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getStoredFileDisplayName, sanitizeFilename } from '@/lib/innovation';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';

// GET /api/profile/me
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return errorRes('Profile not found', ['Student profile does not exist. Please create one first.'], 404);
    }

    const payload = {
      ...profile,
      resumeFileName: getStoredFileDisplayName(profile.resumeUrl),
      resumeUrl: profile.resumeUrl ? await getSignedUrl(profile.resumeUrl).catch(() => null) : null,
    };

    return successRes(payload, 'Profile retrieved successfully.');
  } catch (err) {
    console.error('Profile GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/profile
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const formData = await req.formData();
    const skills = ((formData.get('skills') as string) || '').trim();
    const experience = ((formData.get('experience') as string) || '').trim();
    const interests = ((formData.get('interests') as string) || '').trim();
    const resumeFile = formData.get('resume') as File | null;

    if (!skills && !experience && !interests) {
      return errorRes('Validation failed', ['At least one field (skills, experience, or interests) is required'], 400);
    }

    const allowedResumeMime = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    let resumeUrl: string | null = null;
    if (resumeFile) {
      if (!allowedResumeMime.includes(resumeFile.type)) {
        return errorRes('Invalid resume file type', ['Resume must be PDF, DOC, or DOCX format'], 400);
      }

      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      const resumeKey = `profiles/${user.id}/resume-${Date.now()}-${sanitizeFilename(resumeFile.name)}`;

      await uploadFileWithObjectKey(resumeKey, {
        buffer,
        mimetype: resumeFile.type || 'application/octet-stream',
        size: buffer.length,
      });

      resumeUrl = resumeKey;
    }

    // Check if profile exists
    const existingProfile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });

    let profile;
    if (existingProfile) {
      // Update existing profile
      profile = await prisma.studentProfile.update({
        where: { userId: user.id },
        data: {
          skills: skills || existingProfile.skills,
          experience: experience || existingProfile.experience,
          interests: interests || existingProfile.interests,
          resumeUrl: resumeUrl || existingProfile.resumeUrl,
          isComplete: !!(skills && experience && interests && (resumeUrl || existingProfile.resumeUrl)),
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new profile
      profile = await prisma.studentProfile.create({
        data: {
          userId: user.id,
          skills: skills || null,
          experience: experience || null,
          interests: interests || null,
          resumeUrl,
          isComplete: !!(skills && experience && interests && resumeUrl),
        },
      });
    }

    const payload = {
      ...profile,
      resumeFileName: getStoredFileDisplayName(profile.resumeUrl),
      resumeUrl: profile.resumeUrl ? await getSignedUrl(profile.resumeUrl).catch(() => null) : null,
    };

    return successRes(payload, 'Student profile created successfully.', 201);
  } catch (err) {
    console.error('Profile POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/profile
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const formData = await req.formData();
    const skills = formData.has('skills') ? ((formData.get('skills') as string) || '').trim() : undefined;
    const experience = formData.has('experience') ? ((formData.get('experience') as string) || '').trim() : undefined;
    const interests = formData.has('interests') ? ((formData.get('interests') as string) || '').trim() : undefined;
    const resumeFile = formData.get('resume') as File | null;

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return errorRes('Profile not found', ['Student profile does not exist. Please create one first.'], 404);
    }

    const allowedResumeMime = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    let resumeUrl: string | undefined;
    if (resumeFile) {
      if (!allowedResumeMime.includes(resumeFile.type)) {
        return errorRes('Invalid resume file type', ['Resume must be PDF, DOC, or DOCX format'], 400);
      }

      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      const resumeKey = `profiles/${user.id}/resume-${Date.now()}-${sanitizeFilename(resumeFile.name)}`;

      await uploadFileWithObjectKey(resumeKey, {
        buffer,
        mimetype: resumeFile.type || 'application/octet-stream',
        size: buffer.length,
      });

      resumeUrl = resumeKey;
    }

    const updated = await prisma.studentProfile.update({
      where: { userId: user.id },
      data: {
        ...(skills !== undefined && { skills }),
        ...(experience !== undefined && { experience }),
        ...(interests !== undefined && { interests }),
        ...(resumeUrl !== undefined && { resumeUrl }),
        updatedAt: new Date(),
      },
    });

    // Recalculate isComplete
    const finalProfile = await prisma.studentProfile.update({
      where: { userId: user.id },
      data: {
        isComplete: !!(updated.skills && updated.experience && updated.interests && updated.resumeUrl),
      },
    });

    const payload = {
      ...finalProfile,
      resumeFileName: getStoredFileDisplayName(finalProfile.resumeUrl),
      resumeUrl: finalProfile.resumeUrl ? await getSignedUrl(finalProfile.resumeUrl).catch(() => null) : null,
    };

    return successRes(payload, 'Student profile updated successfully.');
  } catch (err) {
    console.error('Profile PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
