import "server-only";
import tls from "node:tls";
import net from "node:net";
import type { PqcResult, Status, TlsVersionId, TlsVersionResult } from "./types";

/** Per-handshake timeout. Keep short: a full scan runs ~8 handshakes. */
export const PROBE_TIMEOUT_MS = 8_000;

/**
 * OpenSSL 3 refuses TLS 1.0/1.1 and SHA-1 signatures at its default
 * security level. Dropping to level 0 lets us *detect* legacy support on
 * the server; we never send application data over these connections.
 */
const PERMISSIVE_CIPHERS = "DEFAULT:@SECLEVEL=0";

export interface ProbeOptions {
  minVersion?: tls.SecureVersion;
  maxVersion?: tls.SecureVersion;
  /** Colon-separated key-exchange groups to offer (OpenSSL names). */
  groups?: string;
}

export type ProbeResult =
  | {
      ok: true;
      protocol: string;
      cipher: tls.CipherNameAndProtocol;
      cert: tls.DetailedPeerCertificate;
      authorized: boolean;
      authorizationError?: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      /** The local OpenSSL build cannot even offer the requested option. */
      clientUnsupported?: boolean;
    };

/**
 * Perform a single TLS handshake against `ip:443`, sending SNI for `host`,
 * and report what was negotiated. Never rejects; failures come back as
 * `{ ok: false }` so callers can treat "not supported" as data.
 */
export function probe(ip: string, host: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let socket: tls.TLSSocket;
    try {
      socket = tls.connect({
        host: ip,
        port: 443,
        // SNI must be a hostname; it is not allowed for IP literals.
        servername: net.isIP(host) ? undefined : host,
        // We inspect trust ourselves so we can still report on bad certs.
        rejectUnauthorized: false,
        minVersion: opts.minVersion ?? "TLSv1",
        maxVersion: opts.maxVersion ?? "TLSv1.3",
        ciphers: PERMISSIVE_CIPHERS,
        ...(opts.groups ? { ecdhCurve: opts.groups } : {}),
      });
    } catch (err) {
      // Thrown synchronously when OpenSSL doesn't know a group/version.
      resolve({ ok: false, error: (err as Error).message, clientUnsupported: true });
      return;
    }

    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: "Handshake timed out", code: "TIMEOUT" }),
      PROBE_TIMEOUT_MS,
    );

    socket.once("secureConnect", () => {
      finish({
        ok: true,
        protocol: socket.getProtocol() ?? "unknown",
        cipher: socket.getCipher(),
        cert: socket.getPeerCertificate(true),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
      });
    });

    socket.once("error", (err: NodeJS.ErrnoException) => {
      finish({ ok: false, error: err.message, code: err.code });
    });
  });
}

const VERSIONS: { id: TlsVersionId; label: string }[] = [
  { id: "TLSv1", label: "TLS 1.0" },
  { id: "TLSv1.1", label: "TLS 1.1" },
  { id: "TLSv1.2", label: "TLS 1.2" },
  { id: "TLSv1.3", label: "TLS 1.3" },
];

/** Status rules: legacy versions are vulnerabilities when enabled; modern ones are wanted. */
function versionStatus(id: TlsVersionId, supported: boolean): Status {
  const legacy = id === "TLSv1" || id === "TLSv1.1";
  if (legacy) return supported ? "VULNERABLE" : "SECURE";
  if (id === "TLSv1.3") return supported ? "SECURE" : "WEAK";
  return supported ? "SECURE" : "INFO"; // TLS 1.2 off is fine if 1.3 is on
}

/** Probe each protocol version in isolation (min = max = version). */
export async function checkTlsVersions(ip: string, host: string): Promise<TlsVersionResult[]> {
  return Promise.all(
    VERSIONS.map(async ({ id, label }) => {
      const r = await probe(ip, host, { minVersion: id, maxVersion: id });
      if (r.ok) {
        return { id, label, supported: true, cipher: r.cipher.standardName ?? r.cipher.name, status: versionStatus(id, true) };
      }
      return {
        id,
        label,
        supported: false,
        status: r.clientUnsupported ? "UNKNOWN" : versionStatus(id, false),
        note: r.clientUnsupported ? "Scanner runtime cannot test this version" : r.code === "TIMEOUT" ? "No response" : undefined,
      };
    }),
  );
}

/**
 * Post-quantum hybrid key exchange groups (IANA / OpenSSL 3.5 names).
 * X25519MLKEM768 is what Chrome, Firefox and Cloudflare deploy today.
 */
const PQC_GROUPS = ["X25519MLKEM768", "SecP256r1MLKEM768", "SecP384r1MLKEM1024", "MLKEM768"];

/**
 * Offer *only* one ML-KEM group per handshake. If the handshake completes,
 * the server must have negotiated that group, which is unambiguous proof of support.
 * Requires TLS 1.3 and a Node.js build linked against OpenSSL >= 3.5.
 */
export async function checkPqc(ip: string, host: string): Promise<PqcResult> {
  const groups = await Promise.all(
    PQC_GROUPS.map(async (name) => {
      const r = await probe(ip, host, { minVersion: "TLSv1.3", groups: name });
      if (r.ok) return { name, supported: true };
      if (r.clientUnsupported) {
        return { name, supported: null, note: `Not available in scanner's OpenSSL ${process.versions.openssl}` };
      }
      return { name, supported: false };
    }),
  );

  const anySupported = groups.some((g) => g.supported === true);
  const allUnknown = groups.every((g) => g.supported === null);
  return {
    supported: anySupported ? true : allUnknown ? null : false,
    groups,
    status: anySupported ? "SECURE" : allUnknown ? "UNKNOWN" : "MISSING",
  };
}
