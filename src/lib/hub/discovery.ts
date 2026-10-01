import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { clipDbString } from '@/lib/hackathon-hub';
import { ensureHubSources } from './sources';

const FETCH_TIMEOUT_MS = 15000;
const POLITENESS_DELAY_MS = 1500;
const MAX_HTML_CHARS = 1_500_000;
const MAX_CANDIDATES_PER_PAGE = 20;

const HACKATHON_KEYWORDS =
  /hackathon|hackfest|codefest|ideathon|datathon|competition|challenge|contest/i;
const NOISE =
  /job|recruitment|vacancy|admission|result|merit list|tender|auction/i;
// Listing/nav pages, not events (e.g. "Explore hackathons", "Organize a hackathon").
export const LISTING_TITLES =
  /^(explore|organize|organise|all|upcoming|past|open|find|browse|discover|host)\b[\w\s|–-]*hackathons?\b[\w\s|–-]*$/i;

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function normalizeContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString().slice(0, 512);
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TCET-CoE-HubBot/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }
    return (await res.text()).slice(0, MAX_HTML_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

export type DiscoveredLink = { url: string; title: string };

export function extractEventLinks(html: string, base: string): DiscoveredLink[] {
  const out: DiscoveredLink[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    if (out.length >= MAX_CANDIDATES_PER_PAGE) break;
    const url = normalizeUrl(match[1].trim(), base);
    if (!url || !url.startsWith('https://')) continue;
    try {
      const parsed = new URL(url);
      const baseParsed = new URL(base);
      if (parsed.origin === baseParsed.origin && parsed.pathname.replace(/\/$/, '') === '') continue; // site self-link
      if (/^\/(submit|login|signup|signin|organise|organize|contact|about)/i.test(parsed.pathname)) continue; // forms, not events
    } catch {
      continue;
    }
    const title = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (title.length < 8 || !HACKATHON_KEYWORDS.test(title) || NOISE.test(title)) continue;
    if (LISTING_TITLES.test(title)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, title });
  }
  return out;
}

export type DiscoveryResult = {
  pagesFetched: number;
  discovered: number;
  errors: string[];
};

// Sitemap discovery: a sitemap.xml is a machine-readable index of a site's
// pages — one fetch yields every event URL, no HTML parsing. Preferred over
// page crawling wherever a source publishes one.
// ponytail: currently wired for indiahackathons only; upgrade path is a
// per-source sitemap column on HubSource instead of the key check below.
export async function discoverFromSitemap(
  sitemapUrl: string,
  sourceKey: string,
  sourceType: string,
  pathFilter: RegExp,
): Promise<{ discovered: number; error: string | null }> {
  let discovered = 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let xml = '';
    try {
      const res = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TCET-CoE-HubBot/1.0', Accept: 'application/xml,text/xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
    } finally {
      clearTimeout(timer);
    }
    const seen = new Set<string>();
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = match[1].trim().slice(0, 512);
      if (!url.startsWith('https://') || !pathFilter.test(url) || seen.has(url.toLowerCase())) continue;
      seen.add(url.toLowerCase());
      const existing = await (prisma as any).hubCandidate.findUnique({ where: { url } });
      if (existing) continue;
      const slug = url.split('/').filter(Boolean).pop() ?? url;
      await (prisma as any).hubCandidate.create({
        data: {
          url,
          source: sourceKey,
          sourceType,
          status: 'DISCOVERED',
          title: clipDbString(slug.replace(/[-_]+/g, ' ').replace(/\?.*$/, ''), 191) ?? url.slice(0, 191),
        },
      });
      discovered++;
    }
    return { discovered, error: null };
  } catch (err) {
    return { discovered, error: `${sourceKey} sitemap: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function runDiscovery(): Promise<DiscoveryResult> {
  await ensureHubSources();
  const errors: string[] = [];
  let pagesFetched = 0;
  let discovered = 0;

  const sources = await (prisma as any).hubSource.findMany({
    where: { enabled: true, method: { in: ['PAGE', 'RSS', 'API'] } },
  });

  // Sitemap-first for sources that publish one (complete coverage, 1 fetch).
  // Runs only while the source stays enabled (toggle in Hub Sources).
  const ihEnabled = sources.some((s: { key: string }) => s.key === 'indiahackathons');
  if (ihEnabled) {
    const sitemap = await discoverFromSitemap(
      'https://indiahackathons.com/sitemap.xml',
      'indiahackathons',
      'INDIAHACKATHONS',
      /^https:\/\/indiahackathons\.com\/events\//,
    );
    discovered += sitemap.discovered;
    if (sitemap.error) errors.push(sitemap.error);
  }

  for (const source of sources) {
    const seedUrl = (source as { key: string }).key
      ? seedUrlFor(source.key as string)
      : null;
    if (!seedUrl) continue;
    try {
      const html = await fetchHtml(seedUrl);
      pagesFetched++;
      await new Promise((r) => setTimeout(r, POLITENESS_DELAY_MS));
      const hash = sha256(normalizeContent(html));
      for (const link of extractEventLinks(html, seedUrl)) {
        const existing = await (prisma as any).hubCandidate.findUnique({ where: { url: link.url } });
        if (existing) continue;
        await (prisma as any).hubCandidate.create({
          data: {
            url: link.url,
            source: source.key,
            sourceType: sourceTypeFor(source.key),
            status: 'DISCOVERED',
            title: clipDbString(link.title, 191) ?? link.url.slice(0, 191),
            pageHash: hash,
          },
        });
        discovered++;
      }
      await (prisma as any).hubSource.update({
        where: { key: source.key },
        data: { lastRunAt: new Date(), lastError: null },
      });
    } catch (err) {
      const msg = `${source.key}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await (prisma as any).hubSource.update({
        where: { key: source.key },
        data: { lastRunAt: new Date(), lastError: msg.slice(0, 1900) },
      });
    }
  }

  await (prisma as any).hubImportLog.create({
    data: { source: 'DISCOVERY', discovered, inserted: discovered, errors: errors.length > 0 ? errors : undefined },
  });

  return { pagesFetched, discovered, errors };
}

function seedUrlFor(key: string): string | null {
  const map: Record<string, string> = {
    government: 'https://www.mygov.in/',
    devfolio: 'https://devfolio.co/hackathons',
    unstop: 'https://unstop.com/hackathons',
    hackerearth: 'https://www.hackerearth.com/challenges/hackathon/',
    hack2skill: 'https://hack2skill.com/hackathons',
    mlh: 'https://mlh.io/events',
    indiahackathons: 'https://indiahackathons.com/',
  };
  return map[key] ?? null;
}

function sourceTypeFor(key: string): string {
  const map: Record<string, string> = {
    devfolio: 'DEVFOLIO',
    unstop: 'UNSTOP',
    hackerearth: 'HACKEREARTH',
    hack2skill: 'HACK2SKILL',
    mlh: 'MLH',
    indiahackathons: 'INDIAHACKATHONS',
    government: 'GOVERNMENT',
    college: 'COLLEGE_WEBSITE',
  };
  return map[key] ?? 'OTHER';
}
