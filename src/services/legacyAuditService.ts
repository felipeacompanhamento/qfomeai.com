import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc,
  query,
  orderBy,
  limit,
  startAfter,
  documentId,
  QueryDocumentSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { CanonicalUser, AccountType, UserRole, UserStatus } from '../types';

export interface AuditReport {
  totalAnalyzed: number;
  totalValid: number;
  warnings: string[];
  criticalErrors: string[];
  conflicts: string[];
  legacyUsers: string[]; // UIDs or Emails dependent on legacy structure
  blockedRestaurants: string[]; // Restaurant IDs blocked from legacy removal
  recommendations: string[];
  systemAptoForDisableLegacy: boolean;
  timestamp: string;
}

export interface AuditOptions {
  dryRun?: boolean;
  maxRecords?: number;
  batchSize?: number;
  onProgress?: (progress: {
    usersProcessed: number;
    restaurantsProcessed: number;
    currentBatch: number;
    errorsCount: number;
  }) => void;
  shouldCancel?: () => boolean;
}

export interface SystemCompatibilityConfig {
  legacyUserCompatibilityEnabled: boolean;
  legacyUserCompatibilityByRestaurant: Record<string, boolean>; // Controlled testing per restaurant
  updatedAt: string;
  updatedBy: string;
}

export interface AuditLogEntry {
  id?: string;
  changedBy: string;
  changedAt: string;
  action: string;
  newValue: boolean;
  scope: string; // 'GLOBAL' or restaurantId
  details: string;
  criticalErrorsCount?: number;
  warningsCount?: number;
}

const VALID_ACCOUNT_TYPES = [AccountType.CLIENT, AccountType.RESTAURANT, AccountType.DRIVER, AccountType.ADMIN];
const VALID_ROLES = [
  UserRole.OWNER,
  UserRole.RESTAURANT_ADMIN,
  UserRole.MANAGER,
  UserRole.WAITER,
  UserRole.DRIVER,
  UserRole.CASHIER,
  UserRole.KITCHEN,
  UserRole.CLIENT,
  UserRole.ADMIN
];
const INTERNAL_ROLES = [
  UserRole.OWNER,
  UserRole.RESTAURANT_ADMIN,
  UserRole.MANAGER,
  UserRole.WAITER,
  UserRole.CASHIER,
  UserRole.KITCHEN
];

