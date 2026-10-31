import "server-only";
import { analyzeCertificate } from "./certificate";
import { normalizeDomain } from "./domain";
import { ScanError, toScanError } from "./errors";
import { analyzeHeaders, fetchHeaders } from "./headers";
import { resolvePublicHost } from "./net-guard";
import { checkPqc, checkTlsVersions, probe } from "./tls-probe";
import { computeGrade } from "./grade";
import type { HeaderResult, ScanResult } from "./types";

export { ScanError } from "./errors";

/**
 * Run a full security scan of `input` (any domain-ish string).
 *
 * 1. Validate + normalise the domain and resolve it to a public IP (SSRF guard).
 * 2. Baseline handshake: proves HTTPS is reachable and yields the certificate.
 * 3. In parallel: per-version TLS probes, PQC group probes, HTTP header fetch.
 * 4. Grade everything.
 */
export async function scanDomain(input: unknown): Promise<ScanResult> {
  const started = Date.now();
  const host = normalizeDomain(input);

  let ip: string;
  try {
    ip = await resolvePublicHost(host);
  } catch (err) {
    throw toScanError(err, host);
  }

  const baseline = await probe(ip, host);
  if (!baseline.ok) {
    throw toScanError(Object.assign(new Error(baseline.error), { code: baseline.code }), host);
  }
  if (!baseline.cert?.raw) {
    throw new ScanError(`${host} did not present a certificate.`, "NO_CERTIFICATE", 502);
  }

  const [versions, pqc, headerResponse] = await Promise.all([
    checkTlsVersions(ip, host),
    checkPqc(ip, host),
    // Header failures shouldn't sink the whole scan: report them inline.
    fetchHeaders(host).then(
      (res) => ({ ok: true as const, res }),
      (err: Error) => ({ ok: false as const, error: err.message }),
    ),
  ]);

  const certificate = analyzeCertificate(host, baseline.cert, baseline.authorized, baseline.authorizationError);

  let headers: ScanResult["headers"];
  if (headerResponse.ok) {
    headers = {
      finalUrl: headerResponse.res.url,
      statusCode: headerResponse.res.statusCode,
      items: analyzeHeaders(headerResponse.res),
    };
  } else {
    const unknown = (name: string, short: string): HeaderResult => ({
      name,
      short,
      present: false,
      status: "UNKNOWN",
      note: "HTTP request failed; header could not be checked.",
    });
    headers = {
      finalUrl: `https://${host}/`,
      statusCode: 0,
      error: headerResponse.error,
      items: [
        unknown("Strict-Transport-Security", "HSTS"),
        unknown("Content-Security-Policy", "CSP"),
        unknown("X-Frame-Options", "XFO"),
        unknown("X-Content-Type-Options", "XCTO"),
      ],
    };
  }

  const { grade, score, findings } = computeGrade(versions, pqc, certificate, headers.items);
  if (headers.error) findings.push({ severity: "warning", message: `HTTP header check failed: ${headers.error}` });

  return {
    domain: host,
    ip,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    grade,
    score,
    tls: {
      negotiatedProtocol: baseline.protocol,
      negotiatedCipher: baseline.cipher.standardName ?? baseline.cipher.name,
      versions,
      pqc,
    },
    certificate,
    headers,
    findings,
  };
}
