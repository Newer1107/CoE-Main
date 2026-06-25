import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/internal/users/lookup?uid=...
 *
 * Internal endpoint called by the Project Dashboard to resolve a user by UID.
 * Protected by SYNC_SECRET shared secret (same key as the upsert endpoint uses).
 *
 * This is NOT a public API. It is only reachable by services that know the secret.
 *
 * Query params:
 *   uid  string  required  — the UID to look up
 *
 * Response (200):
 *   { success: true, data: { name, email, uid, role, status } }
 *
 * Response (404):
 *   { success: false, error: "User not found" }
 *
 * Response (401 / 500):
 *   { success: false, error: "..." }
 */
export async function GET(req: NextRequest) {
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) {
    return NextResponse.json(
      { success: false, error: "SYNC_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("x-sync-secret");
  if (!authHeader || authHeader !== syncSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid || typeof uid !== "string") {
    return NextResponse.json(
      { success: false, error: "uid query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findFirst({
      where: { uid },
      select: {
        name: true,
        email: true,
        uid: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        uid: user.uid,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("[INTERNAL LOOKUP] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
