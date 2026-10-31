import "server-only";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import type { CertificateResult, Status } from "./types";

/** OpenSSL curve names → familiar NIST/display names. */
const CURVE_NAMES: Record<string, { label: string; bits: number }> = {
  prime256v1: { label: "P-256", bits: 256 },
  secp256r1: { label: "P-256", bits: 256 },
  secp384r1: { label: "P-384", bits: 384 },
  secp521r1: { label: "P-521", bits: 521 },
};

/** getPeerCertificate() fields can be string or string[] (multi-valued RDNs). */
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function describeKey(raw: Buffer): { algorithm: string; bits?: number; label: string; status: Status } {
  const key = new X509Certificate(raw).publicKey;
  const details = key.asymmetricKeyDetails ?? {};

  switch (key.asymmetricKeyType) {
    case "rsa":
    case "rsa-pss": {
      const bits = details.modulusLength;
      // NIST SP 800-57: RSA < 2048 is disallowed; 2048 is acceptable; 3072+ is strong.
      const status: Status = !bits || bits < 2048 ? "VULNERABLE" : "SECURE";
      return { algorithm: "RSA", bits, label: `RSA ${bits ?? "?"}`, status };
    }
    case "ec": {
      const curve = CURVE_NAMES[details.namedCurve ?? ""];
      const bits = curve?.bits;
      const status: Status = bits && bits >= 256 ? "SECURE" : "WEAK";
      return { algorithm: "ECDSA", bits, label: `ECDSA ${curve?.label ?? details.namedCurve ?? "unknown curve"}`, status };
    }
    case "ed25519":
      return { algorithm: "Ed25519", bits: 256, label: "Ed25519", status: "SECURE" };
    case "ed448":
      return { algorithm: "Ed448", bits: 456, label: "Ed448", status: "SECURE" };
    default:
      return { algorithm: key.asymmetricKeyType ?? "unknown", label: key.asymmetricKeyType ?? "Unknown", status: "UNKNOWN" };
  }
}

/** Build the certificate report from the leaf cert of the baseline handshake. */
export function analyzeCertificate(
  host: string,
  cert: tls.DetailedPeerCertificate,
  authorized: boolean,
  authorizationError?: string,
): CertificateResult {
  const validTo = new Date(cert.valid_to);
  const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
  const key = describeKey(cert.raw);

  // rejectUnauthorized:false skips the hostname check, so run it explicitly.
  const hostnameMatch = tls.checkServerIdentity(host, cert) === undefined;
  const san = (cert.subjectaltname ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^(DNS|IP Address):/, ""))
    .filter(Boolean);

  let status: Status = "SECURE";
  if (!authorized || !hostnameMatch || daysRemaining < 0) status = "VULNERABLE";
  else if (daysRemaining < 14 || key.status !== "SECURE") status = "WEAK";

  const issuerOrg = first(cert.issuer?.O);
  return {
    subject: first(cert.subject?.CN) ?? san[0] ?? host,
    issuer: first(cert.issuer?.CN) ?? issuerOrg ?? "Unknown",
    issuerOrg,
    validFrom: new Date(cert.valid_from).toISOString(),
    validTo: validTo.toISOString(),
    daysRemaining,
    keyAlgorithm: key.algorithm,
    keyBits: key.bits,
    keyLabel: key.label,
    keyStatus: key.status,
    san,
    trusted: authorized,
    hostnameMatch,
    trustError: authorizationError,
    status,
  };
}
