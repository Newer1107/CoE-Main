import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticate, authorize, errorRes, successRes } from "@/lib/api-helpers";
import { getStoredFileDisplayName, sanitizeFilename } from "@/lib/innovation";
import { getSignedUrl, uploadFileWithObjectKey } from "@/lib/minio";

type ProfileLinkPayload = string[];

const allowedResumeMime = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const normalizeProfileLinks = (raw: string | null): ProfileLinkPayload => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((link) => (typeof link === "string" ? link.trim() : ""))
      .filter((link) => link.length > 0);
  } catch {
    return [];
  }
};

const validateLinks = (links: ProfileLinkPayload) => {
  const invalid = links.filter((link) => {
    try {
      const url = new URL(link);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  });

  return invalid;
};

const buildResumePayload = async (resumeUrl: string | null) => {
  return {
    resumeFileName: getStoredFileDisplayName(resumeUrl),
    resumeUrl: resumeUrl ? await getSignedUrl(resumeUrl).catch(() => null) : null,
  };
};

// GET /api/faculty/profile
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes("Unauthorized", [], 401);
    if (!authorize(user, "FACULTY")) return errorRes("Forbidden", ["Faculty access required"], 403);

    const profile = await prisma.facultyProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return errorRes("Profile not found", ["Faculty profile does not exist. Please create one first."], 404);
    }

    const resumePayload = await buildResumePayload(profile.resumeUrl ?? null);

    return successRes(
      {
        ...profile,
        profileLinks: Array.isArray(profile.profileLinks) ? profile.profileLinks : [],
        ...resumePayload,
      },
      "Profile retrieved successfully.",
    );
  } catch (err) {
    console.error("Faculty profile GET error:", err);
    return errorRes("Internal server error", [], 500);
  }
}

// POST /api/faculty/profile
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes("Unauthorized", [], 401);
    if (!authorize(user, "FACULTY")) return errorRes("Forbidden", ["Faculty access required"], 403);

    const formData = await req.formData();
    const department = ((formData.get("department") as string) || "").trim();
    const designation = ((formData.get("designation") as string) || "").trim();
    const expertise = ((formData.get("expertise") as string) || "").trim();
    const resumeFile = formData.get("resume") as File | null;
    const rawLinks = formData.get("profileLinks") as string | null;

    if (!department || !designation || !expertise) {
      return errorRes("Validation failed", ["Department, designation, and expertise are required"], 400);
    }

    if (!resumeFile) {
      return errorRes("Validation failed", ["Resume is required when creating a profile"], 400);
    }

    if (!allowedResumeMime.includes(resumeFile.type)) {
      return errorRes("Invalid resume file type", ["Resume must be PDF, DOC, or DOCX format"], 400);
    }

    const profileLinks = normalizeProfileLinks(rawLinks);
    const invalidLinks = validateLinks(profileLinks);
    if (invalidLinks.length > 0) {
      return errorRes("Validation failed", ["One or more profile links are invalid"], 400);
    }

    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const resumeKey = `faculty-profiles/${user.id}/resume-${Date.now()}-${sanitizeFilename(resumeFile.name)}`;

    await uploadFileWithObjectKey(resumeKey, {
      buffer,
      mimetype: resumeFile.type || "application/octet-stream",
      size: buffer.length,
    });

    const existingProfile = await prisma.facultyProfile.findUnique({
      where: { userId: user.id },
    });

    const data = {
      department,
      designation,
      expertise,
      resumeUrl: resumeKey,
      profileLinks,
      isComplete: true,
    };

    const profile = existingProfile
      ? await prisma.facultyProfile.update({ where: { userId: user.id }, data })
      : await prisma.facultyProfile.create({ data: { ...data, userId: user.id } });

    const resumePayload = await buildResumePayload(profile.resumeUrl ?? null);

    return successRes(
      {
        ...profile,
        profileLinks: Array.isArray(profile.profileLinks) ? profile.profileLinks : [],
        ...resumePayload,
      },
      "Faculty profile saved successfully.",
      existingProfile ? 200 : 201,
    );
  } catch (err) {
    console.error("Faculty profile POST error:", err);
    return errorRes("Internal server error", [], 500);
  }
}

// PATCH /api/faculty/profile
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes("Unauthorized", [], 401);
    if (!authorize(user, "FACULTY")) return errorRes("Forbidden", ["Faculty access required"], 403);

    const formData = await req.formData();
    const department = formData.has("department")
      ? ((formData.get("department") as string) || "").trim()
      : undefined;
    const designation = formData.has("designation")
      ? ((formData.get("designation") as string) || "").trim()
      : undefined;
    const expertise = formData.has("expertise")
      ? ((formData.get("expertise") as string) || "").trim()
      : undefined;
    const resumeFile = formData.get("resume") as File | null;
    const profileLinksRaw = formData.has("profileLinks")
      ? (formData.get("profileLinks") as string | null)
      : undefined;

    const profile = await prisma.facultyProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return errorRes("Profile not found", ["Faculty profile does not exist. Please create one first."], 404);
    }

    let resumeUrl: string | undefined;
    if (resumeFile) {
      if (!allowedResumeMime.includes(resumeFile.type)) {
        return errorRes("Invalid resume file type", ["Resume must be PDF, DOC, or DOCX format"], 400);
      }

      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      const resumeKey = `faculty-profiles/${user.id}/resume-${Date.now()}-${sanitizeFilename(resumeFile.name)}`;

      await uploadFileWithObjectKey(resumeKey, {
        buffer,
        mimetype: resumeFile.type || "application/octet-stream",
        size: buffer.length,
      });

      resumeUrl = resumeKey;
    }

    let profileLinks: ProfileLinkPayload | undefined;
    if (profileLinksRaw !== undefined) {
      profileLinks = normalizeProfileLinks(profileLinksRaw);
      const invalidLinks = validateLinks(profileLinks);
      if (invalidLinks.length > 0) {
        return errorRes("Validation failed", ["One or more profile links are invalid"], 400);
      }
    }

    const updated = await prisma.facultyProfile.update({
      where: { userId: user.id },
      data: {
        ...(department !== undefined && { department }),
        ...(designation !== undefined && { designation }),
        ...(expertise !== undefined && { expertise }),
        ...(resumeUrl !== undefined && { resumeUrl }),
        ...(profileLinks !== undefined && { profileLinks }),
        updatedAt: new Date(),
      },
    });

    const finalProfile = await prisma.facultyProfile.update({
      where: { userId: user.id },
      data: {
        isComplete: !!(
          updated.department &&
          updated.designation &&
          updated.expertise &&
          updated.resumeUrl
        ),
      },
    });

    const resumePayload = await buildResumePayload(finalProfile.resumeUrl ?? null);

    return successRes(
      {
        ...finalProfile,
        profileLinks: Array.isArray(finalProfile.profileLinks) ? finalProfile.profileLinks : [],
        ...resumePayload,
      },
      "Faculty profile updated successfully.",
    );
  } catch (err) {
    console.error("Faculty profile PATCH error:", err);
    return errorRes("Internal server error", [], 500);
  }
}
