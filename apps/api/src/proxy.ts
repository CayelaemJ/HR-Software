/**
 * Only trust an explicitly configured single reverse-proxy hop.
 * A directly reachable Express server must not trust caller-set
 * X-Forwarded-For headers or rate limiting can be evaded.
 */
export function trustedProxyHops(value: string | undefined): false | 1 {
  return value === '1' ? 1 : false;
}
