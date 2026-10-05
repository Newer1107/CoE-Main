import { NextRequest } from "next/server";
import { authenticate, authorize, errorRes, successRes } from "@/lib/api-helpers";
import { collectMonthlyGrants } from "@/lib/grants/automation";

// In-memory run guard (same pattern as src/app/api/auth/*/route.ts).
// A full collection (Tavily search + AI call + store) is expensive, so reject
// repeat triggers within 10 minutes. Constraint: module-level state resets on
// every deploy/restart and is per-process — valid only while the app runs as a
// single instance (prod is fork_mode / single instance today). Do not rely on
// this if the app is ever clustered; the DB idempotency check remains the
// real duplicate protection.
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

    // Fail loudly on missing setup: a 503 + NOT_CONFIGURED is distinguishable
    // from a transient AI failure (FAILED) in automation_runs. No run row is
    // created and the rate-limit slot is not consumed, so an unconfigured
    // endpoint always answers 503 (never a misleading 429).
    const missing = [
      "QWEN_API_KEY",
      "TAVILY_API_KEY",
      "AI_GATEWAY_URL",
      "AI_GATEWAY_MODEL",
    ].filter((k) => !process.env[k]?.trim());
    if (missing.length > 0) {
      return errorRes(
        "Grants collector not configured",
        missing.map((k) => `NOT_CONFIGURED: ${k} is missing — set it in .env and GitHub Actions secrets`),
        503
      );
    }
    lastFullRunAt = Date.now();

    const result = await collectMonthlyGrants();
    return successRes(result, "Grants collection completed.");
  } catch (err) {
    console.error("Grants collector cron error:", err);
    return errorRes("Internal server error", [], 500);
  }
}
