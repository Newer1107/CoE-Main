import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { runCsvImport, fetchSheetCsv } from '@/lib/hub/csv';

// POST /api/admin/hub/import — CSV text or Google Sheet CSV-export URL (§24, §31)
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json().catch(() => ({}));
    const sheetUrl = typeof body.sheetUrl === 'string' ? body.sheetUrl.trim() : '';
    const csvText = typeof body.csvText === 'string' ? body.csvText : '';
    if (!sheetUrl && !csvText) return errorRes('Validation failed', ['Provide csvText or sheetUrl'], 400);
    if (sheetUrl && !/^https:\/\//.test(sheetUrl)) return errorRes('Validation failed', ['sheetUrl must be https'], 400);

    const text = sheetUrl ? await fetchSheetCsv(sheetUrl) : csvText;
    const result = await runCsvImport(text, {
      actorId: user.id,
      actorRole: user.role,
      origin: sheetUrl ? 'SHEET_URL' : 'CSV',
    });
    return successRes(result, 'Import completed.');
  } catch (err) {
    console.error('Hub import error:', err);
    return errorRes(err instanceof Error ? err.message : 'Import failed', [], 500);
  }
}

// GET /api/admin/hub/import — recent import logs (§24.4)
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);
    const logs = await (prisma as any).hubImportLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    return successRes(logs, 'Import logs retrieved.');
  } catch (err) {
    console.error('Hub import logs error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
