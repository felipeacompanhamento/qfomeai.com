/**
 * Validates a Request ID format (alphanumeric, dashes, underscores up to 64 chars).
 */
export function isValidRequestId(id?: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length < 8 || id.length > 64) return false;
  return /^[a-zA-Z0-9\-_]+$/.test(id);
}

/**
 * Validates an Idempotency-Key string (alphanumeric, dashes, underscores up to 64 chars).
 */
export function isValidIdempotencyKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.length < 8 || key.length > 64) return false;
  return /^[a-zA-Z0-9\-_]+$/.test(key);
}

/**
 * Checks if a requested scope is present in the list of granted scopes.
 */
export function hasRequiredScope(grantedScopes: string[], requiredScope: string): boolean {
  if (!Array.isArray(grantedScopes)) return false;
  if (grantedScopes.includes('*') || grantedScopes.includes('admin')) return true;
  return grantedScopes.includes(requiredScope);
}
