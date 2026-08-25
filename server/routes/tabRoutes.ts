import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';
import { removeUndefinedRecursively } from '../utils/sanitize';
import { logger } from '../utils/logger';
import { resolveChannelUnitPriceCents, isProductAvailableForChannel } from '../../src/domain/product/productChannels';
import { resolveActiveCashRegister } from '../utils/cashRegister';
import { normalizePaymentMethodId } from '../constants/payment';

export function createTabRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  // Helper function for user role in cancellation endpoints
  const getRequestUserRole = (req: any) => {
    const simulated = req.headers['x-simulated-role'] || req.body?.simulatedRole;
    if (simulated === 'WAITERS' || simulated === 'waiter' || simulated === 'garcom') {
      return 'waiter';
    }
    if (simulated === 'MANAGER' || simulated === 'manager' || simulated === 'admin') {
      return 'manager';
    }
    const actualRole = req.user?.role || req.user?.tipo_usuario || 'waiter';
    if (actualRole === 'admin' || actualRole === 'restaurant' || actualRole === 'restaurante' || actualRole === 'manager' || actualRole === 'MANAGER') {
      return 'manager';
    }
    return 'waiter';
  };

  // Helper function for cancellation audit logs
  const logCancellationAction = async (transaction: any, restaurantId: string, action: string, itemId: string, tabId: string | null, orderId: string | null, user: any, details?: string) => {
    try {
      const logRef = db.collection('restaurants').doc(restaurantId).collection('cancellation_logs').doc();
      const now = new Date().toISOString();
      const logData = {
        id: logRef.id,
        action, // 'REQUEST', 'CANCEL_DIRECT', 'APPROVE', 'REFUSE'
        itemId,
        tabId: tabId || null,
        orderId: orderId || null,
        user: {
          uid: user.uid,
          name: user.nome || user.name || user.displayName || user.email || 'Desconhecido',
          email: user.email || '',
          role: user.role || 'waiter'
        },
        details: details || '',
        timestamp: now,
        createdAt: now
      };
      transaction.set(logRef, logData);
    } catch (err) {
      logger.error('Erro ao registrar log de auditoria de cancelamento:', { error: err });
    }
  };

  // Helper to determine if a tab status is open/active
  const CLOSED_TAB_STATUSES = ['CLOSED', 'FECHADA', 'PAID', 'PAGA', 'CANCELLED', 'CANCELADA', 'MERGED', 'UNIFICADA'];
  const isTabOpenStatus = (rawStatus?: string): boolean => {
    const status = (rawStatus || '').toUpperCase().trim();
    if (!status) return true;
    return !CLOSED_TAB_STATUSES.includes(status);
  };

  // Canonical Tab Resolver Helper
  const resolveTabRef = async (
    restaurantId: string,
    tabId: string,
    transaction?: any
  ): Promise<{ ref: any; snapshot: any; data: any; source: 'ROOT' | 'NESTED' }> => {
    const cleanTabId = (tabId || '').trim();
    const cleanRestaurantId = (restaurantId || '').trim();

    if (!cleanTabId) {
      throw new Error('ID da comanda é obrigatório.');
    }
    if (!cleanRestaurantId) {
      throw new Error('ID do restaurante é obrigatório.');
    }

    // 1. Tentar primeiro na raiz: /tabs/{tabId}
    const rootTabRef = db.collection('tabs').doc(cleanTabId);
    const rootSnap = transaction ? await transaction.get(rootTabRef) : await rootTabRef.get();

    if (rootSnap.exists) {
      const data = rootSnap.data() || {};
      if (data.restaurantId && String(data.restaurantId).trim() === cleanRestaurantId) {
        return { ref: rootTabRef, snapshot: rootSnap, data, source: 'ROOT' };
      }
      if (data.restaurantId && String(data.restaurantId).trim() !== cleanRestaurantId) {
        throw new Error('FORBIDDEN_CROSS_TENANT: A comanda pertence a outro restaurante.');
      }
      // Se data.restaurantId estiver ausente na raiz, não aceita automaticamente
    }

    // 2. Fallback para estrutura legada nested: /restaurants/{restaurantId}/tabs/{tabId}
    const nestedTabRef = db.collection('restaurants').doc(cleanRestaurantId).collection('tabs').doc(cleanTabId);
    const nestedSnap = transaction ? await transaction.get(nestedTabRef) : await nestedTabRef.get();

    if (nestedSnap.exists) {
      const data = nestedSnap.data() || {};
      const tabRestId = data.restaurantId ? String(data.restaurantId).trim() : cleanRestaurantId;
      if (tabRestId === cleanRestaurantId) {
        if (rootSnap.exists) {
          logger.warn(`[resolveTabRef] Root tab ${cleanTabId} missing restaurantId. Using nested tab for ${cleanRestaurantId}.`);
        }
        return { ref: nestedTabRef, snapshot: nestedSnap, data, source: 'NESTED' };
      } else {
        throw new Error('FORBIDDEN_CROSS_TENANT: A comanda pertence a outro restaurante.');
      }
    }

    if (rootSnap.exists) {
      throw new Error('FORBIDDEN_INVALID_TENANT: Comanda na raiz sem restaurante associado.');
    }

    throw new Error('TAB_NOT_FOUND: Comanda não encontrada.');
  };

  // Canonical Table Resolver Helper
  const resolveTableRef = async (
    restaurantId: string,
    tableId: string,
    transaction?: any
  ): Promise<{ ref: any; snapshot: any; data: any; source: 'ROOT' | 'NESTED' } | null> => {
    const cleanTableId = (tableId || '').trim();
    const cleanRestaurantId = (restaurantId || '').trim();

    if (!cleanTableId || !cleanRestaurantId) {
      return null;
    }

    // 1. Tentar primeiro na raiz canônica: /tables/{tableId}
    const rootTableRef = db.collection('tables').doc(cleanTableId);
    const rootSnap = transaction ? await transaction.get(rootTableRef) : await rootTableRef.get();

    if (rootSnap.exists) {
      const data = rootSnap.data() || {};
      if (data.restaurantId && String(data.restaurantId).trim() !== cleanRestaurantId) {
        const err: any = new Error('Acesso negado: Mesa pertence a outro restaurante.');
        err.code = 'FORBIDDEN_TABLE_RESTAURANT';
        throw err;
      }
      return { ref: rootTableRef, snapshot: rootSnap, data, source: 'ROOT' };
    }

    // 2. Fallback legado em /restaurants/{restaurantId}/tables/{tableId}
    const nestedTableRef = db.collection('restaurants').doc(cleanRestaurantId).collection('tables').doc(cleanTableId);
    const nestedSnap = transaction ? await transaction.get(nestedTableRef) : await nestedTableRef.get();

    if (nestedSnap.exists) {
      const data = nestedSnap.data() || {};
      if (data.restaurantId && String(data.restaurantId).trim() !== cleanRestaurantId) {
        const err: any = new Error('Acesso negado: Mesa pertence a outro restaurante.');
        err.code = 'FORBIDDEN_TABLE_RESTAURANT';
        throw err;
      }
      return { ref: nestedTableRef, snapshot: nestedSnap, data, source: 'NESTED' };
    }

    return null;
  };

  // ==========================================
  // OPERAÇÃO DE MESAS: LIBERAR MESA MANUALMENTE (POST /release-table)
  // ==========================================
  router.post('/release-table', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId || 'NO_REQUEST_ID_FOUND';
    const body = req.body || {};
    const { tableId } = body;

    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.',
          requestId
        });
      }

      const restaurantId = req.user.restaurantId;

      if (!restaurantId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado no token.',
          requestId
        });
      }

      if (!tableId || typeof tableId !== 'string' || !tableId.trim()) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_TABLE_ID',
          message: 'ID da mesa (tableId) é obrigatório.',
          requestId
        });
      }

      const cleanTableId = tableId.trim();

      const result = await db.runTransaction(async (transaction) => {
        // --- ETAPA 1: LEITURAS (READS) - ANTES DE QUALQUER ESCRITA ---
        
        // 1a. Localizar a mesa
        const resolvedTable = await resolveTableRef(restaurantId, cleanTableId, transaction);
        if (!resolvedTable || !resolvedTable.ref) {
          const err: any = new Error('Mesa não encontrada.');
          err.code = 'TABLE_NOT_FOUND';
          throw err;
        }

        const tableData = resolvedTable.data || {};
        if (tableData.restaurantId && tableData.restaurantId !== restaurantId) {
          const err: any = new Error('Acesso negado: a mesa pertence a outro restaurante.');
          err.code = 'FORBIDDEN_RESTAURANT';
          throw err;
        }

        // 1b. Localizar a comanda ativa daquela mesa
        let resolvedTab: any = null;
        const targetTabId = tableData.comandaId || tableData.tabId;

        if (targetTabId && typeof targetTabId === 'string' && targetTabId.trim()) {
          try {
            resolvedTab = await resolveTabRef(restaurantId, targetTabId.trim(), transaction);
          } catch (err) {
            resolvedTab = null;
          }
        }

        if (!resolvedTab) {
          const activeTabsQuery = db.collection('tabs')
            .where('restaurantId', '==', restaurantId)
            .where('tableId', '==', cleanTableId)
            .where('status', 'in', ['OPEN', 'WAITING_ITEMS', 'WAITING_PAYMENT', 'PARTIALLY_PAID', 'aberta']);

          const activeTabsSnap = await transaction.get(activeTabsQuery);
          if (!activeTabsSnap.empty) {
            const docSnap = activeTabsSnap.docs[0];
            resolvedTab = {
              ref: docSnap.ref,
              data: docSnap.data(),
              source: 'ROOT'
            };
          }
        }

        // 1c. Se a comanda possuir mesas mescladas, realizar a leitura de suas referências
        const activeTab = resolvedTab?.data;
        const mergedTableRefs: any[] = [];

        if (activeTab && Array.isArray(activeTab.mergedTables)) {
          for (const mt of activeTab.mergedTables) {
            const mTableId = (typeof mt === 'string' ? mt : (mt?.id || mt?.tableId) || '').trim();
            if (mTableId && mTableId !== cleanTableId) {
              const mRes = await resolveTableRef(restaurantId, mTableId, transaction);
              if (mRes && mRes.ref) {
                mergedTableRefs.push(mRes.ref);
              }
            }
          }
        }

        // --- ETAPA 2: VALIDAÇÃO DAS REGRAS ---
        const now = new Date().toISOString();

        if (activeTab) {
          const isTabActive = activeTab.status === 'OPEN' || activeTab.status === 'WAITING_ITEMS' || activeTab.status === 'WAITING_PAYMENT' || activeTab.status === 'PARTIALLY_PAID' || activeTab.status === 'aberta';

          if (isTabActive) {
            const items = Array.isArray(activeTab.items) ? activeTab.items : [];
            const cancelledStatuses = new Set(['cancelled', 'cancelado', 'canceled', 'removed', 'removido']);

            const chargeableItems = items.filter((i: any) => {
              if (!i || typeof i !== 'object') return false;
              const statusStr = String(i.status || '').trim().toLowerCase();
              if (statusStr && cancelledStatuses.has(statusStr)) {
                return false;
              }
              const qty = Number(i.quantity ?? i.qtd ?? i.qty ?? i.amount ?? 0);
              return qty > 0;
            });

            const chargeableTotalCents = chargeableItems.reduce((acc: number, i: any) => {
              const qty = Number(i.quantity ?? i.qtd ?? i.qty ?? i.amount ?? 1);
              const itemCents = i.totalInCents ??
                (i.totalPrice != null ? Math.round(Number(i.totalPrice) * 100) : null) ??
                (i.total != null ? Math.round(Number(i.total) * 100) : null) ??
                (i.price != null ? Math.round(Number(i.price) * qty * 100) : null) ??
                (i.unitPrice != null ? Math.round(Number(i.unitPrice) * qty * 100) : null) ?? 0;
              return acc + Math.max(itemCents, 0);
            }, 0);

            const storedTotalCents = activeTab.totalInCents ?? Math.round((Number(activeTab.total || 0)) * 100);
            const effectiveTotalCents = chargeableItems.length === 0 ? 0 : (chargeableTotalCents > 0 ? chargeableTotalCents : storedTotalCents);

            const paidCents = activeTab.paidInCents ?? Math.round((Number(activeTab.paidAmount || 0)) * 100);
            const balanceDueCents = Math.max(effectiveTotalCents - paidCents, 0);

            // Regra estrita: Só é permitido liberar a mesa se NÃO houver pedidos/consumo em aberto nem saldo devedor
            const hasConsumptionOrBalance = chargeableItems.length > 0 || effectiveTotalCents > 0 || storedTotalCents > 0 || balanceDueCents > 0;

            if (hasConsumptionOrBalance) {
              const err: any = new Error('Esta mesa possui consumo, pedidos em aberto ou saldo devedor e não pode ser liberada.');
              err.code = 'HAS_CONSUMPTION';
              throw err;
            }

            // --- ETAPA 3: ESCRITAS (UPDATES) ---
            transaction.update(resolvedTab.ref, {
              status: 'CANCELLED',
              cancelledAt: now,
              cancellationReason: 'Comanda sem consumo cancelada ao liberar a mesa.',
              updatedAt: now
            });

            transaction.update(resolvedTable.ref, {
              status: 'AVAILABLE',
              comandaId: null,
              tabId: null,
              updatedAt: now
            });

            for (const mRef of mergedTableRefs) {
              transaction.update(mRef, {
                status: 'AVAILABLE',
                comandaId: null,
                tabId: null,
                updatedAt: now
              });
            }

            return {
              tableReleased: true,
              tabCancelled: true,
              message: 'Comanda sem consumo cancelada e mesa liberada com sucesso.'
            };
          }
        }

        // Se não existir comanda ativa para a mesa:
        // --- ETAPA 3: ESCRITAS (UPDATES) ---
        transaction.update(resolvedTable.ref, {
          status: 'AVAILABLE',
          comandaId: null,
          tabId: null,
          updatedAt: now
        });

        return {
          tableReleased: true,
          tabCancelled: false,
          message: 'Mesa liberada com sucesso.'
        };
      });

      return res.status(200).json({
        success: true,
        message: result.message || 'Mesa liberada com sucesso!',
        tableId: cleanTableId,
        ...result,
        requestId
      });

    } catch (error: any) {
      if (error.code === 'HAS_CONSUMPTION') {
        return res.status(409).json({
          success: false,
          code: 'HAS_CONSUMPTION',
          message: 'Esta mesa possui consumo ou valor pendente e não pode ser liberada.',
          error: error.message,
          requestId
        });
      }

      if (error.code === 'TABLE_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          code: 'TABLE_NOT_FOUND',
          message: 'Mesa não encontrada.',
          requestId
        });
      }

      if (error.code === 'FORBIDDEN_RESTAURANT') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_RESTAURANT',
          message: 'Acesso negado: a mesa pertence a outro restaurante.',
          requestId
        });
      }

      logger.error(`[AUDIT_LOG] RequestID: ${requestId} | Erro ao liberar mesa:`, { error: error.message });
      return res.status(400).json({
        success: false,
        code: error.code || 'RELEASE_TABLE_FAILED',
        message: error.message || 'Erro ao tentar liberar a mesa.',
        requestId
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: BUSCAR RODADAS DA COMANDA (GET /:tabId/rounds)
  // ==========================================
  router.get('/:tabId/rounds', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId || 'NO_REQUEST_ID_FOUND';
    const tabId = (req.params.tabId || '').trim();

    try {
      // 1. Autenticar usuário
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado ou sessão expirada.',
          requestId
        });
      }

      // 2. Validar restaurantId do token
      const tokenRestaurantId = req.user.restaurantId;
      if (!tokenRestaurantId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado no token de acesso.',
          requestId
        });
      }

      if (!tabId) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_TAB_ID',
          message: 'O ID da comanda (tabId) é obrigatório.',
          requestId
        });
      }

      // 3. Validar cargo permitido
      const allowedRoles = [
        'OWNER',
        'RESTAURANT',
        'RESTAURANTE',
        'RESTAURANT_ADMIN',
        'ADMIN',
        'MANAGER',
        'GERENTE',
        'WAITER',
        'GARCOM',
        'CASHIER',
        'CAIXA'
      ];
      const roleUpper = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
      if (!allowedRoles.includes(roleUpper)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Seu cargo não possui permissão para visualizar rodadas de comanda.',
          requestId
        });
      }

      // 4. Resolver comanda canônica e validar tenant
      let resolvedTab: any;
      try {
        resolvedTab = await resolveTabRef(tokenRestaurantId, tabId);
      } catch (err: any) {
        return res.status(404).json({
          success: false,
          code: 'TAB_NOT_FOUND',
          message: err.message || 'Comanda não encontrada.',
          requestId
        });
      }

      const currentTabData = resolvedTab.data || {};

      // 5. Validação granular para garçons
      if (['WAITER', 'GARCOM'].includes(roleUpper)) {
        const staffProfileSnap = await db.collection('restaurants').doc(tokenRestaurantId).collection('staffProfiles').doc(req.user.uid).get();
        if (staffProfileSnap.exists) {
          const staffData = staffProfileSnap.data() || {};
          const opStatus = (staffData.operationalStatus || staffData.status || '').toUpperCase();
          const isStaffActive = staffData.active !== false && opStatus !== 'INACTIVE' && opStatus !== 'BLOCKED' && opStatus !== 'DESATIVADO';

          if (!isStaffActive) {
            return res.status(403).json({
              success: false,
              code: 'WAITER_OPERATION_NOT_ALLOWED',
              message: 'Perfil de garçom inativo ou bloqueado.',
              requestId
            });
          }

          const waiterConfig = staffData.roleSpecificData || staffData.waiterConfig || {};
          if (waiterConfig.canViewOtherWaitersTabs === false) {
            const isMyTab = currentTabData.waiterId === req.user.uid || currentTabData.openedBy === req.user.uid;
            if (!isMyTab) {
              return res.status(403).json({
                success: false,
                code: 'FORBIDDEN_TAB_OWNERSHIP',
                message: 'Você não tem permissão para visualizar comandas de outros garçons.',
                requestId
              });
            }
          }
        }
      }

      // 6. Buscar somente orders com tabId correspondente no restaurante
      let ordersSnap = await db.collection('restaurants')
        .doc(tokenRestaurantId)
        .collection('orders')
        .where('tabId', '==', tabId)
        .get();

      // Fallback para pedidos antigos com comanda_id
      if (ordersSnap.empty) {
        const fallbackSnap = await db.collection('restaurants')
          .doc(tokenRestaurantId)
          .collection('orders')
          .where('comanda_id', '==', tabId)
          .get();
        if (!fallbackSnap.empty) {
          ordersSnap = fallbackSnap;
        }
      }

      const fetchedOrders = ordersSnap.docs.map(docSnap => {
        const d = docSnap.data() || {};
        return {
          id: docSnap.id,
          orderId: docSnap.id,
          restaurantId: d.restaurantId,
          tableId: d.tableId || null,
          tabId: d.tabId || d.comanda_id || tabId,
          source: d.source || d.origin || 'TABLE',
          origin: d.origin || d.source || 'TABLE',
          serviceMode: d.serviceMode || 'DINE_IN',
          orderStatus: d.orderStatus || 'PREPARING',
          status: d.status || d.canonicalStatus || 'cozinha',
          canonicalStatus: d.canonicalStatus || d.status || 'PREPARING',
          cliente_nome: d.cliente_nome || '',
          mesa_numero: d.mesa_numero || null,
          items: Array.isArray(d.items) ? d.items : [],
          valor_produtos: d.valor_produtos || 0,
          valor_total: d.valor_total || 0,
          subtotalInCents: d.subtotalInCents || 0,
          totalInCents: d.totalInCents || 0,
          pago: d.pago ?? false,
          sentBy: d.sentBy || null,
          data_criacao: d.data_criacao || d.createdAt || null,
          createdAt: d.createdAt || d.data_criacao || null,
          updatedAt: d.updatedAt || null
        };
      });

      // Ordenar cronologicamente (do mais antigo para o mais recente)
      fetchedOrders.sort((a: any, b: any) => {
        const timeA = new Date(a.createdAt || a.data_criacao || 0).getTime();
        const timeB = new Date(b.createdAt || b.data_criacao || 0).getTime();
        return timeA - timeB;
      });

      return res.status(200).json({
        success: true,
        data: {
          tabId,
          rounds: fetchedOrders
        },
        rounds: fetchedOrders,
        requestId
      });

    } catch (error: any) {
      logger.error(`[AUDIT_LOG] RequestID: ${requestId} | Erro ao buscar rodadas da comanda:`, { error });
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: error.message || 'Erro interno ao buscar rodadas da comanda.',
        requestId
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: ABERTURA DE COMANDA PARA MESA
  // ==========================================
  router.post('/open-for-table', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId || 'NO_REQUEST_ID_FOUND';
    const body = req.body || {};
    const { tableId, peopleCount, waiterId, customerName, observation } = body;

    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.'
        });
      }

      const uid = req.user.uid;
      const restaurantId = req.user.restaurantId;

      if (!restaurantId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado.'
        });
      }

      if (!tableId || typeof tableId !== 'string' || !tableId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'tableId é obrigatório para abrir comanda.'
        });
      }

      const count = Number(peopleCount);
      if (isNaN(count) || count <= 0) {
        return res.status(400).json({
          success: false,
          message: 'peopleCount deve ser um número inteiro maior que zero.'
        });
      }

      // Validar perfil e permissões operacionais do garçom se existir staffProfile
      const staffProfileSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(uid).get();
      if (staffProfileSnap.exists) {
        const staffData = staffProfileSnap.data();
        const roleSpecific = staffData?.roleSpecificData || {};
        if (roleSpecific.canOpenTab === false) {
          return res.status(403).json({
            success: false,
            message: 'Acesso negado: Seu perfil não possui permissão para abrir comanda.'
          });
        }
      }

      // Executar transação atômica no servidor usando Admin SDK
      const result = await db.runTransaction(async (transaction) => {
        const cleanTableId = tableId.trim();
        const resolvedTable = await resolveTableRef(restaurantId, cleanTableId, transaction);

        if (!resolvedTable || !resolvedTable.snapshot?.exists) {
          throw new Error('Mesa não encontrada.');
        }

        const tableRef = resolvedTable.ref;
        const tableSnap = resolvedTable.snapshot;
        const tableData = tableSnap.data() || {};

        if (tableData.restaurantId && tableData.restaurantId !== restaurantId) {
          throw new Error('Acesso negado: Mesa pertence a outro restaurante.');
        }

        if (tableData.active === false) {
          throw new Error('Mesa está inativa e não pode receber comanda.');
        }

        // Verificar comandas ativas na mesa
        const activeStatuses = ['OPEN', 'WAITING_ITEMS', 'WAITING_PAYMENT', 'PARTIALLY_PAID'];
        const activeTabsQuery = db.collection('tabs')
          .where('restaurantId', '==', restaurantId)
          .where('tableId', '==', cleanTableId)
          .where('status', 'in', activeStatuses);

        const activeTabsSnap = await transaction.get(activeTabsQuery);
        if (!activeTabsSnap.empty) {
          throw new Error('Já existe uma comanda ativa para esta mesa.');
        }

        const now = new Date().toISOString();
        const tabRef = db.collection('tabs').doc();
        const assignedWaiter = waiterId && typeof waiterId === 'string' && waiterId.trim() ? waiterId.trim() : uid;

        const resolvedTableName = tableData.name || tableData.nome || (tableData.number !== undefined && tableData.number !== null ? `Mesa ${tableData.number}` : (tableData.numero !== undefined && tableData.numero !== null ? `Mesa ${tableData.numero}` : (body.tableName || '')));
        const resolvedTableNumber = (tableData.number !== undefined && tableData.number !== null)
          ? tableData.number
          : ((tableData.numero !== undefined && tableData.numero !== null)
            ? tableData.numero
            : (body.tableNumber !== undefined && body.tableNumber !== null ? body.tableNumber : null));

        let resolvedWaiterName = (body.waiterName && typeof body.waiterName === 'string' && body.waiterName.trim())
          ? body.waiterName.trim()
          : null;

        if (!resolvedWaiterName) {
          if (assignedWaiter === uid) {
            resolvedWaiterName = req.user?.nome || req.user?.name || req.user?.displayName || null;
            if (!resolvedWaiterName && staffProfileSnap.exists) {
              const sData = staffProfileSnap.data();
              resolvedWaiterName = sData?.nome || sData?.name || sData?.displayName || null;
            }
          } else {
            try {
              const assignedStaffSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(assignedWaiter).get();
              if (assignedStaffSnap.exists) {
                const sData = assignedStaffSnap.data();
                resolvedWaiterName = sData?.nome || sData?.name || sData?.displayName || null;
              }
              if (!resolvedWaiterName) {
                const assignedUserSnap = await db.collection('users').doc(assignedWaiter).get();
                if (assignedUserSnap.exists) {
                  const uData = assignedUserSnap.data();
                  resolvedWaiterName = uData?.nome || uData?.name || uData?.displayName || null;
                }
              }
              if (!resolvedWaiterName) {
                const legacyWaiterSnap = await db.collection('restaurants').doc(restaurantId).collection('waiters').doc(assignedWaiter).get();
                if (legacyWaiterSnap.exists) {
                  const wData = legacyWaiterSnap.data();
                  resolvedWaiterName = wData?.nome || wData?.name || null;
                }
              }
            } catch (e) {
              // Ignore lookup errors
            }
          }
        }

        if (!resolvedWaiterName) {
          resolvedWaiterName = req.user?.nome || req.user?.name || req.user?.displayName || null;
        }

        const newTabData = {
          restaurantId,
          tableId: cleanTableId,
          tableName: resolvedTableName || null,
          tableNumber: resolvedTableNumber,
          hallId: tableData.hallId || null,
          waiterId: assignedWaiter,
          waiterName: resolvedWaiterName || null,
          customerName: customerName ? String(customerName).trim() : '',
          observation: observation ? String(observation).trim() : '',
          peopleCount: Math.floor(count),
          status: 'OPEN',
          origin: 'TABLE',
          openedBy: uid,
          openedAt: now,
          createdAt: now,
          updatedAt: now,
          items: [],
          totalInCents: 0,
          paidInCents: 0
        };

        transaction.set(tabRef, newTabData);
        transaction.update(tableRef, {
          status: 'OCCUPIED',
          comandaId: tabRef.id,
          tabId: tabRef.id,
          updatedAt: now
        });

        return {
          tab: { id: tabRef.id, ...newTabData },
          table: { id: tableSnap.id, ...tableData, status: 'OCCUPIED', comandaId: tabRef.id, tabId: tabRef.id, updatedAt: now }
        };
      });

      return res.status(200).json({
        success: true,
        message: 'Comanda aberta com sucesso.',
        tab: result.tab,
        table: result.table,
        requestId
      });

    } catch (error: any) {
      logger.error(`[OPEN_TAB_ERROR] RequestID: ${requestId}`, { error: error.message });
      return res.status(400).json({
        success: false,
        message: error.message || 'Erro ao abrir comanda no servidor.',
        requestId
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: ENVIO DA RODADA
  // ==========================================
  router.post('/send-round', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em /send-round', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    const body = req.body || {};
    const {
      clientActionId,
      tableId,
      tabId,
      origin,
      items,
      restaurantId,
      waiterId: bodyWaiterId,
      waiterName: bodyWaiterName
    } = body;

    try {
      // 1. Autenticar usuário
      if (!req.user || !req.user.uid) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | Autenticação falhou: req.user ausente.`);
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado ou sessão expirada.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 2. Validar restaurantId do token
      const tokenRestaurantId = req.user.restaurantId;
      if (!tokenRestaurantId) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Sem restaurantId no token.`);
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado no token de acesso.',
          data: null,
          metadata: null,
          requestId
        });
      }

      if (!restaurantId) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | restaurantId ausente no corpo.`);
        return res.status(400).json({
          success: false,
          code: 'MISSING_RESTAURANT_ID',
          message: 'O campo restaurantId é obrigatório no corpo da requisição.',
          data: null,
          metadata: null,
          requestId
        });
      }

      if (tokenRestaurantId !== restaurantId) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Tentativa de acesso a outro restaurante.`);
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_RESTAURANT_MISMATCH',
          message: 'Você não tem permissão para realizar operações em outro restaurante.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 3. Validar cargo e permissão para enviar rodada
      const allowedRoles = [
        'OWNER',
        'RESTAURANT',
        'RESTAURANTE',
        'RESTAURANT_ADMIN',
        'ADMIN',
        'MANAGER',
        'GERENTE',
        'WAITER',
        'GARCOM',
        'CASHIER',
        'CAIXA'
      ];
      const roleUpper = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
      if (!allowedRoles.includes(roleUpper)) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Cargo não permitido: ${roleUpper}`);
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Seu cargo não possui permissão para enviar rodadas de comanda.',
          data: null,
          metadata: null,
          requestId
        });
      }

      let cachedStaffWaiterName: string | null = null;

      // Validação granular específica de staffProfile para garçons
      if (['WAITER', 'GARCOM'].includes(roleUpper)) {
        const staffProfileSnap = await db.collection('restaurants').doc(tokenRestaurantId).collection('staffProfiles').doc(req.user.uid).get();
        if (!staffProfileSnap.exists) {
          logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Staff profile não encontrado.`);
          return res.status(403).json({
            success: false,
            code: 'WAITER_OPERATION_NOT_ALLOWED',
            message: 'Perfil operacional do garçom não foi encontrado.',
            data: null,
            metadata: null,
            requestId
          });
        }

        const staffData = staffProfileSnap.data() || {};
        cachedStaffWaiterName = staffData.nome || staffData.name || staffData.displayName || null;
        const opStatus = (staffData.operationalStatus || staffData.status || '').toUpperCase();
        const isStaffActive = staffData.active !== false && opStatus !== 'INACTIVE' && opStatus !== 'BLOCKED' && opStatus !== 'DESATIVADO';

        if (!isStaffActive) {
          logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Staff profile inativo ou bloqueado: ${opStatus}`);
          return res.status(403).json({
            success: false,
            code: 'WAITER_OPERATION_NOT_ALLOWED',
            message: 'Perfil de garçom inativo ou bloqueado.',
            data: null,
            metadata: null,
            requestId
          });
        }

        const roleData = staffData.roleSpecificData || staffData.waiterConfig || staffData;
        const canOpenTab = roleData.canOpenTab ?? roleData.createOrders ?? true;
        if (canOpenTab === false) {
          logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Garçom sem permissão canOpenTab.`);
          return res.status(403).json({
            success: false,
            code: 'WAITER_OPERATION_NOT_ALLOWED',
            message: 'Seu perfil de garçom não possui permissão para lançar pedidos ou enviar rodadas.',
            data: null,
            metadata: null,
            requestId
          });
        }
      }

      // 4. Buscar a comanda e 5. Confirmar que a comanda pertence ao mesmo restaurante
      if (!tabId || typeof tabId !== 'string' || !tabId.trim()) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | tabId ausente.`);
        return res.status(400).json({
          success: false,
          code: 'MISSING_TAB_ID',
          message: 'O identificador da comanda (tabId) é obrigatório.',
          data: null,
          metadata: null,
          requestId
        });
      }

      let tabRef: any;
      let tabData: any;
      try {
        const resolved = await resolveTabRef(tokenRestaurantId, tabId);
        tabRef = resolved.ref;
        tabData = resolved.data;
      } catch (err: any) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Erro ao resolver comanda ${tabId}: ${err.message}`);
        const isForbidden = err.message.includes('FORBIDDEN');
        return res.status(isForbidden ? 403 : 404).json({
          success: false,
          code: isForbidden ? 'FORBIDDEN_RESTRICTION' : 'TAB_NOT_FOUND',
          message: isForbidden ? 'Acesso negado: A comanda pertence a outro restaurante.' : 'Comanda não encontrada.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 6. Validar o payload
      if (!clientActionId || typeof clientActionId !== 'string' || !clientActionId.trim()) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | clientActionId ausente.`);
        return res.status(400).json({
          success: false,
          code: 'MISSING_ACTION_ID',
          message: 'clientActionId é obrigatório para garantir idempotência.',
          data: null,
          metadata: null,
          requestId
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Carrinho vazio.`);
        return res.status(400).json({
          success: false,
          code: 'EMPTY_CART',
          message: 'O carrinho da rodada está vazio.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // Validar cada item antes de iniciar gravação
      for (const item of items) {
        if (!item || typeof item !== 'object') {
          logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Item inválido.`);
          return res.status(400).json({
            success: false,
            code: 'INVALID_ITEM_FORMAT',
            message: 'O formato do item no carrinho é inválido.',
            data: null,
            metadata: null,
            requestId
          });
        }

        const productId = item.productId || item.produtoId;
        if (!productId || typeof productId !== 'string' || !productId.trim()) {
          logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Item com productId ausente.`);
          return res.status(400).json({
            success: false,
            code: 'MISSING_PRODUCT_ID',
            message: 'O identificador do produto (productId) é obrigatório para cada item.',
            data: null,
            metadata: null,
            requestId
          });
        }

        const quantity = item.quantity !== undefined ? item.quantity : item.quantidade;
        if (typeof quantity !== 'number' || isNaN(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
          logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Quantidade inválida: ${quantity}`);
          return res.status(400).json({
            success: false,
            code: 'INVALID_QUANTITY',
            message: `A quantidade do item deve ser um número inteiro maior que zero.`,
            data: null,
            metadata: null,
            requestId
          });
        }
      }

      const actionRef = db.collection('restaurants').doc(tokenRestaurantId).collection('processedActions').doc(clientActionId.trim());

      // Fast check outside transaction for idempotency
      const existingActionSnap = await actionRef.get();
      if (existingActionSnap.exists) {
        const actionData = existingActionSnap.data()!;
        logger.info(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | Idempotência acionada (fora da tx).`);
        return res.status(200).json({
          success: true,
          code: 'SUCCESS',
          message: 'Rodada já foi enviada anteriormente.',
          data: {
            orderId: actionData.orderId,
            alreadyProcessed: true
          },
          metadata: {
            itemsCount: items.length
          },
          requestId
        });
      }

      // Collect all unique Product IDs and Option Item IDs to prepare transaction reads
      const uniqueProductIds = Array.from(new Set(
        items.map((i: any) => (i.productId || i.produtoId || '').trim()).filter(Boolean)
      ));

      const uniqueOptionIds = Array.from(new Set(
        items.flatMap((i: any) => {
          const rawOpts = Array.isArray(i.options) ? i.options : (Array.isArray(i.adicionaisSelecionados) ? i.adicionaisSelecionados : []);
          return rawOpts.map((o: any) => (o.itemId || o.id || o.adicionalId || '').trim());
        }).filter(Boolean)
      ));

      // 7. Executar a gravação com transação altamente otimizada e auto-recuperável contra concorrência
      let attempts = 0;
      const maxAttempts = 8;
      let result;

      while (attempts < maxAttempts) {
        try {
          attempts++;
          result = await db.runTransaction(async (transaction) => {
            // Double check idempotency inside transaction
            const inTxActionSnap = await transaction.get(actionRef);
            if (inTxActionSnap.exists) {
              const actionData = inTxActionSnap.data()!;
              return {
                success: true,
                code: 'SUCCESS',
                message: 'Rodada já foi enviada anteriormente.',
                data: {
                  orderId: actionData.orderId,
                  alreadyProcessed: true
                },
                metadata: {
                  itemsCount: items.length
                }
              };
            }

            // Fetch Tab, Table, Products, and Option Items in parallel (ALL READS BEFORE WRITES)
            const tableRef = (tableId && typeof tableId === 'string' && tableId.trim())
              ? db.collection('restaurants').doc(tokenRestaurantId).collection('tables').doc(tableId.trim())
              : (tabData.tableId ? db.collection('restaurants').doc(tokenRestaurantId).collection('tables').doc(tabData.tableId) : null);

            const productRefsMap = new Map(
              uniqueProductIds.map(id => [id, db.collection('restaurants').doc(tokenRestaurantId).collection('products').doc(id)])
            );

            const optionRefsMap = new Map(
              uniqueOptionIds.map(id => [id, db.collection('restaurants').doc(tokenRestaurantId).collection('optionItems').doc(id)])
            );

            const [tabSnap, tableSnap, ...allSnapshots] = await Promise.all([
              transaction.get(tabRef as FirebaseFirestore.DocumentReference),
              tableRef ? transaction.get(tableRef as FirebaseFirestore.DocumentReference) : Promise.resolve(null),
              ...Array.from(productRefsMap.values()).map(ref => transaction.get(ref as FirebaseFirestore.DocumentReference)),
              ...Array.from(optionRefsMap.values()).map(ref => transaction.get(ref as FirebaseFirestore.DocumentReference))
            ]);

            const currentTabData = tabSnap.exists ? tabSnap.data()! : tabData;
            const tableData = tableSnap?.exists ? tableSnap.data() : null;

            const productSnaps = allSnapshots.slice(0, uniqueProductIds.length);
            const optionSnaps = allSnapshots.slice(uniqueProductIds.length);

            const productSnapsMap = new Map<string, any>();
            for (let i = 0; i < uniqueProductIds.length; i++) {
              productSnapsMap.set(uniqueProductIds[i], productSnaps[i]);
            }

            const optionSnapsMap = new Map<string, any>();
            for (let i = 0; i < uniqueOptionIds.length; i++) {
              optionSnapsMap.set(uniqueOptionIds[i], optionSnaps[i]);
            }

            // Full Server-Side Validation and Canonical Recalculation of Each Item
            const canonicalItems: any[] = [];

            for (const item of items) {
              const productId = (item.productId || item.produtoId || '').trim();
              const quantity = item.quantity !== undefined ? item.quantity : item.quantidade;

              if (typeof quantity !== 'number' || isNaN(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
                const err: any = new Error(`A quantidade do item deve ser um número inteiro maior que zero.`);
                err.code = 'INVALID_QUANTITY';
                err.status = 400;
                throw err;
              }

              // 1. Product Document Verification
              const pSnap = productSnapsMap.get(productId);
              if (!pSnap || !pSnap.exists) {
                const err: any = new Error(`O produto "${item.productName || item.nome || productId}" (ID: ${productId}) não existe no cardápio.`);
                err.code = 'PRODUCT_NOT_FOUND';
                err.status = 404;
                throw err;
              }

              const pData = pSnap.data()!;

              // 2. Active Status Verification
              const isActive = pData.status === 'ativo' || pData.ativo !== false;
              if (!isActive) {
                const err: any = new Error(`O produto "${pData.nome || item.productName || 'Item'}" está inativo ou indisponível.`);
                err.code = 'PRODUCT_UNAVAILABLE';
                err.status = 422;
                throw err;
              }

              // 3. Sales Channel Verification (Waiter)
              if (!isProductAvailableForChannel(pData, 'waiter')) {
                const err: any = new Error(`O produto "${pData.nome || item.productName || 'Item'}" não está disponível para o canal Garçom.`);
                err.code = 'PRODUCT_NOT_AVAILABLE_FOR_WAITER';
                err.status = 422;
                throw err;
              }

              // 4. Size / Variation Verification & Base Price Calculation
              const productSizes: any[] = Array.isArray(pData.sizes)
                ? pData.sizes
                : (Array.isArray(pData.variations) ? pData.variations : (Array.isArray(pData.variacoes) ? pData.variacoes : (Array.isArray(pData.tamanhos) ? pData.tamanhos : [])));

              let matchedSize: any = null;
              const rawSizeObj = item.size || item.tamanho || item.tamanhoSelecionado;
              const requestedSizeName = typeof rawSizeObj === 'object' && rawSizeObj !== null
                ? (rawSizeObj.nome || rawSizeObj.name || '')
                : (typeof rawSizeObj === 'string' ? rawSizeObj : (item.sizeId || item.variationId || ''));

              if (productSizes.length > 0) {
                if (requestedSizeName && requestedSizeName.trim()) {
                  matchedSize = productSizes.find((s: any) => {
                    const sName = typeof s === 'string' ? s : (s.nome || s.name || s.id || '');
                    return sName.toLowerCase().trim() === requestedSizeName.toLowerCase().trim();
                  });
                  if (!matchedSize) {
                    const err: any = new Error(`A variação/tamanho "${requestedSizeName}" selecionado não é válida para o produto "${pData.nome}".`);
                    err.code = 'INVALID_VARIATION';
                    err.status = 400;
                    throw err;
                  }
                } else {
                  const err: any = new Error(`É necessário selecionar um tamanho/variação para o produto "${pData.nome}".`);
                  err.code = 'INVALID_VARIATION';
                  err.status = 400;
                  throw err;
                }
              } else if (requestedSizeName && requestedSizeName.trim()) {
                const err: any = new Error(`O produto "${pData.nome}" não possui opções de tamanho/variação.`);
                err.code = 'INVALID_VARIATION';
                err.status = 400;
                throw err;
              }

              // Calculate canonical base unit price in cents using domain helper
              const baseUnitPriceCents = resolveChannelUnitPriceCents(pData, matchedSize, 'waiter');

              // 5. Option Groups and Addons Verification
              const productOptionGroups: any[] = Array.isArray(pData.optionGroups)
                ? pData.optionGroups
                : (Array.isArray(pData.gruposOpcoes) ? pData.gruposOpcoes : (Array.isArray(pData.grupos_opcoes) ? pData.grupos_opcoes : []));

              const allowedGroupsMap = new Map<string, any>();
              for (const g of productOptionGroups) {
                const gId = g.groupId || g.id || g.grupoId;
                if (gId) {
                  allowedGroupsMap.set(gId, g);
                }
              }

              const itemOptions = Array.isArray(item.options)
                ? item.options
                : (Array.isArray(item.adicionaisSelecionados) ? item.adicionaisSelecionados : []);

              const sentOptionsByGroup = new Map<string, any[]>();
              const validatedOptionsForItem: any[] = [];
              let itemOptionsTotalCents = 0;
              const seenOptionKeysInItem = new Set<string>();

              for (const opt of itemOptions) {
                const gId = opt.groupId || opt.grupoId;
                const optItemId = opt.itemId || opt.id || opt.adicionalId;

                if (!gId || !allowedGroupsMap.has(gId)) {
                  const err: any = new Error(`O grupo de opções (ID: "${gId || 'desconhecido'}") não pertence ao produto "${pData.nome}".`);
                  err.code = 'INVALID_OPTION_GROUP';
                  err.status = 400;
                  throw err;
                }

                const groupDef = allowedGroupsMap.get(gId)!;

                if (!optItemId) {
                  const err: any = new Error(`Identificador do adicional/opção ausente para o produto "${pData.nome}".`);
                  err.code = 'INVALID_OPTION';
                  err.status = 400;
                  throw err;
                }

                const optionKey = `${gId}_${optItemId}`;
                if (seenOptionKeysInItem.has(optionKey)) {
                  const err: any = new Error(`A opção/adicional (ID: "${optItemId}") foi enviada duplicada no mesmo item.`);
                  err.code = 'DUPLICATE_OPTION';
                  err.status = 400;
                  throw err;
                }
                seenOptionKeysInItem.add(optionKey);

                const optSnap = optionSnapsMap.get(optItemId);
                if (!optSnap || !optSnap.exists) {
                  const err: any = new Error(`A opção/adicional selecionado (ID: "${optItemId}") não existe.`);
                  err.code = 'INVALID_OPTION';
                  err.status = 400;
                  throw err;
                }

                const optData = optSnap.data()!;
                if (optData.ativo === false || optData.status === 'inativo') {
                  const err: any = new Error(`A opção "${optData.nome || optItemId}" está inativa ou indisponível.`);
                  err.code = 'INVALID_OPTION';
                  err.status = 400;
                  throw err;
                }

                const optDataGroupId = optData.grupoId || optData.groupId;
                if (optDataGroupId && optDataGroupId !== gId) {
                  const err: any = new Error(`A opção "${optData.nome || optItemId}" não pertence ao grupo "${groupDef.nome || gId}".`);
                  err.code = 'INVALID_OPTION';
                  err.status = 400;
                  throw err;
                }

                const currentGroupSelections = sentOptionsByGroup.get(gId) || [];
                currentGroupSelections.push(optData);
                sentOptionsByGroup.set(gId, currentGroupSelections);

                const officialOptPriceNumber = typeof optData.preco === 'number' ? optData.preco : (typeof optData.price === 'number' ? optData.price : 0);
                const officialOptPriceCents = Math.round(officialOptPriceNumber * 100);
                itemOptionsTotalCents += officialOptPriceCents;

                validatedOptionsForItem.push({
                  groupId: gId,
                  groupName: groupDef.nome || opt.groupName || opt.nomeGrupo || '',
                  itemId: optItemId,
                  itemNome: optData.nome || opt.itemNome || opt.nome || '',
                  preco: officialOptPriceNumber
                });
              }

              // Validate Option Group Min / Max / Required constraints
              for (const grp of productOptionGroups) {
                const gId = grp.groupId || grp.id || grp.grupoId;
                const gName = grp.nome || grp.name || 'Grupo de opções';
                const isRequired = grp.obrigatorio === true || grp.required === true;
                const minRequired = typeof grp.min === 'number' ? grp.min : (isRequired ? 1 : 0);
                const maxAllowed = typeof grp.max === 'number' && grp.max > 0 ? grp.max : 0;

                const count = (sentOptionsByGroup.get(gId) || []).length;

                if (minRequired > 0 && count < minRequired) {
                  const err: any = new Error(`Selecione pelo menos ${minRequired} opção(ões) no grupo "${gName}" para o produto "${pData.nome}".`);
                  err.code = 'REQUIRED_OPTION_GROUP_NOT_SATISFIED';
                  err.status = 400;
                  throw err;
                }

                if (maxAllowed > 0 && count > maxAllowed) {
                  const err: any = new Error(`Você selecionou ${count} opções, excedendo o limite máximo de ${maxAllowed} no grupo "${gName}" para o produto "${pData.nome}".`);
                  err.code = 'OPTION_GROUP_MAX_EXCEEDED';
                  err.status = 400;
                  throw err;
                }
              }

              // 6. Recalculate Final Canonical Unit Price and Total Price for Item
              const calculatedUnitPriceCents = baseUnitPriceCents + itemOptionsTotalCents;
              const calculatedTotalPriceCents = calculatedUnitPriceCents * quantity;

              // 7. Stock Control Check and Updating
              const hasStockControl = pData.controlarEstoque === true || pData.stockControl === true;
              if (hasStockControl) {
                const currentStock = typeof pData.estoqueAtual === 'number' ? pData.estoqueAtual : (typeof pData.estoque === 'number' ? pData.estoque : (typeof pData.stock === 'number' ? pData.stock : 0));
                const permitirVenda = pData.permitirVendaSemEstoque === true;
                if (!permitirVenda && currentStock < quantity) {
                  const err: any = new Error(`Estoque insuficiente para o produto "${pData.nome || 'Item'}". Disponível: ${currentStock}, Solicitado: ${quantity}`);
                  err.code = 'INSUFFICIENT_STOCK';
                  err.status = 422;
                  throw err;
                }
                const newStock = currentStock - quantity;
                transaction.update(pSnap.ref, {
                  estoqueAtual: newStock,
                  estoque: newStock,
                  stock: newStock,
                  updatedAt: new Date().toISOString()
                });
              }

              // Build Canonical Item Representation
              canonicalItems.push({
                id: item.id || db.collection('restaurants').doc(tokenRestaurantId).collection('orderItems').doc().id,
                productId,
                productName: pData.nome || item.productName || 'Item',
                quantity,
                unitPriceCents: calculatedUnitPriceCents,
                totalPriceCents: calculatedTotalPriceCents,
                observation: typeof item.observation === 'string' ? item.observation.trim().substring(0, 500) : (typeof item.observacao === 'string' ? item.observacao.trim().substring(0, 500) : ''),
                size: matchedSize ? { nome: matchedSize.nome, preco: matchedSize.preco } : null,
                options: validatedOptionsForItem
              });
            }

            // Create canonical order document
            const orderRef = db.collection('restaurants').doc(tokenRestaurantId).collection('orders').doc();
            const orderId = orderRef.id;
            const now = new Date().toISOString();

            const totalRoundCents = canonicalItems.reduce((sum: number, item: any) => sum + item.totalPriceCents, 0);
            const totalRoundVal = totalRoundCents / 100;

            const isWaiterRole = req.user?.tipo_usuario === 'waiter' || req.user?.tipo_usuario === 'garcom' || req.user?.role === 'WAITER';
            const finalOrigin = (origin === 'WAITER' || origin === 'TABLE') ? origin : (isWaiterRole || currentTabData?.waiterId ? 'WAITER' : 'TABLE');

            const tableNumOrName = tableData?.number || tableData?.name || '';
            const tableLabel = tableNumOrName ? `Mesa ${tableNumOrName}` : '';
            const customerLabel = currentTabData?.customerName ? currentTabData.customerName : 'Comanda';
            const clienteNome = tableLabel ? `${tableLabel} - ${customerLabel}` : customerLabel;

            const normalizedOrderItems = canonicalItems.map((i: any) => ({
              id: i.id,
              productId: i.productId,
              nome: i.productName,
              quantidade: i.quantity,
              precoUnitario: i.unitPriceCents / 100,
              unitPriceCents: i.unitPriceCents,
              valorTotal: i.totalPriceCents / 100,
              totalPriceCents: i.totalPriceCents,
              observacao: i.observation,
              tamanhoSelecionado: i.size,
              adicionaisSelecionados: i.options
            }));

            const existingOrdersInTab = new Set(
              (Array.isArray(currentTabData?.items) ? currentTabData.items : [])
                .map((i: any) => i.orderId)
                .filter(Boolean)
            );
            const roundNumber = existingOrdersInTab.size + 1;
            const resolvedWaiterId = bodyWaiterId || req.user?.uid || currentTabData?.waiterId || null;
            const waiterResponsible = (bodyWaiterName && typeof bodyWaiterName === 'string' && bodyWaiterName.trim())
              ? bodyWaiterName.trim()
              : (req.user?.nome || req.user?.name || req.user?.displayName || cachedStaffWaiterName || currentTabData?.waiterName || null);

            const resolvedTableId = tableId || currentTabData?.tableId || (tableRef ? tableRef.id : null) || null;
            const resolvedTableName = tableData?.name || tableData?.nome || (tableNumOrName ? String(tableNumOrName) : null);
            const resolvedTableNumber = (tableData?.number !== undefined && tableData?.number !== null)
              ? tableData.number
              : ((tableData?.numero !== undefined && tableData?.numero !== null)
                ? tableData.numero
                : (typeof tableNumOrName === 'number' ? tableNumOrName : (tableNumOrName ? String(tableNumOrName) : null)));
            const resolvedTabId = tabId || currentTabData?.id || null;
            const resolvedRoundId = clientActionId || orderId;

            const orderData = {
              id: orderId,
              restaurantId: tokenRestaurantId,
              tableId: resolvedTableId,
              tableName: resolvedTableName,
              tableNumber: resolvedTableNumber,
              tabId: resolvedTabId,
              comandaId: resolvedTabId,
              comanda_id: resolvedTabId,
              waiterId: resolvedWaiterId,
              waiterName: waiterResponsible,
              garcom_nome: waiterResponsible,
              roundId: resolvedRoundId,
              roundNumber: roundNumber,
              numero_rodada: roundNumber,
              origem: 'GARCOM',
              source: 'GARCOM',
              origin: 'GARCOM',
              serviceMode: 'DINE_IN',
              orderStatus: 'PREPARING',
              status: 'cozinha', // Canonical status for KDS and printing
              canonicalStatus: 'PREPARING',
              cliente_nome: clienteNome,
              mesa_numero: tableNumOrName || null,
              items: normalizedOrderItems,
              itens: normalizedOrderItems,
              valor_produtos: totalRoundVal,
              valor_total: totalRoundVal,
              subtotalInCents: totalRoundCents,
              totalInCents: totalRoundCents,
              pago: false,
              financialSettlementStatus: 'NOT_REQUIRED',
              clientActionId,
              sentBy: {
                uid: req.user.uid,
                name: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Operador',
                email: req.user.email || ''
              },
              data_criacao: now,
              createdAt: now,
              updatedAt: now
            };

            transaction.set(orderRef, removeUndefinedRecursively(orderData));

            // Update Tab (Comanda) if tab exists
            if (tabRef && tabSnap?.exists) {
              const currentTabItems = Array.isArray(currentTabData.items) ? currentTabData.items : [];
              const newRoundTabItems = canonicalItems.map((i: any) => ({
                id: i.id || db.collection('dummy').doc().id,
                orderId,
                produtoId: i.productId,
                produtoNome: i.productName,
                quantidade: i.quantity,
                precoUnitario: i.unitPriceCents / 100,
                unitPriceCents: i.unitPriceCents,
                total: i.totalPriceCents / 100,
                totalPriceCents: i.totalPriceCents,
                status: 'em_preparo',
                observacoes: i.observation,
                pedidosAdicionais: {
                  size: i.size,
                  options: i.options
                },
                sentAt: now
              }));

              const updatedTabItems = [...currentTabItems, ...newRoundTabItems];
              const prevTotalCents = currentTabData.totalInCents ?? Math.round((currentTabData.total || 0) * 100);
              const newTotalCents = prevTotalCents + totalRoundCents;
              const prevPaidCents = currentTabData.paidInCents ?? Math.round((currentTabData.paidAmount || 0) * 100);
              const newRemainingCents = Math.max(0, newTotalCents - prevPaidCents);

              transaction.update(tabRef, removeUndefinedRecursively({
                items: updatedTabItems,
                totalInCents: newTotalCents,
                subtotal: newTotalCents / 100,
                total: newTotalCents / 100,
                totalInBrl: newTotalCents / 100,
                remainingInCents: newRemainingCents,
                status: 'OPEN', // Comanda explicitly remains open
                lastOrderId: orderId,
                updatedAt: now
              }));
            }

            // Update Table status to OCCUPIED if table was AVAILABLE
            if (tableRef && tableSnap?.exists) {
              if (tableData.status === 'AVAILABLE' || tableData.status === 'LIVRE') {
                transaction.update(tableRef, {
                  status: 'OCCUPIED',
                  updatedAt: now
                });
              }
            }

            // Record processed action for idempotency
            transaction.set(actionRef, removeUndefinedRecursively({
              clientActionId,
              orderId,
              restaurantId: tokenRestaurantId,
              processedAt: now
            }));

            return {
              success: true,
              code: 'SUCCESS',
              message: 'Rodada enviada com sucesso.',
              data: {
                orderId,
                alreadyProcessed: false,
                order: orderData
              },
              metadata: {
                itemsCount: canonicalItems.length
              }
            };
          });
          break; // Succeeded! Break the retry loop
        } catch (error: any) {
          const isAborted = error.code === 10 || 
                            error.status === 10 || 
                            error.message?.includes('ABORTED') || 
                            error.message?.includes('conflict') ||
                            error.message?.includes('contention') ||
                            error.message?.includes('Please retry the transaction');

          if (isAborted && attempts < maxAttempts) {
            const delay = 40 + Math.random() * (attempts * 100);
            logger.warn(`[AUDIT_LOG] RequestID: ${requestId} | Concurrencia detectada (send-round). Tentativa ${attempts}/${maxAttempts} aguardando ${delay.toFixed(0)}ms.`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }

      logger.info(`[AUDIT_LOG] RequestID: ${requestId} | User: ${req.user.uid} | RestaurantID: ${tokenRestaurantId} | TabID: ${tabId} | ItemsCount: ${items.length} | Result: SUCCESS`);
      
      return res.status(200).json({
        ...result,
        requestId
      });

    } catch (error: any) {
      logger.error(`[AUDIT_LOG] RequestID: ${requestId} | Erro ao enviar rodada da comanda:`, { error });

      // Handle custom transaction validation errors with appropriate HTTP status codes
      if (error.code && error.status) {
        return res.status(error.status).json({
          success: false,
          code: error.code,
          message: error.message,
          data: null,
          metadata: null,
          requestId
        });
      }

      if (error.code === 'INSUFFICIENT_STOCK') {
        return res.status(422).json({
          success: false,
          code: 'INSUFFICIENT_STOCK',
          message: error.message,
          data: null,
          metadata: null,
          requestId
        });
      }

      return res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Erro interno inesperado ao processar o envio da rodada.',
        data: null,
        metadata: null,
        requestId
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: TRANSFERÊNCIA DE MESA
  // ==========================================
  router.post('/transfer-table', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        return res.status(400).json({
          code: 'MISSING_RESTAURANT_ID',
          error: 'ID do restaurante não encontrado no token.'
        });
      }

      const { tabId, targetTableId } = req.body || {};

      if (!tabId || typeof tabId !== 'string' || !tabId.trim()) {
        return res.status(400).json({
          code: 'MISSING_TAB_ID',
          error: 'O ID da comanda (tabId) é obrigatório.'
        });
      }

      if (!targetTableId || typeof targetTableId !== 'string' || !targetTableId.trim()) {
        return res.status(400).json({
          code: 'MISSING_TARGET_TABLE_ID',
          error: 'O ID da mesa de destino (targetTableId) é obrigatório.'
        });
      }

      const cleanTabId = tabId.trim();
      const cleanTargetTableId = targetTableId.trim();

      const result = await db.runTransaction(async (transaction) => {
        // 1. Fetch the Tab (comanda) via canonical resolver
        const { ref: tabRef, snapshot: tabSnap, data: tabData } = await resolveTabRef(restaurantId, cleanTabId, transaction);

        const oldTableId = tabData.tableId || tabData.mesaId;

        // 2. Fetch the target table from root and nested collections
        const rootNewTableRef = db.collection('tables').doc(cleanTargetTableId);
        const nestedNewTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(cleanTargetTableId);

        const rootNewTableSnap = await transaction.get(rootNewTableRef);
        const nestedNewTableSnap = await transaction.get(nestedNewTableRef);

        const newTableSnap = rootNewTableSnap.exists ? rootNewTableSnap : (nestedNewTableSnap.exists ? nestedNewTableSnap : null);
        if (!newTableSnap || !newTableSnap.exists) {
          throw new Error('Mesa de destino não encontrada.');
        }

        const newTableData = newTableSnap.data()!;
        if (newTableData.restaurantId !== restaurantId) {
          throw new Error('Acesso negado: Mesa de destino pertence a outro restaurante.');
        }

        // 3. Impedir transferência para mesa ocupada
        const isOccupied = newTableData.status === 'OCCUPIED' || 
                           newTableData.status === 'ocupada' || 
                           newTableData.status === 'atendimento' || 
                           newTableData.status === 'WAITING_PAYMENT' ||
                           (newTableData.comandaId && newTableData.comandaId !== cleanTabId);
        if (isOccupied) {
          throw new Error('A mesa de destino já está ocupada.');
        }

        const newTableNum = newTableData.number || newTableData.numero || 0;

        // 4. Fetch the old table if exists
        let oldTableNum = 0;
        let rootOldTableSnap: any = null;
        let nestedOldTableSnap: any = null;
        let rootOldTableRef: any = null;
        let nestedOldTableRef: any = null;

        if (oldTableId) {
          rootOldTableRef = db.collection('tables').doc(oldTableId);
          nestedOldTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(oldTableId);

          rootOldTableSnap = await transaction.get(rootOldTableRef);
          nestedOldTableSnap = await transaction.get(nestedOldTableRef);

          const oldTableSnap = rootOldTableSnap.exists ? rootOldTableSnap : (nestedOldTableSnap.exists ? nestedOldTableSnap : null);
          if (oldTableSnap && oldTableSnap.exists) {
            const oldTableData = oldTableSnap.data()!;
            oldTableNum = oldTableData.number || oldTableData.numero || 0;
          }
        }

        // 5. Query and read order documents linked to this tab (MUST happen before any writes)
        const ordersQuery1 = db.collection('restaurants').doc(restaurantId).collection('orders').where('tabId', '==', cleanTabId);
        const ordersSnap1 = await transaction.get(ordersQuery1);
        const orderDocs = [...ordersSnap1.docs];

        const ordersQuery2 = db.collection('restaurants').doc(restaurantId).collection('orders').where('comanda_id', '==', cleanTabId);
        const ordersSnap2 = await transaction.get(ordersQuery2);
        for (const docSnap of ordersSnap2.docs) {
          if (!orderDocs.some(d => d.id === docSnap.id)) {
            orderDocs.push(docSnap);
          }
        }

        // --- ALL READS ARE COMPLETED HERE. NOW PERFORM ALL WRITES ---

        // 6. Update old table to AVAILABLE / livre (if exists)
        if (oldTableId) {
          if (rootOldTableSnap && rootOldTableSnap.exists) {
            transaction.update(rootOldTableRef, {
              status: 'AVAILABLE',
              comandaId: null,
              updatedAt: new Date().toISOString()
            });
          }
          if (nestedOldTableSnap && nestedOldTableSnap.exists) {
            transaction.update(nestedOldTableRef, {
              status: 'AVAILABLE',
              comandaId: null,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // 7. Update target table to OCCUPIED / ocupada, associate comandaId
        if (rootNewTableSnap.exists) {
          transaction.update(rootNewTableRef, {
            status: 'OCCUPIED',
            comandaId: cleanTabId,
            updatedAt: new Date().toISOString()
          });
        }
        if (nestedNewTableSnap.exists) {
          transaction.update(nestedNewTableRef, {
            status: 'OCCUPIED',
            comandaId: cleanTabId,
            updatedAt: new Date().toISOString()
          });
        }

        // 8. Update Tab/Comanda with new table references
        const tabUpdates: any = {
          tableId: cleanTargetTableId,
          mesaId: cleanTargetTableId,
          mesaNumero: newTableNum,
          updatedAt: new Date().toISOString()
        };
        transaction.update(tabRef, tabUpdates);

        // 9. Update orders linked to this tab
        for (const orderDoc of orderDocs) {
          const oData = orderDoc.data();
          const oldClientName = oData.cliente_nome || '';
          const oldTableLabel = oldTableNum ? `Mesa ${oldTableNum}` : '';
          const newTableLabel = newTableNum ? `Mesa ${newTableNum}` : '';
          let newClientName = oldClientName;
          if (oldTableLabel && newClientName.includes(oldTableLabel)) {
            newClientName = newClientName.replace(oldTableLabel, newTableLabel);
          } else if (!newClientName.includes(newTableLabel)) {
            newClientName = newTableLabel ? `${newTableLabel} - ${newClientName}` : newClientName;
          }

          transaction.update(orderDoc.ref, {
            tableId: cleanTargetTableId,
            mesa_numero: newTableNum,
            cliente_nome: newClientName,
            updatedAt: new Date().toISOString()
          });
        }

        // 8. Register history/log details
        const transferId = db.collection('restaurants').doc(restaurantId).collection('table_transfers').doc().id;
        const nowIso = new Date().toISOString();
        const transferData = {
          id: transferId,
          restaurantId,
          comandaId: cleanTabId,
          mesaOrigemId: oldTableId || '',
          mesaOrigemNumero: oldTableNum,
          mesaDestinoId: cleanTargetTableId,
          mesaDestinoNumero: newTableNum,
          transferidoPorUserId: req.user.uid,
          transferidoPorUserName: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Usuário',
          transferidoEm: nowIso,
          timestamp: nowIso,
          date: new Date().toLocaleDateString('pt-BR'),
          time: new Date().toLocaleTimeString('pt-BR')
        };

        const rootLogRef = db.collection('table_transfers').doc(transferId);
        transaction.set(rootLogRef, transferData);

        const nestedLogRef = db.collection('restaurants').doc(restaurantId).collection('table_transfers').doc(transferId);
        transaction.set(nestedLogRef, transferData);

        return {
          success: true,
          message: 'Mesa transferida com sucesso.',
          transferData
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro na transferência de mesa:', { error });
      return res.status(400).json({
        code: 'TRANSFER_ERROR',
        error: error.message || 'Erro ao transferir a mesa.'
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: TRANSFERÊNCIA DE ITENS (PROMPT 4.7.2)
  // ==========================================
  router.post('/transfer-items', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        return res.status(400).json({
          code: 'MISSING_RESTAURANT_ID',
          error: 'ID do restaurante não encontrado no token.'
        });
      }

      const { sourceTabId, targetTabId, itemsToTransfer } = req.body || {};

      if (!sourceTabId || typeof sourceTabId !== 'string' || !sourceTabId.trim()) {
        return res.status(400).json({
          code: 'MISSING_SOURCE_TAB_ID',
          error: 'O ID da comanda de origem (sourceTabId) é obrigatório.'
        });
      }

      if (!targetTabId || typeof targetTabId !== 'string' || !targetTabId.trim()) {
        return res.status(400).json({
          code: 'MISSING_TARGET_TAB_ID',
          error: 'O ID da comanda de destino (targetTabId) é obrigatório.'
        });
      }

      if (!Array.isArray(itemsToTransfer) || itemsToTransfer.length === 0) {
        return res.status(400).json({
          code: 'MISSING_ITEMS_TO_TRANSFER',
          error: 'É necessário selecionar pelo menos um item para transferir.'
        });
      }

      const cleanSourceTabId = sourceTabId.trim();
      const cleanTargetTabId = targetTabId.trim();

      if (cleanSourceTabId === cleanTargetTabId) {
        return res.status(400).json({
          code: 'SAME_TAB_TRANSFER',
          error: 'A comanda de origem e de destino devem ser diferentes.'
        });
      }

      const result = await db.runTransaction(async (transaction) => {
        // 1. Fetch Source Tab via canonical resolver
        const { ref: sourceTabRef, snapshot: sourceTabSnap, data: sourceTabData } = await resolveTabRef(restaurantId, cleanSourceTabId, transaction);

        if (!isTabOpenStatus(sourceTabData.status)) {
          throw new Error('A comanda de origem deve estar aberta para transferência.');
        }

        // Fetch source table in read phase
        const sourceTableId = (sourceTabData.tableId || sourceTabData.mesaId || '').trim();
        let resolvedSourceTable: any = null;
        if (sourceTableId) {
          resolvedSourceTable = await resolveTableRef(restaurantId, sourceTableId, transaction);
        }

        // 2. Fetch Target Tab via canonical resolver
        const { ref: targetTabRef, snapshot: targetTabSnap, data: targetTabData } = await resolveTabRef(restaurantId, cleanTargetTabId, transaction);

        if (!isTabOpenStatus(targetTabData.status)) {
          throw new Error('A comanda de destino deve estar aberta para transferência.');
        }

        // 3. Process items to transfer
        const sourceTabItems = Array.isArray(sourceTabData.items) ? [...sourceTabData.items] : [];
        const targetTabItems = Array.isArray(targetTabData.items) ? [...targetTabData.items] : [];

        let totalTransferredCents = 0;
        const transferredItemsLog: any[] = [];
        const ordersToUpdate: Record<string, { orderRef: any; orderData: any }> = {};

        for (const reqItem of itemsToTransfer) {
          const { itemId, quantity } = reqItem;
          if (!itemId || typeof itemId !== 'string') {
            throw new Error('ID do item inválido na requisição.');
          }

          const qToTransfer = Number(quantity);
          if (isNaN(qToTransfer) || qToTransfer <= 0) {
            throw new Error('Quantidade de transferência inválida.');
          }

          const cleanItemId = itemId.trim();
          const itemIdx = sourceTabItems.findIndex((i: any) => i.id === cleanItemId);
          if (itemIdx === -1) {
            throw new Error(`Item com ID ${cleanItemId} não encontrado na comanda de origem.`);
          }

          const sourceItem = sourceTabItems[itemIdx];

          // Impedir transferência de item CANCELLED
          const itemStatus = (sourceItem.status || '').toLowerCase();
          if (itemStatus === 'cancelled' || itemStatus === 'cancelado') {
            throw new Error(`Não é possível transferir o item "${sourceItem.produtoNome || 'Produto'}" pois ele está cancelado.`);
          }

          const availableQty = Number(sourceItem.quantidade) || 0;
          if (qToTransfer > availableQty) {
            throw new Error(`Quantidade solicitada para transferir (${qToTransfer}) é maior do que a quantidade disponível (${availableQty}) para o item "${sourceItem.produtoNome || 'Produto'}".`);
          }

          const unitPriceCents = Number(sourceItem.unitPriceCents) || Math.round((Number(sourceItem.precoUnitario) || 0) * 100);
          const itemTransferValueCents = unitPriceCents * qToTransfer;
          totalTransferredCents += itemTransferValueCents;

          // Fetch order associated with this item if possible
          const orderId = sourceItem.orderId || sourceItem.pedidoId;
          if (orderId && !ordersToUpdate[orderId]) {
            const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            if (orderSnap.exists) {
              ordersToUpdate[orderId] = {
                orderRef,
                orderData: orderSnap.data()!
              };
            }
          }

          // Handle complete transfer vs partial transfer
          let transferredItem: any = null;

          if (qToTransfer === availableQty) {
            // Complete transfer: remove from source tab items
            sourceTabItems.splice(itemIdx, 1);
            transferredItem = { ...sourceItem };
            targetTabItems.push(transferredItem);

            // Update order items
            if (orderId && ordersToUpdate[orderId]) {
              const oInfo = ordersToUpdate[orderId];
              const oItems = Array.isArray(oInfo.orderData.items) ? [...oInfo.orderData.items] : [];
              const oItemIdx = oItems.findIndex((oi: any) => oi.id === cleanItemId);
              if (oItemIdx !== -1) {
                oItems.splice(oItemIdx, 1);
                oInfo.orderData.items = oItems;
              }
            }
          } else {
            // Partial transfer: reduce quantity in source tab items
            const newQty = availableQty - qToTransfer;
            const newTotal = (newQty * unitPriceCents) / 100;
            const newTotalCents = newQty * unitPriceCents;

            sourceTabItems[itemIdx] = {
              ...sourceItem,
              quantidade: newQty,
              total: newTotal,
              totalPriceCents: newTotalCents
            };

            // Create new item in target tab items
            const newTransferredItemId = db.collection('dummy').doc().id;
            const transferredTotal = (qToTransfer * unitPriceCents) / 100;
            const transferredTotalCents = qToTransfer * unitPriceCents;

            transferredItem = {
              ...sourceItem,
              id: newTransferredItemId,
              quantidade: qToTransfer,
              total: transferredTotal,
              totalPriceCents: transferredTotalCents
            };
            targetTabItems.push(transferredItem);

            // Update order items
            if (orderId && ordersToUpdate[orderId]) {
              const oInfo = ordersToUpdate[orderId];
              const oItems = Array.isArray(oInfo.orderData.items) ? [...oInfo.orderData.items] : [];
              const oItemIdx = oItems.findIndex((oi: any) => oi.id === cleanItemId);
              if (oItemIdx !== -1) {
                oItems[oItemIdx] = {
                  ...oItems[oItemIdx],
                  quantidade: newQty,
                  valorTotal: newTotal,
                  totalPriceCents: newTotalCents
                };
                oInfo.orderData.items = oItems;
              }
            }
          }

          transferredItemsLog.push({
            productId: sourceItem.produtoId || '',
            productName: sourceItem.produtoNome || 'Produto',
            quantity: qToTransfer,
            unitPriceCents,
            totalPriceCents: itemTransferValueCents,
            originalOrderId: orderId || ''
          });
        }

        // 4. Update order documents and totals
        for (const orderId of Object.keys(ordersToUpdate)) {
          const { orderRef, orderData } = ordersToUpdate[orderId];
          const oItems = orderData.items || [];

          // Calculate new order totals based on remaining items
          const nonCancelledItems = oItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
          const newOrderTotalCents = nonCancelledItems.reduce((acc: number, i: any) => {
            const cents = i.totalPriceCents ?? Math.round((Number(i.valorTotal || i.total) || 0) * 100);
            return acc + cents;
          }, 0);

          if (oItems.length === 0) {
            // If order has no items left, move the entire order to the target comanda!
            const restoredOrderItems = targetTabItems.filter((i: any) => i.orderId === orderId).map((i: any) => ({
              id: i.id,
              productId: i.produtoId,
              nome: i.produtoNome || 'Produto',
              quantidade: Number(i.quantidade),
              precoUnitario: Number(i.precoUnitario),
              unitPriceCents: Number(i.unitPriceCents),
              valorTotal: Number(i.total),
              totalPriceCents: Number(i.totalPriceCents),
              observacao: i.observacoes || '',
              tamanhoSelecionado: i.pedidosAdicionais?.size || null,
              adicionaisSelecionados: i.pedidosAdicionais?.options || []
            }));

            const targetTableNum = targetTabData.mesaNumero || 0;
            const targetTableLabel = targetTableNum ? `Mesa ${targetTableNum}` : '';
            const targetCustomerLabel = targetTabData.customerName ? targetTabData.customerName : 'Comanda';
            const targetClienteNome = targetTableLabel ? `${targetTableLabel} - ${targetCustomerLabel}` : targetCustomerLabel;

            const restoredOrderTotalCents = restoredOrderItems.reduce((acc: number, i: any) => acc + (i.totalPriceCents || 0), 0);

            transaction.update(orderRef, {
              tabId: cleanTargetTabId,
              comanda_id: cleanTargetTabId,
              tableId: targetTabData.tableId || null,
              mesa_numero: targetTableNum || null,
              cliente_nome: targetClienteNome,
              items: restoredOrderItems,
              valor_produtos: restoredOrderTotalCents / 100,
              valor_total: restoredOrderTotalCents / 100,
              subtotalInCents: restoredOrderTotalCents,
              totalInCents: restoredOrderTotalCents,
              updatedAt: new Date().toISOString()
            });
          } else {
            // Order still has other items, update it with reduced quantities/items
            transaction.update(orderRef, {
              items: oItems,
              valor_produtos: newOrderTotalCents / 100,
              valor_total: newOrderTotalCents / 100,
              subtotalInCents: newOrderTotalCents,
              totalInCents: newOrderTotalCents,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // 5. Update Source Tab totals
        const sourcePrevTotalCents = sourceTabData.totalInCents ?? Math.round((sourceTabData.total || 0) * 100);
        const sourceNewTotalCents = Math.max(0, sourcePrevTotalCents - totalTransferredCents);
        const sourcePrevPaidCents = sourceTabData.paidInCents ?? Math.round((sourceTabData.paidAmount || 0) * 100);
        const sourceNewRemainingCents = Math.max(0, sourceNewTotalCents - sourcePrevPaidCents);

        const activeSourceItems = sourceTabItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
        const isSourceEmpty = activeSourceItems.length === 0 && sourceNewTotalCents <= 0 && sourcePrevPaidCents <= 0;

        const sourceUpdates: any = {
          items: sourceTabItems,
          totalInCents: sourceNewTotalCents,
          subtotal: sourceNewTotalCents / 100,
          total: sourceNewTotalCents / 100,
          totalInBrl: sourceNewTotalCents / 100,
          remainingInCents: sourceNewRemainingCents,
          updatedAt: new Date().toISOString()
        };

        if (isSourceEmpty) {
          sourceUpdates.status = 'CANCELLED';
          sourceUpdates.cancelledAt = new Date().toISOString();
          sourceUpdates.cancellationReason = 'Todos os itens foram transferidos para outra comanda (comanda zerada).';
        }

        transaction.update(sourceTabRef, sourceUpdates);

        if (isSourceEmpty && resolvedSourceTable && resolvedSourceTable.ref) {
          transaction.update(resolvedSourceTable.ref, {
            status: 'AVAILABLE',
            comandaId: null,
            tabId: null,
            updatedAt: new Date().toISOString()
          });
        }

        // 6. Update Target Tab totals
        const targetPrevTotalCents = targetTabData.totalInCents ?? Math.round((targetTabData.total || 0) * 100);
        const targetNewTotalCents = targetPrevTotalCents + totalTransferredCents;
        const targetPrevPaidCents = targetTabData.paidInCents ?? Math.round((targetTabData.paidAmount || 0) * 100);
        const targetNewRemainingCents = Math.max(0, targetNewTotalCents - targetPrevPaidCents);

        const targetUpdates = {
          items: targetTabItems,
          totalInCents: targetNewTotalCents,
          subtotal: targetNewTotalCents / 100,
          total: targetNewTotalCents / 100,
          totalInBrl: targetNewTotalCents / 100,
          remainingInCents: targetNewRemainingCents,
          updatedAt: new Date().toISOString()
        };

        transaction.update(targetTabRef, targetUpdates);

        // 7. Write history logs
        const transferId = db.collection('restaurants').doc(restaurantId).collection('item_transfers').doc().id;
        const nowIso = new Date().toISOString();
        const transferData = {
          id: transferId,
          restaurantId,
          sourceTabId: cleanSourceTabId,
          sourceTabName: sourceTabData.customerName || `Mesa ${sourceTabData.mesaNumero || ''}`,
          targetTabId: cleanTargetTabId,
          targetTabName: targetTabData.customerName || `Mesa ${targetTabData.mesaNumero || ''}`,
          items: transferredItemsLog,
          totalTransferredCents,
          transferidoPorUserId: req.user.uid,
          transferidoPorUserName: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Usuário',
          transferidoEm: nowIso,
          timestamp: nowIso,
          date: new Date().toLocaleDateString('pt-BR'),
          time: new Date().toLocaleTimeString('pt-BR')
        };

        const rootLogRef = db.collection('item_transfers').doc(transferId);
        transaction.set(rootLogRef, transferData);

        const nestedLogRef = db.collection('restaurants').doc(restaurantId).collection('item_transfers').doc(transferId);
        transaction.set(nestedLogRef, transferData);

        return {
          success: true,
          message: 'Itens transferidos com sucesso.',
          totalTransferredCents,
          transferData
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro na transferência de itens:', { error });
      return res.status(400).json({
        code: 'TRANSFER_ITEMS_ERROR',
        error: error.message || 'Erro ao transferir os itens.'
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: UNIÃO DE MESAS (PROMPT 4.7.3)
  // ==========================================
  router.post('/merge-tabs', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        return res.status(400).json({
          code: 'MISSING_RESTAURANT_ID',
          error: 'ID do restaurante não encontrado no token.'
        });
      }

      const { mainTabId, secondaryTabIds } = req.body || {};

      if (!mainTabId || typeof mainTabId !== 'string' || !mainTabId.trim()) {
        return res.status(400).json({
          code: 'MISSING_MAIN_TAB_ID',
          error: 'O ID da comanda principal (mainTabId) é obrigatório.'
        });
      }

      if (!secondaryTabIds || !Array.isArray(secondaryTabIds) || secondaryTabIds.length === 0) {
        return res.status(400).json({
          code: 'MISSING_SECONDARY_TAB_IDS',
          error: 'É necessário fornecer pelo menos uma comanda para ser incorporada.'
        });
      }

      const cleanMainTabId = mainTabId.trim();
      const cleanSecondaryTabIds = secondaryTabIds.map((id: string) => id.trim()).filter((id: string) => id !== cleanMainTabId);

      if (cleanSecondaryTabIds.length === 0) {
        return res.status(400).json({
          code: 'INVALID_SECONDARY_TAB_IDS',
          error: 'As comandas secundárias não podem conter apenas a comanda principal.'
        });
      }

      const result = await db.runTransaction(async (transaction) => {
        // --- ALL READS FIRST ---

        // 1. Read main comanda via canonical resolver
        const { ref: mainTabRef, snapshot: mainTabSnap, data: mainTabData } = await resolveTabRef(restaurantId, cleanMainTabId, transaction);

        if (!isTabOpenStatus(mainTabData.status)) {
          throw new Error('A comanda principal deve estar aberta.');
        }

        const mainTableId = mainTabData.tableId || mainTabData.mesaId;

        // 2. Read all secondary comandas via canonical resolver
        const secondaryTabsDataList: any[] = [];
        const secondaryTabRefsToUpdate: Array<{ ref: any }> = [];

        for (const secId of cleanSecondaryTabIds) {
          const { ref: secTabRef, snapshot: secTabSnap, data: secTabData } = await resolveTabRef(restaurantId, secId, transaction);

          if (!isTabOpenStatus(secTabData.status)) {
            throw new Error(`A comanda ${secId} deve estar aberta para ser incorporada.`);
          }

          secondaryTabsDataList.push({ id: secId, data: secTabData });
          secondaryTabRefsToUpdate.push({ ref: secTabRef });
        }

        // 3. Collect table info to read secondary tables
        const tablesToRead: Array<{ id: string; name: string; number: number; tabId: string; customerName: string }> = [];
        for (const sec of secondaryTabsDataList) {
          const secTableId = sec.data.tableId || sec.data.mesaId;
          const secTableName = sec.data.mesaNumero ? `Mesa ${sec.data.mesaNumero}` : '';
          const secTableNum = Number(sec.data.mesaNumero) || 0;
          if (secTableId) {
            tablesToRead.push({
              id: secTableId,
              name: secTableName,
              number: secTableNum,
              tabId: sec.id,
              customerName: sec.data.customerName || ''
            });
          }
        }

        // Read all secondary table snapshots
        const tableSnapsToUpdate: Array<{ id: string; rootRef: any; nestedRef: any; rootSnap: any; nestedSnap: any }> = [];
        for (const tbl of tablesToRead) {
          if (tbl.id && tbl.id !== mainTableId) {
            const rootTableRef = db.collection('tables').doc(tbl.id);
            const nestedTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(tbl.id);

            const rootTableSnap = await transaction.get(rootTableRef);
            const nestedTableSnap = await transaction.get(nestedTableRef);

            tableSnapsToUpdate.push({
              id: tbl.id,
              rootRef: rootTableRef,
              nestedRef: nestedTableRef,
              rootSnap: rootTableSnap,
              nestedSnap: nestedTableSnap
            });
          }
        }

        // 4. Read main table
        let mainTableRefGroup: { rootRef: any; nestedRef: any; rootSnap: any; nestedSnap: any } | null = null;
        if (mainTableId) {
          const rootMainTableRef = db.collection('tables').doc(mainTableId);
          const nestedMainTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(mainTableId);

          const rootMainTableSnap = await transaction.get(rootMainTableRef);
          const nestedMainTableSnap = await transaction.get(nestedMainTableRef);

          mainTableRefGroup = {
            rootRef: rootMainTableRef,
            nestedRef: nestedMainTableRef,
            rootSnap: rootMainTableSnap,
            nestedSnap: nestedMainTableSnap
          };
        }

        // 5. Query and read order documents belonging to secondary tabs
        const ordersToUpdate: any[] = [];
        const ordersRef = db.collection('restaurants').doc(restaurantId).collection('orders');

        for (const secId of cleanSecondaryTabIds) {
          const ordersSnap = await transaction.get(ordersRef.where('tabId', '==', secId));
          ordersSnap.forEach((doc) => {
            ordersToUpdate.push({ ref: doc.ref, data: doc.data() });
          });

          const ordersSnapAlt = await transaction.get(ordersRef.where('comanda_id', '==', secId));
          ordersSnapAlt.forEach((doc) => {
            if (!ordersToUpdate.some(o => o.ref.id === doc.id)) {
              ordersToUpdate.push({ ref: doc.ref, data: doc.data() });
            }
          });
        }

        // --- ALL WRITES START HERE ---

        // A. Close incorporated secondary comandas
        const nowIso = new Date().toISOString();
        const mergedTabUpdates = {
          status: 'MERGED',
          active: false,
          items: [],
          totalInCents: 0,
          subtotal: 0,
          total: 0,
          totalInBrl: 0,
          remainingInCents: 0,
          mergedIntoTabId: cleanMainTabId,
          updatedAt: nowIso
        };

        for (const refGroup of secondaryTabRefsToUpdate) {
          transaction.update(refGroup.ref, mergedTabUpdates);
        }

        // B. Release secondary tables
        for (const tblSnap of tableSnapsToUpdate) {
          if (tblSnap.rootSnap.exists) {
            transaction.update(tblSnap.rootRef, {
              status: 'AVAILABLE',
              comandaId: null,
              updatedAt: nowIso
            });
          }
          if (tblSnap.nestedSnap.exists) {
            transaction.update(tblSnap.nestedRef, {
              status: 'AVAILABLE',
              comandaId: null,
              updatedAt: nowIso
            });
          }
        }

        // C. Update main table status to OCCUPIED and point to main comanda
        if (mainTableRefGroup) {
          if (mainTableRefGroup.rootSnap.exists) {
            transaction.update(mainTableRefGroup.rootRef, {
              status: 'OCCUPIED',
              comandaId: cleanMainTabId,
              updatedAt: nowIso
            });
          }
          if (mainTableRefGroup.nestedSnap.exists) {
            transaction.update(mainTableRefGroup.nestedRef, {
              status: 'OCCUPIED',
              comandaId: cleanMainTabId,
              updatedAt: nowIso
            });
          }
        }

        // D. Calculate total cents and items to accumulate
        let accumulatedItems = Array.isArray(mainTabData.items) ? [...mainTabData.items] : [];
        let totalCentsToTransfer = 0;

        for (const sec of secondaryTabsDataList) {
          const secItems = Array.isArray(sec.data.items) ? sec.data.items : [];
          accumulatedItems = [...accumulatedItems, ...secItems];

          const secTotalCents = sec.data.totalInCents ?? Math.round((sec.data.total || 0) * 100);
          totalCentsToTransfer += secTotalCents;
        }

        const previousMainTotalCents = mainTabData.totalInCents ?? Math.round((mainTabData.total || 0) * 100);
        const finalMainTotalCents = previousMainTotalCents + totalCentsToTransfer;
        const previousPaidCents = mainTabData.paidInCents ?? Math.round((mainTabData.paidAmount || 0) * 100);
        const finalRemainingCents = Math.max(0, finalMainTotalCents - previousPaidCents);

        const previousMergedTables = Array.isArray(mainTabData.mergedTables) ? mainTabData.mergedTables : [];
        const updatedMergedTables = [...previousMergedTables, ...tablesToRead];

        const mainTabUpdates = {
          items: accumulatedItems,
          totalInCents: finalMainTotalCents,
          subtotal: finalMainTotalCents / 100,
          total: finalMainTotalCents / 100,
          totalInBrl: finalMainTotalCents / 100,
          remainingInCents: finalRemainingCents,
          mergedTables: updatedMergedTables,
          updatedAt: nowIso
        };

        transaction.update(mainTabRef, mainTabUpdates);

        // E. Update order documents
        for (const order of ordersToUpdate) {
          transaction.update(order.ref, {
            tabId: cleanMainTabId,
            comanda_id: cleanMainTabId,
            tableId: mainTableId || order.data.tableId || null,
            mesa_numero: mainTabData.mesaNumero || order.data.mesa_numero || null,
            updatedAt: nowIso
          });
        }

        // F. Log the merge operation
        const mergeId = db.collection('dummy').doc().id;
        const mergeLogData = {
          id: mergeId,
          restaurantId,
          mainTabId: cleanMainTabId,
          mainTableName: mainTabData.customerName || `Mesa ${mainTabData.mesaNumero || ''}`,
          secondaryTabIds: cleanSecondaryTabIds,
          incorporatedTables: tablesToRead,
          totalMergedCents: totalCentsToTransfer,
          mergedByUserId: req.user.uid,
          mergedByUserName: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Operador',
          mergedEm: nowIso,
          timestamp: nowIso,
          date: new Date().toLocaleDateString('pt-BR'),
          time: new Date().toLocaleTimeString('pt-BR')
        };

        const rootMergeLogRef = db.collection('tab_merges').doc(mergeId);
        transaction.set(rootMergeLogRef, mergeLogData);

        const nestedMergeLogRef = db.collection('restaurants').doc(restaurantId).collection('tab_merges').doc(mergeId);
        transaction.set(nestedMergeLogRef, mergeLogData);

        return {
          success: true,
          message: 'Comandas unificadas com sucesso.',
          mainTabId: cleanMainTabId,
          totalMergedCents: totalCentsToTransfer
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro na unificação de comandas:', { error });
      return res.status(400).json({
        code: 'MERGE_TABS_ERROR',
        error: error.message || 'Erro ao unificar as comandas.'
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: SEPARAÇÃO DE MESAS UNIDAS (PROMPT 4.7.4)
  // ==========================================
  router.post('/split-tabs', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        return res.status(400).json({
          code: 'MISSING_RESTAURANT_ID',
          error: 'ID do restaurante não encontrado no token.'
        });
      }

      const { mainTabId, separations } = req.body || {};

      if (!mainTabId || typeof mainTabId !== 'string' || !mainTabId.trim()) {
        return res.status(400).json({
          code: 'MISSING_MAIN_TAB_ID',
          error: 'O ID da comanda principal (mainTabId) é obrigatório.'
        });
      }

      if (!separations || !Array.isArray(separations) || separations.length === 0) {
        return res.status(400).json({
          code: 'MISSING_SEPARATIONS',
          error: 'É necessário fornecer pelo menos uma mesa/comanda para ser separada.'
        });
      }

      const cleanMainTabId = mainTabId.trim();

      const result = await db.runTransaction(async (transaction) => {
        // --- ALL READS FIRST ---

        // 1. Read main comanda via canonical resolver
        const { ref: mainTabRef, snapshot: mainTabSnap, data: mainTabData } = await resolveTabRef(restaurantId, cleanMainTabId, transaction);

        if (!isTabOpenStatus(mainTabData.status)) {
          throw new Error('A comanda principal deve estar aberta.');
        }

        const currentMainItems = Array.isArray(mainTabData.items) ? [...mainTabData.items] : [];

        // Validate that target tables and tabs are valid
        const secTabsToRead: Array<{ targetTableId: string, targetTabId: string, items: any[] }> = [];
        for (const sep of separations) {
          const tTableId = sep.targetTableId?.trim();
          const tTabId = sep.targetTabId?.trim();
          if (!tTableId || !tTabId) {
            throw new Error('Cada separação deve conter targetTableId e targetTabId.');
          }
          if (tTabId === cleanMainTabId) {
            throw new Error('Não é possível separar a comanda principal dela mesma.');
          }
          secTabsToRead.push({
            targetTableId: tTableId,
            targetTabId: tTabId,
            items: sep.items || []
          });
        }

        // 2. Read all secondary tabs via canonical resolver
        const secTabSnaps: any[] = [];
        for (const sec of secTabsToRead) {
          const { ref: secTabRef, snapshot: secTabSnap, data: secTabData } = await resolveTabRef(restaurantId, sec.targetTabId, transaction);

          secTabSnaps.push({
            id: sec.targetTabId,
            ref: secTabRef,
            snap: secTabSnap,
            data: secTabData
          });
        }

        // 3. Read all target tables
        const tableSnaps: any[] = [];
        for (const sec of secTabsToRead) {
          const rootTableRef = db.collection('tables').doc(sec.targetTableId);
          const nestedTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(sec.targetTableId);

          const rootTableSnap = await transaction.get(rootTableRef);
          const nestedTableSnap = await transaction.get(nestedTableRef);

          const tableSnap = rootTableSnap.exists ? rootTableSnap : (nestedTableSnap.exists ? nestedTableSnap : null);
          if (!tableSnap || !tableSnap.exists) {
            throw new Error(`Mesa ${sec.targetTableId} não encontrada.`);
          }

          const tableData = tableSnap.data()!;
          if (tableData.restaurantId !== restaurantId) {
            throw new Error(`Acesso negado: Mesa ${sec.targetTableId} pertence a outro restaurante.`);
          }

          tableSnaps.push({
            id: sec.targetTableId,
            rootRef: rootTableRef,
            nestedRef: nestedTableRef,
            rootSnap: rootTableSnap,
            nestedSnap: nestedTableSnap,
            data: tableData
          });
        }

        // 4. Read associated orders
        const orderIdsToFetch = new Set<string>();
        for (const sep of secTabsToRead) {
          for (const itemAlloc of sep.items) {
            const matchedItem = currentMainItems.find(i => i.id === itemAlloc.itemId);
            if (matchedItem && matchedItem.orderId) {
              orderIdsToFetch.add(matchedItem.orderId);
            }
          }
        }

        const orderSnaps: any[] = [];
        for (const orderId of Array.from(orderIdsToFetch)) {
          const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
          const orderSnap = await transaction.get(orderRef);
          if (orderSnap.exists) {
            orderSnaps.push({
              id: orderId,
              ref: orderRef,
              data: orderSnap.data()!
            });
          }
        }

        // --- ALL WRITES START HERE ---

        const nowIso = new Date().toISOString();
        const mainRemainingItems = [...currentMainItems];
        const tabSeparationsLogList: any[] = [];

        // For each separation, distribute items
        for (const sep of secTabsToRead) {
          const secTabInfo = secTabSnaps.find(s => s.id === sep.targetTabId);
          const tableInfo = tableSnaps.find(t => t.id === sep.targetTableId);

          const separatedItems: any[] = [];

          for (const itemAlloc of sep.items) {
            const { itemId, quantity } = itemAlloc;
            if (!itemId || !quantity || quantity <= 0) continue;

            const mainItemIndex = mainRemainingItems.findIndex(i => i.id === itemId);
            if (mainItemIndex === -1) {
              throw new Error(`Item com ID ${itemId} não encontrado na comanda principal.`);
            }

            const mainItem = mainRemainingItems[mainItemIndex];
            if (mainItem.quantidade < quantity) {
              throw new Error(`Quantidade solicitada para separar (${quantity}) é maior do que a disponível (${mainItem.quantidade}) para o produto ${mainItem.produtoNome || mainItem.productName || itemId}.`);
            }

            // Subtract from main comanda items list
            mainRemainingItems[mainItemIndex] = {
              ...mainItem,
              quantidade: mainItem.quantidade - quantity,
              total: (mainItem.precoUnitario || 0) * (mainItem.quantidade - quantity),
              totalPriceCents: (mainItem.unitPriceCents || Math.round((mainItem.precoUnitario || 0) * 100)) * (mainItem.quantidade - quantity)
            };

            // Copy to separated items list
            const unitPrice = mainItem.precoUnitario || 0;
            const unitPriceCents = mainItem.unitPriceCents || Math.round(unitPrice * 100);

            separatedItems.push({
              ...mainItem,
              quantidade: quantity,
              total: unitPrice * quantity,
              totalPriceCents: unitPriceCents * quantity
            });
          }

          // Clean up items with 0 quantity from mainRemainingItems
          const finalMainItems = mainRemainingItems.filter(i => i.quantidade > 0);
          mainRemainingItems.length = 0;
          mainRemainingItems.push(...finalMainItems);

          // Calculate totals for this separated comanda
          const totalInCents = separatedItems.reduce((acc, item) => acc + (item.totalPriceCents || 0), 0);
          const previousPaidCents = secTabInfo.data.paidInCents ?? Math.round((secTabInfo.data.paidAmount || 0) * 100);
          const remainingInCents = Math.max(0, totalInCents - previousPaidCents);

          // Update separated comanda
          const updatedSecTab = {
            status: 'OPEN',
            active: true,
            items: separatedItems,
            totalInCents: totalInCents,
            subtotal: totalInCents / 100,
            total: totalInCents / 100,
            totalInBrl: totalInCents / 100,
            remainingInCents: remainingInCents,
            mergedIntoTabId: null,
            updatedAt: nowIso
          };

          transaction.update(secTabInfo.ref, updatedSecTab);

          // Update corresponding table to OCCUPIED and point to separated comanda
          if (tableInfo.rootSnap.exists) {
            transaction.update(tableInfo.rootRef, {
              status: 'OCCUPIED',
              comandaId: sep.targetTabId,
              updatedAt: nowIso
            });
          }
          if (tableInfo.nestedSnap.exists) {
            transaction.update(tableInfo.nestedRef, {
              status: 'OCCUPIED',
              comandaId: sep.targetTabId,
              updatedAt: nowIso
            });
          }

          tabSeparationsLogList.push({
            tableId: sep.targetTableId,
            tableName: tableInfo.data.name,
            tabId: sep.targetTabId,
            itemsCount: separatedItems.length,
            totalCents: totalInCents
          });
        }

        // Recalculate totals for Main Comanda
        const mainTotalCents = mainRemainingItems.reduce((acc, item) => acc + (item.totalPriceCents || 0), 0);
        const mainPaidCents = mainTabData.paidInCents ?? Math.round((mainTabData.paidAmount || 0) * 100);
        const mainRemainingCents = Math.max(0, mainTotalCents - mainPaidCents);

        // Remove separated tables from main comanda's mergedTables list
        const previousMergedTables = Array.isArray(mainTabData.mergedTables) ? mainTabData.mergedTables : [];
        const separatedTableIds = secTabsToRead.map(s => s.targetTableId);
        const updatedMergedTables = previousMergedTables.filter((tbl: any) => !separatedTableIds.includes(tbl.id));

        const updatedMainTab = {
          items: mainRemainingItems,
          totalInCents: mainTotalCents,
          subtotal: mainTotalCents / 100,
          total: mainTotalCents / 100,
          totalInBrl: mainTotalCents / 100,
          remainingInCents: mainRemainingCents,
          mergedTables: updatedMergedTables,
          updatedAt: nowIso
        };

        transaction.update(mainTabRef, updatedMainTab);

        // Update/Split associated orders
        for (const orderSnap of orderSnaps) {
          const orderData = orderSnap.data;
          const orderItems = Array.isArray(orderData.items) ? orderData.items : [];

          const itemsToMoveByTab: { [tabId: string]: any[] } = {};

          for (const sep of secTabsToRead) {
            const tableInfo = tableSnaps.find(t => t.id === sep.targetTableId);
            for (const itemAlloc of sep.items) {
              const mainItem = currentMainItems.find(i => i.id === itemAlloc.itemId);
              if (mainItem && mainItem.orderId === orderSnap.id) {
                if (!itemsToMoveByTab[sep.targetTabId]) {
                  itemsToMoveByTab[sep.targetTabId] = [];
                }
                itemsToMoveByTab[sep.targetTabId].push({
                  itemId: itemAlloc.itemId,
                  quantity: itemAlloc.quantity,
                  productName: mainItem.produtoNome || mainItem.productName || '',
                  tableId: sep.targetTableId,
                  tableName: tableInfo?.data.name || ''
                });
              }
            }
          }

          const movingTabs = Object.keys(itemsToMoveByTab);
          if (movingTabs.length > 0) {
            let remainingOrderItems = [...orderItems];

            for (const targetTabId of movingTabs) {
              const movedItemsForTab = itemsToMoveByTab[targetTabId];
              const tableInfo = tableSnaps.find(t => t.id === movedItemsForTab[0].tableId);

              const newOrderItems: any[] = [];

              for (const mItem of movedItemsForTab) {
                const orderItemIndex = remainingOrderItems.findIndex((oi: any) => oi.id === mItem.itemId || oi.produtoId === mItem.itemId);
                if (orderItemIndex !== -1) {
                  const originalOrderItem = remainingOrderItems[orderItemIndex];
                  const newQty = Math.min(originalOrderItem.quantidade, mItem.quantity);

                  remainingOrderItems[orderItemIndex] = {
                    ...originalOrderItem,
                    quantidade: originalOrderItem.quantidade - newQty,
                    total: (originalOrderItem.precoUnitario || 0) * (originalOrderItem.quantidade - newQty),
                    totalPriceCents: (originalOrderItem.unitPriceCents || Math.round((originalOrderItem.precoUnitario || 0) * 100)) * (originalOrderItem.quantidade - newQty)
                  };

                  newOrderItems.push({
                    ...originalOrderItem,
                    quantidade: newQty,
                    total: (originalOrderItem.precoUnitario || 0) * newQty,
                    totalPriceCents: (originalOrderItem.unitPriceCents || Math.round((originalOrderItem.precoUnitario || 0) * 100)) * newQty
                  });
                }
              }

              if (newOrderItems.length > 0) {
                const newOrderId = db.collection('dummy').doc().id;
                const newOrderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(newOrderId);

                const newOrderData = {
                  ...orderData,
                  id: newOrderId,
                  tabId: targetTabId,
                  comanda_id: targetTabId,
                  tableId: movedItemsForTab[0].tableId,
                  mesa_numero: tableInfo?.data.number || tableInfo?.data.name || null,
                  items: newOrderItems,
                  totalCents: newOrderItems.reduce((acc, item) => acc + (item.totalPriceCents || 0), 0),
                  updatedAt: nowIso,
                  createdAt: nowIso
                };

                transaction.set(newOrderRef, newOrderData);
              }
            }

            const finalRemainingOrderItems = remainingOrderItems.filter((oi: any) => oi.quantidade > 0);
            if (finalRemainingOrderItems.length === 0) {
              transaction.delete(orderSnap.ref);
            } else {
              transaction.update(orderSnap.ref, {
                items: finalRemainingOrderItems,
                totalCents: finalRemainingOrderItems.reduce((acc, item) => acc + (item.totalPriceCents || 0), 0),
                updatedAt: nowIso
              });
            }
          }
        }

        // Log the split operation
        const splitId = db.collection('dummy').doc().id;
        const splitLogData = {
          id: splitId,
          restaurantId,
          mainTabId: cleanMainTabId,
          mainTableName: mainTabData.customerName || `Mesa ${mainTabData.mesaNumero || ''}`,
          separations: tabSeparationsLogList,
          separatedByUserId: req.user.uid,
          separatedByUserName: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Operador',
          separatedEm: nowIso,
          timestamp: nowIso,
          date: new Date().toLocaleDateString('pt-BR'),
          time: new Date().toLocaleTimeString('pt-BR')
        };

        const rootSplitLogRef = db.collection('tab_splits').doc(splitId);
        transaction.set(rootSplitLogRef, splitLogData);

        const nestedSplitLogRef = db.collection('restaurants').doc(restaurantId).collection('tab_splits').doc(splitId);
        transaction.set(nestedSplitLogRef, splitLogData);

        return {
          success: true,
          message: 'Mesas separadas com sucesso.',
          mainTabId: cleanMainTabId,
          separations: tabSeparationsLogList
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro na separação de comandas:', { error });
      return res.status(400).json({
        code: 'SPLIT_TABS_ERROR',
        error: error.message || 'Erro ao separar as comandas.'
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: CANCELAMENTO DE ITEM
  // ==========================================
  router.post('/cancel-item', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const {
        tabId,
        orderId,
        itemId,
        cancellationReason
      } = req.body || {};

      // Restaurant Isolation Check
      const clientRestaurantId = req.body?.restaurantId || req.headers['x-restaurant-id'];
      if (clientRestaurantId && clientRestaurantId !== restaurantId) {
        return res.status(403).json({
          code: 'FORBIDDEN_RESTAURANT',
          error: 'Acesso negado. Usuário pertence a outro restaurante.'
        });
      }

      if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
        return res.status(400).json({
          code: 'MISSING_ITEM_ID',
          error: 'ID do item é obrigatório para o cancelamento.'
        });
      }

      if (!cancellationReason || typeof cancellationReason !== 'string' || !cancellationReason.trim()) {
        return res.status(400).json({
          code: 'MISSING_REASON',
          error: 'O motivo do cancelamento é obrigatório.'
        });
      }

      const cleanReason = cancellationReason.trim();
      const cleanItemId = itemId.trim();
      const now = new Date().toISOString();
      const userRole = getRequestUserRole(req);
      const cancelledBy = {
        uid: req.user.uid,
        name: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Operador',
        email: req.user.email || '',
        role: userRole
      };

      const result = await db.runTransaction(async (transaction) => {
        let orderRef: any = null;
        let orderSnap: any = null;
        let targetOrderId = orderId ? orderId.trim() : null;

        if (targetOrderId) {
          orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(targetOrderId);
          orderSnap = await transaction.get(orderRef);
        }

        let tabRef: any = null;
        let tabSnap: any = null;
        let targetTabId = tabId ? tabId.trim() : (orderSnap?.exists ? orderSnap.data()?.tabId || orderSnap.data()?.comanda_id : null);

        if (targetTabId) {
          try {
            const resolved = await resolveTabRef(restaurantId, targetTabId, transaction);
            tabRef = resolved.ref;
            tabSnap = resolved.snapshot;
          } catch (e) {
            tabRef = null;
            tabSnap = null;
          }
        }

        if (!orderSnap?.exists && targetTabId) {
          const ordersQuery = db.collection('restaurants').doc(restaurantId).collection('orders').where('tabId', '==', targetTabId);
          const ordersSnap = await ordersQuery.get();
          for (const docSnap of ordersSnap.docs) {
            const oData = docSnap.data();
            if (Array.isArray(oData.items) && oData.items.some((i: any) => i.id === cleanItemId)) {
              orderRef = docSnap.ref;
              orderSnap = await transaction.get(orderRef);
              targetOrderId = docSnap.id;
              break;
            }
          }
        }

        const orderData = orderSnap?.exists ? orderSnap.data() : null;
        const tabData = tabSnap?.exists ? tabSnap.data() : null;

        let targetItem: any = null;
        let itemIndex = -1;

        if (orderData && Array.isArray(orderData.items)) {
          itemIndex = orderData.items.findIndex((i: any) => i.id === cleanItemId);
          if (itemIndex >= 0) {
            targetItem = orderData.items[itemIndex];
          }
        }

        if (!targetItem && tabData && Array.isArray(tabData.items)) {
          const tIdx = tabData.items.findIndex((i: any) => i.id === cleanItemId);
          if (tIdx >= 0) {
            targetItem = tabData.items[tIdx];
          }
        }

        if (!targetItem) {
          const err: any = new Error('Item não encontrado na comanda/pedido.');
          err.code = 'ITEM_NOT_FOUND';
          throw err;
        }

        const currentStatus = (targetItem.status || '').toLowerCase();
        if (currentStatus === 'cancelled' || currentStatus === 'cancelado') {
          const err: any = new Error('Este item já foi cancelado anteriormente.');
          err.code = 'ALREADY_CANCELLED';
          throw err;
        }

        if (currentStatus === 'delivered' || currentStatus === 'finalized' || currentStatus === 'entregue' || currentStatus === 'concluido') {
          const err: any = new Error('Não é possível cancelar um item que já foi entregue ou finalizado.');
          err.code = 'ITEM_FINALIZED';
          throw err;
        }

        const isPending = currentStatus === 'pending' || currentStatus === 'pendente' || currentStatus === 'aguardando';
        if (userRole === 'waiter' && !isPending) {
          const err: any = new Error('Garçons não têm permissão para cancelar itens em produção diretamente. Você deve solicitar autorização da gerência.');
          err.code = 'WAITERS_NOT_ALLOWED';
          throw err;
        }

        let itemTotalCents = targetItem.totalPriceCents;
        if (typeof itemTotalCents !== 'number') {
          const valTot = Number(targetItem.valorTotal || targetItem.total) || 0;
          if (valTot > 0) {
            itemTotalCents = Math.round(valTot * 100);
          } else {
            const unitVal = Number(targetItem.precoUnitario) || 0;
            const qty = Number(targetItem.quantidade) || 1;
            itemTotalCents = Math.round(unitVal * qty * 100);
          }
        }

        // Stock Reversal
        const productId = targetItem.productId || targetItem.produtoId;
        if (productId) {
          const productRef = db.collection('restaurants').doc(restaurantId).collection('products').doc(productId);
          const productSnap = await transaction.get(productRef);
          if (productSnap.exists) {
            const pData = productSnap.data()!;
            const hasStockControl = pData.controlarEstoque === true || pData.stockControl === true;
            if (hasStockControl) {
              const currentStock = typeof pData.estoqueAtual === 'number' ? pData.estoqueAtual : typeof pData.estoque === 'number' ? pData.estoque : typeof pData.stock === 'number' ? pData.stock : 0;
              const returnQty = Number(targetItem.quantidade) || 1;
              const restoredStock = currentStock + returnQty;
              transaction.update(productRef, {
                estoqueAtual: restoredStock,
                estoque: restoredStock,
                stock: restoredStock,
                updatedAt: now
              });
            }
          }
        }

        // Table Resolution (in read phase before writes)
        const primaryTableId = tabData ? (tabData.tableId || tabData.mesaId || '').trim() : null;
        let resolvedTable: any = null;
        if (primaryTableId) {
          resolvedTable = await resolveTableRef(restaurantId, primaryTableId, transaction);
        }

        const resolvedMergedTables: any[] = [];
        if (tabData && Array.isArray(tabData.mergedTables)) {
          for (const mt of tabData.mergedTables) {
            const mTableId = (typeof mt === 'string' ? mt : (mt?.id || mt?.tableId) || '').trim();
            if (mTableId) {
              const mRes = await resolveTableRef(restaurantId, mTableId, transaction);
              if (mRes) {
                resolvedMergedTables.push(mRes);
              }
            }
          }
        }

        if (orderRef && orderData) {
          const updatedOrderItems = [...orderData.items];
          updatedOrderItems[itemIndex] = {
            ...targetItem,
            status: 'CANCELLED',
            cancellationReason: cleanReason,
            cancelledAt: now,
            cancelledBy
          };

          const nonCancelledItems = updatedOrderItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
          const newOrderTotalCents = nonCancelledItems.reduce((acc: number, i: any) => {
            const cents = i.totalPriceCents ?? Math.round((Number(i.valorTotal || i.total) || 0) * 100);
            return acc + cents;
          }, 0);

          const allItemsCancelled = updatedOrderItems.every((i: any) => i.status === 'CANCELLED' || i.status === 'cancelado');

          const orderUpdates: any = {
            items: updatedOrderItems,
            valor_produtos: newOrderTotalCents / 100,
            valor_total: newOrderTotalCents / 100,
            subtotalInCents: newOrderTotalCents,
            totalInCents: newOrderTotalCents,
            updatedAt: now
          };

          if (allItemsCancelled) {
            orderUpdates.orderStatus = 'CANCELLED';
            orderUpdates.status = 'cancelado';
            orderUpdates.canonicalStatus = 'CANCELLED';
            orderUpdates.cancellationReason = cleanReason;
            orderUpdates.cancelledAt = now;
            orderUpdates.cancelledBy = cancelledBy;
          }

          transaction.update(orderRef, orderUpdates);
        }

        if (tabRef && tabData) {
          let updatedTabItems = Array.isArray(tabData.items) ? [...tabData.items] : [];
          const tabItemIdx = updatedTabItems.findIndex((i: any) => i.id === cleanItemId);
          if (tabItemIdx >= 0) {
            updatedTabItems[tabItemIdx] = {
              ...updatedTabItems[tabItemIdx],
              status: 'CANCELLED',
              cancellationReason: cleanReason,
              cancelledAt: now,
              cancelledBy
            };
          }

          const prevTotalCents = tabData.totalInCents ?? Math.round((tabData.total || 0) * 100);
          const newTotalCents = Math.max(0, prevTotalCents - itemTotalCents);
          const prevPaidCents = tabData.paidInCents ?? Math.round((tabData.paidAmount || 0) * 100);
          const newRemainingCents = Math.max(0, newTotalCents - prevPaidCents);

          // Verificar se a comanda ficou sem itens cobrados, total 0 e pago 0
          const nonCancelledTabItems = updatedTabItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
          const hasActiveItems = nonCancelledTabItems.length > 0;
          const isZeroTotal = newTotalCents <= 0;
          const isZeroPaid = prevPaidCents <= 0;
          const shouldCancelTab = !hasActiveItems && isZeroTotal && isZeroPaid;

          const tabUpdates: any = {
            items: updatedTabItems,
            totalInCents: newTotalCents,
            subtotal: newTotalCents / 100,
            total: newTotalCents / 100,
            totalInBrl: newTotalCents / 100,
            remainingInCents: newRemainingCents,
            updatedAt: now
          };

          if (shouldCancelTab) {
            tabUpdates.status = 'CANCELLED';
            tabUpdates.cancelledAt = now;
            tabUpdates.cancelledBy = cancelledBy;
            tabUpdates.cancellationReason = 'Todos os itens foram cancelados (comanda zerada).';
          }

          transaction.update(tabRef, tabUpdates);

          // Se a comanda foi cancelada (zerada), liberar a mesa canônica e mesas unificadas para AVAILABLE
          if (shouldCancelTab) {
            const freeTablePayload = {
              status: 'AVAILABLE',
              comandaId: null,
              tabId: null,
              updatedAt: now
            };

            if (resolvedTable && resolvedTable.ref) {
              transaction.update(resolvedTable.ref, freeTablePayload);
            }

            for (const mRes of resolvedMergedTables) {
              if (mRes && mRes.ref) {
                transaction.update(mRes.ref, freeTablePayload);
              }
            }
          }
        }

        await logCancellationAction(
          transaction,
          restaurantId,
          'CANCEL_DIRECT',
          cleanItemId,
          targetTabId,
          targetOrderId,
          cancelledBy,
          `Cancelamento direto realizado. Motivo: "${cleanReason}"`
        );

        return {
          success: true,
          itemId: cleanItemId,
          cancelledAt: now,
          cancelledBy,
          message: 'Item cancelado com sucesso.'
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro ao cancelar item da comanda:', { error });
      const statusCode = error.code === 'WAITERS_NOT_ALLOWED' || error.code === 'FORBIDDEN_RESTAURANT' ? 403 :
                        error.code === 'MISSING_REASON' || error.code === 'MISSING_ITEM_ID' ? 400 :
                        error.code === 'ALREADY_CANCELLED' || error.code === 'ITEM_FINALIZED' ? 409 : 500;
      return res.status(statusCode).json({
        code: error.code || 'CANCEL_ITEM_FAILED',
        error: error.message || 'Erro ao cancelar o item.'
      });
    }
  });

  // =========================================================================
  // OPERAÇÃO DE COMANDA: SOLICITAÇÃO DE CANCELAMENTO DE ITEM
  // =========================================================================
  router.post('/request-item-cancellation', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { tabId, orderId, itemId, cancellationReason } = req.body || {};

      // Restaurant Isolation Check
      const clientRestaurantId = req.body?.restaurantId || req.headers['x-restaurant-id'];
      if (clientRestaurantId && clientRestaurantId !== restaurantId) {
        return res.status(403).json({
          code: 'FORBIDDEN_RESTAURANT',
          error: 'Acesso negado. Usuário pertence a outro restaurante.'
        });
      }

      if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
        return res.status(400).json({
          code: 'MISSING_ITEM_ID',
          error: 'ID do item é obrigatório.'
        });
      }

      if (!cancellationReason || typeof cancellationReason !== 'string' || !cancellationReason.trim()) {
        return res.status(400).json({
          code: 'MISSING_REASON',
          error: 'O motivo do cancelamento é obrigatório.'
        });
      }

      const cleanReason = cancellationReason.trim();
      const cleanItemId = itemId.trim();
      const now = new Date().toISOString();
      const userRole = getRequestUserRole(req);
      const requestedBy = {
        uid: req.user.uid,
        name: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Garçom',
        email: req.user.email || '',
        role: userRole
      };

      const result = await db.runTransaction(async (transaction) => {
        let orderRef: any = null;
        let orderSnap: any = null;
        let targetOrderId = orderId ? orderId.trim() : null;

        if (targetOrderId) {
          orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(targetOrderId);
          orderSnap = await transaction.get(orderRef);
        }

        let tabRef: any = null;
        let tabSnap: any = null;
        let targetTabId = tabId ? tabId.trim() : (orderSnap?.exists ? orderSnap.data()?.tabId || orderSnap.data()?.comanda_id : null);

        if (targetTabId) {
          try {
            const resolved = await resolveTabRef(restaurantId, targetTabId, transaction);
            tabRef = resolved.ref;
            tabSnap = resolved.snapshot;
          } catch (e) {
            tabRef = null;
            tabSnap = null;
          }
        }

        if (!orderSnap?.exists && targetTabId) {
          const ordersQuery = db.collection('restaurants').doc(restaurantId).collection('orders').where('tabId', '==', targetTabId);
          const ordersSnap = await ordersQuery.get();
          for (const docSnap of ordersSnap.docs) {
            const oData = docSnap.data();
            if (Array.isArray(oData.items) && oData.items.some((i: any) => i.id === cleanItemId)) {
              orderRef = docSnap.ref;
              orderSnap = await transaction.get(orderRef);
              targetOrderId = docSnap.id;
              break;
            }
          }
        }

        const orderData = orderSnap?.exists ? orderSnap.data() : null;
        const tabData = tabSnap?.exists ? tabSnap.data() : null;

        let targetItem: any = null;
        let itemIndex = -1;

        if (orderData && Array.isArray(orderData.items)) {
          itemIndex = orderData.items.findIndex((i: any) => i.id === cleanItemId);
          if (itemIndex >= 0) {
            targetItem = orderData.items[itemIndex];
          }
        }

        if (!targetItem && tabData && Array.isArray(tabData.items)) {
          const tIdx = tabData.items.findIndex((i: any) => i.id === cleanItemId);
          if (tIdx >= 0) {
            targetItem = tabData.items[tIdx];
          }
        }

        if (!targetItem) {
          const err: any = new Error('Item não encontrado na comanda/pedido.');
          err.code = 'ITEM_NOT_FOUND';
          throw err;
        }

        const currentStatus = (targetItem.status || '').toLowerCase();
        if (currentStatus === 'cancelled' || currentStatus === 'cancelado') {
          const err: any = new Error('Este item já foi cancelado anteriormente.');
          err.code = 'ALREADY_CANCELLED';
          throw err;
        }

        if (currentStatus === 'delivered' || currentStatus === 'finalized' || currentStatus === 'entregue' || currentStatus === 'concluido') {
          const err: any = new Error('Não é possível solicitar cancelamento de um item entregue ou finalizado.');
          err.code = 'ITEM_FINALIZED';
          throw err;
        }

        if (targetItem.cancellationRequest?.status === 'PENDING_APPROVAL') {
          const err: any = new Error('Este item já possui uma solicitação de cancelamento pendente.');
          err.code = 'DUPLICATE_REQUEST';
          throw err;
        }

        const cancellationRequest = {
          id: req.requestId ? `canc_${req.requestId}` : `canc_${cleanItemId}_${requestedBy.uid}`,
          reason: cleanReason,
          requestedBy,
          requestedAt: now,
          status: 'PENDING_APPROVAL'
        };

        if (orderRef && orderData) {
          const updatedOrderItems = [...orderData.items];
          updatedOrderItems[itemIndex] = {
            ...targetItem,
            cancellationRequest
          };
          transaction.update(orderRef, {
            items: updatedOrderItems,
            updatedAt: now
          });
        }

        if (tabRef && tabData) {
          let updatedTabItems = Array.isArray(tabData.items) ? [...tabData.items] : [];
          const tabItemIdx = updatedTabItems.findIndex((i: any) => i.id === cleanItemId);
          if (tabItemIdx >= 0) {
            updatedTabItems[tabItemIdx] = {
              ...updatedTabItems[tabItemIdx],
              cancellationRequest
            };
          }
          transaction.update(tabRef, {
            items: updatedTabItems,
            updatedAt: now
          });
        }

        await logCancellationAction(
          transaction,
          restaurantId,
          'REQUEST',
          cleanItemId,
          targetTabId,
          targetOrderId,
          requestedBy,
          `Solicitação de cancelamento enviada. Motivo: "${cleanReason}"`
        );

        return {
          success: true,
          message: 'Solicitação de cancelamento registrada com sucesso. Aguardando aprovação.',
          itemId: cleanItemId,
          cancellationRequest
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro ao solicitar cancelamento de item:', { error });
      const statusCode = error.code === 'FORBIDDEN_RESTAURANT' ? 403 :
                        error.code === 'DUPLICATE_REQUEST' || error.code === 'ALREADY_CANCELLED' || error.code === 'ITEM_FINALIZED' ? 409 : 400;
      return res.status(statusCode).json({
        code: error.code || 'REQUEST_CANCEL_FAILED',
        error: error.message || 'Erro ao solicitar cancelamento do item.'
      });
    }
  });

  // =========================================================================
  // OPERAÇÃO DE COMANDA: APROVAÇÃO DE CANCELAMENTO DE ITEM (GERÊNCIA)
  // =========================================================================
  router.post('/approve-item-cancellation', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { tabId, orderId, itemId, approvalNote } = req.body || {};

      // Restaurant Isolation Check
      const clientRestaurantId = req.body?.restaurantId || req.headers['x-restaurant-id'];
      if (clientRestaurantId && clientRestaurantId !== restaurantId) {
        return res.status(403).json({
          code: 'FORBIDDEN_RESTAURANT',
          error: 'Acesso negado. Usuário pertence a outro restaurante.'
        });
      }

      // Check manager profile permissions
      const userRole = getRequestUserRole(req);
      if (userRole !== 'manager') {
        return res.status(403).json({
          code: 'UNAUTHORIZED_ROLE',
          error: 'Apenas gerentes e administradores podem aprovar solicitações de cancelamento.'
        });
      }

      if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
        return res.status(400).json({ code: 'MISSING_ITEM_ID', error: 'ID do item é obrigatório.' });
      }

      const cleanItemId = itemId.trim();
      const now = new Date().toISOString();
      const approvedBy = {
        uid: req.user.uid,
        name: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Gerente',
        email: req.user.email || '',
        role: userRole
      };

      const result = await db.runTransaction(async (transaction) => {
        let orderRef: any = null;
        let orderSnap: any = null;
        let targetOrderId = orderId ? orderId.trim() : null;

        if (targetOrderId) {
          orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(targetOrderId);
          orderSnap = await transaction.get(orderRef);
        }

        let tabRef: any = null;
        let tabSnap: any = null;
        let targetTabId = tabId ? tabId.trim() : (orderSnap?.exists ? orderSnap.data()?.tabId || orderSnap.data()?.comanda_id : null);

        if (targetTabId) {
          try {
            const resolved = await resolveTabRef(restaurantId, targetTabId, transaction);
            tabRef = resolved.ref;
            tabSnap = resolved.snapshot;
          } catch (e) {
            tabRef = null;
            tabSnap = null;
          }
        }

        if (!orderSnap?.exists && targetTabId) {
          const ordersQuery = db.collection('restaurants').doc(restaurantId).collection('orders').where('tabId', '==', targetTabId);
          const ordersSnap = await ordersQuery.get();
          for (const docSnap of ordersSnap.docs) {
            const oData = docSnap.data();
            if (Array.isArray(oData.items) && oData.items.some((i: any) => i.id === cleanItemId)) {
              orderRef = docSnap.ref;
              orderSnap = await transaction.get(orderRef);
              targetOrderId = docSnap.id;
              break;
            }
          }
        }

        const orderData = orderSnap?.exists ? orderSnap.data() : null;
        const tabData = tabSnap?.exists ? tabSnap.data() : null;

        let targetItem: any = null;
        let itemIndex = -1;

        if (orderData && Array.isArray(orderData.items)) {
          itemIndex = orderData.items.findIndex((i: any) => i.id === cleanItemId);
          if (itemIndex >= 0) {
            targetItem = orderData.items[itemIndex];
          }
        }

        if (!targetItem && tabData && Array.isArray(tabData.items)) {
          const tIdx = tabData.items.findIndex((i: any) => i.id === cleanItemId);
          if (tIdx >= 0) {
            targetItem = tabData.items[tIdx];
          }
        }

        if (!targetItem) {
          const err: any = new Error('Item não encontrado na comanda/pedido.');
          err.code = 'ITEM_NOT_FOUND';
          throw err;
        }

        const currentStatus = (targetItem.status || '').toLowerCase();
        if (currentStatus === 'cancelled' || currentStatus === 'cancelado') {
          const err: any = new Error('Este item já está cancelado.');
          err.code = 'ALREADY_CANCELLED';
          throw err;
        }

        const requesterUid = targetItem.cancellationRequest?.requestedBy?.uid;
        if (requesterUid && requesterUid === req.user.uid) {
          const err: any = new Error('Operação bloqueada: Um funcionário não pode aprovar a sua própria solicitação de cancelamento.');
          err.code = 'SELF_APPROVAL_BLOCKED';
          throw err;
        }

        const reqReason = targetItem.cancellationRequest?.reason || 'Cancelamento aprovado pela gerência.';
        const updatedReq = {
          ...(targetItem.cancellationRequest || {}),
          status: 'APPROVED',
          approvedBy,
          approvedAt: now,
          approvalNote: approvalNote?.trim() || ''
        };

        let itemTotalCents = targetItem.totalPriceCents;
        if (typeof itemTotalCents !== 'number') {
          const valTot = Number(targetItem.valorTotal || targetItem.total) || 0;
          if (valTot > 0) {
            itemTotalCents = Math.round(valTot * 100);
          } else {
            const unitVal = Number(targetItem.precoUnitario) || 0;
            const qty = Number(targetItem.quantidade) || 1;
            itemTotalCents = Math.round(unitVal * qty * 100);
          }
        }

        // Stock Reversal
        const productId = targetItem.productId || targetItem.produtoId;
        if (productId) {
          const productRef = db.collection('restaurants').doc(restaurantId).collection('products').doc(productId);
          const productSnap = await transaction.get(productRef);
          if (productSnap.exists) {
            const pData = productSnap.data()!;
            const hasStockControl = pData.controlarEstoque === true || pData.stockControl === true;
            if (hasStockControl) {
              const currentStock = typeof pData.estoqueAtual === 'number' ? pData.estoqueAtual : typeof pData.estoque === 'number' ? pData.estoque : typeof pData.stock === 'number' ? pData.stock : 0;
              const returnQty = Number(targetItem.quantidade) || 1;
              const restoredStock = currentStock + returnQty;
              transaction.update(productRef, {
                estoqueAtual: restoredStock,
                estoque: restoredStock,
                stock: restoredStock,
                updatedAt: now
              });
            }
          }
        }

        // Table Resolution (in read phase before writes)
        const primaryTableId = tabData ? (tabData.tableId || tabData.mesaId || '').trim() : null;
        let resolvedTable: any = null;
        if (primaryTableId) {
          resolvedTable = await resolveTableRef(restaurantId, primaryTableId, transaction);
        }

        const resolvedMergedTables: any[] = [];
        if (tabData && Array.isArray(tabData.mergedTables)) {
          for (const mt of tabData.mergedTables) {
            const mTableId = (typeof mt === 'string' ? mt : (mt?.id || mt?.tableId) || '').trim();
            if (mTableId) {
              const mRes = await resolveTableRef(restaurantId, mTableId, transaction);
              if (mRes) {
                resolvedMergedTables.push(mRes);
              }
            }
          }
        }

        if (orderRef && orderData) {
          const updatedOrderItems = [...orderData.items];
          updatedOrderItems[itemIndex] = {
            ...targetItem,
            status: 'CANCELLED',
            cancellationReason: reqReason,
            cancelledAt: now,
            cancelledBy: targetItem.cancellationRequest?.requestedBy || approvedBy,
            cancellationRequest: updatedReq
          };

          const nonCancelledItems = updatedOrderItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
          const newOrderTotalCents = nonCancelledItems.reduce((acc: number, i: any) => {
            const cents = i.totalPriceCents ?? Math.round((Number(i.valorTotal || i.total) || 0) * 100);
            return acc + cents;
          }, 0);

          const allItemsCancelled = updatedOrderItems.every((i: any) => i.status === 'CANCELLED' || i.status === 'cancelado');

          const orderUpdates: any = {
            items: updatedOrderItems,
            valor_produtos: newOrderTotalCents / 100,
            valor_total: newOrderTotalCents / 100,
            subtotalInCents: newOrderTotalCents,
            totalInCents: newOrderTotalCents,
            updatedAt: now
          };

          if (allItemsCancelled) {
            orderUpdates.orderStatus = 'CANCELLED';
            orderUpdates.status = 'cancelado';
            orderUpdates.canonicalStatus = 'CANCELLED';
            orderUpdates.cancellationReason = reqReason;
            orderUpdates.cancelledAt = now;
            orderUpdates.cancelledBy = approvedBy;
          }

          transaction.update(orderRef, orderUpdates);
        }

        if (tabRef && tabData) {
          let updatedTabItems = Array.isArray(tabData.items) ? [...tabData.items] : [];
          const tabItemIdx = updatedTabItems.findIndex((i: any) => i.id === cleanItemId);
          if (tabItemIdx >= 0) {
            updatedTabItems[tabItemIdx] = {
              ...updatedTabItems[tabItemIdx],
              status: 'CANCELLED',
              cancellationReason: reqReason,
              cancelledAt: now,
              cancelledBy: targetItem.cancellationRequest?.requestedBy || approvedBy,
              cancellationRequest: updatedReq
            };
          }

          const prevTotalCents = tabData.totalInCents ?? Math.round((tabData.total || 0) * 100);
          const newTotalCents = Math.max(0, prevTotalCents - itemTotalCents);
          const prevPaidCents = tabData.paidInCents ?? Math.round((tabData.paidAmount || 0) * 100);
          const newRemainingCents = Math.max(0, newTotalCents - prevPaidCents);

          // Verificar se a comanda ficou sem itens cobrados, total 0 e pago 0
          const nonCancelledTabItems = updatedTabItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
          const hasActiveItems = nonCancelledTabItems.length > 0;
          const isZeroTotal = newTotalCents <= 0;
          const isZeroPaid = prevPaidCents <= 0;
          const shouldCancelTab = !hasActiveItems && isZeroTotal && isZeroPaid;

          const tabUpdates: any = {
            items: updatedTabItems,
            totalInCents: newTotalCents,
            subtotal: newTotalCents / 100,
            total: newTotalCents / 100,
            totalInBrl: newTotalCents / 100,
            remainingInCents: newRemainingCents,
            updatedAt: now
          };

          if (shouldCancelTab) {
            tabUpdates.status = 'CANCELLED';
            tabUpdates.cancelledAt = now;
            tabUpdates.cancelledBy = approvedBy;
            tabUpdates.cancellationReason = 'Todos os itens foram cancelados (comanda zerada).';
          }

          transaction.update(tabRef, tabUpdates);

          // Se a comanda foi cancelada (zerada), liberar a mesa canônica e mesas unificadas para AVAILABLE
          if (shouldCancelTab) {
            const freeTablePayload = {
              status: 'AVAILABLE',
              comandaId: null,
              tabId: null,
              updatedAt: now
            };

            if (resolvedTable && resolvedTable.ref) {
              transaction.update(resolvedTable.ref, freeTablePayload);
            }

            for (const mRes of resolvedMergedTables) {
              if (mRes && mRes.ref) {
                transaction.update(mRes.ref, freeTablePayload);
              }
            }
          }
        }

        await logCancellationAction(
          transaction,
          restaurantId,
          'APPROVE',
          cleanItemId,
          targetTabId,
          targetOrderId,
          approvedBy,
          `Solicitação de cancelamento aprovada. Nota: "${approvalNote || ''}"`
        );

        return {
          success: true,
          message: 'Solicitação de cancelamento APROVADA com sucesso.',
          itemId: cleanItemId
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro ao aprovar cancelamento de item:', { error });
      const statusCode = error.code === 'UNAUTHORIZED_ROLE' || error.code === 'SELF_APPROVAL_BLOCKED' || error.code === 'FORBIDDEN_RESTAURANT' ? 403 : 400;
      return res.status(statusCode).json({
        code: error.code || 'APPROVE_CANCEL_FAILED',
        error: error.message || 'Erro ao aprovar cancelamento do item.'
      });
    }
  });

  // =========================================================================
  // OPERAÇÃO DE COMANDA: RECUSA DE CANCELAMENTO DE ITEM (GERÊNCIA)
  // =========================================================================
  router.post('/refuse-item-cancellation', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { tabId, orderId, itemId, refusalReason } = req.body || {};

      // Restaurant Isolation Check
      const clientRestaurantId = req.body?.restaurantId || req.headers['x-restaurant-id'];
      if (clientRestaurantId && clientRestaurantId !== restaurantId) {
        return res.status(403).json({
          code: 'FORBIDDEN_RESTAURANT',
          error: 'Acesso negado. Usuário pertence a outro restaurante.'
        });
      }

      // Check manager profile permissions
      const userRole = getRequestUserRole(req);
      if (userRole !== 'manager') {
        return res.status(403).json({
          code: 'UNAUTHORIZED_ROLE',
          error: 'Apenas gerentes e administradores podem recusar solicitações de cancelamento.'
        });
      }

      if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
        return res.status(400).json({ code: 'MISSING_ITEM_ID', error: 'ID do item é obrigatório.' });
      }

      const cleanItemId = itemId.trim();
      const now = new Date().toISOString();
      const refusedBy = {
        uid: req.user.uid,
        name: req.user.nome || req.user.name || req.user.displayName || req.user.email || 'Gerente',
        email: req.user.email || '',
        role: userRole
      };

      const result = await db.runTransaction(async (transaction) => {
        let orderRef: any = null;
        let orderSnap: any = null;
        let targetOrderId = orderId ? orderId.trim() : null;

        if (targetOrderId) {
          orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(targetOrderId);
          orderSnap = await transaction.get(orderRef);
        }

        let tabRef: any = null;
        let tabSnap: any = null;
        let targetTabId = tabId ? tabId.trim() : (orderSnap?.exists ? orderSnap.data()?.tabId || orderSnap.data()?.comanda_id : null);

        if (targetTabId) {
          try {
            const resolved = await resolveTabRef(restaurantId, targetTabId, transaction);
            tabRef = resolved.ref;
            tabSnap = resolved.snapshot;
          } catch (e) {
            tabRef = null;
            tabSnap = null;
          }
        }

        if (!orderSnap?.exists && targetTabId) {
          const ordersQuery = db.collection('restaurants').doc(restaurantId).collection('orders').where('tabId', '==', targetTabId);
          const ordersSnap = await ordersQuery.get();
          for (const docSnap of ordersSnap.docs) {
            const oData = docSnap.data();
            if (Array.isArray(oData.items) && oData.items.some((i: any) => i.id === cleanItemId)) {
              orderRef = docSnap.ref;
              orderSnap = await transaction.get(orderRef);
              targetOrderId = docSnap.id;
              break;
            }
          }
        }

        const orderData = orderSnap?.exists ? orderSnap.data() : null;
        const tabData = tabSnap?.exists ? tabSnap.data() : null;

        let targetItem: any = null;
        let itemIndex = -1;

        if (orderData && Array.isArray(orderData.items)) {
          itemIndex = orderData.items.findIndex((i: any) => i.id === cleanItemId);
          if (itemIndex >= 0) {
            targetItem = orderData.items[itemIndex];
          }
        }

        if (!targetItem && tabData && Array.isArray(tabData.items)) {
          const tIdx = tabData.items.findIndex((i: any) => i.id === cleanItemId);
          if (tIdx >= 0) {
            targetItem = tabData.items[tIdx];
          }
        }

        if (!targetItem) {
          const err: any = new Error('Item não encontrado na comanda/pedido.');
          err.code = 'ITEM_NOT_FOUND';
          throw err;
        }

        const updatedReq = {
          ...(targetItem.cancellationRequest || {}),
          status: 'REFUSED',
          refusedBy,
          refusedAt: now,
          refusalReason: refusalReason?.trim() || 'Solicitação recusada pela gerência.'
        };

        if (orderRef && orderData) {
          const updatedOrderItems = [...orderData.items];
          updatedOrderItems[itemIndex] = {
            ...targetItem,
            cancellationRequest: updatedReq
          };
          transaction.update(orderRef, {
            items: updatedOrderItems,
            updatedAt: now
          });
        }

        if (tabRef && tabData) {
          let updatedTabItems = Array.isArray(tabData.items) ? [...tabData.items] : [];
          const tabItemIdx = updatedTabItems.findIndex((i: any) => i.id === cleanItemId);
          if (tabItemIdx >= 0) {
            updatedTabItems[tabItemIdx] = {
              ...updatedTabItems[tabItemIdx],
              cancellationRequest: updatedReq
            };
          }
          transaction.update(tabRef, {
            items: updatedTabItems,
            updatedAt: now
          });
        }

        await logCancellationAction(
          transaction,
          restaurantId,
          'REFUSE',
          cleanItemId,
          targetTabId,
          targetOrderId,
          refusedBy,
          `Solicitação de cancelamento recusada. Motivo: "${refusalReason || ''}"`
        );

        return {
          success: true,
          message: 'Solicitação de cancelamento RECUSADA. O item permanece ativo na comanda.',
          itemId: cleanItemId
        };
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('Erro ao recusar cancelamento de item:', { error });
      const statusCode = error.code === 'UNAUTHORIZED_ROLE' || error.code === 'FORBIDDEN_RESTAURANT' ? 403 : 400;
      return res.status(statusCode).json({
        code: error.code || 'REFUSE_CANCEL_FAILED',
        error: error.message || 'Erro ao recusar cancelamento do item.'
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: RECEBER PAGAMENTO E FECHAR CONTA (POST /pay-and-close)
  // ==========================================
  router.post('/pay-and-close', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId || 'NO_REQUEST_ID_FOUND';
    const body = req.body || {};
    const { tabId, payments, observation } = body;

    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.',
          requestId
        });
      }

      const uid = req.user.uid;
      const restaurantId = req.user.restaurantId;

      if (!restaurantId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado no token.',
          requestId
        });
      }

      if (!tabId || typeof tabId !== 'string' || !tabId.trim()) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_TAB_ID',
          message: 'ID da comanda (tabId) é obrigatório.',
          requestId
        });
      }

      if (!Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_PAYMENTS',
          message: 'É necessário informar ao menos uma forma e valor de pagamento.',
          requestId
        });
      }

      // Validar permissão do perfil: garçons não podem receber pagamentos ou fechar contas
      const roleUpper = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
      let isWaiter = ['WAITER', 'GARCOM', 'GARÇOM'].includes(roleUpper);

      if (!isWaiter) {
        const staffProfileSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(uid).get();
        if (staffProfileSnap.exists) {
          const staffData = staffProfileSnap.data() || {};
          const staffRole = (staffData.role || staffData.tipo_usuario || '').toUpperCase();
          if (['WAITER', 'GARCOM', 'GARÇOM'].includes(staffRole)) {
            isWaiter = true;
          }
        }
      }

      if (isWaiter) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_CANNOT_CLOSE_ACCOUNT',
          message: 'Garçons não possuem permissão para receber pagamentos e fechar contas. Apenas o caixa, gerente ou administrador podem realizar o fechamento.',
          requestId
        });
      }

      // Transação atômica
      const result = await db.runTransaction(async (transaction) => {
        // 1. Resolver comanda canônica
        const resolvedTab = await resolveTabRef(restaurantId, tabId, transaction);
        const tabData = resolvedTab.data || {};
        const tabRef = resolvedTab.ref;

        if (tabData.status === 'CLOSED' || tabData.status === 'FECHADA') {
          const err: any = new Error('Esta comanda já foi encerrada anteriormente.');
          err.code = 'TAB_ALREADY_CLOSED';
          throw err;
        }

        if (tabData.status === 'CANCELLED' || tabData.status === 'CANCELADA') {
          const err: any = new Error('Esta comanda está cancelada e não pode receber pagamentos.');
          err.code = 'TAB_CANCELLED';
          throw err;
        }

        // 2. Verificar se o caixa do restaurante está aberto
        const activeCaixa = await resolveActiveCashRegister(db, restaurantId, transaction);
        if (!activeCaixa) {
          const err: any = new Error('Nenhum caixa aberto encontrado. É necessário abrir o caixa antes de receber pagamentos.');
          err.code = 'CASH_REGISTER_NOT_OPEN';
          throw err;
        }

        // 2b. Buscar e resolver a mesa canônica no read phase da transação
        const primaryTableId = (tabData.tableId || tabData.mesaId || '').trim();
        let targetTableRef: any = null;
        let targetTableSnap: any = null;

        if (primaryTableId) {
          // 1. Resolver primeiro na raiz canônica /tables/{tableId}
          const rootTableRef = db.collection('tables').doc(primaryTableId);
          const rootTableSnap = await transaction.get(rootTableRef);

          if (rootTableSnap.exists) {
            const tableData = rootTableSnap.data() || {};
            // 2. Validar obrigatoriamente o tenant
            if (tableData.restaurantId && tableData.restaurantId !== restaurantId) {
              const err: any = new Error('Acesso negado: Mesa pertence a outro restaurante.');
              err.code = 'FORBIDDEN_TABLE_RESTAURANT';
              throw err;
            }
            targetTableRef = rootTableRef;
            targetTableSnap = rootTableSnap;
          } else {
            // 3. Fallback legado em /restaurants/{restaurantId}/tables/{tableId}
            const nestedTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(primaryTableId);
            const nestedTableSnap = await transaction.get(nestedTableRef);
            if (nestedTableSnap.exists) {
              const nestedData = nestedTableSnap.data() || {};
              if (nestedData.restaurantId && nestedData.restaurantId !== restaurantId) {
                const err: any = new Error('Acesso negado: Mesa pertence a outro restaurante.');
                err.code = 'FORBIDDEN_TABLE_RESTAURANT';
                throw err;
              }
              targetTableRef = nestedTableRef;
              targetTableSnap = nestedTableSnap;
            }
          }
        }

        const resolvedMergedTableRefs: any[] = [];
        if (Array.isArray(tabData.mergedTables)) {
          for (const mt of tabData.mergedTables) {
            const mTableId = (typeof mt === 'string' ? mt : (mt?.id || mt?.tableId) || '').trim();
            if (mTableId) {
              const mRootRef = db.collection('tables').doc(mTableId);
              const mRootSnap = await transaction.get(mRootRef);
              if (mRootSnap.exists) {
                const mData = mRootSnap.data() || {};
                if (!mData.restaurantId || mData.restaurantId === restaurantId) {
                  resolvedMergedTableRefs.push(mRootRef);
                }
              } else {
                const mNestedRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(mTableId);
                const mNestedSnap = await transaction.get(mNestedRef);
                if (mNestedSnap.exists) {
                  const mData = mNestedSnap.data() || {};
                  if (!mData.restaurantId || mData.restaurantId === restaurantId) {
                    resolvedMergedTableRefs.push(mNestedRef);
                  }
                }
              }
            }
          }
        }

        // 3. Obter ou calcular total da comanda em centavos
        let tabTotalCents = 0;
        if (typeof tabData.totalInCents === 'number' && tabData.totalInCents > 0) {
          tabTotalCents = tabData.totalInCents;
        } else if (typeof tabData.total === 'number' && tabData.total > 0) {
          tabTotalCents = Math.round(tabData.total * 100);
        } else if (typeof tabData.subtotal === 'number' && tabData.subtotal > 0) {
          tabTotalCents = Math.round(tabData.subtotal * 100);
        } else if (Array.isArray(tabData.items)) {
          tabTotalCents = tabData.items.reduce((sum: number, item: any) => {
            const isCancelled = item.status === 'CANCELLED' || item.status === 'cancelado';
            if (isCancelled) return sum;
            const itemPriceCents = item.totalPriceCents ?? Math.round((Number(item.precoUnitario || item.preco || 0) * Number(item.quantidade || 1)) * 100);
            return sum + itemPriceCents;
          }, 0);
        }

        const prevPaidCents = typeof tabData.paidInCents === 'number' 
          ? tabData.paidInCents 
          : (typeof tabData.paidAmount === 'number' ? Math.round(tabData.paidAmount * 100) : 0);

        // 4. Validar e processar pagamentos informados
        let incomingTotalCents = 0;
        const now = new Date().toISOString();
        const userName = req.user.nome || req.user.name || req.user.email || 'Operador';

        const normalizedPaymentsList: any[] = [];

        for (let i = 0; i < payments.length; i++) {
          const p = payments[i];
          const rawMethod = p.paymentMethodId || p.formaPagamento || p.method || 'dinheiro';
          const methodId = normalizePaymentMethodId(rawMethod) || String(rawMethod).toLowerCase().trim();
          
          let amountCents = 0;
          if (typeof p.amountCents === 'number') {
            amountCents = Math.round(p.amountCents);
          } else if (typeof p.amount === 'number') {
            if (p.isCents || p.amountInCents) {
              amountCents = Math.round(p.amount);
            } else if (Number.isInteger(p.amount) && p.amount >= 100) {
              amountCents = Math.round(p.amount);
            } else {
              amountCents = Math.round(p.amount * 100);
            }
          }

          if (isNaN(amountCents) || amountCents <= 0) {
            continue;
          }

          incomingTotalCents += amountCents;
          const paymentUniqueId = `pay_${Date.now()}_${i}`;

          normalizedPaymentsList.push({
            id: paymentUniqueId,
            paymentMethodId: methodId,
            formaPagamento: methodId,
            amount: amountCents,
            amountCents: amountCents,
            paidAt: now,
            pagoEm: now,
            receivedBy: {
              uid,
              name: userName,
              role: req.user.role || 'operator'
            }
          });
        }

        if (incomingTotalCents <= 0) {
          const err: any = new Error('O valor do pagamento deve ser maior que zero.');
          err.code = 'INVALID_PAYMENT_AMOUNT';
          throw err;
        }

        const newPaidCents = prevPaidCents + incomingTotalCents;
        const remainingCents = Math.max(0, tabTotalCents - newPaidCents);
        const isFullySettled = remainingCents === 0;

        const updatedStatus = isFullySettled ? 'CLOSED' : 'PARTIALLY_PAID';

        // 5. Atualizar documento da Comanda
        const existingPayments = Array.isArray(tabData.payments) ? tabData.payments : [];
        const mergedPayments = [...existingPayments, ...normalizedPaymentsList];

        const tabUpdatePayload: any = {
          status: updatedStatus,
          totalInCents: tabTotalCents,
          paidInCents: newPaidCents,
          remainingInCents: remainingCents,
          total: tabTotalCents / 100,
          paidAmount: newPaidCents / 100,
          remainingAmount: remainingCents / 100,
          payments: mergedPayments,
          pago: isFullySettled,
          updatedAt: now
        };

        if (isFullySettled) {
          tabUpdatePayload.closedAt = now;
          tabUpdatePayload.fechadaAt = now;
          tabUpdatePayload.closedBy = {
            uid,
            name: userName,
            role: req.user.role || 'operator'
          };
        }

        transaction.update(tabRef, removeUndefinedRecursively(tabUpdatePayload));

        // 6. Registrar lançamentos no Caixa aberto
        const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
        for (const pay of normalizedPaymentsList) {
          const movementRef = caixasRef.doc(activeCaixa.id).collection('movimentacoes').doc();
          const tableIdentifier = tabData.tableNumber ? `Mesa ${tabData.tableNumber}` : (tabData.tableId ? `Mesa ${tabData.tableId}` : 'Comanda');

          const movementDoc = {
            id: movementRef.id,
            restaurantId,
            cashRegisterId: activeCaixa.id,
            type: 'INCOME',
            category: 'TAB_PAYMENT',
            description: `Recebimento da ${tableIdentifier}`,
            amount: pay.amountCents,
            amountCents: pay.amountCents,
            paymentMethodId: pay.paymentMethodId,
            paymentId: pay.id,
            tabId,
            tableId: tabData.tableId || null,
            createdAt: now,
            createdBy: userName,
            createdById: uid,
            origin: 'TAB',
            automatic: true,
            idempotencyKey: `TAB_PAYMENT:${tabId}:${pay.id}`
          };

          transaction.set(movementRef, removeUndefinedRecursively(movementDoc));
        }

        // 7. Se quitado (isFullySettled): Liberar mesa e atualizar pedidos vinculados
        if (isFullySettled) {
          const freeTablePayload = {
            status: 'AVAILABLE',
            comandaId: null,
            tabId: null,
            updatedAt: now
          };

          if (targetTableRef && targetTableSnap?.exists) {
            transaction.update(targetTableRef, freeTablePayload);
          }

          // Se houver mesas unificadas/mescladas, liberar todas
          for (const mRef of resolvedMergedTableRefs) {
            transaction.update(mRef, freeTablePayload);
          }
        }

        return {
          success: true,
          isFullySettled,
          status: updatedStatus,
          totalInCents: tabTotalCents,
          paidInCents: newPaidCents,
          remainingInCents: remainingCents,
          message: isFullySettled 
            ? 'Conta recebida com sucesso! Comanda encerrada e mesa liberada.' 
            : `Pagamento parcial registrado com sucesso! Saldo restante: ${(remainingCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
        };
      });

      // Atualizar pedidos fora da transação se quitado
      if (result.isFullySettled) {
        try {
          const ordersSnap = await db.collection('restaurants').doc(restaurantId).collection('orders')
            .where('tabId', '==', tabId)
            .get();
          
          if (!ordersSnap.empty) {
            const batch = db.batch();
            const now = new Date().toISOString();
            ordersSnap.docs.forEach(docSnap => {
              batch.update(docSnap.ref, {
                pago: true,
                paymentStatus: 'PAID',
                financialSettlementStatus: 'SETTLED',
                updatedAt: now
              });
            });
            await batch.commit();
          }
        } catch (ordErr) {
          logger.warn('Aviso: erro não bloqueante ao atualizar pedidos da comanda fechada:', { error: ordErr });
        }
      }

      return res.status(200).json({
        ...result,
        requestId
      });

    } catch (error: any) {
      logger.error(`[AUDIT_LOG] RequestID: ${requestId} | Erro ao receber e fechar conta:`, { error: error.message });
      const statusCode = error.code === 'CASH_REGISTER_NOT_OPEN' ? 409 : (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN_CANNOT_CLOSE_ACCOUNT' ? 403 : 400);
      return res.status(statusCode).json({
        success: false,
        code: error.code || 'PAY_TAB_FAILED',
        message: error.message || 'Erro ao processar pagamento e fechamento da comanda.',
        error: error.message,
        requestId
      });
    }
  });

  // ==========================================
  // OPERAÇÃO DE COMANDA: SOLICITAR CONTA / PRÉ-FECHAMENTO (POST /request-bill)
  // ==========================================
  router.post('/request-bill', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId || 'NO_REQUEST_ID_FOUND';
    const body = req.body || {};
    const { tabId } = body;

    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.',
          requestId
        });
      }

      const uid = req.user.uid;
      const restaurantId = req.user.restaurantId;

      if (!restaurantId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado no token.',
          requestId
        });
      }

      if (!tabId || typeof tabId !== 'string' || !tabId.trim()) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_TAB_ID',
          message: 'ID da comanda (tabId) é obrigatório.',
          requestId
        });
      }

      const now = new Date().toISOString();
      const userName = req.user.nome || req.user.name || req.user.email || 'Garçom';

      const result = await db.runTransaction(async (transaction) => {
        const resolvedTab = await resolveTabRef(restaurantId, tabId, transaction);
        const tabData = resolvedTab.data || {};
        const tabRef = resolvedTab.ref;

        if (tabData.status === 'CLOSED' || tabData.status === 'FECHADA') {
          const err: any = new Error('Esta comanda já foi encerrada.');
          err.code = 'TAB_ALREADY_CLOSED';
          throw err;
        }

        // Buscar e resolver a mesa canônica no read phase da transação
        const primaryTableId = (tabData.tableId || tabData.mesaId || '').trim();
        let targetTableRef: any = null;
        let targetTableSnap: any = null;

        if (primaryTableId) {
          // 1. Resolver primeiro na raiz canônica /tables/{tableId}
          const rootTableRef = db.collection('tables').doc(primaryTableId);
          const rootTableSnap = await transaction.get(rootTableRef);

          if (rootTableSnap.exists) {
            const tableData = rootTableSnap.data() || {};
            // 2. Validar tenant
            if (tableData.restaurantId && tableData.restaurantId !== restaurantId) {
              const err: any = new Error('Acesso negado: Mesa pertence a outro restaurante.');
              err.code = 'FORBIDDEN_TABLE_RESTAURANT';
              throw err;
            }
            targetTableRef = rootTableRef;
            targetTableSnap = rootTableSnap;
          } else {
            // 3. Fallback legado em /restaurants/{restaurantId}/tables/{tableId}
            const nestedTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(primaryTableId);
            const nestedTableSnap = await transaction.get(nestedTableRef);
            if (nestedTableSnap.exists) {
              const nestedData = nestedTableSnap.data() || {};
              if (nestedData.restaurantId && nestedData.restaurantId !== restaurantId) {
                const err: any = new Error('Acesso negado: Mesa pertence a outro restaurante.');
                err.code = 'FORBIDDEN_TABLE_RESTAURANT';
                throw err;
              }
              targetTableRef = nestedTableRef;
              targetTableSnap = nestedTableSnap;
            }
          }
        }

        // Atualizar status para WAITING_PAYMENT
        transaction.update(tabRef, {
          status: 'WAITING_PAYMENT',
          billRequestedAt: now,
          billRequestedBy: {
            uid,
            name: userName,
            role: req.user.role || 'waiter'
          },
          updatedAt: now
        });

        // Atualizar status da mesa resolvida
        if (targetTableRef && targetTableSnap?.exists) {
          transaction.update(targetTableRef, {
            status: 'WAITING_PAYMENT',
            updatedAt: now
          });
        }

        return {
          success: true,
          message: 'Conta solicitada com sucesso! Mesa marcada como Aguardando Pagamento.',
          tabId,
          status: 'WAITING_PAYMENT'
        };
      });

      return res.status(200).json({
        ...result,
        requestId
      });

    } catch (error: any) {
      logger.error(`[AUDIT_LOG] RequestID: ${requestId} | Erro ao solicitar conta:`, { error: error.message });
      return res.status(400).json({
        success: false,
        code: error.code || 'REQUEST_BILL_FAILED',
        message: error.message || 'Erro ao solicitar conta da mesa.',
        requestId
      });
    }
  });

  return router;
}

