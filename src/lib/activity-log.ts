type ActivityContext = Record<string, unknown>;

export function logActivity(event: string, context: ActivityContext = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...context,
  };

  console.log(`[ACTIVITY] ${JSON.stringify(payload)}`);
}
