import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { CertificateKind, generateCertificatePdf } from './certificates';
import { uploadFileWithObjectKey } from './minio';

const POSITION_LABELS = ['First Position', 'Second Position', 'Third Position'];

const ordinal = (n: number) => POSITION_LABELS[n - 1] ?? `${n}th Position`;

const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const LOGO_PATHS = {
  tcet: path.join(process.cwd(), 'public/tcetlogo.png'),
  coe: path.join(process.cwd(), 'public/coe-logo-v2.jpeg'),
};

type IssueOptions = {
  /** Default true — keep already-issued rows and PDFs (idempotent re-runs). */
  onlyMissing?: boolean;
  /** Restrict issuance to specific users (admin issue-later for missed students). */
  onlyUserIds?: number[];
};

/**
 * Issue certificates for one event from final data:
 *   - ACHIEVEMENT   → members of the TOP 3 teams only (rank from finalScore)
 *   - PARTICIPATION → every other member with at least one PRESENT attendance row
 * Both rules decided with the product owner (2026-08-08).
 *
 * Serial is deterministic (CERT-<year>-<eventId>-<A|P><userId>), so re-runs are
 * idempotent: rows are skipped when they already exist.
 */
export async function issueCertificatesForEvent(
  prisma: PrismaClient,
  eventId: number,
  options: IssueOptions = {}
): Promise<{ created: number; skipped: number }> {
  const onlyMissing = options.onlyMissing ?? true;
  const onlyUserIds = options.onlyUserIds;

  const event = await prisma.hackathonEvent.findUnique({
    where: { id: eventId },
    include: {
      problems: {
        include: {
          claims: {
            include: {
              members: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!event) throw new Error(`Event ${eventId} not found`);

  const claims = event.problems.flatMap((p) =>
    p.claims.map((claim) => ({ claim, problemTitle: p.title }))
  );
  const accepted = claims
    .filter(({ claim }) => claim.status === 'ACCEPTED')
    .sort((a, b) => (b.claim.finalScore ?? 0) - (a.claim.finalScore ?? 0));

  // Only the top 3 teams earn achievement certificates (config-respectable via
  // the event's "Issue certificate on accept" toggle; participation is always issued).
  const issueAchievement = (event.config as { certificates?: { issueOnAccept?: boolean } } | null)
    ?.certificates?.issueOnAccept ?? true;
  const rankByClaim = new Map<number, number>();
  accepted.slice(0, 3).forEach(({ claim }, index) => rankByClaim.set(claim.id, index + 1));

  const claimIds = claims.map(({ claim }) => claim.id);
  const presentRows = await prisma.ticketAttendance.findMany({
    where: { claimId: { in: claimIds }, status: 'PRESENT' },
    select: { claimMemberId: true },
  });
  const presentMemberIds = new Set(presentRows.map((r) => r.claimMemberId));

  let created = 0;
  let skipped = 0;

  for (const { claim, problemTitle } of claims) {
    const rank = rankByClaim.get(claim.id);

    for (const member of claim.members) {
      if (onlyUserIds && !onlyUserIds.includes(member.userId)) continue;
      const rankValue = rank;
      const kind = rankValue && issueAchievement
        ? ('ACHIEVEMENT' as const)
        : presentMemberIds.has(member.id)
          ? ('PARTICIPATION' as const)
          : null;
      if (!kind) continue;

      const detailLines =
        kind === 'ACHIEVEMENT'
          ? [
              { text: `for securing ${ordinal(rankValue as number)} at` },
              { text: event.title, gold: true },
              ...(problemTitle ? [{ text: problemTitle, gold: true } as const] : []),
              { text: `with team ${claim.teamName ?? `Team-${claim.id}`} (score ${claim.finalScore ?? 0}/100)` },
            ]
          : [
              { text: event.title, gold: true },
              ...(problemTitle ? [{ text: problemTitle, gold: true } as const] : []),
              { text: 'for active participation in the event' },
            ];

      const serial = `CERT-${event.endTime.getFullYear()}-${String(event.id).padStart(2, '0')}-${kind[0]}${String(member.userId).padStart(4, '0')}`;

      const existing = onlyMissing
        ? await prisma.certificate.findUnique({ where: { serial } })
        : null;
      if (existing) {
        skipped += 1;
        continue;
      }

      const pdf = await generateCertificatePdf({
        kind,
        studentName: member.user.name,
        eventTitle: event.title,
        detailLines,
        dateLabel: formatDate(event.endTime),
        serial,
        signatureName: 'Principal',
        signaturePath: path.join(process.cwd(), 'public/principal-signature.png'),
        logoPaths: LOGO_PATHS,
      });

      const fileKey = `certificates/${event.id}/${kind}/${serial}.pdf`;
      await uploadFileWithObjectKey(fileKey, {
        buffer: Buffer.from(pdf),
        mimetype: 'application/pdf',
        size: pdf.length,
      });

      await prisma.certificate.create({
        data: {
          userId: member.userId,
          eventId: event.id,
          type: kind,
          title: event.title,
          detail: detailLines.map((l) => l.text).join(' '),
          fileKey,
          serial,
        },
      });
      created += 1;
    }
  }

  return { created, skipped };
}

/**
 * Regenerate one certificate's PDF with a corrected name (admin name-edit fix).
 * The rank/detail are recomputed from final data, so reissue always matches the
 * bulk rules even if judging data changed.
 */
export async function reissueCertificate(
  prisma: PrismaClient,
  certificateId: number,
  nameOverride?: string | null
) {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { event: true, user: { select: { name: true } } },
  });
  if (!certificate) throw new Error('Certificate not found');

  const member = await prisma.claimMember.findFirst({
    where: { userId: certificate.userId, claim: { problem: { eventId: certificate.eventId } } },
    include: { claim: { include: { problem: { select: { title: true } } } } },
  });
  if (!member) throw new Error('Student has no claim in this event');

  const accepted = await prisma.claim.findMany({
    where: { problem: { eventId: certificate.eventId }, status: 'ACCEPTED' },
    orderBy: { finalScore: 'desc' },
    select: { id: true },
  });
  const rank = accepted.findIndex((c) => c.id === member.claimId) + 1;
  const problemTitle = member.claim.problem.title;

  const detailLines =
    certificate.type === 'ACHIEVEMENT'
      ? [
          { text: `for securing ${ordinal(rank)} at` },
          { text: certificate.event.title, gold: true },
          ...(problemTitle ? [{ text: problemTitle, gold: true } as const] : []),
          { text: `with team ${member.claim.teamName ?? `Team-${member.claim.id}`} (score ${member.claim.finalScore ?? 0}/100)` },
        ]
      : [
          { text: certificate.event.title, gold: true },
          ...(problemTitle ? [{ text: problemTitle, gold: true } as const] : []),
          { text: 'for active participation in the event' },
        ];

  const pdf = await generateCertificatePdf({
    kind: certificate.type as CertificateKind,
    studentName: nameOverride?.trim() || certificate.user.name,
    eventTitle: certificate.event.title,
    detailLines,
    dateLabel: formatDate(certificate.event.endTime),
    serial: certificate.serial,
    signatureName: 'Principal',
    signaturePath: path.join(process.cwd(), 'public/principal-signature.png'),
    logoPaths: LOGO_PATHS,
  });

  const fileKey = certificate.fileKey ?? `certificates/${certificate.eventId}/${certificate.type}/${certificate.serial}.pdf`;
  await uploadFileWithObjectKey(fileKey, {
    buffer: Buffer.from(pdf),
    mimetype: 'application/pdf',
    size: pdf.length,
  });

  return prisma.certificate.update({
    where: { id: certificateId },
    data: {
      nameOverride: nameOverride?.trim() || null,
      detail: detailLines.map((l) => l.text).join(' '),
      fileKey,
    },
  });
}
