/**
 * dashboard-sync.ts
 *
 * Reusable service for synchronising users from COE Main to
 * the Project Dashboard.
 *
 * Architecture:
 *   - Fire-and-forget: never blocks the caller, never throws.
 *   - Logs failures to console.error for observability.
 *   - Uses SYNC_SECRET shared secret for endpoint protection.
 *
 * Usage:
 *   import { syncDashboardUser } from '@/lib/dashboard-sync';
 *
 *   // After OTP verification:
 *   await syncDashboardUser({ email, name, role: 'STUDENT', status: 'ACTIVE' });
 *
 *   // After faculty approval:
 *   await syncDashboardUser({ email, name, role: 'FACULTY', status: 'ACTIVE' });
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL;
const SYNC_SECRET = process.env.SYNC_SECRET;

export type SyncUserPayload = {
  email: string;
  name: string | null;
  role: string;
  department?: string | null;
  uid?: string | null;
  status: string;
  isActive?: boolean;
};

/**
 * Sends a user record to the Project Dashboard's internal sync endpoint.
 *
 * - Fire-and-forget: the promise is caught internally.
 * - Never throws to the caller.
 * - Silently skipped if DASHBOARD_URL or SYNC_SECRET is not configured.
 */
export async function syncDashboardUser(user: SyncUserPayload): Promise<void> {
  if (!DASHBOARD_URL || !SYNC_SECRET) {
    console.warn(
      "[dashboard-sync] DASHBOARD_URL or SYNC_SECRET not configured — skipping sync for",
      user.email
    );
    return;
  }

  const url = `${DASHBOARD_URL.replace(/\/+$/, "")}/api/internal/users/upsert`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": SYNC_SECRET,
      },
      body: JSON.stringify({
        email: user.email,
        name: user.name || undefined,
        role: user.role,
        department: user.department ?? null,
        uid: user.uid ?? null,
        status: user.status,
        isActive: user.isActive ?? true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "no body");
      console.error(
        `[dashboard-sync] Failed (${response.status}) for ${user.email}: ${body}`
      );
      return;
    }

    const result = await response.json().catch(() => null);
    if (result?.success) {
      console.log(`[dashboard-sync] Synced ${user.email} -> dashboard uid=${result.data?.id ?? "skipped"}`);
    }
  } catch (err) {
    // Fire-and-forget: log but never throw
    console.error(`[dashboard-sync] Network error for ${user.email}:`, err);
  }
}
