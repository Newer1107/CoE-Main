/**
 * Server instrumentation hook — runs once at Node.js startup before any
 * request is handled.
 *
 * Forces IPv4-first DNS resolution. The server has no IPv6 connectivity,
 * so Node.js defaulting to IPv6 causes ENETUNREACH on outbound TCP
 * connections (SMTP, etc.).
 *
 * Next.js guarantees `register()` runs at server startup, before any
 * route handler, middleware, or module evaluation.
 */
export function register() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dns = require("node:dns") as typeof import("node:dns");
  dns.setDefaultResultOrder("ipv4first");
}
