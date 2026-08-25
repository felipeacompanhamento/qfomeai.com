import type { Firestore } from 'firebase-admin/firestore';
import { metricsRegistry } from './metrics';
import { logger } from './logger';

export async function sendWhatsAppMessage(db: Firestore, phone: string, text: string, restaurantId: string) {
  try {
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    const restaurant = restaurantDoc.data();

    if (!restaurant?.whatsapp_enabled || !restaurant?.whatsapp_token || !restaurant?.whatsapp_phone_number_id) {
      logger.warn(`[WhatsApp] Integração não configurada ou desativada`);
      return;
    }

    const token = restaurant.whatsapp_token;
    const phoneNumberId = restaurant.whatsapp_phone_number_id;

    const cleanPhone = phone.replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    const convDoc = await db.collection('restaurants').doc(restaurantId).collection('whatsapp_conversations').doc(finalPhone).get();
    if (!convDoc.exists) {
      logger.debug(`[WhatsApp] Nenhuma conversa iniciada pelo cliente. Mensagem não enviada.`);
      return;
    }

    const lastMessageAt = new Date(convDoc.data()?.lastMessageAt).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (now - lastMessageAt > twentyFourHours) {
      logger.debug(`[WhatsApp] Janela de 24h expirada. Mensagem não enviada.`);
      return;
    }

    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: finalPhone,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      metricsRegistry.increment('whatsappFailure');
      logger.error(`[WhatsApp] Erro ao enviar mensagem`, { error: errorData });
    } else {
      metricsRegistry.increment('whatsappSuccess');
      logger.debug(`[WhatsApp] Mensagem enviada com sucesso`);
    }
  } catch (error: any) {
    metricsRegistry.increment('whatsappFailure');
    logger.error('[WhatsApp] Erro na função sendWhatsAppMessage:', { error: error.message });
  }
}
