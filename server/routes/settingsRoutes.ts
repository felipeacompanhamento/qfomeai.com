import express from 'express';
import { createVerifyRestaurant } from '../middleware/auth';

export function createSettingsRouter(authAdmin: any, db: any) {
  const router = express.Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  // GET: Retrieve a restaurant's custom delivery settings
  router.get('/delivery-settings', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const resDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!resDoc.exists) {
        return res.status(404).json({ error: 'Restaurante não encontrado' });
      }

      const resData = resDoc.data();
      const settings = resData?.deliverySettings || {
        deliveryPropria: true,
        atribuicaoManual: true,
        entregadorAceitaRecusa: false,
        tempoMedioEntrega: 30,
        observacoesInternas: ''
      };

      res.json({ success: true, settings });
    } catch (error: any) {
      console.error('Error fetching delivery settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT: Save restaurant delivery settings
  router.put('/delivery-settings', verifyRestaurant, async (req: any, res: any) => {
    const { deliveryPropria, atribuicaoManual, entregadorAceitaRecusa, tempoMedioEntrega, observacoesInternas } = req.body;
    try {
      const restaurantId = req.user.restaurantId;

      await db.collection('restaurants').doc(restaurantId).update({
        deliverySettings: {
          deliveryPropria: deliveryPropria !== undefined ? deliveryPropria : true,
          atribuicaoManual: atribuicaoManual !== undefined ? atribuicaoManual : true,
          entregadorAceitaRecusa: entregadorAceitaRecusa !== undefined ? entregadorAceitaRecusa : false,
          tempoMedioEntrega: tempoMedioEntrega !== undefined ? Number(tempoMedioEntrega) : 30,
          observacoesInternas: observacoesInternas || ''
        }
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error saving delivery settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
