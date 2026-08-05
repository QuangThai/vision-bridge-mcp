import { isIP } from "node:net";

/**
 * Check if a hostname is an IPv6 address in the private/link-local range.
 */
export function isPrivateIpv6(hostname: string): boolean {
  const ipv6 = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (!isIP(ipv6)) return false;

  // Normalize to lowercase for prefix matching
  const lower = ipv6.toLowerCase();

  // ::1 — loopback (IPv6)
  if (lower === "::1") return true;

  // fd00::/8 — Unique Local Addresses (ULA)
  if (lower.startsWith("fd") || lower.startsWith("fc")) return true;

  // fe80::/10 — Link-Local addresses
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  )
    return true;

  // fec0::/10 — Site-Local addresses (deprecated but still valid)
  if (
    lower.startsWith("fec") ||
    lower.startsWith("fed") ||
    lower.startsWith("fee") ||
    lower.startsWith("fef")
  )
    return true;

  // ::ffff:x.x.x.x — IPv4-mapped IPv6 addresses
  if (lower.startsWith("::ffff:")) {
    const v4part = lower.slice(7); // "::ffff:" is 7 chars
    return isPrivateIpv4(v4part);
  }

  // ::x.x.x.x — IPv4-compatible IPv6 addresses
  if (lower.startsWith("::") && lower.length > 2 && lower.includes(".")) {
    const v4part = lower.replace(/^::/, "");
    return isPrivateIpv4(v4part);
  }

  return false;
}

/**
 * Check if a hostname is a private/reserved IPv4 address.
 */
export function isPrivateIpv4(hostname: string): boolean {
  // 127.0.0.0/8 — loopback
  if (hostname.startsWith("127.")) return true;

  // 10.0.0.0/8 — private
  if (hostname.startsWith("10.")) return true;

  // 192.168.0.0/16 — private
  if (hostname.startsWith("192.168.")) return true;

  // 172.16.0.0/12 — private
  if (hostname.startsWith("172.") && hostname.split(".").length > 1) {
    const secondOctet = Number(hostname.split(".")[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // 169.254.0.0/16 — link-local (includes cloud metadata 169.254.169.254)
  if (hostname.startsWith("169.254.")) return true;

  // 0.0.0.0/8 — current network
  if (hostname.startsWith("0.")) return true;

  // 198.18.0.0/15 — benchmark testing
  if (hostname.startsWith("198.18.") || hostname.startsWith("198.19.")) return true;

  return false;
}

/**
 * Check if a hostname is the loopback interface (localhost / 127.0.0.1 / [::1]).
 */
export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  );
}

/**
 * Check if a hostname resolves to the local machine or a private network.
 * Used to decide whether a plain-http endpoint is safe for API key transport.
 */
export function isLoopbackOrPrivateHostname(hostname: string): boolean {
  return isLoopbackHostname(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname);
}
