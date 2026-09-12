import { TRUSTED_SOURCES } from "./sources";

export type ScrapedCandidate = {
  sourceName: string;
  sourcePageUrl: string;
  title: string;
  url: string;
  snippet: string;
  dateTexts: string[];
};

export type ScrapeResult = {
  candidates: ScrapedCandidate[];
  pagesFetched: number;
  errors: string[];
};

type SeedPage = {
  sourceName: string;
  pageUrl: string;
};

// ponytail: seed list covers DST + AICTE static pages only. To add a source,
// append one entry here — no other code changes needed. Dynamic/JS-rendered
// pages (e.g. DST call-for-proposals view) yield few links; the pipeline
// falls back to training-data mode and logs it.
const SEED_PAGES: SeedPage[] = [
  { sourceName: "DST", pageUrl: "https://dst.gov.in/call-for-proposals" },
  { sourceName: "DST", pageUrl: "https://dst.gov.in/whatsnew/announcement" },
  {
    sourceName: "DST",
    pageUrl: "https://dst.gov.in/fellowship-opportunities-researchers",
  },
  {
    sourceName: "AICTE",
    pageUrl: "https://www.aicte-india.org/schemes/overview",
  },
  {
    sourceName: "AICTE",
    pageUrl: "https://www.aicte-india.org/schemes/students-development-schemes",
  },
  {
    sourceName: "AICTE",
    pageUrl: "https://www.aicte-india.org/schemes/staff-development-schemes",
  },
];

const FETCH_TIMEOUT_MS = 15000;
const POLITENESS_DELAY_MS = 1500;
const MAX_HTML_CHARS = 1_500_000;
const MAX_CANDIDATES_PER_PAGE = 15;
const MAX_TOTAL_CANDIDATES = 40;
const SNIPPET_CHARS = 300;

const POSITIVE_KEYWORDS =
  /grant|fellowship|scholarship|proposal|call for|scheme|funding|research|award|seed fund|studentship/i;
const JOB_NOISE =
  /advertisement for the post|vacancy|recruitment|assistant law officer|project coordinator|appointment|post of/i;
const GENERIC_NAV =
  /^(schemes?\s*(\/\s*programmes?)?|overview|learn more|read more|more|archive.*|awards?\/prize\/result|call for proposals|what'?s new|announcements?|e newsletter|monthly achievements|.*programmes|overview\s|read more about)/i;

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function trustedHostnames(): string[] {
  const hosts = new Set<string>();
  for (const s of TRUSTED_SOURCES) {
    try {
      hosts.add(normalizeHost(new URL(s.url).hostname));
    } catch {
      /* ignore malformed registry entry */
    }
  }
  for (const p of SEED_PAGES) {
    try {
      hosts.add(normalizeHost(new URL(p.pageUrl).hostname));
    } catch {
      /* ignore */
    }
  }
  return [...hosts];
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isAllowedUrl(url: string): boolean {
  try {
    const host = normalizeHost(new URL(url).hostname);
    return trustedHostnames().some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDates(text: string): string[] {
  const found = new Set<string>();
  const push = (y: string, m: string, d: string) => {
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isNaN(Date.parse(iso))) found.add(iso);
  };

  // DD/MM/YYYY or DD-MM-YYYY
  for (const m of text.matchAll(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g)) {
    push(m[3], m[2], m[1]);
  }
  // "15 June 2026" / "15th June 2026"
  for (const m of text.matchAll(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi
  )) {
    push(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  }
  // "June 15, 2026"
  for (const m of text.matchAll(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi
  )) {
    push(m[3], MONTHS[m[1].toLowerCase()], m[2]);
  }
  // Month-only text like "September 2026" or "Sept 2026" → last day of that month.
  // Accurate to the stated granularity; the AI prompt still requires flagging
  // these as tentative in the description.
  const SHORT_MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };
  for (const m of text.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{4})\b/gi
  )) {
    const key = m[1].toLowerCase();
    const mm = MONTHS[key] || SHORT_MONTHS[key];
    if (!mm) continue;
    const lastDay = new Date(parseInt(m[2], 10), parseInt(mm, 10), 0).getDate();
    push(m[2], mm, String(lastDay));
  }
  return [...found].slice(0, 4);
}

async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TCET-CoE-GrantsBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }
    const text = await res.text();
    return text.slice(0, MAX_HTML_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

function parsePage(
  html: string,
  seed: SeedPage
): ScrapedCandidate[] {
  const out: ScrapedCandidate[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    if (out.length >= MAX_CANDIDATES_PER_PAGE) break;
    const rawHref = match[1].trim();
    if (
      !rawHref ||
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("#")
    ) {
      continue;
    }

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(rawHref, seed.pageUrl).toString().split("#")[0];
    } catch {
      continue;
    }
    if (!absoluteUrl.startsWith("https://")) continue;
    if (!isAllowedUrl(absoluteUrl)) continue;
    if (absoluteUrl.split("?")[0].toLowerCase() === seed.pageUrl.toLowerCase()) {
      continue; // self-link
    }

    const title = stripTags(match[2]).slice(0, 200);
    if (title.length < 10) continue;
    if (GENERIC_NAV.test(title)) continue;
    // Skip stale yearly content (e.g. "Awards 2023")
    const yearMatch = title.match(/\b((?:19|20)\d{2})\b/);
    if (yearMatch && parseInt(yearMatch[1], 10) < new Date().getFullYear() - 1) {
      continue;
    }
    if (!POSITIVE_KEYWORDS.test(title)) continue;
    if (JOB_NOISE.test(title) && !/fellowship|grant|scholarship|scheme|fund/i.test(title)) {
      continue;
    }

    const key = absoluteUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Snippet: plain text surrounding this link in the page
    const pos = match.index;
    const context = stripTags(
      html.slice(Math.max(0, pos - 1500), pos + 1500)
    ).slice(0, SNIPPET_CHARS);

    out.push({
      sourceName: seed.sourceName,
      sourcePageUrl: seed.pageUrl,
      title,
      url: absoluteUrl,
      snippet: context,
      dateTexts: extractDates(context),
    });
  }
  return out;
}

export async function scrapeGrantSources(): Promise<ScrapeResult> {
  const candidates: ScrapedCandidate[] = [];
  const errors: string[] = [];
  let pagesFetched = 0;

  for (const seed of SEED_PAGES) {
    try {
      const html = await fetchPageHtml(seed.pageUrl);
      pagesFetched++;
      // ponytail: 1.5s gap keeps us polite to NIC-hosted servers; ceiling is
      // ~10s total for 6 pages, fine for a monthly job. If the seed list grows
      // past ~20 pages, switch to a small worker pool with the same gap.
      await new Promise((r) => setTimeout(r, POLITENESS_DELAY_MS));
      for (const c of parsePage(html, seed)) {
        if (candidates.length >= MAX_TOTAL_CANDIDATES) break;
        // Deduplicate across pages by URL
        if (!candidates.some((e) => e.url.toLowerCase() === c.url.toLowerCase())) {
          candidates.push(c);
        }
      }
    } catch (err) {
      errors.push(
        `${seed.pageUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { candidates, pagesFetched, errors };
}
