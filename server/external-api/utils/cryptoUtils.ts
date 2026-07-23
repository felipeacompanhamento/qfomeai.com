import crypto from 'crypto';

/**
 * Computes a SHA-256 hash of a string.
 */
export function hashSha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes a SHA-256 hash of an IP address using an environment salt.
 */
export function hashIpAddress(ip: string): string {
  const salt = process.env.EXTERNAL_API_IP_HASH_SALT || 'qfomeai_default_ip_salt_2026';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/**
 * Hashes an app client secret securely for HMAC mode.
 */
export function hashSecret(secret: string): string {
  const salt = process.env.EXTERNAL_API_SECRET_SALT || 'qfomeai_default_secret_salt_2026';
  return crypto.createHmac('sha256', salt).update(secret).digest('hex');
}

/**
 * Summarizes a user agent string to avoid storing full raw header while keeping diagnostic info.
 */
export function summarizeUserAgent(ua?: string): string {
  if (!ua) return 'unknown';
  const clean = ua.trim().substring(0, 100);
  return clean || 'unknown';
}
