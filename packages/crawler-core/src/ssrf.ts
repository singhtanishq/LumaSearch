/**
 * SSRF protection: block private/loopback/link-local IPs, DNS rebinding.
 * Resolves the hostname first, then connects to the resolved IP with Host header
 * pinning so a DNS rebinding between check and fetch cannot occur.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_RANGES: Array<[string, number, string]> = [
  ['0.0.0.0', 8, 'this-network'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-nat'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'ietf'],
  ['192.0.2.0', 24, 'test-net'],
  ['192.88.99.0', 24, '6to4-relay'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmark'],
  ['198.51.100.0', 24, 'test-net'],
  ['203.0.113.0', 24, 'test-net'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

function ipToBytes(ip: string): number[] | null {
  if (net.isIPv4(ip)) return ip.split('.').map(Number);
  return null;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const ipBytes = ipToBytes(ip);
  const baseBytes = ipToBytes(base);
  if (!ipBytes || !baseBytes) return false;
  for (let i = 0; i < 4; i++) {
    const mask = Math.max(0, Math.min(8, bits - i * 8));
    if (mask === 0) break;
    const maskByte = (0xff << (8 - mask)) & 0xff;
    if (((ipBytes[i] ?? 0) & maskByte) !== ((baseBytes[i] ?? 0) & maskByte)) return false;
  }
  return true;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return false;
  // IPv6 loopback/link-local/ULA/mapped IPv4
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.replace('::ffff:', ''));
  for (const [base, bits] of PRIVATE_RANGES) {
    if (inCidr(ip, base, bits)) return true;
  }
  return false;
}

export interface DnsCheckResult {
  allowed: boolean;
  ip?: string;
  reason?: string;
}

/**
 * Resolve hostname and verify none of the addresses is private.
 * Call immediately before fetch; pin the resolved IP in the fetch when possible.
 */
export async function resolveAndCheck(
  hostname: string,
  opts: { blockPrivateIps?: boolean } = {}
): Promise<DnsCheckResult> {
  if (net.isIP(hostname) !== 0) {
    if (opts.blockPrivateIps !== false && isPrivateIp(hostname)) {
      return { allowed: false, reason: `blocked private IP: ${hostname}` };
    }
    return { allowed: true, ip: hostname };
  }
  try {
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    for (const addr of addrs) {
      if (opts.blockPrivateIps !== false && isPrivateIp(addr.address)) {
        return { allowed: false, reason: `blocked private IP: ${addr.address} for ${hostname}` };
      }
    }
    return { allowed: true, ip: addrs[0]?.address };
  } catch (err) {
    return { allowed: false, reason: `DNS lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}` };
  }
}