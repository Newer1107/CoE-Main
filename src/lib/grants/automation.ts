import prisma from "@/lib/prisma";
import { TRUSTED_SOURCES } from "./sources";
import { scrapeGrantSources, type ScrapedCandidate } from "./scraper";

const QWEN_API_URL = "https://ai.tcetcercd.in/v1/chat/completions";

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

const TRUSTED_DOMAINS = TRUSTED_SOURCES.map((s) => {
  try { return normalizeHostname(new URL(s.url).hostname); } catch { return s.url; }
});

function isTrustedUrl(url: string | null): boolean {
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
  scrapedCount: number;
  scrapedPages: number;
};

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildPrompt(currentMonth: string, scraped: ScrapedCandidate[]): string {
  const sourceList = TRUSTED_SOURCES.map(
    (s) => `- ${s.name} (${s.abbreviation}) — ${s.url}`
  ).join("\n");

  const scrapedBlock =
    scraped.length > 0
      ? scraped
          .map(
            (c, i) =>
              `[${i + 1}] ${c.title}\nURL: ${c.url}\nSource page: ${c.sourcePageUrl}\nContext: ${c.snippet}\nDates seen: ${c.dateTexts.join(", ") || "none"}`
          )
          .join("\n\n")
      : "(no live pages could be fetched — use only opportunities you are highly confident are real)";

  return `You are a grant-data extraction assistant for an Indian Engineering & Technology Centre of Excellence.
Today: ${new Date().toISOString().slice(0, 10)}
Target month: ${currentMonth}

Below is LIVE scraped data collected right now from official trusted-source pages. Prefer these over memory. You may also use training knowledge ONLY for well-known recurring programs, and only when highly confident.

SCRAPED CANDIDATES:
${scrapedBlock}

Your job is to select and structure ONLY opportunities that are:
- REAL
- CURRENTLY ACTIVE for the target month
- Relevant to engineering, technology, research, students, researchers, or faculty
- From the trusted organizations/domains provided
- Supported by the scraped data above or by high-confidence knowledge

TRUSTED SOURCES:
${sourceList}

IMPORTANT:
1. Do NOT invent facts, deadlines, or URLs.
2. Do NOT use old/expired opportunities.
3. Every grant MUST have a deadline in YYYY-MM-DD format. Priority: (a) exact date from the scraped context, (b) last day of a month named in the context, (c) last day of the target month as fallback.
4. DEADLINE HONESTY (critical — students plan submissions around these dates): if you use fallback (c), or the opportunity is rolling/year-round, you MUST end the description with exactly one of these sentences: "Deadline shown is tentative — confirm on the official page." or "Applications are accepted year-round; the shown date is a review horizon, not a cutoff — confirm on the official page."
5. For EVERY grant, set deadlineTentative to true if the deadline is a fallback/rolling-horizon date, or false ONLY if you copied an exact published deadline. When in doubt, use true.
6. referenceLink MUST be a URL from the scraped candidates above when available — copy it exactly, never modify paths. Only fall back to a trusted-source homepage when no candidate URL fits.
5. Every URL must start with https://
6. If the official URL is missing or uncertain, EXCLUDE the opportunity.
7. No duplicates. Accuracy > quantity.

Return up to 10-15 of the strongest opportunities. If fewer qualify, return fewer.

Categories: GOVT_GRANT, SCHOLARSHIP, RESEARCH_FUND, INDUSTRY_GRANT

For each selected opportunity return exactly:
{
  "title": "string",
  "issuingBody": "string",
  "category": "GOVT_GRANT | SCHOLARSHIP | RESEARCH_FUND | INDUSTRY_GRANT",
  "description": "2 concise sentences",
  "deadline": "YYYY-MM-DD (never null)",
  "referenceLink": "exact scraped URL or trusted homepage",
  "deadlineTentative": "boolean — true if fallback/rolling-horizon, false only if exact published date"
}

FINAL CHECK: Remove any record with uncertain existence, expired deadline, non-https URL, fabricated path, unsupported claims, or duplicate opportunity.

Return ONLY valid JSON.`;
}

function parseClaudeResponse(text: string): RawGrant[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed;
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
  let scrapedCount = 0;
  let scrapedPages = 0;

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
      scrapedCount: 0,
      scrapedPages: 0,
    };
  }

  const run = await prisma.automationRun.create({
    data: { month, status: "PARTIAL" },
  });

  try {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error("QWEN_API_KEY not configured");

    // Step 1: scrape live official pages — Qwen structures this data,
    // it does not browse the web itself.
    const scraped = await scrapeGrantSources();
    scrapedCount = scraped.candidates.length;
    scrapedPages = scraped.pagesFetched;
    for (const e of scraped.errors) errors.push(`Scraper: ${e}`);
    console.log(
      `[grants-collector] scraped ${scraped.candidates.length} candidates from ${scraped.pagesFetched} pages`
    );

    const prompt = buildPrompt(month, scraped.candidates);

    const response = await fetch(QWEN_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3.6",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Qwen API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from Qwen API");

    const rawGrants = parseClaudeResponse(text);
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
      scrapedCount,
      scrapedPages,
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
      scrapedCount,
      scrapedPages,
    };
  }
}
