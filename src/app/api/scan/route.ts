import { scanDomain, ScanError } from "@/lib/scan";
import type { ScanErrorBody } from "@/lib/scan/types";

/**
 * POST /api/scan   body: { "domain": "example.com" }
 *
 * Note: with `cacheComponents` enabled, route handlers always run on the
 * Node.js runtime and must not export `runtime`/`dynamic`. POST handlers
 * are never cached, so every request performs a live scan.
 */

// A scan is ~9 handshakes in parallel with 8s timeouts; leave headroom.
export const maxDuration = 30;

// --- Simple in-memory rate limiter ------------------------------------------
// Good enough for a single instance. Use Redis/Upstash etc. when scaling out.
const WINDOW_MS = 60_000;
const MAX_SCANS_PER_WINDOW = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = hits.get(clientIp);
  if (!entry || entry.resetAt < now) {
    hits.set(clientIp, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistic cleanup so the map can't grow without bound.
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    return false;
  }
  entry.count++;
  return entry.count > MAX_SCANS_PER_WINDOW;
}

function errorResponse(message: string, code: string, status: number) {
  return Response.json({ error: message, code } satisfies ScanErrorBody, { status });
}

export async function POST(request: Request) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(clientIp)) {
    return errorResponse("Too many scans. Please wait a minute and try again.", "RATE_LIMITED", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be JSON: { \"domain\": \"example.com\" }", "BAD_REQUEST", 400);
  }

  try {
    const result = await scanDomain((body as { domain?: unknown })?.domain);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ScanError) return errorResponse(err.message, err.code, err.status);
    console.error("[scan] unexpected error", err);
    return errorResponse("Unexpected scanner error. Please try again.", "INTERNAL", 500);
  }
}
