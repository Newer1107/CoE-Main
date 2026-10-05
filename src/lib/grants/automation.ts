import prisma from "@/lib/prisma";
import { TRUSTED_SOURCES } from "./sources";
import { fetchLiveGrantContext, assertAllowedFetchUrl, type LiveCandidate } from "./tavily";

// All service endpoints come from env — no URL or model literals in source.
// Missing values fail loudly (503 NOT_CONFIGURED) instead of silently
// falling back to a stale default.
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL;
const AI_GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

// Upstream services return full HTML error pages on failure — storing those
// blobs in automation_runs.errors buries the signal, so collapse them here
// into one actionable line instead.
function summarizeHttpError(label: string, status: number, body: string): string {
  const text = (body || "").trim();
  if (text.startsWith("<")) {
    if (/tunnel/i.test(text) || /error 1033/i.test(text)) {
      return `${label} ${status}: AI gateway unreachable (Cloudflare tunnel down) — retry later or contact the CoE coordinator`;
    }
    if (/time-?out/i.test(text) || /error 524/i.test(text)) {
      return `${label} ${status}: AI gateway timed out (model overloaded) — retry later`;
    }
    const title = text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    return `${label} ${status}: unexpected HTML response${
      title ? ` (${title.slice(0, 100)})` : ""
    }`;
  }
  return `${label} ${status}: ${text.slice(0, 300)}`;
}

// Read a fetch Response as text first: a 200 with an HTML body (proxy error
// page) must not reach JSON.parse, whose SyntaxError ("Unexpected token
// '<'...") hides the real cause.
async function readJsonBody(
  res: Response,
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const raw = await res.text();
  if (!res.ok) throw new Error(summarizeHttpError(label, res.status, raw));
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(summarizeHttpError(label, res.status, raw));
  }
}

const TRUSTED_DOMAINS = TRUSTED_SOURCES.flatMap((s) => {
  const hosts: string[] = [];
  try {
    hosts.push(normalizeHostname(new URL(s.url).hostname));
  } catch {
    hosts.push(s.url);
  }
  for (const a of s.aliases ?? []) hosts.push(normalizeHostname(a));
  return hosts;
});

export function isTrustedUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const hostname = normalizeHostname(new URL(url).hostname);
    return TRUSTED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

type RawGrant = {
  title: string;
  issuingBody: string;
  category: string;
  description: string;
  deadline: string | null;
  referenceLink: string | null;
  // AI-reported: true when the deadline is a fallback/rolling-horizon date.
  // Unknown/missing is treated as tentative (safe direction).
  deadlineTentative: unknown;
};

type AutomationResult = {
  month: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  grantsFound: number;
  grantsPublished: number;
  duplicatesSkipped: number;
  errors: string[];
  liveResults: number;
  liveQueries: number;
};

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildPrompt(currentMonth: string, live: LiveCandidate[]): string {
  const sourceList = TRUSTED_SOURCES.map(
    (s) => `- ${s.name} (${s.abbreviation}) — ${s.url}`
  ).join("\n");

  const liveBlock =
    live.length > 0
      ? live
          .map(
            (c, i) =>
              `[${i + 1}] ${c.title}\nURL: ${c.url}\nContext: ${c.snippet || "none"}`
          )
          .join("\n\n")
      : "(live search returned nothing — use only opportunities you are highly confident are real)";

  return `You are a grant-data extraction assistant for an Indian Engineering & Technology Centre of Excellence.
Today: ${new Date().toISOString().slice(0, 10)}
Target month: ${currentMonth}

Below is LIVE web-search context collected right now. Prefer it over memory. You may also use training knowledge ONLY for well-known recurring programs, and only when highly confident.

LIVE RESULTS:
${liveBlock}

Your job is to select and structure ONLY opportunities that are REAL, CURRENTLY ACTIVE for the target month, relevant to engineering, technology, research, students, researchers, or faculty, from the trusted organizations below, and supported by the live results above or by high-confidence knowledge.

TRUSTED SOURCES:
${sourceList}

RULES:
1. Do NOT invent facts, deadlines, or URLs.
2. Do NOT use old/expired opportunities.
3. Every grant MUST have a deadline in YYYY-MM-DD format. Priority: (a) exact date from the live context, (b) last day of a month named in the context, (c) last day of the target month as fallback.
4. DEADLINE HONESTY (critical — students plan submissions around these dates): if you use fallback (c), or the opportunity is rolling/year-round, end the description with exactly one of these sentences: "Deadline shown is tentative — confirm on the official page." or "Applications are accepted year-round; the shown date is a review horizon, not a cutoff — confirm on the official page."
5. For EVERY grant, set deadlineTentative to true if the deadline is a fallback/rolling-horizon date, or false ONLY if you copied an exact published deadline. When in doubt, use true.
6. referenceLink MUST be a URL from the live results above when available — copy it exactly, never modify paths. Only fall back to a trusted-source homepage when no result URL fits.
7. ALLOWED DOMAINS: referenceLink's domain MUST belong to one of the trusted sources above. NEVER use facebook.com, linkedin.com, youtube.com, x.com, aggregators (wemakescholars.com, fundsforngos.org, buddy4study.com, etc.), blogs, forums, or news sites. If a live result URL is from one of these, replace it with the trusted organization's official program page — or EXCLUDE the grant if you cannot identify one.
8. Every URL must start with https://. If the official URL is missing or uncertain, EXCLUDE the opportunity.
9. No duplicates. Accuracy > quantity.

Return up to 10-15 of the strongest opportunities. If fewer qualify, return fewer.

Categories: GOVT_GRANT, SCHOLARSHIP, RESEARCH_FUND, INDUSTRY_GRANT

For each selected opportunity return exactly:
{
  "title": "string",
  "issuingBody": "string",
  "category": "GOVT_GRANT | SCHOLARSHIP | RESEARCH_FUND | INDUSTRY_GRANT",
  "description": "2 concise sentences",
  "deadline": "YYYY-MM-DD (never null)",
  "referenceLink": "exact live-result URL or trusted homepage",
  "deadlineTentative": "boolean — true if fallback/rolling-horizon, false only if exact published date"
}

FINAL CHECK: Remove any record with uncertain existence, expired deadline, non-https URL, non-trusted domain, fabricated path, unsupported claims, or duplicate opportunity.

Return ONLY valid JSON.`;
}

