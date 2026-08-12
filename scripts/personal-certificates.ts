// One-off: personal certificates for Raunak Singh (Phase 1 & 2, pre-portal events).
// Reuses the exact portal layout from src/lib/certificates.ts.
// Run: npx --yes tsx scripts/personal-certificates.ts
import fs from 'node:fs';
import path from 'node:path';
import { generateCertificatePdf } from '../src/lib/certificates';

const LOGO_PATHS = {
  tcet: path.join(process.cwd(), 'public/tcetlogo.png'),
  coe: path.join(process.cwd(), 'public/coe-logo-v2.jpeg'),
};

const SERIAL = { p1: 'CERT-2026-P1-RAUNAK01', p2: 'CERT-2026-P2-RAUNAK02' };

const certs = [
  {
    kind: 'ACHIEVEMENT' as const,
    file: 'certificate-raunak-phase1.pdf',
    detailLines: [
      { text: 'for successfully organizing', gold: false },
      { text: 'TCET HACKATHON ACADEMY - PHASE 1', gold: true },
      { text: 'held from 10 April to 13 April 2026', gold: false },
    ],
    dateLabel: '13 APRIL 2026',
    serial: SERIAL.p1,
  },
  {
    kind: 'ACHIEVEMENT' as const,
    file: 'certificate-raunak-phase2.pdf',
    detailLines: [
      { text: 'for successfully organizing', gold: false },
      { text: 'TCET HACKATHON ACADEMY - PHASE 2', gold: true },
      { text: 'held from 16 April to 17 April 2026', gold: false },
    ],
    dateLabel: '17 APRIL 2026',
    serial: SERIAL.p2,
  },
];

const outDir = path.join(process.cwd(), 'out-certs');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  for (const c of certs) {
    const bytes = await generateCertificatePdf({
      kind: c.kind,
      studentName: 'Raunak Singh',
      eventTitle: '',
      detailLines: c.detailLines,
      dateLabel: c.dateLabel,
      serial: c.serial,
      signatureName: 'Dr. (Name) Principal',
      signaturePath: path.join(process.cwd(), 'public/principal-signature.png'),
      logoPaths: LOGO_PATHS,
    });
    const p = path.join(outDir, c.file);
    fs.writeFileSync(p, bytes);
    console.log(`wrote ${p} (${bytes.length} bytes)`);
  }
}

main();
