import { NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveErpUid, encryptErpPassword } from '@/lib/erp-attendance';

const pythonBin = () =>
  process.env.ERP_PYTHON ?? path.join(os.homedir(), '.hermes/venvs/erp/bin/python');
const fetcherPath = () => {
  const p = process.env.ERP_FETCHER;
  return p ? path.resolve(p) : path.join(process.cwd(), 'scripts/erp_fetch.py');
};

/** Live credential check: one fetcher probe with the candidate password.
 *  Exit 0 = ERP accepted it · 3 = rejected · 4 = ERP flaky (retry, don't store). */
function probeErpPassword(uid: string, password: string): Promise<{ ok: boolean; reason: string }> {
  const workdir = `/tmp/erp/probe-${uid}`;
  return new Promise((resolve) => {
    const child = spawn(pythonBin(), [fetcherPath(), 'probe', '--workdir', workdir], {
      env: { ...process.env, ERP_USER: uid, ERP_PW: password },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, reason: 'ERP_TIMEOUT' });
    }, 60_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: `SPAWN_ERROR:${(err as NodeJS.ErrnoException).code ?? 'unknown'}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ ok: true, reason: 'OK' });
      if (code === 3) {
        const msg = stdout.split('\n').find((l) => l.includes('LOGIN FAILED')) ?? 'LOGIN FAILED';
        return resolve({ ok: false, reason: `REJECTED:${msg.slice(0, 120)}` });
      }
      resolve({ ok: false, reason: `ERP_UNAVAILABLE:${code}` });
    });
  });
}

// POST /api/attendance/password — validate against the ERP live, then store
// the password encrypted (AES-256-GCM, key derived from the JWT secret).
export async function POST(req: NextRequest) {
  try {
    if (process.env.ATTENDANCE_ENABLED === 'false') {
      return errorRes('Attendance sync is disabled', [], 403);
    }
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const uid = deriveErpUid(user.email);
    if (!uid) return errorRes('No ERP account linked to this email', [], 400);

    const body = await req.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password.trim() : '';
    if (!password || password.length < 4 || password.length > 100) {
      return errorRes('Validation failed', ['ERP password must be between 4 and 100 characters.'], 400);
    }

    const probe = await probeErpPassword(uid, password);
    if (!probe.ok) {
      if (probe.reason.startsWith('REJECTED')) {
        return errorRes('ERP rejected this password', ['The ERP did not accept this login — check the password.'], 400);
      }
      return errorRes('ERP unreachable', ['Could not reach the ERP to verify — try again in a minute.'], 502);
    }

    const enc = encryptErpPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { erpPasswordEnc: enc },
    });
    return successRes({ saved: true });
  } catch (err) {
    console.error('Attendance password error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
