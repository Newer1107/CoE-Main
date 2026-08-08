import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { getPlatformConfig, clearPlatformConfigCache } from '@/lib/platform-config';

type SettingInput = {
  key: string;
  value: unknown;
  group: string;
  label: string;
  description?: string;
};

const parseSettings = (body: unknown): { ok: true; settings: SettingInput[] } | { ok: false; errors: string[] } => {
  if (body == null || typeof body !== 'object') {
    return { ok: false, errors: ['Request body must be a JSON object with a "settings" array'] };
  }
  const settings = (body as { settings?: unknown }).settings;
  if (!Array.isArray(settings) || settings.length === 0) {
    return { ok: false, errors: ['"settings" must be a non-empty array'] };
  }

  const errors: string[] = [];
  const valid: SettingInput[] = [];
  settings.forEach((entry, index) => {
    if (entry == null || typeof entry !== 'object') {
      errors.push(`settings[${index}] must be an object`);
      return;
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.key !== 'string' || item.key.trim().length === 0) {
      errors.push(`settings[${index}].key must be a non-empty string`);
      return;
    }
    if (typeof item.group !== 'string' || item.group.trim().length === 0) {
      errors.push(`settings[${index}].group must be a non-empty string`);
      return;
    }
    if (typeof item.label !== 'string' || item.label.trim().length === 0) {
      errors.push(`settings[${index}].label must be a non-empty string`);
      return;
    }
    if (item.description != null && typeof item.description !== 'string') {
      errors.push(`settings[${index}].description must be a string when provided`);
      return;
    }
    valid.push({
      key: item.key.trim(),
      value: item.value,
      group: item.group.trim(),
      label: item.label.trim(),
      description: typeof item.description === 'string' ? item.description : undefined,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, settings: valid };
};

// GET /api/admin/hackathons-config — full merged platform configuration
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const config = await getPlatformConfig();
    return successRes(config, 'Platform config retrieved.');
  } catch (err) {
    console.error('Get platform config error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/admin/hackathons-config — upsert site_settings overrides
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorRes('Invalid JSON body', [], 400);
    }

    const parsed = parseSettings(body);
    if (!parsed.ok) {
      return errorRes('Validation failed', parsed.errors, 400);
    }

    for (const setting of parsed.settings) {
      await prisma.siteSetting.upsert({
        where: { key: setting.key },
        create: {
          key: setting.key,
          value: setting.value as Prisma.InputJsonValue,
          group: setting.group,
          label: setting.label,
          description: setting.description ?? null,
        },
        update: {
          value: setting.value as Prisma.InputJsonValue,
          group: setting.group,
          label: setting.label,
          description: setting.description ?? null,
        },
      });
    }

    clearPlatformConfigCache();
    const config = await getPlatformConfig();
    return successRes(config, `Saved ${parsed.settings.length} setting(s).`);
  } catch (err) {
    console.error('Update platform config error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
