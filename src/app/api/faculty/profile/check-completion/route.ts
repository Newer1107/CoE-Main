import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticate, authorize, errorRes, successRes } from "@/lib/api-helpers";

// GET /api/faculty/profile/check-completion
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes("Unauthorized", [], 401);
    if (!authorize(user, "FACULTY")) return errorRes("Forbidden", ["Faculty access required"], 403);

    const profile = await prisma.facultyProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        isComplete: true,
        department: true,
        designation: true,
        expertise: true,
        resumeUrl: true,
      },
    });

    if (!profile) {
      return successRes(
        {
          profileExists: false,
          isComplete: false,
          profile: null,
        },
        "Profile check completed.",
      );
    }

    return successRes(
      {
        profileExists: true,
        isComplete: profile.isComplete,
        profile: {
          id: profile.id,
          department: profile.department,
          designation: profile.designation,
          expertise: profile.expertise,
          resumeUrl: profile.resumeUrl,
        },
      },
      "Profile check completed.",
    );
  } catch (err) {
    console.error("Faculty profile check error:", err);
    return errorRes("Internal server error", [], 500);
  }
}
