/**
 * Typed error used across the scan engine. The API route maps `status`
 * straight onto the HTTP response, so every failure the user can cause
 * (bad input, unreachable host, timeout) surfaces as a clear message.
 */
export class ScanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

/** Translate low-level socket / DNS errors into user-facing ScanErrors. */
export function toScanError(err: unknown, host: string): ScanError {
  if (err instanceof ScanError) return err;
  const e = err as NodeJS.ErrnoException;
  switch (e?.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "ENODATA":
      return new ScanError(`Domain "${host}" could not be resolved (DNS lookup failed).`, "DNS_FAILED", 422);
    case "ETIMEDOUT":
    case "TIMEOUT":
      return new ScanError(`Connection to ${host}:443 timed out.`, "TIMEOUT", 504);
    case "ECONNREFUSED":
      return new ScanError(`${host} refused the connection on port 443 (no HTTPS service).`, "CONN_REFUSED", 502);
    case "ECONNRESET":
    case "EPIPE":
      return new ScanError(`${host} reset the connection during the TLS handshake.`, "CONN_RESET", 502);
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return new ScanError(`${host} is unreachable from the scanner.`, "UNREACHABLE", 502);
    default:
      return new ScanError(`TLS handshake with ${host} failed: ${e?.message ?? "unknown error"}`, "HANDSHAKE_FAILED", 502);
  }
}
