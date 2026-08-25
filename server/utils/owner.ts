import type { Firestore } from 'firebase-admin/firestore';
import { logger } from './logger';

export async function getPrimaryOwnerUidForRestaurant(db: Firestore, restaurantId: string): Promise<string | null> {
  if (!restaurantId) return null;

  try {
    const restSnap = await db.collection('restaurants').doc(restaurantId).get();
    if (!restSnap.exists) return null;

    const rData = restSnap.data() || {};

    const canonicalUid = rData.primaryOwnerUid || rData.ownerUid || rData.owner_uid || rData.ownerId || rData.created_by || rData.createdBy;

    if (canonicalUid && typeof canonicalUid === 'string') {
      const userDoc = await db.collection('users').doc(canonicalUid).get();
      if (userDoc.exists) {
        const uData = userDoc.data() || {};
        const uRole = (uData.role || uData.tipo_usuario || '').toUpperCase();
        if (['OWNER', 'RESTAURANT', 'RESTAURANTE', 'RESTAURANT_OWNER'].includes(uRole) && (uData.restaurantId === restaurantId || canonicalUid === restaurantId)) {
          return canonicalUid;
        }
      }
    }

    const defaultUserSnap = await db.collection('users').doc(restaurantId).get();
    if (defaultUserSnap.exists) {
      const uData = defaultUserSnap.data() || {};
      const uRole = (uData.role || uData.tipo_usuario || '').toUpperCase();
      if ((uRole === 'OWNER' || uRole === 'RESTAURANT' || uRole === 'RESTAURANTE' || uData.accountType === 'RESTAURANT') && (uData.restaurantId === restaurantId || defaultUserSnap.id === restaurantId)) {
        return restaurantId;
      }
    }

    const staffSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles')
      .where('role', '==', 'OWNER')
      .get();

    for (const doc of staffSnap.docs) {
      const sp = doc.data();
      if (sp.primaryOwner === true || sp.isMainOwner === true) {
        const userDoc = await db.collection('users').doc(doc.id).get();
        if (userDoc.exists) {
          const uData = userDoc.data() || {};
          const uRole = (uData.role || uData.tipo_usuario || '').toUpperCase();
          if ((uRole === 'OWNER' || uRole === 'RESTAURANT' || uRole === 'RESTAURANTE') && uData.restaurantId === restaurantId) {
            return doc.id;
          }
        }
      }
    }
  } catch (err: any) {
    logger.error('Error fetching Primary Owner UID:', { error: err.message });
  }

  return null;
}

export async function validatePrimaryOwnerRequest(db: Firestore, req: any, res: any, targetRestaurantId: string): Promise<string | null> {
  if (!targetRestaurantId || req.user.restaurantId !== targetRestaurantId) {
    res.status(403).json({ error: 'Apenas o Proprietário Principal do restaurante pode solicitar ou executar a limpeza de dados.' });
    return null;
  }

  const primaryOwnerUid = await getPrimaryOwnerUidForRestaurant(db, targetRestaurantId);

  if (!primaryOwnerUid) {
    res.status(400).json({ error: 'Configuração do Proprietário Principal inválida ou não encontrada para este restaurante.' });
    return null;
  }

  const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
  const isOwnerRole = ['OWNER', 'RESTAURANT', 'RESTAURANTE', 'RESTAURANT_OWNER'].includes(opRole);

  if (!isOwnerRole || req.user.uid !== primaryOwnerUid) {
    res.status(403).json({ error: 'Apenas o Proprietário Principal tem permissão para realizar esta operação.' });
    return null;
  }

  return primaryOwnerUid;
}
