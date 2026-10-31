import "server-only";
import dns from "node:dns";
import net from "node:net";
import { ScanError } from "./errors";

/**
 * SSRF protection.
 *
 * A scanner that connects to user-supplied hosts must never be usable to
 * reach the server's own network (cloud metadata, localhost admin panels,
 * RFC1918 ranges, ...). Every connection goes through `resolvePublicHost`
 * or `safeLookup`, which reject any non-public address. Because the check
 * runs inside the socket's DNS lookup, it also defeats DNS rebinding.
 */

const blocked = new net.BlockList();
// IPv4 special-purpose ranges (RFC 6890 and friends)
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // carrier-grade NAT
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // link-local / cloud metadata
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.0.0", 24, "ipv4");
blocked.addSubnet("192.0.2.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("198.51.100.0", 24, "ipv4");
blocked.addSubnet("203.0.113.0", 24, "ipv4");
blocked.addSubnet("224.0.0.0", 3, "ipv4"); // multicast + reserved
// IPv6 special-purpose ranges
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
// NB: no "::ffff:0:0/96" rule. BlockList matches *every* IPv4 address against
// it; IPv4-mapped IPv6 is instead unwrapped and checked in isBlockedAddress.
blocked.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64
blocked.addSubnet("fc00::", 7, "ipv6"); // unique local
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local
blocked.addSubnet("ff00::", 8, "ipv6"); // multicast
blocked.addSubnet("2001:db8::", 32, "ipv6"); // documentation

/** True when the address must not be contacted by the scanner. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    // Unwrap IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1) and check the IPv4 part.
    const dotted = address.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (dotted) return isBlockedAddress(dotted[1]);
    const hex = address.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return blocked.check(address, "ipv6");
  }
  return true; // not an IP at all
}

/**
 * Resolve a hostname and return a public IP to connect to.
 * Prefers IPv4 for wider reachability from typical hosting environments.
 */
export async function resolvePublicHost(host: string): Promise<string> {
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new ScanError("Scanning private, loopback or reserved addresses is not allowed.", "BLOCKED_ADDRESS", 400);
    }
    return host;
  }

  const addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new ScanError(`Domain "${host}" has no A/AAAA records.`, "DNS_FAILED", 422);
  }
  // Refuse if *any* record points inward: a mixed answer is a classic rebinding trick.
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new ScanError(`"${host}" resolves to a private or reserved address and cannot be scanned.`, "BLOCKED_ADDRESS", 400);
  }
  return (addresses.find((a) => a.family === 4) ?? addresses[0]).address;
}

/**
 * Drop-in replacement for `dns.lookup`, passed as the `lookup` option to
 * http/https requests so redirects can't be bounced to internal addresses.
 */
export const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const bad = addresses.find((a) => isBlockedAddress(a.address));
    if (bad) {
      const e = new Error(`Blocked request to non-public address ${bad.address}`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e, "", 4);
    }
    if (options.all) {
      // Node's happy-eyeballs path asks for every address at once.
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};
