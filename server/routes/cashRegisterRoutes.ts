import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';
import { removeUndefinedRecursively } from '../utils/sanitize';
import { logger } from '../utils/logger';
import { resolveActiveCashRegister } from '../utils/cashRegister';

export function createCashRegisterRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  // 0. STATUS CANÔNICO DO CAIXA
  router.get('/status', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const openCaixa = await resolveActiveCashRegister(db, restaurantId);

      if (openCaixa) {
        return res.json({
          success: true,
          status: 'OPEN',
          caixa: openCaixa
        });
      }

      return res.json({
        success: true,
        status: 'CLOSED',
        caixa: null
      });
    } catch (error: any) {
      logger.error('Error fetching caixa status', { error });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao obter status do caixa.' });
    }
  });

  // 1. ABERTURA DE CAIXA (Atômica)
  router.post('/open', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { openingBalance, openingBalanceCents, observation } = req.body || {};

      let cents = 0;
      if (typeof openingBalanceCents === 'number') {
        cents = Math.round(openingBalanceCents);
      } else if (typeof openingBalance === 'number') {
        cents = Math.round(openingBalance * 100);
      } else if (typeof openingBalance === 'string') {
        const clean = openingBalance.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents < 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor do saldo inicial deve ser um número inteiro positivo em centavos.'
        });
      }

      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
      const activeCaixaRef = db.collection('restaurants').doc(restaurantId).collection('active_caixa').doc('current');

      const result = await db.runTransaction(async (transaction) => {
        // Resolve canonical active open cash register inside transaction
        const existingOpen = await resolveActiveCashRegister(db, restaurantId, transaction);

        if (existingOpen) {
          const err: any = new Error('Já existe um caixa aberto para este restaurante.');
          err.code = 'CASH_REGISTER_ALREADY_OPEN';
          err.caixa = existingOpen;
          throw err;
        }

        const newCaixaRef = caixasRef.doc();
        const now = new Date().toISOString();
        const userName = req.user.nome || req.user.name || req.user.email || 'Operador';

        const newCaixaData = {
          id: newCaixaRef.id,
          restaurantId,
          status: 'OPEN',
          openedAt: now,
          openedBy: userName,
          openedById: req.user.uid,
          openingBalance: cents,
          observation: typeof observation === 'string' ? observation.trim() : '',
          createdAt: now,
          updatedAt: now
        };

        transaction.set(newCaixaRef, newCaixaData);
        transaction.set(activeCaixaRef, {
          cashRegisterId: newCaixaRef.id,
          status: 'OPEN',
          openedAt: now,
          openedBy: userName,
          updatedAt: now
        });

        return newCaixaData;
      });

      return res.status(201).json({ success: true, caixa: result });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_ALREADY_OPEN') {
        return res.status(409).json({
          code: 'CASH_REGISTER_ALREADY_OPEN',
          error: error.message,
          caixa: error.caixa || null
        });
      }
      logger.error('Error opening caixa', { error });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao abrir caixa.' });
    }
  });

  // 2. FECHAMENTO DE CAIXA (Atômico)
  router.post('/close', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { countedValues, countedValuesInCents, observation } = req.body || {};

      const rawCounted: Record<string, any> = countedValuesInCents || countedValues || {};
      const parsedCountedCents: Record<string, number> = {};

      for (const [pmId, rawVal] of Object.entries(rawCounted)) {
        let valCents = 0;
        if (typeof rawVal === 'number') {
          valCents = Number.isInteger(rawVal) ? rawVal : Math.round(rawVal * 100);
        } else if (typeof rawVal === 'string') {
          const clean = rawVal.replace(/[^\d,-]/g, '').replace(',', '.');
          const num = parseFloat(clean);
          valCents = Math.round((isNaN(num) ? 0 : num) * 100);
        }
        if (isNaN(valCents) || valCents < 0) {
          return res.status(400).json({
            code: 'INVALID_AMOUNT',
            error: `O valor para a forma de pagamento "${pmId}" é inválido.`
          });
        }
        parsedCountedCents[pmId] = valCents;
      }

      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

      const result = await db.runTransaction(async (transaction) => {
        const openCaixa = await resolveActiveCashRegister(db, restaurantId, transaction);

        if (!openCaixa) {
          const err: any = new Error('Nenhum caixa aberto foi encontrado para realizar o fechamento.');
          err.code = 'CASH_REGISTER_NOT_OPEN';
          throw err;
        }

        const caixaId = openCaixa.id;
        const caixaRef = caixasRef.doc(caixaId);
        const activeCaixaRef = db.collection('restaurants').doc(restaurantId).collection('active_caixa').doc('current');
        const restaurantDocRef = db.collection('restaurants').doc(restaurantId);

        const caixaSnap = await transaction.get(caixaRef);
        if (!caixaSnap.exists) {
          const err: any = new Error('Caixa não encontrado.');
          err.code = 'CASH_REGISTER_NOT_OPEN';
          throw err;
        }
        const caixaData = caixaSnap.data()!;
        if (caixaData.status !== 'OPEN') {
          const err: any = new Error('Este caixa já se encontra fechado.');
          err.code = 'CASH_REGISTER_ALREADY_CLOSED';
          throw err;
        }
        if (caixaData.restaurantId !== restaurantId) {
          const err: any = new Error('O caixa não pertence ao restaurante autenticado.');
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }

        const movementsSnap = await transaction.get(caixaRef.collection('movimentacoes'));
        const restSnap = await transaction.get(restaurantDocRef);
        const rawFormasPagamento = restSnap.data()?.formas_pagamento || restSnap.data()?.payment_methods || [];
        const formasPagamento: any[] = Array.isArray(rawFormasPagamento)
          ? rawFormasPagamento
          : rawFormasPagamento && typeof rawFormasPagamento === 'object'
            ? Object.entries(rawFormasPagamento).map(([key, val]: [string, any]) => ({ id: key, ...(typeof val === 'object' ? val : { active: Boolean(val) }) }))
            : [];

        let rawOpening = caixaData.openingBalance || 0;
        let openingCents = Number.isInteger(rawOpening) ? rawOpening : Math.round(rawOpening * 100);

        let totalEntries = 0;
        let totalExits = 0;
        let totalSupplies = 0;
        let totalWithdrawals = 0;

        const pmExpected: Record<string, number> = {};
        pmExpected['dinheiro'] = openingCents;

        movementsSnap.forEach((mDoc) => {
          const m = mDoc.data();
          let amt = m.amount || 0;
          if (!Number.isInteger(amt)) amt = Math.round(amt * 100);
          const pmId = m.paymentMethodId || 'dinheiro';
          if (!pmExpected[pmId]) pmExpected[pmId] = 0;

          if (m.type === 'INCOME') {
            totalEntries += amt;
            pmExpected[pmId] += amt;
          } else if (m.type === 'EXPENSE') {
            totalExits += amt;
            pmExpected[pmId] -= amt;
          } else if (m.type === 'SUPPLY') {
            totalSupplies += amt;
            pmExpected[pmId] += amt;
          } else if (m.type === 'WITHDRAWAL') {
            totalWithdrawals += amt;
            pmExpected[pmId] -= amt;
          }
        });

        const expectedTotal = openingCents + totalEntries + totalSupplies - totalExits - totalWithdrawals;

        const allMethodIdsSet = new Set<string>();
        formasPagamento.forEach((p: any) => { if (p.id) allMethodIdsSet.add(p.id); });
        Object.keys(pmExpected).forEach((id) => allMethodIdsSet.add(id));
        Object.keys(parsedCountedCents).forEach((id) => allMethodIdsSet.add(id));
        if (openingCents > 0) allMethodIdsSet.add('dinheiro');

        const expectedByPaymentMethod: Record<string, number> = {};
        const countedByPaymentMethod: Record<string, number> = {};
        const differenceByPaymentMethod: Record<string, number> = {};
        const paymentSummary: Array<{
          paymentMethodId: string;
          paymentMethodName: string;
          expectedAmount: number;
          countedAmount: number;
          differenceAmount: number;
        }> = [];

        let totalCounted = 0;

        const getMethodLabel = (id: string): string => {
          const found = formasPagamento.find((p: any) => p.id === id);
          if (found?.label) return found.label;
          const fallback: Record<string, string> = {
            dinheiro: 'Dinheiro',
            pix: 'Pix',
            credito: 'Cartão de Crédito',
            debito: 'Cartão de Débito'
          };
          return fallback[id] || id;
        };

        allMethodIdsSet.forEach((pmId) => {
          const exp = pmExpected[pmId] || 0;
          const cnt = parsedCountedCents[pmId] ?? 0;
          const diff = cnt - exp;
          totalCounted += cnt;

          expectedByPaymentMethod[pmId] = exp;
          countedByPaymentMethod[pmId] = cnt;
          differenceByPaymentMethod[pmId] = diff;

          paymentSummary.push({
            paymentMethodId: pmId,
            paymentMethodName: getMethodLabel(pmId),
            expectedAmount: exp,
            countedAmount: cnt,
            differenceAmount: diff
          });
        });

        const totalDifference = totalCounted - expectedTotal;
        const now = new Date().toISOString();
        const userName = req.user.nome || req.user.name || req.user.email || 'Operador';

        let finalObs = caixaData.observation || '';
        if (typeof observation === 'string' && observation.trim()) {
          finalObs = finalObs
            ? `${finalObs}\n---\nFechamento: ${observation.trim()}`
            : `Fechamento: ${observation.trim()}`;
        }

        const updatePayload = {
          status: 'CLOSED',
          closedAt: now,
          closedBy: userName,
          closedById: req.user.uid,
          closingBalance: totalCounted,
          expectedTotal,
          countedTotal: totalCounted,
          totalDifference,
          totalEntries,
          totalExits,
          totalSupplies,
          totalWithdrawals,
          expectedByPaymentMethod,
          countedByPaymentMethod,
          differenceByPaymentMethod,
          paymentSummary,
          observation: finalObs,
          updatedAt: now
        };

        transaction.update(caixaRef, updatePayload);
        transaction.set(activeCaixaRef, {
          status: 'CLOSED',
          cashRegisterId: caixaId,
          closedAt: now,
          closedBy: userName,
          updatedAt: now
        });

        return {
          ...caixaData,
          ...updatePayload,
          id: caixaId
        };
      });

      return res.json({ success: true, caixa: result });
    } catch (error: any) {
      if (error.code) {
        return res.status(400).json({ code: error.code, error: error.message });
      }
      logger.error('Error closing caixa', { error });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao fechar caixa.' });
    }
  });

  // 3. MOVIMENTAÇÃO MANUAL DE CAIXA
  router.post('/movement', verifyRestaurant, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em POST /movement', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }

    try {
      // 1. Autenticar
      if (!req.user || !req.user.uid) {
        logger.warn('Autenticação falhou: req.user ausente');
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado ou sessão expirada.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 2. Validar restaurantId
      const tokenRestaurantId = req.user.restaurantId;
      if (!tokenRestaurantId) {
        logger.warn('Sem restaurantId no token');
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_NO_RESTAURANT',
          message: 'Acesso negado: restaurante não identificado no token de acesso.',
          data: null,
          metadata: null,
          requestId
        });
      }

      const bodyRestaurantId = req.body?.restaurantId;
      if (bodyRestaurantId && bodyRestaurantId !== tokenRestaurantId) {
        logger.warn('Tentativa de acesso a outro restaurante', { tokenRestaurantId, bodyRestaurantId });
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_RESTAURANT_MISMATCH',
          message: 'Você não tem permissão para realizar operações em outro restaurante.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 3. Validar operador
      const userDocRef = db.collection('users').doc(req.user.uid);
      const userDocSnap = await userDocRef.get();
      if (!userDocSnap.exists) {
        logger.warn('Operador não existe');
        return res.status(403).json({
          success: false,
          code: 'OPERATOR_NOT_FOUND',
          message: 'Operador não encontrado no sistema.',
          data: null,
          metadata: null,
          requestId
        });
      }

      const userData = userDocSnap.data()!;
      if (userData.status === 'INACTIVE' || userData.active === false) {
        logger.warn('Operador inativo');
        return res.status(403).json({
          success: false,
          code: 'OPERATOR_INACTIVE',
          message: 'Sua conta de operador está desativada.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 4. Validar permissão do caixa (operador autorizado)
      const allowedRoles = [
        'OWNER',
        'RESTAURANT',
        'RESTAURANTE',
        'RESTAURANT_ADMIN',
        'ADMIN',
        'MANAGER',
        'GERENTE',
        'CASHIER',
        'CAIXA'
      ];
      const roleUpper = (userData.role || userData.tipo_usuario || '').toUpperCase();
      if (!allowedRoles.includes(roleUpper)) {
        logger.warn('Cargo não permitido para caixa', { roleUpper });
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_ROLE',
          message: 'Seu cargo não possui permissão para realizar movimentações de caixa.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 5. Validar caixa informado / existente / pertencente ao restaurante / aberto
      const bodyCashRegisterId = req.body?.cashRegisterId || req.body?.caixaId || req.body?.caixa;
      let cashRegisterId = bodyCashRegisterId;
      let matchedCaixaDoc: any = null;

      if (cashRegisterId && typeof cashRegisterId === 'string' && cashRegisterId.trim()) {
        const idToSearch = cashRegisterId.trim();
        const caixasGroupSnap = await db.collectionGroup('caixas').where('id', '==', idToSearch).get();
        if (caixasGroupSnap.empty) {
          logger.warn('Caixa não encontrado', { idToSearch });
          return res.status(404).json({
            success: false,
            code: 'CASH_REGISTER_NOT_FOUND',
            message: 'O caixa informado não existe.',
            data: null,
            metadata: null,
            requestId
          });
        }

        // Check if any of the matched docs belong to this restaurant
        for (const doc of caixasGroupSnap.docs) {
          const pathSegments = doc.ref.path.split('/');
          const rIdFromPath = pathSegments[1];
          if (rIdFromPath === tokenRestaurantId) {
            matchedCaixaDoc = doc;
            break;
          }
        }

        if (!matchedCaixaDoc) {
          logger.warn('Caixa pertence a outro restaurante', { idToSearch });
          return res.status(403).json({
            success: false,
            code: 'FORBIDDEN_OTHER_RESTAURANT_CAIXA',
            message: 'Este caixa pertence a outro restaurante.',
            data: null,
            metadata: null,
            requestId
          });
        }
      } else {
        // Look for currently open caixa for this restaurant using canonical resolution
        const activeCaixa = await resolveActiveCashRegister(db, tokenRestaurantId);
        if (!activeCaixa) {
          logger.warn('Nenhum caixa aberto encontrado');
          return res.status(404).json({
            success: false,
            code: 'CASH_REGISTER_NOT_FOUND',
            message: 'Não há nenhum caixa aberto para este restaurante.',
            data: null,
            metadata: null,
            requestId
          });
        }
        cashRegisterId = activeCaixa.id;
        matchedCaixaDoc = await db.collection('restaurants').doc(tokenRestaurantId).collection('caixas').doc(cashRegisterId).get();
      }

      const caixaData = matchedCaixaDoc.data();
      if (caixaData.status !== 'OPEN') {
        logger.warn('Caixa está fechado', { cashRegisterId });
        return res.status(409).json({
          success: false,
          code: 'CASH_REGISTER_CLOSED',
          message: 'Este caixa está fechado.',
          data: null,
          metadata: null,
          requestId
        });
      }

      // 6. Validar payload
      const { type, amount, amountCents, category, description, paymentMethodId, observation } = req.body || {};

      let normalizedType = (type || '').toString().toUpperCase().trim();
      if (normalizedType === 'SUPRIMENTO') {
        normalizedType = 'SUPPLY';
      } else if (normalizedType === 'SANGRIA') {
        normalizedType = 'WITHDRAWAL';
      }

      const validTypes = ['INCOME', 'EXPENSE', 'SUPPLY', 'WITHDRAWAL'];
      if (!type || !validTypes.includes(normalizedType)) {
        logger.warn('Tipo de movimentação inválido', { type });
        return res.status(400).json({
          success: false,
          code: 'INVALID_CASH_MOVEMENT_TYPE',
          message: 'Tipo de movimentação inválido ou ausente. Valores permitidos: SUPPLY, SUPRIMENTO, WITHDRAWAL, SANGRIA.',
          data: null,
          metadata: null,
          requestId
        });
      }

      let cents = 0;
      if (typeof amountCents === 'number') {
        cents = Math.round(amountCents);
      } else if (typeof amount === 'number') {
        cents = Math.round(amount * 100);
      } else if (typeof amount === 'string') {
        const clean = amount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        logger.warn('Valor inválido', { cents });
        return res.status(400).json({
          success: false,
          code: 'INVALID_AMOUNT',
          message: 'O valor da movimentação deve ser maior que zero.',
          data: null,
          metadata: null,
          requestId
        });
      }

      const cleanCategory = typeof category === 'string' ? category.trim() : '';
      if (!cleanCategory) {
        logger.warn('Categoria vazia');
        return res.status(400).json({
          success: false,
          code: 'INVALID_CATEGORY',
          message: 'A categoria da movimentação é obrigatória.',
          data: null,
          metadata: null,
          requestId
        });
      }

      const cleanDescription = typeof description === 'string' ? description.trim() : '';
      if (!cleanDescription) {
        logger.warn('Descrição vazia');
        return res.status(400).json({
          success: false,
          code: 'INVALID_DESCRIPTION',
          message: 'A descrição da movimentação é obrigatória.',
          data: null,
          metadata: null,
          requestId
        });
      }

      const cleanPaymentMethodId = typeof paymentMethodId === 'string' ? paymentMethodId.trim() : '';
      if (!cleanPaymentMethodId) {
        logger.warn('Forma de pagamento vazia');
        return res.status(400).json({
          success: false,
          code: 'INVALID_PAYMENT_METHOD',
          message: 'A forma de pagamento é obrigatória.',
          data: null,
          metadata: null,
          requestId
        });
      }

      const restDoc = await db.collection('restaurants').doc(tokenRestaurantId).get();
      const rawFormasPagamento = restDoc.data()?.formas_pagamento || restDoc.data()?.payment_methods || [];
      const formasPagamento: any[] = Array.isArray(rawFormasPagamento)
        ? rawFormasPagamento
        : rawFormasPagamento && typeof rawFormasPagamento === 'object'
          ? Object.entries(rawFormasPagamento).map(([key, val]: [string, any]) => ({ id: key, ...(typeof val === 'object' ? val : { active: Boolean(val) }) }))
          : [];
      const validMethods = new Set(['dinheiro', 'pix', 'credito', 'debito']);
      formasPagamento.forEach((p: any) => { if (p.id) validMethods.add(p.id); });

      if (!validMethods.has(cleanPaymentMethodId)) {
        logger.warn('Forma de pagamento não configurada', { cleanPaymentMethodId });
        return res.status(400).json({
          success: false,
          code: 'INVALID_PAYMENT_METHOD',
          message: `A forma de pagamento "${cleanPaymentMethodId}" não está configurada para este restaurante.`,
          data: null,
          metadata: null,
          requestId
        });
      }

      // 7. Executar movimentação
      const caixasRef = db.collection('restaurants').doc(tokenRestaurantId).collection('caixas');
      const movementRef = caixasRef.doc(cashRegisterId).collection('movimentacoes').doc();
      const now = new Date().toISOString();
      const userName = userData.nome || userData.name || userData.email || 'Operador';

      const movementDoc = {
        id: movementRef.id,
        restaurantId: tokenRestaurantId,
        cashRegisterId,
        type: normalizedType,
        category: cleanCategory,
        description: cleanDescription,
        amount: cents,
        paymentMethodId: cleanPaymentMethodId,
        createdAt: now,
        createdBy: userName,
        createdById: req.user.uid,
        createdByName: userName,
        observation: typeof observation === 'string' && observation.trim() ? observation.trim() : null,
        automatic: false,
        origin: 'MANUAL'
      };

      const sanitizedMovementDoc = removeUndefinedRecursively(movementDoc);
      await movementRef.set(sanitizedMovementDoc);

      logger.info('Movimentação realizada com sucesso', { cashRegisterId, type: normalizedType, cents });

      return res.status(201).json({
        success: true,
        code: 'SUCCESS',
        message: 'Movimentação realizada com sucesso.',
        data: {
          movement: sanitizedMovementDoc
        },
        metadata: null,
        requestId
      });

    } catch (error: any) {
      logger.error('Error creating cash movement', { error });
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Erro interno inesperado ao processar a movimentação de caixa.',
        data: null,
        metadata: null,
        requestId
      });
    }
  });

  return router;
}
