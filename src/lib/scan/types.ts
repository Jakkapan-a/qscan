/**
 * Shared types for the SecureScan engine and UI.
 * This file is imported by both server (API route) and client components,
 * so it must stay free of Node.js-only imports.
 */

/** Visual verdict shown as a badge next to every scanned item. */
export type Status = "SECURE" | "WEAK" | "MISSING" | "VULNERABLE" | "INFO" | "UNKNOWN";

export type Grade = "A+" | "A" | "B" | "C" | "F";

export type TlsVersionId = "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3";

export interface TlsVersionResult {
  id: TlsVersionId;
  /** Human-friendly label, e.g. "TLS 1.2". */
  label: string;
  supported: boolean;
  /** Cipher suite negotiated when probing this version only. */
  cipher?: string;
  status: Status;
  note?: string;
}

export interface PqcGroupResult {
  /** OpenSSL group name, e.g. "X25519MLKEM768". */
  name: string;
  /** null = the scanner itself could not test this group. */
  supported: boolean | null;
  note?: string;
}

export interface PqcResult {
  /** true when at least one ML-KEM hybrid/pure group was negotiated. */
  supported: boolean | null;
  groups: PqcGroupResult[];
  status: Status;
}

export interface CertificateResult {
  subject: string;
  issuer: string;
  issuerOrg?: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  /** "RSA", "ECDSA", "Ed25519", ... */
  keyAlgorithm: string;
  /** Key size in bits (modulus length for RSA, curve size for EC). */
  keyBits?: number;
  /** Display label, e.g. "RSA 2048" or "ECDSA P-256". */
  keyLabel: string;
  keyStatus: Status;
  san: string[];
  /** Chain validates against Node's bundled CA store. */
  trusted: boolean;
  /** Certificate covers the scanned hostname. */
  hostnameMatch: boolean;
  trustError?: string;
  status: Status;
}

export interface HeaderResult {
  /** Display name, e.g. "Strict-Transport-Security". */
  name: string;
  short: string;
  present: boolean;
  value?: string;
  status: Status;
  note: string;
}

export interface Finding {
  severity: "critical" | "warning" | "info" | "good";
  message: string;
}

export interface ScanResult {
  domain: string;
  ip: string;
  scannedAt: string;
  durationMs: number;
  grade: Grade;
  score: number;
  tls: {
    negotiatedProtocol: string;
    negotiatedCipher: string;
    versions: TlsVersionResult[];
    pqc: PqcResult;
  };
  certificate: CertificateResult;
  headers: {
    finalUrl: string;
    statusCode: number;
    /** null when the HTTP request failed; items are then all UNKNOWN. */
    error?: string;
    items: HeaderResult[];
  };
  findings: Finding[];
}

/** Shape of every non-2xx response from /api/scan. */
export interface ScanErrorBody {
  error: string;
  code: string;
}
