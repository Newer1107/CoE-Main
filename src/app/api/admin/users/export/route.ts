import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticate, authorize, errorRes } from "@/lib/api-helpers";
import { getSignedUrl } from "@/lib/minio";

type YearFilter = "FIRST" | "SECOND" | "THIRD" | "FOURTH";

type UidParts = {
  startYear: string;
  endYear: string;
  branchCode: string;
};

const csvEscape = (value: unknown): string => {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const parseUid = (uid: string | null): UidParts | null => {
  if (!uid) return null;
  const normalized = uid.trim().toUpperCase();
  const parts = normalized.split("-");
  if (parts.length !== 3) return null;

  const [startYear, middle, endYear] = parts;
  if (startYear.length !== 2 || endYear.length !== 2) return null;

  const middleMatch = middle.match(/^([A-Z]+)(\d{1,3})$/);
  if (!middleMatch) return null;

  const letters = middleMatch[1];
  if (letters.length < 2) return null;

  const branchCode = letters.slice(0, -1);
  return { startYear, endYear, branchCode };
};

const yearFilterMap: Record<YearFilter, { startYear: string; endYear: string }> = {
  FIRST: { startYear: "25", endYear: "29" },
  SECOND: { startYear: "24", endYear: "28" },
  THIRD: { startYear: "23", endYear: "27" },
  FOURTH: { startYear: "22", endYear: "26" },
};

const matchesYearFilter = (parts: UidParts, filter: YearFilter) => {
  const expected = yearFilterMap[filter];
  return parts.startYear === expected.startYear && parts.endYear === expected.endYear;
};

// GET /api/admin/users/export
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes("Unauthorized", [], 401);
    if (!authorize(user, "ADMIN")) return errorRes("Forbidden", ["Admin access required"], 403);

    const searchParams = new URL(req.url).searchParams;
    const yearFilterRaw = searchParams.get("year")?.trim().toUpperCase() || "ALL";
    const yearFilter =
      yearFilterRaw === "FIRST" ||
      yearFilterRaw === "SECOND" ||
      yearFilterRaw === "THIRD" ||
      yearFilterRaw === "FOURTH"
        ? (yearFilterRaw as YearFilter)
        : null;
    const branchFilter = searchParams.get("branch")?.trim().toUpperCase() || "ALL";

    const users = await prisma.user.findMany({
      where: { role: "STUDENT" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        uid: true,
        studentProfile: {
          select: {
            skills: true,
            resumeUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = await Promise.all(
      users
        .map((row) => {
          const uidParts = parseUid(row.uid ?? null);
          const matchesYear = !yearFilter || (uidParts ? matchesYearFilter(uidParts, yearFilter) : false);
          const matchesBranch =
            branchFilter === "ALL" ||
            (uidParts ? uidParts.branchCode === branchFilter : false);

          if (!matchesYear || !matchesBranch) return null;
          return row;
        })
        .filter((row): row is typeof users[number] => row !== null)
        .map(async (row) => {
          const resumeUrl = row.studentProfile?.resumeUrl
            ? await getSignedUrl(row.studentProfile.resumeUrl).catch(() => null)
            : null;

          return {
            name: row.name,
            uid: row.uid ?? "",
            phone: row.phone ?? "",
            email: row.email,
            skills: row.studentProfile?.skills ?? "",
            resumeUrl: resumeUrl ?? "",
          };
        })
    );

    const headers = ["Name", "UID", "Phone", "Email", "Skills", "Resume URL"];
    const lines = rows.map((row) =>
      [row.name, row.uid, row.phone, row.email, row.skills, row.resumeUrl]
        .map(csvEscape)
        .join(",")
    );

    const csv = [headers.map(csvEscape).join(","), ...lines].join("\n");
    const fileStamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="user-directory-${fileStamp}.csv"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Admin users export GET error:", err);
    return errorRes("Internal server error", [], 500);
  }
}
