import "server-only";
import http from "node:http";
import https from "node:https";
import { safeLookup } from "./net-guard";
import { PROBE_TIMEOUT_MS } from "./tls-probe";
import type { HeaderResult, Status } from "./types";

const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; SecureScan/1.0)";

interface RawResponse {
  url: string;
  statusCode: number;
  headers: http.IncomingHttpHeaders;
}

/** Issue one GET, return status + headers, and abort before downloading the body. */
function requestOnce(url: URL): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: safeLookup, // SSRF guard on every hop
        rejectUnauthorized: false, // cert problems are reported by the TLS checks instead
        timeout: PROBE_TIMEOUT_MS,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      },
      (res) => {
        resolve({ url: url.toString(), statusCode: res.statusCode ?? 0, headers: res.headers });
        res.destroy();
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("HTTP request timed out"), { code: "TIMEOUT" })));
    req.on("error", reject);
    req.end();
  });
}

/** Follow up to MAX_REDIRECTS redirects (http/https only) and return the final response. */
export async function fetchHeaders(host: string): Promise<RawResponse> {
  let url = new URL(`https://${host}/`);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(url);
    const location = res.headers.location;
    if (res.statusCode >= 300 && res.statusCode < 400 && location) {
      const next = new URL(location, url);
      if (next.protocol !== "https:" && next.protocol !== "http:") break;
      url = next;
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

function get(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v.join(", ") : v;
}

/** Evaluate the four critical headers. Each result carries a verdict and an explanation. */
export function analyzeHeaders(res: RawResponse): HeaderResult[] {
  const h = res.headers;
  const overHttps = res.url.startsWith("https:");

  // --- Strict-Transport-Security -------------------------------------------
  const hsts = get(h, "strict-transport-security");
  let hstsResult: HeaderResult;
  if (!hsts || !overHttps) {
    hstsResult = {
      name: "Strict-Transport-Security",
      short: "HSTS",
      present: false,
      status: "MISSING",
      note: overHttps ? "Browsers may be downgraded to plain HTTP." : "Site ends on plain HTTP, so HSTS cannot apply.",
    };
  } else {
    const maxAge = Number(hsts.match(/max-age\s*=\s*"?(\d+)/i)?.[1] ?? 0);
    const sub = /includesubdomains/i.test(hsts);
    const preload = /preload/i.test(hsts);
    // 180 days is the common minimum; HSTS preload requires 1 year.
    const status: Status = maxAge >= 15_552_000 ? "SECURE" : "WEAK";
    const days = Math.round(maxAge / 86_400);
    hstsResult = {
      name: "Strict-Transport-Security",
      short: "HSTS",
      present: true,
      value: hsts,
      status,
      note:
        status === "SECURE"
          ? `max-age ${days} days${sub ? ", includeSubDomains" : ""}${preload ? ", preload" : ""}.`
          : `max-age is only ${days} days; use at least 180 days (31536000s recommended).`,
    };
  }

  // --- Content-Security-Policy ---------------------------------------------
  const csp = get(h, "content-security-policy");
  let cspResult: HeaderResult;
  if (!csp) {
    const ro = get(h, "content-security-policy-report-only");
    cspResult = {
      name: "Content-Security-Policy",
      short: "CSP",
      present: false,
      value: ro,
      status: "MISSING",
      note: ro ? "Only a Report-Only policy is set; it does not block anything." : "No defence-in-depth against XSS and injection.",
    };
  } else {
    // Effective script policy: script-src, falling back to default-src.
    const directive = (d: string) => csp.match(new RegExp(`(?:^|;)\\s*${d}\\s+([^;]*)`, "i"))?.[1];
    const scriptSrc = directive("script-src") ?? directive("default-src") ?? "";
    const hasNonceOrHash = /'nonce-|'sha(256|384|512)-|'strict-dynamic'/i.test(scriptSrc);
    const issues: string[] = [];
    if (!scriptSrc) issues.push("no script-src/default-src");
    if (/'unsafe-inline'/i.test(scriptSrc) && !hasNonceOrHash) issues.push("'unsafe-inline' scripts");
    if (/'unsafe-eval'/i.test(scriptSrc)) issues.push("'unsafe-eval'");
    if (/(^|\s)(\*|https?:)(\s|$)/i.test(scriptSrc)) issues.push("wildcard script sources");
    cspResult = {
      name: "Content-Security-Policy",
      short: "CSP",
      present: true,
      value: csp,
      status: issues.length ? "WEAK" : "SECURE",
      note: issues.length ? `Policy allows ${issues.join(", ")}.` : "Script sources are restricted.",
    };
  }

  // --- X-Frame-Options (or CSP frame-ancestors) ----------------------------
  const xfo = get(h, "x-frame-options");
  const frameAncestors = csp?.match(/frame-ancestors\s+([^;]*)/i)?.[1];
  let xfoResult: HeaderResult;
  if (xfo && /^(deny|sameorigin)$/i.test(xfo.trim())) {
    xfoResult = { name: "X-Frame-Options", short: "XFO", present: true, value: xfo, status: "SECURE", note: "Clickjacking protection enabled." };
  } else if (frameAncestors && !/(^|\s)\*(\s|$)/.test(frameAncestors)) {
    xfoResult = {
      name: "X-Frame-Options",
      short: "XFO",
      present: false,
      value: `frame-ancestors ${frameAncestors}`,
      status: "SECURE",
      note: "Covered by CSP frame-ancestors (the modern replacement).",
    };
  } else {
    xfoResult = {
      name: "X-Frame-Options",
      short: "XFO",
      present: !!xfo,
      value: xfo,
      status: xfo ? "WEAK" : "MISSING",
      note: xfo ? `Unrecognised value; use DENY or SAMEORIGIN.` : "Page can be framed by any site (clickjacking).",
    };
  }

  // --- X-Content-Type-Options ----------------------------------------------
  const xcto = get(h, "x-content-type-options");
  const xctoResult: HeaderResult =
    xcto && xcto.trim().toLowerCase() === "nosniff"
      ? { name: "X-Content-Type-Options", short: "XCTO", present: true, value: xcto, status: "SECURE", note: "MIME sniffing disabled." }
      : {
          name: "X-Content-Type-Options",
          short: "XCTO",
          present: !!xcto,
          value: xcto,
          status: xcto ? "WEAK" : "MISSING",
          note: xcto ? "Value must be exactly 'nosniff'." : "Browsers may MIME-sniff responses into executable types.",
        };

  return [hstsResult, cspResult, xfoResult, xctoResult];
}
