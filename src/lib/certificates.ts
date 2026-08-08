import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Stitch institutional palette
const NAVY = rgb(0, 0.13, 0.33);
const NAVY_MID = rgb(0.1, 0.26, 0.56);
const GOLD = rgb(0.78, 0.56, 0.16);
const GOLD_SOFT = rgb(0.85, 0.75, 0.54);
const INK = rgb(0.26, 0.27, 0.31);
const MUTED = rgb(0.45, 0.46, 0.51);
const CREAM = rgb(0.98, 0.976, 0.965);
const PAPER = rgb(0.93, 0.92, 0.88);
const ORG_GOLD = rgb(0.55, 0.31, 0);

export type CertificateKind = 'ACHIEVEMENT' | 'PARTICIPATION';

const KIND_TITLE: Record<CertificateKind, string> = {
  ACHIEVEMENT: 'CERTIFICATE OF ACHIEVEMENT',
  PARTICIPATION: 'CERTIFICATE OF PARTICIPATION',
};

const W = 842;
const H = 595;

const drawCentered = (
  page: any,
  font: any,
  text: string,
  size: number,
  y: number,
  color: any,
  opacity = 1
) => {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (W - width) / 2,
    y,
    size,
    font,
    color,
    opacity,
  });
};

/** pdf-lib standard fonts are WinAnsi-only — strip/transliterate anything else
 *  so a non-Latin student name (Devanagari, emoji, …) can never crash issuance. */
const toWinAnsi = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\xFF]/g, '?');

