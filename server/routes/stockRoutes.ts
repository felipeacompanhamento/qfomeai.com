import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';

export function createStockRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  // POST: Stock movement (entrada, saida, ajuste)
  router.post('/products/:productId/stock-movement', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { productId } = req.params;
      const { tipo, quantidade, motivo, observacao } = req.body;

      if (!['entrada', 'saida', 'ajuste'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de movimentação inválido. Use entrada, saida ou ajuste.' });
      }

      const qty = Number(quantidade);
      if (Number.isNaN(qty) || qty < 0) {
        return res.status(400).json({ error: 'Quantidade inválida.' });
      }

      if (tipo !== 'ajuste' && qty === 0) {
        return res.status(400).json({ error: 'A quantidade deve ser maior que zero.' });
      }

      if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'O motivo da movimentação é obrigatório.' });
      }

      const productRef = db.collection('restaurants').doc(restaurantId).collection('products').doc(productId);
      
      const result = await db.runTransaction(async (transaction: any) => {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) {
          throw new Error('Produto não encontrado.');
        }

        const pData = productSnap.data()!;
        const hasStockControl = pData.controlarEstoque === true || pData.stockControl === true;
        if (!hasStockControl) {
          throw new Error('Este produto não possui controle de estoque ativado.');
        }

        const currentStock = typeof pData.estoqueAtual === 'number' ? pData.estoqueAtual : typeof pData.estoque === 'number' ? pData.estoque : typeof pData.stock === 'number' ? pData.stock : 0;
        const permitirVenda = pData.permitirVendaSemEstoque === true;

        let newStock = currentStock;
        if (tipo === 'entrada') {
          newStock = currentStock + qty;
        } else if (tipo === 'saida') {
          newStock = currentStock - qty;
        } else if (tipo === 'ajuste') {
          newStock = qty;
        }

        if (newStock < 0 && !permitirVenda) {
          const err: any = new Error(`Estoque insuficiente. Saldo resultante seria ${newStock} e a venda sem estoque não é permitida.`);
          err.code = 'NEGATIVE_STOCK_NOT_ALLOWED';
          throw err;
        }

        const now = new Date().toISOString();
        const userName = req.user.email || req.user.name || 'Usuário do Sistema';

        const movementRef = db.collection('restaurants').doc(restaurantId).collection('products').doc(productId).collection('estoque_movimentacoes').doc();
        const movementData = {
          id: movementRef.id,
          restaurantId,
          productId,
          tipo,
          quantidade: qty,
          quantidadeAnterior: currentStock,
          quantidadeNova: newStock,
          motivo: motivo.trim(),
          observacao: observacao ? observacao.trim() : '',
          usuario: userName,
          created_at: now
        };

        transaction.set(movementRef, movementData);
        transaction.update(productRef, {
          estoqueAtual: newStock,
          estoque: newStock,
          stock: newStock,
          updatedAt: now
        });

        return { currentStock, newStock, movementData };
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Error in stock movement:', error);
      res.status(400).json({ error: error.message || 'Erro ao movimentar estoque' });
    }
  });

  // GET: Stock movements history
  router.get('/products/:productId/stock-movements', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { productId } = req.params;

      const movementsSnap = await db.collection('restaurants').doc(restaurantId).collection('products').doc(productId).collection('estoque_movimentacoes').orderBy('created_at', 'desc').limit(50).get();
      const movements = movementsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      res.json(movements);
    } catch (error: any) {
      console.error('Error fetching stock movements:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar histórico de estoque' });
    }
  });

  return router;
}
