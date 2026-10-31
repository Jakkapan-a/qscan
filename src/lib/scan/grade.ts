import type { CertificateResult, Finding, Grade, HeaderResult, PqcResult, TlsVersionResult } from "./types";

/**
 * Scoring model (inspired by SSL Labs / securityheaders.com):
 *
 *   Start at 100, subtract penalties, add a small PQC bonus, then apply
 *   hard caps for issues that are serious regardless of everything else.
 *
 *   A+  score >= 95, no legacy TLS, TLS 1.3, strong HSTS
 *   A   score >= 85
 *   B   score >= 70   (also the cap when TLS 1.0/1.1 is enabled)
 *   C   score >= 50   (also the cap for weak keys)
 *   F   below 50, or untrusted/expired/mismatched cert, or no TLS 1.2+
 */
export function computeGrade(
  versions: TlsVersionResult[],
  pqc: PqcResult,
  cert: CertificateResult,
  headers: HeaderResult[],
): { grade: Grade; score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 100;
  let cap: Grade = "A+";

  const capAt = (g: Grade) => {
    const order: Grade[] = ["F", "C", "B", "A", "A+"];
    if (order.indexOf(g) < order.indexOf(cap)) cap = g;
  };
  const supports = (id: TlsVersionResult["id"]) => versions.find((v) => v.id === id)?.supported ?? false;

  // ---- Protocols ------------------------------------------------------------
  if (supports("TLSv1")) {
    score -= 15;
    capAt("B");
    findings.push({ severity: "critical", message: "TLS 1.0 is enabled (deprecated by RFC 8996, vulnerable to BEAST/POODLE-class attacks)." });
  }
  if (supports("TLSv1.1")) {
    score -= 10;
    capAt("B");
    findings.push({ severity: "critical", message: "TLS 1.1 is enabled (deprecated by RFC 8996)." });
  }
  if (!supports("TLSv1.3")) {
    score -= 10;
    capAt("A");
    findings.push({ severity: "warning", message: "TLS 1.3 is not supported." });
  } else {
    findings.push({ severity: "good", message: "TLS 1.3 is supported." });
  }
  if (!supports("TLSv1.2") && !supports("TLSv1.3")) {
    capAt("F");
    findings.push({ severity: "critical", message: "Neither TLS 1.2 nor TLS 1.3 is supported." });
  }

  // ---- Post-quantum ---------------------------------------------------------
  if (pqc.supported === true) {
    score += 5;
    const names = pqc.groups.filter((g) => g.supported).map((g) => g.name).join(", ");
    findings.push({ severity: "good", message: `Post-quantum key exchange supported (${names}).` });
  } else if (pqc.supported === false) {
    findings.push({ severity: "info", message: "No ML-KEM hybrid key exchange; traffic is exposed to harvest-now-decrypt-later attacks." });
  }

  // ---- Certificate ----------------------------------------------------------
  if (!cert.trusted) {
    capAt("F");
    findings.push({ severity: "critical", message: `Certificate is not trusted: ${cert.trustError ?? "chain validation failed"}.` });
  }
  if (!cert.hostnameMatch) {
    capAt("F");
    findings.push({ severity: "critical", message: "Certificate does not cover the scanned hostname." });
  }
  if (cert.daysRemaining < 0) {
    capAt("F");
    findings.push({ severity: "critical", message: `Certificate expired ${-cert.daysRemaining} days ago.` });
  } else if (cert.daysRemaining < 14) {
    score -= 10;
    findings.push({ severity: "warning", message: `Certificate expires in ${cert.daysRemaining} days.` });
  }
  if (cert.keyStatus === "VULNERABLE" || cert.keyStatus === "WEAK") {
    score -= 30;
    capAt("C");
    findings.push({ severity: "critical", message: `Weak certificate key (${cert.keyLabel}).` });
  }

  // ---- Headers --------------------------------------------------------------
  const penalties: Record<string, { missing: number; weak: number }> = {
    HSTS: { missing: 15, weak: 5 },
    CSP: { missing: 10, weak: 5 },
    XFO: { missing: 5, weak: 3 },
    XCTO: { missing: 5, weak: 3 },
  };
  for (const h of headers) {
    const p = penalties[h.short];
    if (!p) continue;
    if (h.status === "MISSING") {
      score -= p.missing;
      findings.push({ severity: h.short === "HSTS" ? "critical" : "warning", message: `${h.name} header is missing.` });
    } else if (h.status === "WEAK") {
      score -= p.weak;
      findings.push({ severity: "warning", message: `${h.name}: ${h.note}` });
    }
  }
  if (headers.find((h) => h.short === "HSTS")?.status !== "SECURE") capAt("A");

  score = Math.max(0, Math.min(100, score));

  let grade: Grade = score >= 95 ? "A+" : score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "F";
  const order: Grade[] = ["F", "C", "B", "A", "A+"];
  if (order.indexOf(grade) > order.indexOf(cap)) grade = cap;

  // Most severe first so the UI can show the important items at the top.
  const rank = { critical: 0, warning: 1, info: 2, good: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return { grade, score, findings };
}
