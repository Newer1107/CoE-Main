import { NextRequest } from "next/server";
import { authenticate, authorize, errorRes, successRes } from "@/lib/api-helpers";
import { collectMonthlyGrants } from "@/lib/grants/automation";

// In-memory run guard (same pattern as src/app/api/auth/*/route.ts).
// A full collection scrapes 6 external pages + calls the AI gateway,
// so reject repeat triggers within 10 minutes.
let lastFullRunAt = 0;

function isAuthorizedCron(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = (
    new URL(req.url).searchParams.get("secret") || ""
  ).trim();

  if (expectedSecret) {
    return headerSecret === expectedSecret || querySecret === expectedSecret;
  }

  const user = authenticate(req);
  return Boolean(user && authorize(user, "ADMIN"));
}

// GET /api/cron/grants-collector
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return errorRes("Forbidden", ["Invalid cron secret"], 403);
    }

    if (Date.now() - lastFullRunAt < 10 * 60_000) {
      return errorRes("Too many requests", ["A collection run started less than 10 minutes ago."], 429);
    }
    lastFullRunAt = Date.now();

    const result = await collectMonthlyGrants();
    return successRes(result, "Grants collection completed.");
  } catch (err) {
    console.error("Grants collector cron error:", err);
    return errorRes("Internal server error", [], 500);
  }
}