export async function generateCertificatePdf(params: {
  kind: CertificateKind;
  studentName: string;
  eventTitle: string;
  detailLines: { text: string; gold?: boolean }[];
  dateLabel: string;
  serial: string;
  signatureName: string;
  signaturePath?: string;
  logoPaths: { tcet: string; coe: string };
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  // Paper background with soft radial vignette (approximated with two rects)
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER, opacity: 0.25 });

  // Frames: outer navy, gold keyline, inner hairline
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: NAVY, borderWidth: 2, color: undefined });
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: GOLD, borderWidth: 1, color: undefined });
  page.drawRectangle({ x: 38, y: 38, width: W - 76, height: H - 76, borderColor: GOLD_SOFT, borderWidth: 0.5, color: undefined });

  // Corner filigree (double L + gold dot)
  const corner = (cx: number, cy: number, sx: number, sy: number) => {
    const o = 40;
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + sx * o, y: cy }, thickness: 1.6, color: GOLD });
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + sy * o }, thickness: 1.6, color: GOLD });
    page.drawLine({ start: { x: cx + sx * 10, y: cy }, end: { x: cx + sx * o, y: cy }, thickness: 0.6, color: GOLD, opacity: 0.6 });
    page.drawLine({ start: { x: cx, y: cy + sy * 10 }, end: { x: cx, y: cy + sy * o }, thickness: 0.6, color: GOLD, opacity: 0.6 });
    page.drawCircle({ x: cx, y: cy, size: 2.2, color: GOLD });
    page.drawCircle({ x: cx + sx * o, y: cy, size: 1.4, color: GOLD });
    page.drawCircle({ x: cx, y: cy + sy * o, size: 1.4, color: GOLD });
  };
  corner(40, 40, 1, 1);
  corner(W - 40, 40, -1, 1);
  corner(40, H - 40, 1, -1);
  corner(W - 40, H - 40, -1, -1);

  // Watermark monogram
  drawCentered(page, timesBold, 'TCET', 150, 240, NAVY, 0.035);

  // Logos (TCET logo is a WebP with a .png extension — convert via sharp when needed)
  if (fs.existsSync(params.logoPaths.tcet)) {
    let buf = fs.readFileSync(params.logoPaths.tcet);
    if (!buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
      const { default: sharp } = await import('sharp');
      buf = Buffer.from(await sharp(buf).png().toBuffer());
    }
    const png = await pdf.embedPng(buf);
    page.drawImage(png, { x: 72, y: H - 118, width: 58, height: 58 });
  }
  if (fs.existsSync(params.logoPaths.coe)) {
    const jpg = await pdf.embedJpg(fs.readFileSync(params.logoPaths.coe));
    page.drawImage(jpg, { x: W - 130, y: H - 118, width: 58, height: 58 });
  }

  // Org header
  drawCentered(page, timesBold, toWinAnsi('THAKUR COLLEGE OF ENGINEERING & TECHNOLOGY'), 13, 452, ORG_GOLD);
  drawCentered(page, times, toWinAnsi('Centre of Excellence for Research Culture & Development'), 10, 436, MUTED);

  // Title + flourish
  drawCentered(page, timesBold, KIND_TITLE[params.kind], 27, 400, NAVY_MID);
  const fx = (W - 220) / 2;
  page.drawLine({ start: { x: fx, y: 380 }, end: { x: fx + 88, y: 380 }, thickness: 0.8, color: GOLD });
  page.drawLine({ start: { x: fx + 132, y: 380 }, end: { x: fx + 220, y: 380 }, thickness: 0.8, color: GOLD });
  page.drawLine({ start: { x: fx + 92, y: 380 }, end: { x: fx + 110, y: 370 }, thickness: 1, color: GOLD });
  page.drawLine({ start: { x: fx + 110, y: 370 }, end: { x: fx + 128, y: 380 }, thickness: 1, color: GOLD });
  page.drawCircle({ x: fx + 110, y: 380, size: 1.2, color: CREAM });

  // Presented to
  drawCentered(page, times, toWinAnsi('This certificate is proudly presented to'), 13, 352, INK);
  drawCentered(page, timesItalic, toWinAnsi(params.studentName), 33, 316, NAVY);

  // Name underline with gold diamond (drawn — ◆ isn't in WinAnsi)
  const nu = (W - 320) / 2;
  page.drawLine({ start: { x: nu, y: 306 }, end: { x: nu + 320, y: 306 }, thickness: 0.8, color: GOLD });
  const dx = W / 2;
  page.drawLine({ start: { x: dx - 5, y: 306 }, end: { x: dx, y: 300 }, thickness: 1, color: GOLD });
  page.drawLine({ start: { x: dx, y: 300 }, end: { x: dx + 5, y: 306 }, thickness: 1, color: GOLD });

  // Detail lines (event in gold bold)
  let dy = 272;
  for (const line of params.detailLines) {
    drawCentered(page, line.gold ? timesBold : times, toWinAnsi(line.text), 12, dy, line.gold ? ORG_GOLD : INK);
    dy -= 17;
  }

  // Date
  drawCentered(page, times, toWinAnsi(`ISSUED ON ${params.dateLabel.toUpperCase()}`), 9, dy - 6, MUTED);

  // Signature block (single, centered)
  const sy = 78;
  if (params.signaturePath && fs.existsSync(params.signaturePath)) {
    const sigPng = await pdf.embedPng(fs.readFileSync(params.signaturePath));
    const sigW = 170;
    const sigH = (sigPng.height / sigPng.width) * sigW;
    page.drawImage(sigPng, { x: (W - sigW) / 2, y: sy + 4, width: sigW, height: sigH });
  } else {
    drawCentered(page, timesItalic, toWinAnsi(params.signatureName), 15, sy + 22, NAVY);
  }
  page.drawLine({ start: { x: W / 2 - 125, y: sy }, end: { x: W / 2 + 125, y: sy }, thickness: 0.8, color: INK });
  drawCentered(page, timesBold, 'PRINCIPAL', 9, sy - 12, INK);
  drawCentered(page, times, toWinAnsi('Thakur College of Engineering & Technology'), 8, sy - 24, MUTED);

  // Serial + verification
  page.drawText(toWinAnsi(params.serial), { x: 56, y: 34, size: 8, font: times, color: MUTED });
  page.drawText('Verify authenticity at tcetcercd.in', { x: W - 250, y: 34, size: 8, font: times, color: MUTED });

  return pdf.save();
}
