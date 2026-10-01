import prisma from '@/lib/prisma';
import { processEmailQueue } from '@/lib/email-delivery';
import { sendHubAdminAlert, sendHubClosingSoonReminder } from '@/lib/mailer';
import { normalizeContent, sha256 } from './discovery';
import { extractFromHtml } from './extract';
import { IMPORTANT_FIELDS, diffImportant } from './pipeline';

const appBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

async function fetchText(url: string, timeoutMs = 12000): Promise<{ status: number; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TCET-CoE-HubBot/1.0', Accept: 'text/html,application/xhtml+xml' },
    });
    const html = res.ok ? (await res.text()).slice(0, 1_500_000) : '';
    return { status: res.status, html };
  } finally {
    clearTimeout(timer);
  }
}

async function notifyAdmin(kind: string, title: string, detail: string, dedupe: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  try {
    await sendHubAdminAlert(adminEmail, {
      kind, title, detail,
      link: `${appBaseUrl}/admin/hackathons-content`,
    });
    void dedupe;
  } catch (err) {
    console.error(`Hub admin notify failed (${kind}):`, err);
  }
}

// Change detection (§21–22) + broken-link review (§41.4).
export async function runMonitor() {
  const out = { checked: 0, changed: 0, broken: 0, errors: [] as string[] };
  const rows = await (prisma as any).opportunity.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true, title: true, sourceUrl: true, applicationUrl: true, pageHash: true,
      registrationDeadline: true, prize: true, eligibility: true, teamMin: true, teamMax: true,
      venue: true, startDate: true, endDate: true,
    },
    take: 200,
  });

  for (const opp of rows) {
    const watchUrl = opp.sourceUrl || opp.applicationUrl;
    if (!watchUrl) continue;
    out.checked++;
    try {
      const { status, html } = await fetchText(watchUrl);
      if (status === 404) {
        out.broken++;
        await (prisma as any).opportunity.update({
          where: { id: opp.id },
          data: { verificationStatus: 'NEEDS_UPDATE', lastVerifiedAt: new Date() },
        });
        await notifyAdmin('Broken registration link', opp.title, `Source page is unavailable (HTTP 404): ${watchUrl}`, `hub-broken-${opp.id}`);
        continue;
      }
      if (status === 403 || !html) continue; // restricted/unavailable (§19) — log only
      const hash = sha256(normalizeContent(html));
      if (opp.pageHash && hash === opp.pageHash) continue;
      if (!opp.pageHash) {
        await (prisma as any).opportunity.update({ where: { id: opp.id }, data: { pageHash: hash } });
        continue;
      }
      const fresh = extractFromHtml(html, watchUrl, opp.title);
      const diffs = diffImportant(
        {
          registrationDeadline: opp.registrationDeadline, prize: opp.prize, eligibility: opp.eligibility,
          teamMin: opp.teamMin, teamMax: opp.teamMax, venue: opp.venue, startDate: opp.startDate, endDate: opp.endDate,
        },
        {
          registrationDeadline: fresh.registrationDeadline ? new Date(fresh.registrationDeadline) : null,
          prize: fresh.prizePool, eligibility: fresh.eligibility, teamMin: fresh.teamMin, teamMax: fresh.teamMax,
          venue: fresh.venue, startDate: fresh.startDate ? new Date(fresh.startDate) : null,
          endDate: fresh.endDate ? new Date(fresh.endDate) : null,
        },
      );
      await (prisma as any).opportunity.update({ where: { id: opp.id }, data: { pageHash: hash } });
      const important = diffs.filter((d) => (IMPORTANT_FIELDS as readonly string[]).includes(d.field));
      if (important.length > 0) {
        out.changed++;
        await (prisma as any).opportunity.update({
          where: { id: opp.id },
          data: { verificationStatus: 'NEEDS_UPDATE', lastVerifiedAt: new Date() },
        });
        const summary = important.map((d) => `${d.field}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join('; ');
        await notifyAdmin('Event change detected', opp.title, `CHANGE DETECTED — ${summary}`, `hub-change-${opp.id}`);
      }
    } catch (err) {
      out.errors.push(`Opportunity ${opp.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return out;
}

// Closing-soon check (§33, every 6h): remind students who saved the event.
export async function runClosingSoon() {
  const out = { events: 0, reminded: 0, errors: [] as string[] };
  const now = new Date();
  const horizon = new Date(now.getTime() + 2 * 86_400_000);
  const rows = await (prisma as any).opportunity.findMany({
    where: { status: 'APPROVED', registrationDeadline: { gt: now, lte: horizon } },
    select: { id: true, title: true, registrationDeadline: true, applicationUrl: true },
    take: 100,
  });

  for (const opp of rows) {
    try {
      const interests = await (prisma as any).opportunityInterest.findMany({
        where: { opportunityId: opp.id },
        include: { user: { select: { email: true, status: true } } },
        take: 500,
      });
      type InterestRow = { user: { email: string; status: string } };
      const emails = Array.from(
        new Set(
          (interests as InterestRow[])
            .map((i) => i.user)
            .filter((u) => u.status === 'ACTIVE')
            .map((u) => u.email),
        ),
      );
      if (emails.length === 0) continue;
      out.events++;
      const day = now.toISOString().slice(0, 10);
      for (const email of emails) {
        await sendHubClosingSoonReminder(email, {
          eventTitle: opp.title,
          deadline: new Date(opp.registrationDeadline).toISOString(),
          applyUrl: opp.applicationUrl,
          dedupeKey: `hub-closing-${opp.id}-${day}-${email}`,
        });
        out.reminded++;
      }
    } catch (err) {
      out.errors.push(`Opportunity ${opp.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try { await processEmailQueue(50); } catch (err) { console.error('Hub closing-soon queue drain failed:', err); }
  return out;
}
