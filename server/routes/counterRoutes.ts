import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { createVerifyRestaurant } from '../middleware/auth';
import { isProductAvailableForChannelData, resolveCounterUnitPriceCents } from '../../src/shared/productChannels';
import { normalizePaymentMethodId } from '../constants/payment';
import {
  registerServerOrderPaymentMovement as registerServerOrderPaymentMovementUtil,
  loadRestaurantCounterPaymentMethods as loadRestaurantCounterPaymentMethodsUtil,
  requireOpenCashRegister as requireOpenCashRegisterUtil
} from '../utils/cashRegister';

export function createCounterRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  const registerServerOrderPaymentMovement = (restaurantId: string, orderId: string, orderData: any, createdBy: string) =>
    registerServerOrderPaymentMovementUtil(db, restaurantId, orderId, orderData, createdBy);

  const loadRestaurantCounterPaymentMethods = (restaurantId: string, serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN') =>
    loadRestaurantCounterPaymentMethodsUtil(db, restaurantId, serviceMode);

  const requireOpenCashRegister = (restaurantId: string, transaction?: any) =>
    requireOpenCashRegisterUtil(db, restaurantId, transaction);

  // --- COUNTER ORDER ENDPOINT (POST /api/restaurant/counter/orders) ---
  router.post('/counter/orders', verifyRestaurant, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const operatorId = req.user.uid;
    const operatorName = req.user.nome || req.user.name || req.user.displayName || 'Operador Balcão';

    const {
      clientActionId,
      serviceMode = 'COUNTER',
      clientName = '',
      clientPhone = '',
      tableNumber = '',
      tableId = '',
      tableName = '',
      tabId = '',
      comandaId = '',
      deliveryAddress = null,
      tipoAtendimento = '',
      items = [],
      paymentMethod: rawPaymentMethod,
      forma_pagamento,
      pago = false,
      amountReceived = 0
    } = req.body;

    const paymentMethod = rawPaymentMethod || forma_pagamento || 'dinheiro';

    const normalizeText = (value: any, maxLength: number): string => {
      if (typeof value !== 'string') return '';
      const clean = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      return clean.trim().substring(0, maxLength);
    };

    if (typeof clientActionId !== 'string') {
      return res.status(400).json({ success: false, error: 'INVALID_CLIENT_ACTION_ID', message: 'clientActionId deve ser uma string.' });
    }
    const normalizedActionId = clientActionId.trim();
    const actionIdRegex = /^[A-Za-z0-9_-]{10,120}$/;
    if (!actionIdRegex.test(normalizedActionId)) {
      return res.status(400).json({ success: false, error: 'INVALID_CLIENT_ACTION_ID', message: 'clientActionId inválido. Deve conter de 10 a 120 caracteres alfanuméricos, hífen ou sublinhado.' });
    }

    if (!['COUNTER', 'PICKUP', 'DINE_IN'].includes(serviceMode)) {
      return res.status(400).json({ success: false, error: 'INVALID_SERVICE_MODE', message: 'Modo de atendimento (serviceMode) inválido. Use COUNTER, PICKUP ou DINE_IN.' });
    }

    const normalizedClientName = normalizeText(clientName, 100);
    if (serviceMode === 'PICKUP' && !normalizedClientName) {
      return res.status(400).json({ success: false, error: 'CLIENT_NAME_REQUIRED', message: 'O nome do cliente é obrigatório para pedidos de retirada.' });
    }
    const finalClientName = normalizedClientName || 'Cliente Balcão';

    if (tipoAtendimento === 'ENTREGA') {
      if (!normalizedClientName) {
        return res.status(400).json({ success: false, error: 'CLIENT_NAME_REQUIRED', message: 'O nome do cliente é obrigatório para pedidos de entrega.' });
      }
      const rawPhone = typeof clientPhone === 'string' ? clientPhone.trim() : '';
      if (!rawPhone) {
        return res.status(400).json({ success: false, error: 'CLIENT_PHONE_REQUIRED', message: 'O telefone / WhatsApp é obrigatório para pedidos de entrega.' });
      }
      const street = deliveryAddress?.street || deliveryAddress?.rua || deliveryAddress?.endereco;
      const num = deliveryAddress?.number || deliveryAddress?.numero;
      const neighborhood = deliveryAddress?.neighborhood || deliveryAddress?.bairro;
      if (!street || !String(street).trim()) {
        return res.status(400).json({ success: false, error: 'DELIVERY_STREET_REQUIRED', message: 'O endereço (rua/logradouro) é obrigatório para pedidos de entrega.' });
      }
      if (!num || !String(num).trim()) {
        return res.status(400).json({ success: false, error: 'DELIVERY_NUMBER_REQUIRED', message: 'O número do endereço é obrigatório para pedidos de entrega.' });
      }
      if (!neighborhood || !String(neighborhood).trim()) {
        return res.status(400).json({ success: false, error: 'DELIVERY_NEIGHBORHOOD_REQUIRED', message: 'O bairro é obrigatório para pedidos de entrega.' });
      }
    }

    if (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') {
      const hasTable = (typeof tableId === 'string' && tableId.trim()) || (typeof tableNumber === 'string' && tableNumber.trim()) || typeof tableNumber === 'number';
      const hasTab = (typeof tabId === 'string' && tabId.trim()) || (typeof comandaId === 'string' && comandaId.trim());
      if (!hasTable && !hasTab) {
        return res.status(400).json({
          success: false,
          error: 'TABLE_OR_TAB_REQUIRED',
          message: 'Para atendimento em mesa, é necessário selecionar uma mesa livre ou comanda ativa existente.'
        });
      }
    }

    if (typeof pago !== 'boolean') {
      return res.status(400).json({ success: false, error: 'INVALID_PAGO', message: 'O campo "pago" deve ser um booleano.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'EMPTY_CART', message: 'O carrinho não pode estar vazio.' });
    }

    const isValidOrderResponse = (orderId: any, order: any) => {
      if (!orderId || typeof orderId !== 'string' || !orderId.trim()) return false;
      if (!order || typeof order !== 'object') return false;
      if (order.source !== 'COUNTER') return false;
      if (order.orderStatus !== 'PREPARING') return false;
      if (order.status !== 'cozinha') return false;
      if (!Array.isArray(order.items)) return false;
      if (typeof order.valor_total !== 'number' || !Number.isFinite(order.valor_total) || order.valor_total < 0) return false;
      if (!['dinheiro', 'pix', 'credito', 'debito', 'comanda'].includes(order.forma_pagamento)) return false;
      return true;
    };

    try {
      await requireOpenCashRegister(restaurantId);

      const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists || restaurantDoc.data()?.features?.counterEnabled !== true) {
        return res.status(403).json({ success: false, error: 'COUNTER_DISABLED', message: 'A funcionalidade de Balcão não está ativada neste restaurante.' });
      }

      let paymentCheck: any = { hasExplicitConfiguration: false, methods: [] };
      if (tipoAtendimento !== 'MESA' && serviceMode !== 'DINE_IN') {
        paymentCheck = await loadRestaurantCounterPaymentMethods(restaurantId, serviceMode);
        if (paymentCheck.hasExplicitConfiguration) {
          const anyEnabledForChannel = paymentCheck.methods.some((m: any) => m.enabledForCurrentServiceMode);
          if (!anyEnabledForChannel) {
            return res.status(400).json({
              success: false,
              error: 'NO_PAYMENT_METHOD_AVAILABLE',
              message: 'Nenhuma forma de pagamento está habilitada para este tipo de atendimento.'
            });
          }
        }
      }

      let reqPayments = Array.isArray(req.body.payments) ? req.body.payments : [];
      let normalizedPayments: any[] = [];
      let cashPaymentCents = 0;
      let totalPaymentsCents = 0;

      const formatPtBrCurrency = (cents: number) => {
        return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      if (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') {
        normalizedPayments = [];
        cashPaymentCents = 0;
        totalPaymentsCents = 0;
      } else if (reqPayments.length > 0) {
        for (const p of reqPayments) {
          const pMethodId = normalizePaymentMethodId(p.paymentMethodId || p.forma_pagamento || p.method);
          if (!pMethodId) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_PAYMENT_METHOD',
              message: 'Uma das formas de pagamento fornecidas é inválida.'
            });
          }

          if (paymentCheck.hasExplicitConfiguration) {
            const methodObj = paymentCheck.methods.find((m: any) => m.id === pMethodId);
            if (!methodObj || !methodObj.enabledForCurrentServiceMode) {
              return res.status(400).json({
                success: false,
                error: 'PAYMENT_METHOD_NOT_AVAILABLE',
                message: `A forma de pagamento (${pMethodId}) não está disponível para este atendimento.`
              });
            }
          } else {
            if (!['dinheiro', 'pix', 'credito', 'debito'].includes(pMethodId)) {
              return res.status(400).json({
                success: false,
                error: 'PAYMENT_METHOD_NOT_AVAILABLE',
                message: 'A forma de pagamento selecionada não está disponível.'
              });
            }
          }

          const pAmountCents = typeof p.amount === 'number' ? Math.round(p.amount) : (typeof p.value === 'number' ? Math.round(p.value * 100) : 0);
          if (pAmountCents <= 0) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_PAYMENT_AMOUNT',
              message: 'O valor de cada parcela de pagamento deve ser maior que zero.'
            });
          }

          totalPaymentsCents += pAmountCents;
          if (pMethodId === 'dinheiro') {
            cashPaymentCents += pAmountCents;
          }

          normalizedPayments.push({
            id: p.id || `pm_${normalizedPayments.length + 1}`,
            paymentMethodId: pMethodId,
            paymentMethodName: p.paymentMethodName || (pMethodId === 'dinheiro' ? 'Dinheiro' : pMethodId === 'pix' ? 'Pix' : pMethodId === 'credito' ? 'Crédito' : 'Débito'),
            amount: pAmountCents,
            status: pago ? 'PAID' : 'PENDING'
          });
        }
      } else {
        const normalizedMethod = normalizePaymentMethodId(paymentMethod);
        if (!normalizedMethod) {
          return res.status(400).json({
            success: false,
            error: 'PAYMENT_METHOD_NOT_AVAILABLE',
            message: 'A forma de pagamento selecionada não está disponível para este atendimento.'
          });
        }

        if (paymentCheck.hasExplicitConfiguration) {
          const methodObj = paymentCheck.methods.find((m: any) => m.id === normalizedMethod);
          if (!methodObj || !methodObj.enabledForCurrentServiceMode) {
            return res.status(400).json({
              success: false,
              error: 'PAYMENT_METHOD_NOT_AVAILABLE',
              message: 'A forma de pagamento selecionada não está disponível para este atendimento.'
            });
          }
        } else {
          if (!['dinheiro', 'pix', 'credito', 'debito'].includes(normalizedMethod)) {
            return res.status(400).json({
              success: false,
              error: 'PAYMENT_METHOD_NOT_AVAILABLE',
              message: 'A forma de pagamento selecionada não está disponível.'
            });
          }
        }

        if (normalizedMethod === 'dinheiro') {
          cashPaymentCents = 0; // will set after totalCents calculation
        }

        normalizedPayments.push({
          id: 'legacy',
          paymentMethodId: normalizedMethod,
          paymentMethodName: normalizedMethod === 'dinheiro' ? 'Dinheiro' : normalizedMethod === 'pix' ? 'Pix' : normalizedMethod === 'credito' ? 'Crédito' : 'Débito',
          amount: 0, // will set after totalCents calculation
          status: pago ? 'PAID' : 'PENDING'
        });
      }

      const [optionItemsSnap, optionGroupsSnap] = await Promise.all([
        db.collection('restaurants').doc(restaurantId).collection('optionItems').get(),
        db.collection('restaurants').doc(restaurantId).collection('optionGroups').get()
      ]);

      const optionItemsMap = new Map<string, any>();
      optionItemsSnap.docs.forEach((doc: any) => {
        optionItemsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const optionGroupsMap = new Map<string, any>();
      optionGroupsSnap.docs.forEach((doc: any) => {
        optionGroupsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const toCents = (val: number) => Math.round(Number(val || 0) * 100);
      const fromCents = (cents: number) => cents / 100;

      let totalCents = 0;
      const formattedItems: any[] = [];

      for (const item of items) {
        const productId = item.productId;
        if (!productId || typeof productId !== 'string') {
          return res.status(400).json({ success: false, error: 'INVALID_PRODUCT_ID', message: 'productId é obrigatório para todos os itens e deve ser uma string.' });
        }

        const productSnap = await db.collection('restaurants').doc(restaurantId).collection('products').doc(productId).get();
        if (!productSnap.exists) {
          return res.status(400).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: `O produto com ID "${productId}" não foi encontrado no cardápio.` });
        }

        const pData = productSnap.data() || {};
        if (pData.status === 'inativo' || pData.ativo === false) {
          return res.status(400).json({ success: false, error: 'PRODUCT_INACTIVE', message: `O produto "${pData.nome || pData.name || 'item'}" está inativo e não pode ser vendido.` });
        }

        const counterAvailable = isProductAvailableForChannelData(pData, 'counter');
        if (!counterAvailable) {
          return res.status(400).json({ success: false, error: 'PRODUCT_NOT_AVAILABLE', message: `O produto "${pData.nome || pData.name}" não está disponível para vendas no Balcão.` });
        }

        if (
          typeof item.quantity !== 'number' ||
          !Number.isFinite(item.quantity) ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          item.quantity > 100
        ) {
          return res.status(400).json({ success: false, error: 'INVALID_QUANTITY', message: `Quantidade inválida (${item.quantity}) para o produto "${pData.nome || pData.name}".` });
        }
        const qty = item.quantity;

        // Consolidated Size Validation
        const rawSizes = Array.isArray(pData.sizes) ? pData.sizes : (Array.isArray(pData.tamanhos) ? pData.tamanhos : []);
        const pSizes = rawSizes.map((s: any, idx: number) => ({
          ...s,
          id: s.id || `size_${idx}`
        }));
        const hasSizes = pSizes.length > 0;
        let matchedSize: any = null;
        let sizeObj: any = null;

        const isSizeOptional = pData.optionalSize === true || pData.tamanhoOpcional === true || pData.requiresSize === false || pData.tamanhoObrigatorio === false;
        const requiresSize = hasSizes && !isSizeOptional;

        if (requiresSize && !item.selectedSizeId) {
          return res.status(400).json({ success: false, error: 'SIZE_REQUIRED', message: `Selecione um tamanho válido para o produto "${pData.nome || pData.name}".` });
        }

        if (item.selectedSizeId) {
          if (!hasSizes) {
            return res.status(400).json({ success: false, error: 'INVALID_SIZE', message: 'O tamanho selecionado não está disponível para este produto.' });
          }
          matchedSize = pSizes.find((s: any) => s.id === item.selectedSizeId);
          if (!matchedSize) {
            return res.status(400).json({ success: false, error: 'INVALID_SIZE', message: 'O tamanho selecionado não está disponível para este produto.' });
          }
          const sizeActive = matchedSize.active !== false && matchedSize.ativo !== false && matchedSize.status !== 'INACTIVE' && matchedSize.status !== 'inativo';
          if (!sizeActive) {
            return res.status(400).json({ success: false, error: 'SIZE_INACTIVE', message: 'O tamanho selecionado não está disponível para este produto.' });
          }
        }

        const canonicalBasePriceCents = resolveCounterUnitPriceCents(pData, matchedSize);
        if (typeof canonicalBasePriceCents !== 'number' || !Number.isFinite(canonicalBasePriceCents) || canonicalBasePriceCents < 0) {
          return res.status(400).json({ success: false, error: 'INVALID_PRODUCT_PRICE', message: 'O preço do produto não está configurado corretamente para o Balcão.' });
        }

        const baseUnitPrice = fromCents(canonicalBasePriceCents);
        if (matchedSize) {
          sizeObj = {
            id: matchedSize.id,
            nome: matchedSize.nome || matchedSize.name || 'Tamanho',
            preco: baseUnitPrice
          };
        }

        let additionalsCents = 0;
        const selectedAdditionalsInItem: any[] = [];
        const selectedAdditionalIds = Array.isArray(item.selectedAdditionalIds) ? item.selectedAdditionalIds : [];

        const seenIds = new Set<string>();
        for (const addId of selectedAdditionalIds) {
          if (typeof addId !== 'string') {
            return res.status(400).json({ success: false, error: 'INVALID_ADDITIONAL', message: 'Identificador de adicional inválido.' });
          }
          const cleanAddId = addId.trim();
          if (!cleanAddId || cleanAddId.length > 120) {
            return res.status(400).json({ success: false, error: 'INVALID_ADDITIONAL', message: 'Identificador de adicional inválido.' });
          }
          if (seenIds.has(cleanAddId)) {
            return res.status(400).json({ success: false, error: 'DUPLICATE_ADDITIONAL', message: 'Adicional duplicado no mesmo produto.' });
          }
          seenIds.add(cleanAddId);

          const opt = optionItemsMap.get(cleanAddId);
          if (!opt) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_NOT_FOUND', message: `O adicional com ID "${cleanAddId}" não foi encontrado.` });
          }

          const addActive = opt.active !== false && opt.ativo !== false && opt.status !== 'INACTIVE' && opt.status !== 'inativo';
          if (!addActive) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_INACTIVE', message: `O adicional "${opt.nome || 'adicional'}" está inativo.` });
          }

          if (typeof opt.restaurantId === 'string' && opt.restaurantId !== restaurantId) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_RESTRICTED', message: `O adicional "${opt.nome || 'adicional'}" não pertence a este restaurante.` });
          }

          const pOptionGroups = Array.isArray(pData.optionGroups) ? pData.optionGroups : [];
          const productGroupConfig = pOptionGroups.find((g: any) => (g.groupId === opt.grupoId || g.id === opt.grupoId));
          const realGroupDoc = optionGroupsMap.get(opt.grupoId);

          if (!productGroupConfig && !realGroupDoc) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_NOT_FOUND', message: `O adicional "${opt.nome || 'adicional'}" pertence a um grupo não associado a este produto.` });
          }

          if (realGroupDoc) {
            const groupActive = realGroupDoc.active !== false && realGroupDoc.ativo !== false && realGroupDoc.status !== 'INACTIVE' && realGroupDoc.status !== 'inativo';
            if (!groupActive) {
              return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_INACTIVE', message: 'O grupo de adicionais está inativo.' });
            }
          }

          const groupOptionIds = realGroupDoc?.optionIds || productGroupConfig?.optionIds;
          if (Array.isArray(groupOptionIds) && groupOptionIds.length > 0) {
            if (!groupOptionIds.includes(cleanAddId)) {
              return res.status(400).json({ success: false, error: 'ADDITIONAL_NOT_PERMITTED', message: `O adicional "${opt.nome || 'adicional'}" não é permitido neste grupo.` });
            }
          }

          let addPrice = opt.preco ?? opt.price ?? opt.valor;
          if (addPrice === undefined && opt.channelPricing?.counter !== undefined) {
            addPrice = opt.channelPricing.counter;
          }
          if (typeof addPrice !== 'number' || !Number.isFinite(addPrice) || addPrice < 0) {
            return res.status(400).json({ success: false, error: 'INVALID_ADDITIONAL_PRICE', message: 'O preço do adicional não está configurado corretamente.' });
          }

          const addPriceCents = toCents(addPrice);
          additionalsCents += addPriceCents;
          selectedAdditionalsInItem.push({
            id: opt.id || cleanAddId,
            nome: opt.nome || opt.name || 'Adicional',
            preco: addPrice,
            grupoId: opt.grupoId,
            grupoNome: realGroupDoc?.nome || productGroupConfig?.nome || 'Adicional'
          });
        }

        const effectiveGroupsMap = new Map<string, any>();
        if (Array.isArray(pData.optionGroups)) {
          pData.optionGroups.forEach((g: any) => {
            const gId = g.groupId || g.id;
            if (gId) effectiveGroupsMap.set(gId, { ...g, groupId: gId });
          });
        }
        optionGroupsMap.forEach((gDoc, gId) => {
          if (!effectiveGroupsMap.has(gId)) {
            effectiveGroupsMap.set(gId, { ...gDoc, groupId: gId });
          } else {
            const existing = effectiveGroupsMap.get(gId);
            effectiveGroupsMap.set(gId, { ...gDoc, ...existing });
          }
        });

        effectiveGroupsMap.forEach((group, gId) => {
          const selectionsInGroup = selectedAdditionalsInItem.filter(opt => opt.grupoId === gId);
          const count = selectionsInGroup.length;

          const isRequired = group.obrigatorio === true || group.required === true || group.isRequired === true;
          const min = Number(group.min ?? group.minimum ?? group.minSelections ?? group.minimo ?? 0);
          const max = Number(group.max ?? group.maximum ?? group.maxSelections ?? group.maximo ?? 0);
          const selectionType = group.selectionType || group.tipoSelecao;
          const isSingle = selectionType === 'single' || selectionType === 'unico' || max === 1;

          const effectiveMin = isRequired ? Math.max(1, min) : min;

          if (isRequired && count < effectiveMin) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_MIN', message: `O grupo "${group.nome || 'Adicional'}" é obrigatório e exige pelo menos ${effectiveMin} seleções.` });
          }
          if (!isRequired && min > 0 && count > 0 && count < min) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_MIN', message: `O grupo "${group.nome || 'Adicional'}" exige pelo menos ${min} seleções se for escolhido.` });
          }
          if (max > 0 && count > max) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_MAX', message: `O grupo "${group.nome || 'Adicional'}" permite no máximo ${max} seleções.` });
          }
          if (isSingle && count > 1) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_SINGLE', message: `O grupo "${group.nome || 'Adicional'}" permite apenas uma única seleção.` });
          }
        });

        const unitBasePriceCents = canonicalBasePriceCents;
        const unitPriceCents = unitBasePriceCents + additionalsCents;
        const itemTotalCents = unitPriceCents * qty;
        totalCents += itemTotalCents;

        formattedItems.push({
          id: productId,
          nome: pData.nome || pData.name || 'Produto',
          precoUnitario: fromCents(unitPriceCents),
          precoBase: fromCents(unitBasePriceCents),
          unitPriceCents: unitPriceCents,
          basePriceCents: unitBasePriceCents,
          pricingChannel: 'BALCAO',
          quantidade: qty,
          valorTotal: fromCents(itemTotalCents),
          observacao: normalizeText(item.observation, 500),
          tamanhoSelecionado: sizeObj,
          adicionaisSelecionados: selectedAdditionalsInItem
        });
      }

      if (tipoAtendimento !== 'MESA' && serviceMode !== 'DINE_IN') {
        if (reqPayments.length === 0) {
          normalizedPayments[0].amount = totalCents;
          if (normalizedPayments[0].paymentMethodId === 'dinheiro') {
            cashPaymentCents = totalCents;
          }
        }

        if (pago && reqPayments.length > 0 && totalPaymentsCents !== totalCents) {
          return res.status(400).json({
            success: false,
            error: 'PAYMENT_SUM_MISMATCH',
            message: `A soma das formas de pagamento (R$ ${formatPtBrCurrency(totalPaymentsCents)}) é diferente do total do pedido (R$ ${formatPtBrCurrency(totalCents)}).`
          });
        }
      }

      let finalPago = Boolean(pago);
      let finalAmountReceivedCents = 0;
      let finalChangeAmountCents = 0;
      let settlementStatus = 'PENDING_RESTAURANT_CONFIRMATION';

      if (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') {
        finalPago = false;
        finalAmountReceivedCents = 0;
        finalChangeAmountCents = 0;
        settlementStatus = 'NOT_REQUIRED';
      } else if (finalPago) {
        settlementStatus = 'SETTLED';
        if (cashPaymentCents > 0) {
          let inputReceivedCents = 0;
          if (typeof amountReceived === 'number' && Number.isFinite(amountReceived) && amountReceived >= 0) {
            inputReceivedCents = toCents(amountReceived);
          } else {
            inputReceivedCents = cashPaymentCents;
          }

          if (inputReceivedCents > 1000000) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_AMOUNT_RECEIVED',
              message: 'O valor recebido excede o limite permitido (R$ 10.000,00).'
            });
          }

          if (inputReceivedCents < cashPaymentCents) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_AMOUNT_RECEIVED',
              message: `O valor entregue em dinheiro (R$ ${formatPtBrCurrency(inputReceivedCents)}) é menor que a parcela em dinheiro (R$ ${formatPtBrCurrency(cashPaymentCents)}).`
            });
          }

          finalAmountReceivedCents = inputReceivedCents;
          finalChangeAmountCents = finalAmountReceivedCents - cashPaymentCents;
        } else {
          finalAmountReceivedCents = 0;
          finalChangeAmountCents = 0;
        }
      } else {
        finalPago = false;
        finalAmountReceivedCents = 0;
        finalChangeAmountCents = 0;
        settlementStatus = 'PENDING_RESTAURANT_CONFIRMATION';
      }

      const actionRef = db.collection('restaurants').doc(restaurantId).collection('processedActions').doc(normalizedActionId);
      const nowIso = new Date().toISOString();

      const result = await db.runTransaction(async (transaction: any) => {
        const actionSnap = await transaction.get(actionRef);
        if (actionSnap.exists) {
          const actionData = actionSnap.data();
          if (
            actionData.source !== 'COUNTER' ||
            actionData.restaurantId !== restaurantId ||
            actionData.operatorId !== operatorId
          ) {
            return {
              error: 'ACTION_ALREADY_USED',
              status: 409,
              message: 'Esta ação já foi utilizada por outra operação.'
            };
          }

          const existingOrderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(actionData.orderId);
          const existingOrderSnap = await transaction.get(existingOrderRef);
          if (!existingOrderSnap.exists) {
            return {
              error: 'IDEMPOTENCY_RECORD_INCONSISTENT',
              status: 409,
              message: 'A venda precisa ser conferida no painel antes de uma nova tentativa.'
            };
          }

          const existingOrderData = {
            ...existingOrderSnap.data(),
            id: existingOrderSnap.id
          };

          if (!isValidOrderResponse(actionData.orderId, existingOrderData)) {
            return {
              error: 'INVALID_ORDER_RESPONSE',
              status: 500,
              message: 'O pedido anterior recuperado possui dados inválidos.'
            };
          }

          return {
            alreadyProcessed: true,
            orderId: actionData.orderId,
            order: existingOrderData
          };
        }

        const counterRef = db.collection('restaurants').doc(restaurantId).collection('counters').doc('orders');
        const counterSnap = await transaction.get(counterRef);
        let nextNumber = 1;
        if (counterSnap.exists) {
          nextNumber = (counterSnap.data().value || 0) + 1;
        }

        // Mesa / Comanda resolution (READ phase: all reads must happen before any writes)
        let resolvedTabId: string | null = null;
        let resolvedTableId: string | null = null;
        let resolvedTableName: string | null = null;
        let resolvedTableNumber: any = null;

        let targetTabRef: any = null;
        let targetTabData: any = null;
        let isNewTab = false;
        let targetTableRef: any = null;
        let targetTableData: any = null;

        if (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') {
          const rawTabId = typeof tabId === 'string' && tabId.trim() ? tabId.trim() : (typeof comandaId === 'string' && comandaId.trim() ? comandaId.trim() : '');
          const rawTableId = typeof tableId === 'string' && tableId.trim() ? tableId.trim() : '';

          if (rawTabId) {
            // Existing active comanda selected
            const rootTabRef = db.collection('tabs').doc(rawTabId);
            let tabSnap = await transaction.get(rootTabRef);
            if (!tabSnap.exists) {
              const nestedTabRef = db.collection('restaurants').doc(restaurantId).collection('tabs').doc(rawTabId);
              tabSnap = await transaction.get(nestedTabRef);
            }
            if (!tabSnap.exists) {
              return {
                error: 'TAB_NOT_FOUND',
                status: 404,
                message: 'Comanda ativa selecionada não foi encontrada.'
              };
            }
            targetTabRef = tabSnap.ref;
            targetTabData = tabSnap.data() || {};
            const tabStatusUpper = String(targetTabData.status || '').toUpperCase().trim();
            if (['CLOSED', 'FECHADA', 'CANCELLED', 'CANCELADA'].includes(tabStatusUpper)) {
              return {
                error: 'TAB_ALREADY_CLOSED',
                status: 400,
                message: 'A comanda selecionada já se encontra fechada.'
              };
            }

            resolvedTabId = tabSnap.id;
            resolvedTableId = rawTableId || targetTabData.tableId || null;
            resolvedTableName = tableName || targetTabData.tableName || (targetTabData.tableNumber !== undefined && targetTabData.tableNumber !== null ? `Mesa ${targetTabData.tableNumber}` : null);
            resolvedTableNumber = tableNumber || targetTabData.tableNumber || null;

            if (resolvedTableId) {
              const rootTableRef = db.collection('tables').doc(resolvedTableId);
              let tSnap = await transaction.get(rootTableRef);
              if (!tSnap.exists) {
                const nestedTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(resolvedTableId);
                tSnap = await transaction.get(nestedTableRef);
              }
              if (tSnap.exists) {
                targetTableRef = tSnap.ref;
                targetTableData = tSnap.data() || {};
              }
            }
          } else if (rawTableId) {
            // Free table selected
            const rootTableRef = db.collection('tables').doc(rawTableId);
            let tSnap = await transaction.get(rootTableRef);
            if (!tSnap.exists) {
              const nestedTableRef = db.collection('restaurants').doc(restaurantId).collection('tables').doc(rawTableId);
              tSnap = await transaction.get(nestedTableRef);
            }
            if (!tSnap.exists) {
              return {
                error: 'TABLE_NOT_FOUND',
                status: 404,
                message: 'Mesa selecionada não foi encontrada.'
              };
            }
            targetTableRef = tSnap.ref;
            targetTableData = tSnap.data() || {};

            // REGRA: Não criar uma segunda comanda! Verificar se já existe comanda ativa para esta mesa
            const activeStatuses = ['OPEN', 'open', 'WAITING_ITEMS', 'waiting_items', 'WAITING_PAYMENT', 'waiting_payment', 'PARTIALLY_PAID', 'partially_paid'];
            const activeTabsQuery = db.collection('tabs')
              .where('restaurantId', '==', restaurantId)
              .where('tableId', '==', rawTableId)
              .where('status', 'in', activeStatuses);
            const activeTabsSnap = await transaction.get(activeTabsQuery);

            if (!activeTabsSnap.empty) {
              const existingTabDoc = activeTabsSnap.docs[0];
              targetTabRef = existingTabDoc.ref;
              targetTabData = existingTabDoc.data() || {};
              isNewTab = false;
            } else {
              targetTabRef = db.collection('tabs').doc();
              const tblName = targetTableData.name || targetTableData.nome || (targetTableData.number !== undefined ? `Mesa ${targetTableData.number}` : `Mesa ${rawTableId}`);
              const tblNum = targetTableData.number !== undefined ? targetTableData.number : (targetTableData.numero !== undefined ? targetTableData.numero : null);
              targetTabData = {
                id: targetTabRef.id,
                restaurantId,
                tableId: rawTableId,
                tableName: tblName,
                tableNumber: tblNum,
                hallId: targetTableData.hallId || null,
                waiterId: operatorId,
                waiterName: operatorName,
                customerName: finalClientName || '',
                observation: '',
                peopleCount: 1,
                status: 'OPEN',
                origin: 'COUNTER',
                openedBy: operatorId,
                openedAt: nowIso,
                createdAt: nowIso,
                updatedAt: nowIso,
                items: [],
                totalInCents: 0,
                paidInCents: 0
              };
              isNewTab = true;
            }

            resolvedTabId = targetTabRef.id;
            resolvedTableId = rawTableId;
            resolvedTableName = targetTabData.tableName || targetTableData.name || targetTableData.nome || (targetTableData.number !== undefined ? `Mesa ${targetTableData.number}` : `Mesa ${rawTableId}`);
            resolvedTableNumber = targetTabData.tableNumber !== undefined ? targetTabData.tableNumber : (targetTableData.number !== undefined ? targetTableData.number : null);
          }
        }

        // WRITE phase
        transaction.set(counterRef, { value: nextNumber }, { merge: true });

        const newOrderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc();

        if (targetTabRef) {
          if (isNewTab) {
            transaction.set(targetTabRef, targetTabData);
          }
          if (targetTableRef) {
            transaction.update(targetTableRef, {
              status: 'OCCUPIED',
              comandaId: resolvedTabId,
              tabId: resolvedTabId,
              updatedAt: nowIso
            });
          }

          const newRoundTabItems = formattedItems.map((item: any) => ({
            id: db.collection('dummy').doc().id,
            orderId: newOrderRef.id,
            produtoId: item.id || item.productId,
            produtoNome: item.nome,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            unitPriceCents: item.unitPriceCents,
            total: item.valorTotal,
            totalPriceCents: Math.round(item.valorTotal * 100),
            status: 'em_preparo',
            observacoes: item.observacao || '',
            pedidosAdicionais: {
              size: item.tamanhoSelecionado || null,
              options: item.adicionaisSelecionados || []
            },
            sentAt: nowIso
          }));

          const currentTabItems = Array.isArray(targetTabData.items) ? targetTabData.items : [];
          const updatedTabItems = [...currentTabItems, ...newRoundTabItems];
          const prevTotalCents = targetTabData.totalInCents ?? Math.round((targetTabData.total || 0) * 100);
          const newTotalCents = prevTotalCents + totalCents;
          const prevPaidCents = targetTabData.paidInCents ?? Math.round((targetTabData.paidAmount || 0) * 100);
          const newRemainingCents = Math.max(0, newTotalCents - prevPaidCents);

          transaction.update(targetTabRef, {
            items: updatedTabItems,
            totalInCents: newTotalCents,
            subtotal: newTotalCents / 100,
            total: newTotalCents / 100,
            totalInBrl: newTotalCents / 100,
            remainingInCents: newRemainingCents,
            status: 'OPEN',
            lastOrderId: newOrderRef.id,
            updatedAt: nowIso
          });
        }

        let tipoEntrega = 'balcao';
        if (serviceMode === 'DINE_IN') tipoEntrega = 'consumo_local';
        else if (serviceMode === 'PICKUP') tipoEntrega = 'retirada';
        else if (tipoAtendimento === 'ENTREGA') tipoEntrega = 'entrega';

        const rawStreet = deliveryAddress?.street || deliveryAddress?.rua || deliveryAddress?.endereco || '';
        const rawNumber = deliveryAddress?.number || deliveryAddress?.numero || '';
        const rawNeighborhood = deliveryAddress?.neighborhood || deliveryAddress?.bairro || '';
        const rawComplement = deliveryAddress?.complement || deliveryAddress?.complemento || '';
        const rawReference = deliveryAddress?.reference || deliveryAddress?.referencia || deliveryAddress?.ponto_referencia || '';

        const formattedDeliveryAddress = tipoAtendimento === 'ENTREGA' ? {
          street: normalizeText(rawStreet, 150),
          rua: normalizeText(rawStreet, 150),
          endereco: normalizeText(rawStreet, 150),
          number: normalizeText(rawNumber, 30),
          numero: normalizeText(rawNumber, 30),
          neighborhood: normalizeText(rawNeighborhood, 80),
          bairro: normalizeText(rawNeighborhood, 80),
          complement: normalizeText(rawComplement, 100),
          complemento: normalizeText(rawComplement, 100),
          reference: normalizeText(rawReference, 150),
          referencia: normalizeText(rawReference, 150),
          ponto_referencia: normalizeText(rawReference, 150),
          fullAddress: deliveryAddress?.fullAddress || [
            `${normalizeText(rawStreet, 150)}, ${normalizeText(rawNumber, 30)}`,
            normalizeText(rawNeighborhood, 80),
            normalizeText(rawComplement, 100) ? `Compl: ${normalizeText(rawComplement, 100)}` : '',
            normalizeText(rawReference, 150) ? `Ref: ${normalizeText(rawReference, 150)}` : ''
          ].filter(Boolean).join(' - ')
        } : (deliveryAddress || null);

        const calculatedAtendimento = (tipoAtendimento || (serviceMode === 'DINE_IN' ? 'MESA' : serviceMode === 'PICKUP' ? 'RETIRADA' : 'BALCAO')).toUpperCase();

        const orderDocData: any = {
          origem: 'BALCAO',
          source: 'COUNTER',
          serviceMode,
          orderStatus: 'PREPARING',
          status: 'cozinha',
          tipo_entrega: tipoEntrega,
          tipo_atendimento: calculatedAtendimento,
          atendimento: calculatedAtendimento,
          tipoAtendimento: calculatedAtendimento,

          restaurante_id: restaurantId,
          restaurantId,
          cliente_id: null,
          cliente_nome: finalClientName,
          cliente_telefone: clientPhone ? normalizeText(clientPhone, 30) : '',
          cliente_telefone_whatsapp: clientPhone ? normalizeText(clientPhone, 30) : '',
          tableId: resolvedTableId || null,
          tableName: resolvedTableName || null,
          tableNumber: resolvedTableNumber !== null && resolvedTableNumber !== undefined ? resolvedTableNumber : (tableNumber ? normalizeText(tableNumber, 50) : null),
          tabId: resolvedTabId || null,
          comandaId: resolvedTabId || null,
          comanda_id: resolvedTabId || null,
          mesa: resolvedTableNumber !== null && resolvedTableNumber !== undefined 
            ? (String(resolvedTableNumber).toLowerCase().startsWith('mesa') ? String(resolvedTableNumber) : `Mesa ${resolvedTableNumber}`) 
            : (resolvedTableName || (tableNumber ? normalizeText(tableNumber, 50) : null)),
          mesa_numero: resolvedTableNumber !== null && resolvedTableNumber !== undefined 
            ? resolvedTableNumber 
            : (tableNumber ? normalizeText(tableNumber, 50) : null),
          endereco_entrega: formattedDeliveryAddress,
          endereco: formattedDeliveryAddress?.fullAddress || (typeof deliveryAddress === 'string' ? deliveryAddress : null),
          rua: tipoAtendimento === 'ENTREGA' ? normalizeText(rawStreet, 150) : null,
          numero_endereco: tipoAtendimento === 'ENTREGA' ? normalizeText(rawNumber, 30) : null,
          endereco_numero: tipoAtendimento === 'ENTREGA' ? normalizeText(rawNumber, 30) : null,
          bairro: tipoAtendimento === 'ENTREGA' ? normalizeText(rawNeighborhood, 80) : null,
          complemento: tipoAtendimento === 'ENTREGA' ? normalizeText(rawComplement, 100) : null,
          ponto_referencia: tipoAtendimento === 'ENTREGA' ? normalizeText(rawReference, 150) : null,
          referencia: tipoAtendimento === 'ENTREGA' ? normalizeText(rawReference, 150) : null,

          createdBy: {
            type: 'RESTAURANT',
            userId: operatorId,
            name: operatorName
          },
          counterContext: {
            operatorId,
            operatorName
          },

          items: formattedItems,

          valor_produtos: fromCents(totalCents),
          taxa_entrega: 0,
          valor_desconto: 0,
          valor_total: fromCents(totalCents),

          payments: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') ? [] : normalizedPayments,
          forma_pagamento: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN')
            ? 'comanda'
            : (normalizedPayments.length > 0 
                ? normalizedPayments.reduce((prev: any, current: any) => (current.amount > prev.amount) ? current : prev, normalizedPayments[0]).paymentMethodId 
                : 'dinheiro'),
          pago: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') ? false : finalPago,
          amountReceived: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') ? 0 : fromCents(finalAmountReceivedCents),
          changeAmount: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') ? 0 : fromCents(finalChangeAmountCents),
          troco: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') ? 0 : fromCents(finalChangeAmountCents),
          financialSettlementStatus: (tipoAtendimento === 'MESA' || serviceMode === 'DINE_IN') ? 'NOT_REQUIRED' : settlementStatus,

          driverId: null,
          assignedDriverId: null,
          entregador_id: null,

          numero_pedido: nextNumber,
          orderNumber: nextNumber,
          numero: nextNumber,
          sequencial: nextNumber,

          data_criacao: nowIso,
          data_criacao_iso: nowIso,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),

          clientActionId: normalizedActionId
        };

        transaction.set(newOrderRef, orderDocData);
        transaction.set(actionRef, {
          orderId: newOrderRef.id,
          clientActionId: normalizedActionId,
          source: 'COUNTER',
          restaurantId,
          operatorId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const createdOrderResult = {
          ...orderDocData,
          id: newOrderRef.id,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        if (!isValidOrderResponse(newOrderRef.id, createdOrderResult)) {
          return {
            error: 'INVALID_ORDER_RESPONSE',
            status: 500,
            message: 'A resposta do pedido gerada é inválida.'
          };
        }

        return {
          alreadyProcessed: false,
          orderId: newOrderRef.id,
          order: createdOrderResult
        };
      });

      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }

      if (!isValidOrderResponse(result.orderId, result.order)) {
        return res.status(500).json({
          success: false,
          error: 'INVALID_ORDER_RESPONSE',
          message: 'O servidor retornou uma resposta inválida. Confira o painel de pedidos.'
        });
      }

      if (result.order.pago && !result.alreadyProcessed) {
        // Run as background promise (non-blocking)
        registerServerOrderPaymentMovement(
          restaurantId,
          result.orderId,
          result.order,
          operatorName
        ).catch(err => console.error('[Counter Finance Integration] Error:', err));
      }

      res.status(result.alreadyProcessed ? 200 : 201).json({
        success: true,
        orderId: result.orderId,
        alreadyProcessed: result.alreadyProcessed,
        order: result.order
      });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED' || error.code === 'CASH_REGISTER_NOT_OPEN') {
        return res.status(409).json({
          success: false,
          code: error.code,
          error: error.code,
          message: error.message
        });
      }
      console.error('Error creating counter order:', error);
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message || 'Erro ao criar pedido do balcão.' });
    }
  });

  return router;
}
