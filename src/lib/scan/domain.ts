import { domainToASCII } from "node:url";
import net from "node:net";
import { ScanError } from "./errors";

// RFC 1123 hostname: dot-separated labels of 1-63 chars, letters/digits/hyphens,
// no leading/trailing hyphen. Requires at least one dot (a TLD).
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

/**
 * Normalise free-form user input into a bare ASCII hostname.
 * Accepts "example.com", "https://example.com/path", "  EXAMPLE.com.  ",
 * and internationalised names (converted to punycode).
 */
export function normalizeDomain(input: unknown): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ScanError("Please enter a domain name, e.g. example.com.", "INVALID_DOMAIN", 400);
  }

  let raw = input.trim().toLowerCase();
  if (raw.length > 2048) {
    throw new ScanError("Input is too long.", "INVALID_DOMAIN", 400);
  }

  // Let the URL parser strip scheme, credentials, port, path and query.
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = `https://${raw}`;
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new ScanError(`"${input}" is not a valid domain name.`, "INVALID_DOMAIN", 400);
  }

  host = host.replace(/\.$/, ""); // trailing root dot
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1); // IPv6 literal
  if (net.isIP(host)) return host;

  const ascii = domainToASCII(host);
  if (!ascii || !HOSTNAME_RE.test(ascii)) {
    throw new ScanError(`"${input}" is not a valid domain name.`, "INVALID_DOMAIN", 400);
  }
  return ascii;
}