export const legacyAuditService = {
  async runAudit(options?: AuditOptions): Promise<AuditReport> {
    const batchSize = Math.max(1, options?.batchSize || 100);
    const maxRecords = options?.maxRecords;
    const isDryRun = Boolean(options?.dryRun);

    if (isDryRun) {
      console.log('[Audit] Executing audit in DRY RUN mode (read-only verification).');
    }

    const warnings: string[] = [];
    const criticalErrors: string[] = [];
    const conflicts: string[] = [];
    const legacyUsers: string[] = [];
    const blockedRestaurantsSet = new Set<string>();
    const recommendations: string[] = [];

    let totalAnalyzed = 0;
    let totalValid = 0;

    try {
      // 1. Scan Restaurants in batches
      const restaurantIds = new Set<string>();
      const restaurantNamesMap = new Map<string, string>();
      let lastRestaurantDoc: QueryDocumentSnapshot | null = null;
      let restaurantsProcessed = 0;
      let currentBatch = 0;

      while (true) {
        if (options?.shouldCancel?.()) {
          console.log('[Audit] Cancellation requested during restaurant scan.');
          break;
        }

        currentBatch++;
        const constraints: QueryConstraint[] = [orderBy(documentId()), limit(batchSize)];
        if (lastRestaurantDoc) {
          constraints.push(startAfter(lastRestaurantDoc));
        }

        const q = query(collection(db, 'restaurants'), ...constraints);
        const snap = await getDocs(q);

        if (snap.empty) break;

        for (const rDoc of snap.docs) {
          restaurantsProcessed++;
          const rId = rDoc.id;
          restaurantIds.add(rId);
          restaurantNamesMap.set(rId, rDoc.data().name || 'Sem nome');

          if (maxRecords && restaurantsProcessed >= maxRecords) {
            break;
          }
        }

        console.log(`[Audit] Restaurants Batch ${currentBatch}: Processed ${snap.docs.length} (Total: ${restaurantsProcessed})`);

        if (options?.onProgress) {
          options.onProgress({
            usersProcessed: 0,
            restaurantsProcessed,
            currentBatch,
            errorsCount: criticalErrors.length
          });
        }

        if (snap.docs.length < batchSize) break;
        if (maxRecords && restaurantsProcessed >= maxRecords) break;

        lastRestaurantDoc = snap.docs[snap.docs.length - 1];
      }

      // 2. Scan Users in batches
      const userUidsSet = new Set<string>();
      const emailMap = new Map<string, string[]>();
      const phoneMap = new Map<string, string[]>();
      const restaurantOwnersMap = new Map<string, string[]>();
      const createdByRefs: Array<{ uid: string; createdBy: string }> = [];

      let lastUserDoc: QueryDocumentSnapshot | null = null;
      let usersProcessed = 0;

      while (true) {
        if (options?.shouldCancel?.()) {
          console.log('[Audit] Cancellation requested during user scan.');
          break;
        }

        currentBatch++;
        const constraints: QueryConstraint[] = [orderBy(documentId()), limit(batchSize)];
        if (lastUserDoc) {
          constraints.push(startAfter(lastUserDoc));
        }

        const q = query(collection(db, 'users'), ...constraints);
        const snap = await getDocs(q);

        if (snap.empty) break;

        for (const docSnap of snap.docs) {
          usersProcessed++;
          totalAnalyzed++;
          const uid = docSnap.id;
          const data = docSnap.data();
          userUidsSet.add(uid);

          let userHasCritical = false;

          // Check 1: usuários canônicos sem uid válido
          if (!data.uid && !data.id) {
            criticalErrors.push(`Usuário (doc: ${uid}): Documento não possui campo 'uid' ou 'id' interno.`);
            userHasCritical = true;
          } else if (data.uid && data.uid !== uid) {
            criticalErrors.push(`Usuário (doc: ${uid}): ID do documento (${uid}) difere do campo 'uid' (${data.uid}).`);
            userHasCritical = true;
          }

          // Check 6: duplicados por uid, e-mail ou telefone
          const email = (data.email || data.email_address || '').toLowerCase().trim();
          const phone = (data.phone || data.telefone || data.phone_number || '').replace(/\D/g, '');

          if (email) {
            if (!emailMap.has(email)) emailMap.set(email, []);
            emailMap.get(email)!.push(uid);
          }
          if (phone && phone.length >= 8) {
            if (!phoneMap.has(phone)) phoneMap.set(phone, []);
            phoneMap.get(phone)!.push(uid);
          }

          // Check 7: usuários legados ainda não migrados
          const isExplicitCanonical = Boolean(data.accountType && data.role && data._migratedAt);
          if (!isExplicitCanonical) {
            legacyUsers.push(uid);
            warnings.push(`Usuário ${uid} (${email || 'sem email'}): Depende da estrutura/inferência legada (sem accountType/role/migratedAt explícitos).`);
          }

          const accountType = data.accountType;
          const role = data.role;
          const legacyTipo = data.tipo_usuario || '';
          const restaurantId = data.restaurantId || data.restaurante_id || data.restaurant_id;

          // Check 4: perfis inválidos
          if (accountType && !VALID_ACCOUNT_TYPES.includes(accountType)) {
            criticalErrors.push(`Usuário ${uid}: accountType inválido '${accountType}'.`);
            userHasCritical = true;
          }
          if (role && !VALID_ROLES.includes(role)) {
            criticalErrors.push(`Usuário ${uid}: role inválida '${role}'.`);
            userHasCritical = true;
          }

          const isInternal = accountType === AccountType.RESTAURANT || 
                             INTERNAL_ROLES.includes(role) || 
                             ['restaurant', 'restaurante', 'gerente', 'garcom', 'caixa', 'cozinha'].includes(legacyTipo);

          // Check 2: usuários internos sem restaurantId
          if (isInternal && role !== UserRole.ADMIN && legacyTipo !== 'admin') {
            if (!restaurantId) {
              criticalErrors.push(`Usuário interno ${uid} (${data.name || email}): Não possui 'restaurantId' vinculado.`);
              userHasCritical = true;
            } else if (typeof restaurantId === 'string' && !restaurantIds.has(restaurantId)) {
              criticalErrors.push(`Usuário interno ${uid}: Vinculado a restaurante inexistente '${restaurantId}'.`);
              userHasCritical = true;
            }
          }

          // Check 3: usuários internos vinculados a mais de um restaurante
          if (Array.isArray(restaurantId)) {
            conflicts.push(`Usuário ${uid}: Vinculado a múltiplos restaurantes [${restaurantId.join(', ')}].`);
            criticalErrors.push(`Usuário ${uid}: Vinculado a mais de um restaurante (array id).`);
            userHasCritical = true;
          }

          // Check 14: PLATFORM_ADMIN com restaurantId
          if ((accountType === AccountType.ADMIN || role === UserRole.ADMIN || legacyTipo === 'admin') && restaurantId) {
            warnings.push(`PLATFORM_ADMIN ${uid} possui 'restaurantId' (${restaurantId}) desnecessário.`);
          }

          // Check 15: CLIENT com perfil interno
          if (accountType === AccountType.CLIENT && INTERNAL_ROLES.includes(role)) {
            criticalErrors.push(`Inconsistência em ${uid}: accountType é CLIENT porém possui role interna '${role}'.`);
            userHasCritical = true;
          }

          // Check 16: WAITER, DRIVER, CASHIER ou KITCHEN sem vínculo operacional válido
          if ([UserRole.WAITER, UserRole.CASHIER, UserRole.KITCHEN].includes(role) && !restaurantId) {
            criticalErrors.push(`Operacional ${role} ${uid} sem restaurantId válido.`);
            userHasCritical = true;
          }
          if ((role === UserRole.DRIVER || legacyTipo === 'delivery_driver' || legacyTipo === 'entregador') && accountType !== AccountType.DRIVER && accountType !== AccountType.RESTAURANT) {
            warnings.push(`Entregador ${uid} possui accountType '${accountType}' em vez de DRIVER/RESTAURANT.`);
          }

          // Check 5: permissões incompatíveis
          if (data.permissions && Array.isArray(data.permissions)) {
            if (accountType === AccountType.CLIENT && data.permissions.length > 0) {
              warnings.push(`Usuário CLIENT ${uid} possui permissões internas configuradas.`);
            }
          }

          // Check 9: usuários inativos ainda com acesso
          if (data.status === UserStatus.INACTIVE && data.active === true) {
            warnings.push(`Inconsistência de status no usuário ${uid}: status=INACTIVE mas active=true.`);
          }

          // Check 8: referências a usuários inexistentes em createdBy
          if (data.createdBy) {
            createdByRefs.push({ uid, createdBy: data.createdBy });
          }

          // Track Owners per Restaurant
          if (restaurantId && typeof restaurantId === 'string' && (role === UserRole.OWNER || legacyTipo === 'restaurant' || legacyTipo === 'restaurante')) {
            if (data.status !== UserStatus.INACTIVE && data.active !== false) {
              if (!restaurantOwnersMap.has(restaurantId)) restaurantOwnersMap.set(restaurantId, []);
              restaurantOwnersMap.get(restaurantId)!.push(uid);
            }
          }

          // Check if restaurant has users with critical/legacy errors
          if (restaurantId && typeof restaurantId === 'string') {
            if (!data.accountType || !data.role) {
              blockedRestaurantsSet.add(restaurantId);
            }
          }

          if (!userHasCritical && isExplicitCanonical) {
            totalValid++;
          }

          if (maxRecords && usersProcessed >= maxRecords) {
            break;
          }
        }

        console.log(`[Audit] Users Batch ${currentBatch}: Processed ${snap.docs.length} (Total: ${usersProcessed}, Critical Errors: ${criticalErrors.length})`);

        if (options?.onProgress) {
          options.onProgress({
            usersProcessed,
            restaurantsProcessed,
            currentBatch,
            errorsCount: criticalErrors.length
          });
        }

        if (snap.docs.length < batchSize) break;
        if (maxRecords && usersProcessed >= maxRecords) break;

        lastUserDoc = snap.docs[snap.docs.length - 1];
      }

      // Check 8 post-processing: referências a usuários inexistentes em createdBy
      for (const { uid, createdBy } of createdByRefs) {
        if (!userUidsSet.has(createdBy)) {
          warnings.push(`Usuário ${uid}: Referência 'createdBy' aponta para usuário inexistente '${createdBy}'.`);
        }
      }

      // Check Duplicates in maps
      emailMap.forEach((uids, emailStr) => {
        if (uids.length > 1) {
          conflicts.push(`Email duplicado '${emailStr}' em UIDs: ${uids.join(', ')}.`);
        }
      });
      phoneMap.forEach((uids, phoneStr) => {
        if (uids.length > 1) {
          conflicts.push(`Telefone duplicado '${phoneStr}' em UIDs: ${uids.join(', ')}.`);
        }
      });

      // Check 12 & 13: Restaurantes sem OWNER ativo ou com múltiplos OWNERs
      restaurantIds.forEach(rId => {
        const owners = restaurantOwnersMap.get(rId) || [];
        const rName = restaurantNamesMap.get(rId) || 'Sem nome';

        if (owners.length === 0) {
          warnings.push(`Restaurante '${rId}' (${rName}): Não possui nenhum OWNER ativo.`);
          blockedRestaurantsSet.add(rId);
        } else if (owners.length > 1) {
          warnings.push(`Restaurante '${rId}': Possui múltiplos OWNERs ativos (${owners.length}): ${owners.join(', ')}.`);
        }
      });

      // Build Recommendations
      if (criticalErrors.length > 0) {
        recommendations.push(`Corrigir os ${criticalErrors.length} erros críticos encontrados antes de desativar a compatibilidade legada.`);
      }
      if (legacyUsers.length > 0) {
        recommendations.push(`Executar o script de migração ('npm run migrate-users') para gravar explicitamente 'role' e 'accountType' nos ${legacyUsers.length} usuários legados.`);
      }
      if (conflicts.length > 0) {
        recommendations.push(`Resolver os ${conflicts.length} conflitos de email/telefone duplicados.`);
      }
      if (blockedRestaurantsSet.size > 0) {
        recommendations.push(`${blockedRestaurantsSet.size} restaurante(s) possuem pendências ou usuários legados e devem ser migrados antes da remoção da compatibilidade.`);
      }
      if (criticalErrors.length === 0 && legacyUsers.length === 0) {
        recommendations.push(`O sistema está 100% pronto para desativar a compatibilidade legada de usuários.`);
      }

      const systemAptoForDisableLegacy = criticalErrors.length === 0;

      return {
        totalAnalyzed,
        totalValid,
        warnings,
        criticalErrors,
        conflicts,
        legacyUsers,
        blockedRestaurants: Array.from(blockedRestaurantsSet),
        recommendations,
        systemAptoForDisableLegacy,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users/audit');
      throw error;
    }
  },

  async getCompatibilityConfig(): Promise<SystemCompatibilityConfig> {
    const defaultConfig: SystemCompatibilityConfig = {
      legacyUserCompatibilityEnabled: true,
      legacyUserCompatibilityByRestaurant: {},
      updatedAt: new Date().toISOString(),
      updatedBy: 'default'
    };

    try {
      const docRef = doc(db, 'system_config', 'legacy_compatibility');
      
      const fetchWithTimeout = Promise.race([
        getDoc(docRef),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('system_config timeout')), 1500)
        )
      ]);

      const snap = await fetchWithTimeout;
      if (snap && snap.exists()) {
        const data = snap.data();
        return {
          legacyUserCompatibilityEnabled: data.legacyUserCompatibilityEnabled ?? true,
          legacyUserCompatibilityByRestaurant: data.legacyUserCompatibilityByRestaurant || {},
          updatedAt: data.updatedAt || new Date().toISOString(),
          updatedBy: data.updatedBy || 'system'
        };
      }
      return defaultConfig;
    } catch {
      // Falha ou timeout em system_config NUNCA bloqueia a aplicação ou autenticação
      return defaultConfig;
    }
  },

  async updateCompatibilityConfig(
    operator: { uid: string; email?: string; role?: string; accountType?: string },
    newGlobalValue: boolean,
    restaurantOverride?: { restaurantId: string; enabled: boolean }
  ): Promise<SystemCompatibilityConfig> {
    // 1. Strict Authorization check: Only ADMIN/PLATFORM_ADMIN can change
    const isOpAdmin = operator.accountType === AccountType.ADMIN || 
                      operator.role === UserRole.ADMIN || 
                      operator.email === 'felipeacompanhamento@gmail.com';

    if (!isOpAdmin) {
      throw new Error('Acesso Negado: Apenas administradores da plataforma podem alterar a configuração de compatibilidade legada.');
    }

    // 2. Fetch current config
    const currentConfig = await this.getCompatibilityConfig();

    // 3. Safety check: If trying to disable legacy compatibility, run audit first!
    if (newGlobalValue === false || (restaurantOverride && restaurantOverride.enabled === false)) {
      const audit = await this.runAudit();
      if (!audit.systemAptoForDisableLegacy) {
        throw new Error(`Desativação Bloqueada: Existem ${audit.criticalErrors.length} erro(s) crítico(s) de integridade. Resolva os erros antes de desativar a compatibilidade legada.`);
      }
    }

    // 4. Prepare updated config payload
    const now = new Date().toISOString();
    const updatedBy = operator.email || operator.uid;

    const newByRestaurant = { ...(currentConfig.legacyUserCompatibilityByRestaurant || {}) };
    if (restaurantOverride) {
      newByRestaurant[restaurantOverride.restaurantId] = restaurantOverride.enabled;
    }

    const newConfig: SystemCompatibilityConfig = {
      legacyUserCompatibilityEnabled: newGlobalValue,
      legacyUserCompatibilityByRestaurant: newByRestaurant,
      updatedAt: now,
      updatedBy
    };

    // 5. Save in Firestore doc(db, 'system_config', 'legacy_compatibility')
    const configDocRef = doc(db, 'system_config', 'legacy_compatibility');
    await setDoc(configDocRef, newConfig, { merge: true });

    // 6. Record Audit Log Entry in collection 'audit_logs'
    try {
      const logEntry: AuditLogEntry = {
        changedBy: updatedBy,
        changedAt: now,
        action: 'TOGGLE_LEGACY_COMPATIBILITY',
        newValue: restaurantOverride ? restaurantOverride.enabled : newGlobalValue,
        scope: restaurantOverride ? `RESTAURANT:${restaurantOverride.restaurantId}` : 'GLOBAL',
        details: restaurantOverride 
          ? `Compatibilidade legada alterada para o restaurante ${restaurantOverride.restaurantId}: ${restaurantOverride.enabled}`
          : `Compatibilidade legada global alterada para: ${newGlobalValue}`
      };
      await addDoc(collection(db, 'audit_logs'), logEntry);
    } catch (err) {
      console.warn("Audit log creation notice:", err);
    }

    return newConfig;
  }
};