export function parseGrantJson(text: string): RawGrant[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const tryParse = (s: string): RawGrant[] => {
    const parsed: unknown = JSON.parse(s);
    if (!Array.isArray(parsed)) throw new Error("Response is not an array");
    return parsed as RawGrant[];
  };

  try {
    return tryParse(cleaned);
  } catch {
    // Prose-wrapped responses: extract the outermost JSON array and retry.
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON array found in response");
    return tryParse(cleaned.slice(start, end + 1));
  }
}

function validateGrant(raw: RawGrant, index: number): string[] {
  const errors: string[] = [];
  if (!raw.title || raw.title.length < 3)
    errors.push(`Grant ${index}: title too short`);
  if (!raw.issuingBody || raw.issuingBody.length < 2)
    errors.push(`Grant ${index}: issuingBody missing`);
  if (
    !["GOVT_GRANT", "SCHOLARSHIP", "RESEARCH_FUND", "INDUSTRY_GRANT"].includes(
      raw.category
    )
  )
    errors.push(`Grant ${index}: invalid category "${raw.category}"`);
  if (!raw.description || raw.description.length < 10)
    errors.push(`Grant ${index}: description too short`);
  if (!raw.deadline)
    errors.push(`Grant ${index}: deadline is required`);
  else if (isNaN(Date.parse(raw.deadline)))
    errors.push(`Grant ${index}: invalid deadline "${raw.deadline}"`);
  if (raw.referenceLink && !isTrustedUrl(raw.referenceLink))
    errors.push(`Grant ${index}: URL not from trusted source "${raw.referenceLink}"`);
  return errors;
}

function normalizeTentative(value: unknown): boolean {
  // Safe direction: anything other than an explicit false counts as tentative.
  return value !== false;
}

function normalizeCategory(
  raw: string
): "GOVT_GRANT" | "SCHOLARSHIP" | "RESEARCH_FUND" | "INDUSTRY_GRANT" {
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (
    ["GOVT_GRANT", "SCHOLARSHIP", "RESEARCH_FUND", "INDUSTRY_GRANT"].includes(
      upper
    )
  )
    return upper as "GOVT_GRANT" | "SCHOLARSHIP" | "RESEARCH_FUND" | "INDUSTRY_GRANT";
  return "GOVT_GRANT";
}

