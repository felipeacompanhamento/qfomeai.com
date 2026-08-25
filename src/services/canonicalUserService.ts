import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { CanonicalUser, normalizeUser, AccountType, UserRole, UserStatus } from '../types';
import { legacyAuditService } from './legacyAuditService';

async function isLegacyEnabledForUser(rawUserData: any): Promise<boolean> {
  try {
    const config = await legacyAuditService.getCompatibilityConfig();
    if (config.legacyUserCompatibilityEnabled === false) return false;
    const restId = rawUserData?.restaurantId || rawUserData?.restaurante_id;
    if (restId && config.legacyUserCompatibilityByRestaurant && config.legacyUserCompatibilityByRestaurant[restId] === false) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export const canonicalUserService = {
  async getUserByUid(uid: string, timeoutMs: number = 3500): Promise<CanonicalUser | null> {
    if (!uid) return null;
    try {
      const docRef = doc(db, 'users', uid);
      
      const fetchWithTimeout = Promise.race([
        getDoc(docRef),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao buscar perfil do usuário')), timeoutMs)
        )
      ]);

      const snap = await fetchWithTimeout;
      if (!snap || !snap.exists()) return null;
      
      const rawData = { id: snap.id, uid: snap.id, ...snap.data() };
      const legacyEnabled = await isLegacyEnabledForUser(rawData);
      return normalizeUser(rawData, { legacyUserCompatibilityEnabled: legacyEnabled });
    } catch (error) {
      console.warn(`[canonicalUserService] Falha ou timeout na leitura do perfil users/${uid}:`, error);
      return null;
    }
  },

  async getUsersByRestaurant(restaurantId: string): Promise<CanonicalUser[]> {
    if (!restaurantId) return [];
    try {
      const q = query(collection(db, 'users'), where('restaurantId', '==', restaurantId));
      const snap = await getDocs(q);
      const users: CanonicalUser[] = [];
      const config = await legacyAuditService.getCompatibilityConfig();
      const legacyEnabled = config.legacyUserCompatibilityEnabled && (config.legacyUserCompatibilityByRestaurant[restaurantId] !== false);
      
      snap.forEach(docSnap => {
        const u = normalizeUser({ id: docSnap.id, uid: docSnap.id, ...docSnap.data() }, { legacyUserCompatibilityEnabled: legacyEnabled });
        // CLIENT and PLATFORM_ADMIN must not appear in restaurant team list
        if (u.accountType !== AccountType.CLIENT && u.role !== UserRole.ADMIN && u.tipo_usuario !== 'admin') {
          users.push(u);
        }
      });

      // Also check if owner doc exists at doc(db, 'users', restaurantId)
      const ownerSnap = await getDoc(doc(db, 'users', restaurantId));
      if (ownerSnap.exists()) {
        const ownerUser = normalizeUser({ id: ownerSnap.id, uid: ownerSnap.id, ...ownerSnap.data() }, { legacyUserCompatibilityEnabled: legacyEnabled });
        if (ownerUser.restaurantId === restaurantId && !users.some(x => x.uid === ownerUser.uid)) {
          if (ownerUser.accountType !== AccountType.CLIENT && ownerUser.role !== UserRole.ADMIN) {
            users.push(ownerUser);
          }
        }
      }

      return users;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `users (restaurantId: ${restaurantId})`);
      return [];
    }
  },

  async createInternalUser(
    operator: { uid: string; role: string; accountType: string; restaurantId?: string },
    data: {
      uid: string;
      name: string;
      email: string;
      phone?: string;
      role: UserRole | string;
      restaurantId: string;
      permissions?: string[];
      status?: UserStatus | string;
    }
  ): Promise<CanonicalUser> {
    // Validations
    if (!data.restaurantId) {
      throw new Error('Usuário interno deve pertencer a um restaurante obrigatório (restaurantId).');
    }
    if (operator.restaurantId && operator.restaurantId !== data.restaurantId) {
      throw new Error('Nenhum usuário pode criar usuários em outro restaurante.');
    }

    // Role permission validation
    const opRole = (operator.role || '').toUpperCase();
    const targetRole = (data.role || '').toUpperCase();

    if (opRole === 'OWNER') {
      // OWNER can manage all internal roles
    } else if (opRole === 'RESTAURANT_ADMIN') {
      if (targetRole === 'OWNER') {
        throw new Error('RESTAURANT_ADMIN não pode criar ou promover OWNER.');
      }
    } else if (opRole === 'MANAGER') {
      if (targetRole === 'OWNER' || targetRole === 'RESTAURANT_ADMIN') {
        throw new Error('MANAGER não pode criar ou promover OWNER ou RESTAURANT_ADMIN.');
      }
    } else {
      throw new Error('Sem permissão para cadastrar membros na equipe.');
    }

    const now = new Date().toISOString();
    const newUser: CanonicalUser = {
      uid: data.uid,
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      accountType: AccountType.RESTAURANT,
      role: targetRole,
      restaurantId: data.restaurantId,
      permissions: data.permissions || [],
      status: data.status || UserStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      createdBy: operator.uid,
      tipo_usuario: targetRole.toLowerCase(),
      nome: data.name,
      telefone: data.phone || '',
      active: (data.status || UserStatus.ACTIVE) === UserStatus.ACTIVE
    };

    try {
      await setDoc(doc(db, 'users', data.uid), newUser, { merge: true });
      return newUser;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${data.uid}`);
      throw error;
    }
  },

  async updateBasicData(
    operator: { uid: string; role: string; restaurantId?: string },
    targetUid: string,
    data: { name?: string; phone?: string; email?: string }
  ): Promise<void> {
    const targetUser = await this.getUserByUid(targetUid);
    if (!targetUser) throw new Error('Usuário não encontrado.');

    if (operator.restaurantId && targetUser.restaurantId && operator.restaurantId !== targetUser.restaurantId) {
      throw new Error('Não é permitido alterar usuários de outro restaurante.');
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };
    if (data.name !== undefined) {
      updates.name = data.name;
      updates.nome = data.name;
    }
    if (data.phone !== undefined) {
      updates.phone = data.phone;
      updates.telefone = data.phone;
    }
    if (data.email !== undefined) {
      updates.email = data.email;
    }

    try {
      await updateDoc(doc(db, 'users', targetUid), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      throw error;
    }
  },

  async updateRole(
    operator: { uid: string; role: string; restaurantId?: string },
    targetUid: string,
    newRole: UserRole | string
  ): Promise<void> {
    const targetUser = await this.getUserByUid(targetUid);
    if (!targetUser) throw new Error('Usuário não encontrado.');

    if (operator.restaurantId && targetUser.restaurantId && operator.restaurantId !== targetUser.restaurantId) {
      throw new Error('Não é permitido alterar usuários de outro restaurante.');
    }

    const opRole = (operator.role || '').toUpperCase();
    const tRole = (newRole || '').toUpperCase();

    if (opRole === 'OWNER') {
      // Allowed
    } else if (opRole === 'RESTAURANT_ADMIN') {
      if (tRole === 'OWNER' || targetUser.role === 'OWNer') {
        throw new Error('RESTAURANT_ADMIN não pode alterar perfil para OWNER.');
      }
    } else if (opRole === 'MANAGER') {
      if (tRole === 'OWNER' || tRole === 'RESTAURANT_ADMIN' || targetUser.role === 'OWNER' || targetUser.role === 'RESTAURANT_ADMIN') {
        throw new Error('MANAGER não pode promover ou gerenciar OWNER ou RESTAURANT_ADMIN.');
      }
    } else {
      throw new Error('Sem permissão para alterar perfis.');
    }

    try {
      await updateDoc(doc(db, 'users', targetUid), {
        role: tRole,
        tipo_usuario: tRole.toLowerCase(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      throw error;
    }
  },

  async updatePermissions(
    operator: { uid: string; role: string; restaurantId?: string },
    targetUid: string,
    permissions: string[]
  ): Promise<void> {
    const targetUser = await this.getUserByUid(targetUid);
    if (!targetUser) throw new Error('Usuário não encontrado.');

    if (operator.restaurantId && targetUser.restaurantId && operator.restaurantId !== targetUser.restaurantId) {
      throw new Error('Não é permitido alterar usuários de outro restaurante.');
    }

    try {
      await updateDoc(doc(db, 'users', targetUid), {
        permissions,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      throw error;
    }
  },

  async setStatus(
    operator: { uid: string; role: string; restaurantId?: string },
    targetUid: string,
    status: UserStatus | string
  ): Promise<void> {
    const targetUser = await this.getUserByUid(targetUid);
    if (!targetUser) throw new Error('Usuário não encontrado.');

    if (operator.restaurantId && targetUser.restaurantId && operator.restaurantId !== targetUser.restaurantId) {
      throw new Error('Não é permitido alterar usuários de outro restaurante.');
    }

    const isActive = status === UserStatus.ACTIVE;

    try {
      await updateDoc(doc(db, 'users', targetUid), {
        status,
        active: isActive,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      throw error;
    }
  }
};
