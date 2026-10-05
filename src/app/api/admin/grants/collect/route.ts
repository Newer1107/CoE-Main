import { NextRequest } from "next/server";
import { successRes, errorRes, authenticate, authorize } from "@/lib/api-helpers";
import { collectMonthlyGrants } from "@/lib/grants/automation";

// POST /api/admin/grants/collect — admin-only manual trigger for the
// monthly grants pipeline. Same work as GET /api/cron/grants-collector,
// but authorized via the admin session cookie instead of CRON_SECRET.
// (The cron endpoint only falls back to admin auth when no CRON_SECRET
// is configured, so the button cannot use it directly.)
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes("Unauthorized", [], 401);
    if (!authorize(user, "ADMIN")) return errorRes("Forbidden", [], 403);

    const result = await collectMonthlyGrants();
    return successRes(result, "Grants collection completed.");
  } catch (err) {
    console.error("Admin grants collect error:", err);
    return errorRes("Internal server error", [], 500);
  }
}