export async function collectMonthlyGrants(): Promise<AutomationResult> {
  const month = getCurrentMonth();
  const errors: string[] = [];
  let grantsFound = 0;
  let grantsPublished = 0;
  let duplicatesSkipped = 0;
  let liveResults = 0;
  let liveQueries = 0;

  // Sweep stale runs first: a run killed after create but before
  // completedAt would otherwise look in-flight forever. Anything unfinished
  // older than 2h is dead (a full run takes minutes). Prior partial errors
  // are preserved, not overwritten.
  const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleRuns = await prisma.automationRun.findMany({
    where: { completedAt: null, startedAt: { lt: staleCutoff } },
    select: { id: true, errors: true },
  });
  for (const stale of staleRuns) {
    let prior: string[] = [];
    try {
      const parsed: unknown = stale.errors ? JSON.parse(stale.errors) : [];
      if (Array.isArray(parsed)) prior = parsed.map(String);
    } catch {
      if (stale.errors) prior = [stale.errors];
    }
    await prisma.automationRun.update({
      where: { id: stale.id },
      data: {
        status: "FAILED",
        errors: JSON.stringify([...prior, "Stale run: process died before completion"]),
        completedAt: new Date(),
      },
    });
  }

  // Idempotency: check if we already ran this month
  const existingRun = await prisma.automationRun.findFirst({
    where: { month, status: { not: "FAILED" } },
  });
  if (existingRun) {
    return {
      month,
      status: "SUCCESS",
      grantsFound: existingRun.grantsFound,
      grantsPublished: existingRun.grantsPublished,
      duplicatesSkipped: existingRun.duplicatesSkipped,
      errors: ["Already ran for this month — skipping."],
      liveResults: 0,
      liveQueries: 0,
    };
  }

  const run = await prisma.automationRun.create({
    data: { month, status: "PARTIAL" },
  });

  // ponytail: the whole pipeline (Tavily search + AI call + store) runs inside
  // one request — fine at this volume (2 runs/month). If a run ever hits route
  // timeouts, upgrade path is enqueue-and-return-202 with a worker, matching
  // the existing email-delivery.ts / sync-erp-attendance.ts drain pattern.
  try {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error("NOT_CONFIGURED: QWEN_API_KEY not configured");
    if (!AI_GATEWAY_URL)
      throw new Error("NOT_CONFIGURED: AI_GATEWAY_URL not configured");
    if (!AI_GATEWAY_MODEL)
      throw new Error("NOT_CONFIGURED: AI_GATEWAY_MODEL not configured");

    // Step 1: live web context via Tavily (open-internet search) — Qwen
    // structures this data, it does not browse the web itself.
    const live = await fetchLiveGrantContext(month);
    liveResults = live.candidates.length;
    liveQueries = live.queriesRun;
    for (const e of live.errors) errors.push(`Tavily: ${e}`);
    console.log(
      `[grants-collector] live context: ${live.candidates.length} results from ${live.queriesRun} queries`
    );

    const prompt = buildPrompt(month, live.candidates.slice(0, 15));

    const response = await fetch(assertAllowedFetchUrl(AI_GATEWAY_URL, "AI gateway"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_GATEWAY_MODEL,
        messages: [{ role: "user", content: prompt }],
        // 10-15 small JSON objects fit comfortably — smaller cap means
        // faster generation, which matters against the gateway's timeout.
        max_tokens: 2048,
      }),
    });

    const data = await readJsonBody(response, "Qwen API error");
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from Qwen API");

    const rawGrants = parseGrantJson(text);
    grantsFound = rawGrants.length;

    // Validate
    const validGrants: RawGrant[] = [];
    for (let i = 0; i < rawGrants.length; i++) {
      const grantErrors = validateGrant(rawGrants[i], i);
      if (grantErrors.length > 0) {
        errors.push(...grantErrors);
      } else {
        validGrants.push(rawGrants[i]);
      }
    }

    // Deduplicate against existing grants for this month
    for (const grant of validGrants) {
      const duplicate = await prisma.grant.findFirst({
        where: {
          month,
          title: { contains: grant.title },
          issuingBody: { contains: grant.issuingBody },
        },
      });

      if (duplicate) {
        duplicatesSkipped++;
        continue;
      }

      // Also check by referenceLink if both are non-null
      if (grant.referenceLink) {
        const linkDuplicate = await prisma.grant.findFirst({
          where: {
            month,
            referenceLink: grant.referenceLink,
          },
        });
        if (linkDuplicate) {
          duplicatesSkipped++;
          continue;
        }
      }

      await prisma.grant.create({
        data: {
          title: grant.title,
          issuingBody: grant.issuingBody,
          category: normalizeCategory(grant.category),
          description: grant.description,
          deadline: new Date(grant.deadline!),
          referenceLink: grant.referenceLink || null,
          isTentative: normalizeTentative(grant.deadlineTentative),
          source: "AUTO",
          month,
          postedById: null,
          isActive: true,
        },
      });
      grantsPublished++;
    }

    const status = errors.length > 0 ? "PARTIAL" : "SUCCESS";

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status,
        grantsFound,
        grantsPublished,
        duplicatesSkipped,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        completedAt: new Date(),
      },
    });

    return {
      month,
      status,
      grantsFound,
      grantsPublished,
      duplicatesSkipped,
      errors,
      liveResults,
      liveQueries,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(errorMsg);

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        grantsFound,
        grantsPublished,
        duplicatesSkipped,
        errors: JSON.stringify(errors),
        completedAt: new Date(),
      },
    });

    return {
      month,
      status: "FAILED",
      grantsFound,
      grantsPublished,
      duplicatesSkipped,
      errors,
      liveResults,
      liveQueries,
    };
  }
}
