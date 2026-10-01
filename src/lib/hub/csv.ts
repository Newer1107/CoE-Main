import prisma from '@/lib/prisma';
import { opportunityCreateSchema } from '@/lib/validators';
import { normalizeName, clipDbString, fitUrl } from '@/lib/hackathon-hub';

// Google Sheet as lightweight CMS (§24): admins paste a Sheet CSV-export URL
// or upload a CSV file. One row = one hackathon. Never blindly overwrites
// higher-priority verified rows (§31).

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  const push = () => { row.push(current); current = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') push();
    else if (ch === '\n') { push(); rows.push(row); row = []; }
    else if (ch === '\r') { /* skip */ }
    else current += ch;
  }
  push();
  if (row.length > 1 || row[0] !== '') rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
      return obj;
    });
}

const HEADER_ALIASES: Record<string, string> = {
  eventname: 'title', title: 'title', name: 'title',
  organiser: 'organizer', organizer: 'organizer',
  owner: 'organizer',
  registrationdeadline: 'registrationDeadline', deadline: 'registrationDeadline',
  registrationurl: 'applicationUrl', applicationurl: 'applicationUrl', applylink: 'applicationUrl',
  officialurl: 'sourceUrl', sourceurl: 'sourceUrl',
  prizepool: 'prize', prize: 'prize',
  startdate: 'startDate', enddate: 'endDate',
  teammin: 'teamMin', teammax: 'teamMax',
  city: 'city', state: 'state', venue: 'venue', mode: 'mode',
  eligibility: 'eligibility', description: 'description', category: 'category',
  themes: 'themes', domains: 'themes', technologies: 'technologies',
  sourcetype: 'sourceType', eventtype: 'category',
};

function normalizeRow(raw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value) continue;
    const field = HEADER_ALIASES[key] ?? key;
    if (['themes', 'technologies'].includes(field)) {
      out[field] = value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    } else if (['teamMin', 'teamMax'].includes(field)) {
      const n = Number(value);
      if (Number.isInteger(n)) out[field] = n;
    } else {
      out[field] = value;
    }
  }
  if (!out.category) out.category = 'Hackathon';
  if (!out.sourceType) out.sourceType = 'GOOGLE_SHEET';
  return out;
}

export type HubImportResult = {
  total: number;
  inserted: number;
  updated: number;
  rejected: number;
  published: number;
  errors: string[];
};

export async function runCsvImport(
  csvText: string,
  opts: { actorId: number; actorRole: string; origin: 'CSV' | 'SHEET_URL' },
): Promise<HubImportResult> {
  const result: HubImportResult = { total: 0, inserted: 0, updated: 0, rejected: 0, published: 0, errors: [] };
  const rows = parseCsv(csvText);
  result.total = rows.length;
  const autoApprove = opts.actorRole === 'ADMIN';

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2; // header is row 1
    try {
      const parsed = opportunityCreateSchema.safeParse(normalizeRow(rows[i]));
      if (!parsed.success) {
        result.rejected++;
        result.errors.push(`Row ${rowNo}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        continue;
      }
      const data = parsed.data;

      // Duplicate detection (§16): source URL first, then normalized name+organizer+start.
      let existing: { id: number; verificationStatus: string; sourceType: string } | null = null;
      if (data.sourceUrl) {
        existing = await (prisma as any).opportunity.findFirst({ where: { sourceUrl: data.sourceUrl } });
      }
      if (!existing) {
        const rivals = await (prisma as any).opportunity.findMany({
          where: { organizer: data.organizer },
          select: { id: true, title: true, verificationStatus: true, sourceType: true, startDate: true },
          take: 50,
        });
        const needle = normalizeName(data.title);
        existing = rivals.find((r: { title: string }) => normalizeName(r.title) === needle) ?? null;
      }

      const record = {
        title: clipDbString(data.title) as string,
        category: clipDbString(data.category) as string,
        organizer: clipDbString(data.organizer) as string,
        description: data.description || null,
        registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
        eligibility: clipDbString(data.eligibility),
        prize: clipDbString(data.prize),
        themes: data.themes?.length ? data.themes : undefined,
        technologies: data.technologies?.length ? data.technologies : undefined,
        applicationUrl: fitUrl(data.applicationUrl),
        facultyRecommended: data.facultyRecommended ?? false,
        mode: (data as { mode?: string }).mode || null,
        venue: clipDbString((data as { venue?: string }).venue),
        city: clipDbString((data as { city?: string }).city),
        state: clipDbString((data as { state?: string }).state),
        startDate: (data as { startDate?: string }).startDate ? new Date((data as { startDate?: string }).startDate as string) : null,
        endDate: (data as { endDate?: string }).endDate ? new Date((data as { endDate?: string }).endDate as string) : null,
        teamMin: (data as { teamMin?: number }).teamMin ?? null,
        teamMax: (data as { teamMax?: number }).teamMax ?? null,
        sourceUrl: (data.sourceUrl || null) as string | null,
        sourceType: data.sourceType ?? 'GOOGLE_SHEET',
      };

      if (!existing) {
        await (prisma as any).opportunity.create({
          data: {
            ...record,
            status: autoApprove ? 'APPROVED' : 'PENDING',
            verificationStatus: autoApprove ? 'ADMIN_VERIFIED' : 'UNVERIFIED',
            lastVerifiedAt: autoApprove ? new Date() : null,
            // Hub-curated feed: always Hub-visible; category hint as fallback.
            showInHub: true,
            createdById: opts.actorId,
          },
        });
        result.inserted++;
        if (autoApprove) result.published++;
      } else {
        // Conflict guard (§31): never blindly overwrite verified rows from sheet data.
        if (['VERIFIED', 'ADMIN_VERIFIED', 'OFFICIAL_SOURCE'].includes(existing.verificationStatus)) {
          result.rejected++;
          result.errors.push(`Row ${rowNo}: conflicts with verified record #${existing.id} — flagged, not overwritten`);
          continue;
        }
        await (prisma as any).opportunity.update({ where: { id: existing.id }, data: record });
        result.updated++;
      }
    } catch (err) {
      result.rejected++;
      result.errors.push(`Row ${rowNo}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await (prisma as any).hubImportLog.create({
    data: {
      source: opts.origin,
      discovered: result.total,
      inserted: result.inserted,
      updated: result.updated,
      rejected: result.rejected,
      published: result.published,
      errors: result.errors.length > 0 ? result.errors.slice(0, 50) : undefined,
    },
  });

  return result;
}

export async function fetchSheetCsv(sheetUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(sheetUrl, { signal: controller.signal, headers: { Accept: 'text/csv,text/plain' } });
    if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes(',')) throw new Error('Sheet did not return CSV — use File → Share → Publish to web (CSV).');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
