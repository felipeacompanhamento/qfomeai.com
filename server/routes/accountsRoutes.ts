import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';
import { extractConfiguredPaymentMethods } from '../constants/payment';
import { requireOpenCashRegister as requireOpenCashRegisterUtil } from '../utils/cashRegister';
import { logger } from '../utils/logger';

export function createAccountsRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  const requireOpenCashRegister = (restaurantId: string, transaction?: any) =>
    requireOpenCashRegisterUtil(db, restaurantId, transaction);

  // ==========================================
  // CONTAS A RECEBER ENDPOINTS
  // ==========================================

  // 1. Criar Conta a Receber
  router.post('/contas-receber', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { customerName, customerId, description, totalAmount, totalAmountCents, dueDate } = req.body || {};

      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ code: 'INVALID_DESCRIPTION', error: 'A descrição é obrigatória.' });
      }

      let cents = 0;
      if (typeof totalAmountCents === 'number') {
        cents = Math.round(totalAmountCents);
      } else if (typeof totalAmount === 'number') {
        cents = Number.isInteger(totalAmount) && totalAmount >= 100 ? totalAmount : Math.round(totalAmount * 100);
      } else if (typeof totalAmount === 'string') {
        const clean = totalAmount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor da conta deve ser um número inteiro positivo em centavos.'
        });
      }

      if (!dueDate || typeof dueDate !== 'string' || isNaN(Date.parse(dueDate))) {
        return res.status(400).json({ code: 'INVALID_DUE_DATE', error: 'Data de vencimento inválida.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasReceber').doc();
      const now = new Date().toISOString();

      const newContaData = {
        id: contaRef.id,
        restaurantId,
        customerId: typeof customerId === 'string' && customerId.trim() ? customerId.trim() : null,
        customerName: typeof customerName === 'string' && customerName.trim() ? customerName.trim() : 'Cliente',
        description: description.trim(),
        totalAmount: cents,
        paidAmount: 0,
        remainingAmount: cents,
        dueDate: dueDate.trim(),
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.uid
      };

      await contaRef.set(newContaData);

      return res.status(201).json({ success: true, conta: newContaData });
    } catch (error: any) {
      logger.error('Error creating conta a receber:', { error: error.message });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao criar conta a receber.' });
    }
  });

  // 2. Registrar Recebimento
  router.post('/contas-receber/:id/receber', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const accountId = req.params.id;
      const { amount, amountCents, paymentMethodId, observation, idempotencyKey } = req.body || {};

      let cents = 0;
      if (typeof amountCents === 'number') {
        cents = Math.round(amountCents);
      } else if (typeof amount === 'number') {
        cents = Number.isInteger(amount) && amount >= 100 ? amount : Math.round(amount * 100);
      } else if (typeof amount === 'string') {
        const clean = amount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor do recebimento deve ser um número inteiro maior que zero em centavos.'
        });
      }

      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        return res.status(400).json({ code: 'INVALID_PAYMENT_METHOD', error: 'A forma de pagamento é obrigatória.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasReceber').doc(accountId);
      const restRef = db.collection('restaurants').doc(restaurantId);
      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

      const result = await db.runTransaction(async (transaction) => {
        const contaSnap = await transaction.get(contaRef);
        if (!contaSnap.exists) {
          const err: any = new Error('Conta a receber não encontrada.');
          err.code = 'ACCOUNT_NOT_FOUND';
          throw err;
        }
        const conta = contaSnap.data()!;
        if (conta.restaurantId !== restaurantId) {
          const err: any = new Error('Conta não pertence ao restaurante autenticado.');
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }
        if (conta.status !== 'OPEN' && conta.status !== 'PARTIALLY_PAID') {
          const err: any = new Error('Esta conta já se encontra quitada ou indisponível para recebimento.');
          err.code = 'ACCOUNT_ALREADY_PAID';
          throw err;
        }

        if (cents > conta.remainingAmount) {
          const err: any = new Error('O valor informado excede o saldo restante da conta.');
          err.code = 'PAYMENT_EXCEEDS_REMAINING';
          throw err;
        }

        const restSnap = await transaction.get(restRef);
        const validMethods = extractConfiguredPaymentMethods(restSnap.data());
        if (!validMethods.has(paymentMethodId)) {
          const err: any = new Error(`A forma de pagamento "${paymentMethodId}" não está configurada para este restaurante.`);
          err.code = 'INVALID_PAYMENT_METHOD';
          throw err;
        }

        const openCaixa = await requireOpenCashRegister(restaurantId, transaction);
        const caixaId = openCaixa.id;

        const recRef = contaRef.collection('recebimentos').doc();
        const stableKey = idempotencyKey || `ACCOUNT_RECEIVABLE:${accountId}:${recRef.id}`;

        let movementRef: any = null;
        if (caixaId) {
          movementRef = caixasRef.doc(caixaId).collection('movimentacoes').doc(stableKey);
          const movSnap: any = await transaction.get(movementRef);
          if (movSnap.exists) {
            const err: any = new Error('Esta operação financeira já foi processada.');
            err.code = 'DUPLICATE_FINANCIAL_OPERATION';
            throw err;
          }
        }

        const newPaidAmount = (conta.paidAmount || 0) + cents;
        const newRemainingAmount = (conta.remainingAmount || 0) - cents;
        const newStatus = newRemainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        const now = new Date().toISOString();

        const receiptDoc = {
          id: recRef.id,
          accountId,
          amount: cents,
          paymentMethodId,
          observation: typeof observation === 'string' && observation.trim() ? observation.trim() : null,
          createdAt: now,
          createdBy: req.user.uid,
          cashMovementStatus: caixaId ? 'REGISTERED' : 'NO_OPEN_CAIXA'
        };

        transaction.set(recRef, receiptDoc);
        transaction.update(contaRef, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: now
        });

        if (caixaId && movementRef) {
          transaction.set(movementRef, {
            id: stableKey,
            restaurantId,
            cashRegisterId: caixaId,
            accountId,
            receiptId: recRef.id,
            type: 'INCOME',
            category: 'ACCOUNT_RECEIVABLE',
            origin: 'ACCOUNT_RECEIVABLE',
            automatic: true,
            amount: cents,
            paymentMethodId,
            description: `Recebimento de conta (${conta.description || 'Conta a Receber'})`,
            createdAt: now,
            createdBy: req.user.uid,
            idempotencyKey: stableKey
          });
        }

        return {
          receipt: receiptDoc,
          conta: {
            ...conta,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: newStatus,
            updatedAt: now
          }
        };
      });

      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (error.code) {
        const statusMap: Record<string, number> = {
          UNAUTHORIZED: 401,
          RESTAURANT_MISMATCH: 403,
          ACCOUNT_NOT_FOUND: 404,
          ACCOUNT_ALREADY_PAID: 400,
          INVALID_AMOUNT: 400,
          INVALID_PAYMENT_METHOD: 400,
          PAYMENT_EXCEEDS_REMAINING: 400,
          DUPLICATE_FINANCIAL_OPERATION: 409,
          FINANCIAL_RECORD_IMMUTABLE: 400,
          CASH_REGISTER_CLOSED: 409,
          CASH_REGISTER_NOT_OPEN: 409
        };
        return res.status(statusMap[error.code] || 400).json({ code: error.code, message: error.message, error: error.message });
      }
      logger.error('Error processing recebimento:', { error: error.message });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao registrar recebimento.' });
    }
  });

  // ==========================================
  // CONTAS A PAGAR ENDPOINTS
  // ==========================================

  // 1. Criar Conta a Pagar
  router.post('/contas-pagar', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { supplierName, supplierId, description, category, totalAmount, totalAmountCents, dueDate } = req.body || {};

      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ code: 'INVALID_DESCRIPTION', error: 'A descrição é obrigatória.' });
      }

      if (!category || typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({ code: 'INVALID_CATEGORY', error: 'A categoria é obrigatória.' });
      }

      let cents = 0;
      if (typeof totalAmountCents === 'number') {
        cents = Math.round(totalAmountCents);
      } else if (typeof totalAmount === 'number') {
        cents = Number.isInteger(totalAmount) && totalAmount >= 100 ? totalAmount : Math.round(totalAmount * 100);
      } else if (typeof totalAmount === 'string') {
        const clean = totalAmount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor da conta deve ser um número inteiro positivo em centavos.'
        });
      }

      if (!dueDate || typeof dueDate !== 'string' || isNaN(Date.parse(dueDate))) {
        return res.status(400).json({ code: 'INVALID_DUE_DATE', error: 'Data de vencimento inválida.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasPagar').doc();
      const now = new Date().toISOString();

      const newContaData = {
        id: contaRef.id,
        restaurantId,
        supplierId: typeof supplierId === 'string' && supplierId.trim() ? supplierId.trim() : null,
        supplierName: typeof supplierName === 'string' && supplierName.trim() ? supplierName.trim() : 'Fornecedor',
        description: description.trim(),
        category: category.trim(),
        totalAmount: cents,
        paidAmount: 0,
        remainingAmount: cents,
        dueDate: dueDate.trim(),
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.uid
      };

      await contaRef.set(newContaData);

      return res.status(201).json({ success: true, conta: newContaData });
    } catch (error: any) {
      logger.error('Error creating conta a pagar:', { error: error.message });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao criar conta a pagar.' });
    }
  });

  // 2. Registrar Pagamento
  router.post('/contas-pagar/:id/pagar', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const accountId = req.params.id;
      const { amount, amountCents, paymentMethodId, observation, idempotencyKey } = req.body || {};

      let cents = 0;
      if (typeof amountCents === 'number') {
        cents = Math.round(amountCents);
      } else if (typeof amount === 'number') {
        cents = Number.isInteger(amount) && amount >= 100 ? amount : Math.round(amount * 100);
      } else if (typeof amount === 'string') {
        const clean = amount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor do pagamento deve ser um número inteiro maior que zero em centavos.'
        });
      }

      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        return res.status(400).json({ code: 'INVALID_PAYMENT_METHOD', error: 'A forma de pagamento é obrigatória.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasPagar').doc(accountId);
      const restRef = db.collection('restaurants').doc(restaurantId);
      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

      const result = await db.runTransaction(async (transaction) => {
        const contaSnap = await transaction.get(contaRef);
        if (!contaSnap.exists) {
          const err: any = new Error('Conta a pagar não encontrada.');
          err.code = 'ACCOUNT_NOT_FOUND';
          throw err;
        }
        const conta = contaSnap.data()!;
        if (conta.restaurantId !== restaurantId) {
          const err: any = new Error('Conta não pertence ao restaurante autenticado.');
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }
        if (conta.status !== 'OPEN' && conta.status !== 'PARTIALLY_PAID') {
          const err: any = new Error('Esta conta já se encontra quitada ou indisponível para pagamento.');
          err.code = 'ACCOUNT_ALREADY_PAID';
          throw err;
        }

        if (cents > conta.remainingAmount) {
          const err: any = new Error('O valor informado excede o saldo restante da conta.');
          err.code = 'PAYMENT_EXCEEDS_REMAINING';
          throw err;
        }

        const restSnap = await transaction.get(restRef);
        const validMethods = extractConfiguredPaymentMethods(restSnap.data());
        if (!validMethods.has(paymentMethodId)) {
          const err: any = new Error(`A forma de pagamento "${paymentMethodId}" não está configurada para este restaurante.`);
          err.code = 'INVALID_PAYMENT_METHOD';
          throw err;
        }

        const openCaixa = await requireOpenCashRegister(restaurantId, transaction);
        const caixaId = openCaixa.id;

        const pagRef = contaRef.collection('pagamentos').doc();
        const stableKey = idempotencyKey || `ACCOUNT_PAYABLE:${accountId}:${pagRef.id}`;

        let movementRef: any = null;
        if (caixaId) {
          movementRef = caixasRef.doc(caixaId).collection('movimentacoes').doc(stableKey);
          const movSnap: any = await transaction.get(movementRef);
          if (movSnap.exists) {
            const err: any = new Error('Esta operação financeira já foi processada.');
            err.code = 'DUPLICATE_FINANCIAL_OPERATION';
            throw err;
          }
        }

        const newPaidAmount = (conta.paidAmount || 0) + cents;
        const newRemainingAmount = (conta.remainingAmount || 0) - cents;
        const newStatus = newRemainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        const now = new Date().toISOString();

        const paymentDoc = {
          id: pagRef.id,
          accountId,
          amount: cents,
          paymentMethodId,
          observation: typeof observation === 'string' && observation.trim() ? observation.trim() : null,
          createdAt: now,
          createdBy: req.user.uid,
          cashMovementStatus: caixaId ? 'REGISTERED' : 'NO_OPEN_CAIXA'
        };

        transaction.set(pagRef, paymentDoc);
        transaction.update(contaRef, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: now
        });

        if (caixaId && movementRef) {
          transaction.set(movementRef, {
            id: stableKey,
            restaurantId,
            cashRegisterId: caixaId,
            accountId,
            paymentId: pagRef.id,
            type: 'EXPENSE',
            category: 'ACCOUNT_PAYABLE',
            origin: 'ACCOUNT_PAYABLE',
            automatic: true,
            amount: cents,
            paymentMethodId,
            description: `Pagamento de conta (${conta.description || 'Conta a Pagar'})`,
            createdAt: now,
            createdBy: req.user.uid,
            idempotencyKey: stableKey
          });
        }

        return {
          payment: paymentDoc,
          conta: {
            ...conta,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: newStatus,
            updatedAt: now
          }
        };
      });

      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (error.code) {
        const statusMap: Record<string, number> = {
          UNAUTHORIZED: 401,
          RESTAURANT_MISMATCH: 403,
          ACCOUNT_NOT_FOUND: 404,
          ACCOUNT_ALREADY_PAID: 400,
          INVALID_AMOUNT: 400,
          INVALID_PAYMENT_METHOD: 400,
          PAYMENT_EXCEEDS_REMAINING: 400,
          DUPLICATE_FINANCIAL_OPERATION: 409,
          FINANCIAL_RECORD_IMMUTABLE: 400,
          CASH_REGISTER_CLOSED: 409,
          CASH_REGISTER_NOT_OPEN: 409
        };
        return res.status(statusMap[error.code] || 400).json({ code: error.code, message: error.message, error: error.message });
      }
      logger.error('Error processing pagamento:', { error: error.message });
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao registrar pagamento.' });
    }
  });

  return router;
}
