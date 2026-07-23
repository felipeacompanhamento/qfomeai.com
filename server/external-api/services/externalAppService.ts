import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../utils/getAdminDb.js';
import { ExternalDeliveryApp } from '../types/externalApi.js';

/**
 * Retrieves an external delivery application config by appId.
 */
export async function getExternalDeliveryApp(appId: string): Promise<ExternalDeliveryApp | null> {
  try {
    const db = getAdminDb();
    const docSnap = await db.collection('externalDeliveryApps').doc(appId).get();

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data();
    return {
      appId: docSnap.id,
      name: data?.name || 'Unknown External App',
      status: data?.status || 'SUSPENDED',
      authenticationMode: data?.authenticationMode || 'JWT_PUBLIC_KEY',
      secretHash: data?.secretHash,
      publicKeyPem: data?.publicKeyPem,
      keyId: data?.keyId,
      issuer: data?.issuer || '',
      audience: data?.audience || '',
      allowedScopes: Array.isArray(data?.allowedScopes) ? data.allowedScopes : [],
      rateLimitPerMinute: typeof data?.rateLimitPerMinute === 'number' ? data.rateLimitPerMinute : 60,
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt,
      lastUsedAt: data?.lastUsedAt,
      suspendedAt: data?.suspendedAt,
      revokedAt: data?.revokedAt,
      credentialVersion: typeof data?.credentialVersion === 'number' ? data.credentialVersion : 1,
    };
  } catch (error) {
    console.error(`[ExternalAppService] Error loading app ${appId}:`, error);
    return null;
  }
}

/**
 * Updates the lastUsedAt timestamp for an external delivery application asynchronously.
 */
export async function updateAppLastUsed(appId: string): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection('externalDeliveryApps').doc(appId).update({
      lastUsedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Non-blocking catch
    console.error(`[ExternalAppService] Failed to update lastUsedAt for ${appId}:`, error);
  }
}
