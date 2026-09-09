import { Router } from 'express';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { sendActivationEmail } from '../utils/email';

export function createAdminRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();

  // API route for manual restaurant registration by admin
  router.post('/admin/register-restaurant', async (req: any, res: any) => {
    const { email, password, nome_proprietario, telefone, nome, slug, cpf_cnpj, endereco, ...rest } = req.body;
    
    try {
      // 1. Create Auth user
      const userRecord: UserRecord = await authAdmin.createUser({
        email,
        password,
        displayName: nome_proprietario,
      });

      const uid = userRecord.uid;

      // 2. Create user doc
      await db.collection('users').doc(uid).set({
        uid,
        nome: nome_proprietario,
        email,
        telefone,
        whatsapp: rest.whatsapp || '',
        instagram: rest.instagram || '',
        tipo_usuario: 'restaurant',
        restaurantId: uid,
        status_conta: 'aprovado',
        onboarding_completo: true,
        data_criacao: new Date().toISOString(),
        acceptedTerms: true,
        acceptedAt: FieldValue.serverTimestamp(),
        termsVersion: "1.0"
      });

      // 3. Create restaurant doc
      await db.collection('restaurants').doc(uid).set({
        id: uid,
        nome,
        slug,
        nome_fantasia: nome,
        nome_proprietario,
        cpf_cnpj,
        status_aprovacao: 'aprovado',
        status_operacao: 'fechado',
        data_criacao: new Date().toISOString(),
        tipo_entrega: 'ambos',
        tempo_max_aceite: 15,
        owner_name: nome_proprietario,
        owner_email: email,
        owner_phone: telefone,
        endereco,
        ...rest
      });

      res.json({ success: true, uid });
    } catch (error: any) {
      console.error("Error registering restaurant:", error);
      res.status(500).json({ error: "Erro ao registrar restaurante." });
    }
  });

  // Public API route for self-service restaurant registration
  router.post('/auth/register-restaurant', async (req: any, res: any) => {
    try {
      const email = (req.body.email || '').trim().toLowerCase();
      const password = req.body.password;
      const nomeProprietario = (req.body.nomeProprietario || req.body.nome_proprietario || '').trim();
      const nomeFantasia = (req.body.nomeFantasia || req.body.nome_fantasia || req.body.nome || '').trim();
      let slug = (req.body.slug || '').trim().toLowerCase();
      const cpfCnpj = (req.body.cpfCnpj || req.body.cpf_cnpj || '').trim();
      const telefone = (req.body.telefone || req.body.phone || '').trim();
      const whatsapp = (req.body.whatsapp || telefone).trim();
      const instagram = (req.body.instagram || '').trim();
      const personType = req.body.personType || 'PJ';
      const endereco = req.body.endereco || {};

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'E-mail inválido ou não informado.' });
      }
      if (!nomeProprietario && !nomeFantasia) {
        return res.status(400).json({ error: 'Nome do proprietário ou Razão Social é obrigatório.' });
      }

      if (!slug) {
        slug = (nomeFantasia || nomeProprietario)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-');
      }

      if (!slug) {
        slug = `restaurante-${Date.now().toString(36)}`;
      }

      // Check if user is authenticated via Bearer token
      let authenticatedUid: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
          const decoded = await authAdmin.verifyIdToken(idToken);
          authenticatedUid = decoded.uid;
        } catch (tokenErr) {
          // Token invalid/expired; continue as unauthenticated
        }
      }

      // Check slug uniqueness
      const slugSnap = await db.collection('restaurants').where('slug', '==', slug).get();
      if (!slugSnap.empty) {
        const isSelf = authenticatedUid && slugSnap.docs.some((d: any) => d.id === authenticatedUid);
        if (!isSelf) {
          return res.status(400).json({ error: 'Este link/slug já está em uso por outro restaurante. Por favor, escolha outro.' });
        }
      }

      let uid = authenticatedUid;
      let isExistingUser = false;
      let userRecord: UserRecord | null = null;

      if (!uid) {
        try {
          userRecord = await authAdmin.getUserByEmail(email);
          uid = userRecord.uid;
          isExistingUser = true;
        } catch (err: any) {
          if (err.code === 'auth/user-not-found') {
            if (!password || password.length < 6) {
              return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
            }
            userRecord = await authAdmin.createUser({
              email,
              password,
              displayName: nomeProprietario || nomeFantasia,
            });
            uid = userRecord.uid;
          } else {
            console.error('[Register Restaurant] Erro ao buscar usuário no Auth:', err);
            return res.status(500).json({ error: 'Erro ao processar autenticação do usuário.' });
          }
        }
      }

      if (isExistingUser && uid) {
        // Check if this account already has a registered restaurant
        const [existingRestDoc, existingUserDoc] = await Promise.all([
          db.collection('restaurants').doc(uid).get(),
          db.collection('users').doc(uid).get()
        ]);

        if (existingRestDoc.exists || existingUserDoc.data()?.accountType === 'RESTAURANT' || existingUserDoc.data()?.tipo_usuario === 'restaurant') {
          return res.status(400).json({ error: 'Este e-mail já possui um restaurante cadastrado. Faça login para acessar o painel administrativo.' });
        }

        // Existing user (e.g. registered with Google or as customer) can set/update password for direct login
        if (password && password.length >= 6) {
          try {
            await authAdmin.updateUser(uid, {
              password,
              displayName: nomeProprietario || nomeFantasia || userRecord?.displayName,
            });
          } catch (passErr: any) {
            console.warn('[Register Restaurant] Não foi possível atualizar senha do usuário existente:', passErr?.message);
          }
        }
      }

      if (!uid) {
        return res.status(500).json({ error: 'Não foi possível identificar ou criar a conta de usuário.' });
      }

      // Upsert user profile
      await db.collection('users').doc(uid).set({
        uid,
        nome: nomeProprietario || nomeFantasia,
        name: nomeProprietario || nomeFantasia,
        email,
        telefone,
        phone: telefone,
        whatsapp: whatsapp || telefone,
        instagram: instagram || '',
        accountType: 'RESTAURANT',
        role: 'OWNER',
        status: 'ACTIVE',
        permissions: [],
        _migratedAt: new Date().toISOString(),
        _migrationVersion: '1.0.0',
        tipo_usuario: 'restaurant',
        restaurantId: uid,
        status_conta: 'pendente_aprovacao',
        onboarding_completo: true,
        data_criacao: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lgpdAccepted: true,
        acceptedAt: FieldValue.serverTimestamp(),
        termsVersion: "1.0"
      }, { merge: true });

      // Create restaurant profile
      await db.collection('restaurants').doc(uid).set({
        id: uid,
        nome: nomeFantasia || nomeProprietario,
        slug,
        nome_fantasia: nomeFantasia || nomeProprietario,
        nome_proprietario: nomeProprietario,
        cpf_cnpj: cpfCnpj,
        tipo_pessoa: personType,
        status_aprovacao: 'pendente_aprovacao',
        status_operacao_config: 'fechado',
        data_criacao: new Date().toISOString(),
        tipo_entrega: 'ambos',
        tempo_max_aceite: 15,
        owner_name: nomeProprietario,
        owner_email: email,
        owner_phone: telefone,
        whatsapp: whatsapp || telefone,
        instagram: instagram || '',
        endereco: {
          rua: endereco.rua || '',
          numero: endereco.numero || '',
          complemento: endereco.complemento || '',
          bairro: endereco.bairro || '',
          cidade: endereco.cidade || '',
          estado: endereco.estado || ''
        }
      }, { merge: true });

      // Increment public stats
      try {
        await db.collection('public_stats').doc('global').set({
          restaurants: FieldValue.increment(1)
        }, { merge: true });
      } catch (statsErr) {
        console.error('[Register Restaurant] Erro ao incrementar stats globais:', statsErr);
      }

      // Send custom activation email
      try {
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const protocol = host?.includes('localhost') ? 'http' : 'https';
        const link = await authAdmin.generateEmailVerificationLink(email, {
          url: `${protocol}://${host}/profile`,
          handleCodeInApp: true
        });
        await sendActivationEmail(email, link);
      } catch (emailErr) {
        console.error('[Register Restaurant] Erro ao enviar e-mail de ativação:', emailErr);
      }

      // Generate custom token for auto-login
      const customToken = await authAdmin.createCustomToken(uid);

      res.json({ success: true, customToken, uid });
    } catch (error: any) {
      console.error('[Register Restaurant] Erro crítico no registro:', error);
      res.status(500).json({ error: error.message || 'Erro ao registrar restaurante.' });
    }
  });

  // API route for user deletion by admin
  router.delete('/admin/users/:uid', async (req: any, res: any) => {
    const { uid } = req.params;
    try {
      // 1. Delete from Auth
      await authAdmin.deleteUser(uid);
      
      // 2. Delete from Firestore (users collection)
      await db.collection('users').doc(uid).delete();
      
      // 3. If it's a restaurant, delete from restaurants collection
      await db.collection('restaurants').doc(uid).delete();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      if (error.message && error.message.includes('identitytoolkit.googleapis.com')) {
        return res.status(403).json({ 
          error: 'A API Identity Toolkit precisa ser ativada no Google Cloud Console para permitir a exclusão de usuários.',
          activationUrl: 'https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=54807670224'
        });
      }
      res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
  });

  // API route for user update by admin
  router.patch('/admin/users/:uid', async (req: any, res: any) => {
    const { uid } = req.params;
    const { email, nome, telefone, tipo_usuario, status_conta } = req.body;
    try {
      // 1. Update Auth if email is provided
      if (email) {
        await authAdmin.updateUser(uid, { email });
      }
      
      // 2. Update Firestore
      const updates: any = {};
      if (email) updates.email = email;
      if (nome) {
        updates.nome = nome;
        updates.name = nome;
      }
      if (telefone) {
        updates.telefone = telefone;
        updates.phone = telefone;
      }
      if (tipo_usuario) {
        updates.tipo_usuario = tipo_usuario;
        const lower = tipo_usuario.toLowerCase();
        if (lower === 'cliente') {
          updates.accountType = 'CLIENT';
          updates.role = 'CLIENT';
        } else if (lower === 'admin') {
          updates.accountType = 'ADMIN';
          updates.role = 'ADMIN';
        } else if (['restaurant', 'restaurante', 'proprietario', 'owner'].includes(lower)) {
          updates.accountType = 'RESTAURANT';
          updates.role = 'OWNER';
        } else if (['delivery_driver', 'entregador', 'driver'].includes(lower)) {
          updates.accountType = 'DRIVER';
          updates.role = 'DRIVER';
        } else if (lower === 'manager' || lower === 'gerente') {
          updates.accountType = 'RESTAURANT';
          updates.role = 'MANAGER';
        } else if (lower === 'waiter' || lower === 'garcom') {
          updates.accountType = 'RESTAURANT';
          updates.role = 'WAITER';
        } else if (lower === 'cashier' || lower === 'caixa') {
          updates.accountType = 'RESTAURANT';
          updates.role = 'CASHIER';
        } else if (lower === 'kitchen' || lower === 'cozinha') {
          updates.accountType = 'RESTAURANT';
          updates.role = 'KITCHEN';
        }
      }
      if (status_conta) {
        updates.status_conta = status_conta;
        updates.status = status_conta === 'bloqueado' || status_conta === 'inativo' ? 'INACTIVE' : 'ACTIVE';
        updates.active = updates.status === 'ACTIVE';
      }
      updates._migratedAt = new Date().toISOString();
      
      await db.collection('users').doc(uid).update(updates);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating user:", error);
      if (error.message && error.message.includes('identitytoolkit.googleapis.com')) {
        return res.status(403).json({ 
          error: 'A API Identity Toolkit precisa ser ativada no Google Cloud Console para permitir a atualização de usuários.',
          activationUrl: 'https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=54807670224'
        });
      }
      res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  });

  // API route to send account activation email
  router.post('/auth/send-activation-email', async (req: any, res: any) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    try {
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const protocol = host?.includes('localhost') ? 'http' : 'https';
      
      const link = await authAdmin.generateEmailVerificationLink(email, {
        url: `${protocol}://${host}/profile`,
        handleCodeInApp: true
      });

      await sendActivationEmail(email, link);
      
      res.json({ success: true, message: 'Email de ativação enviado com sucesso' });
    } catch (error: any) {
      console.error('[Auth API] Erro ao processar email de ativação:', error);
      res.status(500).json({ error: 'Erro ao enviar email de ativação.' });
    }
  });

  // POST: Migration of legacy orders
  router.post('/admin/migrate-orders', async (req: any, res: any) => {
    const { dryRun = true, restaurantId } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação necessário' });
    }

    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await authAdmin.verifyIdToken(idToken);
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.data();

      if (!userData || (userData.role !== 'admin' && userData.tipo_usuario !== 'admin' && userData.role !== 'restaurant_owner')) {
        return res.status(403).json({ error: 'Acesso negado: Permissão administrativa necessária' });
      }

      const targetRestaurantId = restaurantId || userData.restaurantId || decoded.uid;
      const ordersRef = db.collection('restaurants').doc(targetRestaurantId).collection('orders');
      const snapshot = await ordersRef.get();

      let totalExamined = 0;
      let totalUpdated = 0;
      const simulationLogs: any[] = [];

      const batches: any[] = [db.batch()];
      let operationCount = 0;
      let currentBatchIdx = 0;

      for (const orderDoc of snapshot.docs) {
        totalExamined++;
        const data = orderDoc.data();
        const updates: any = {};

        if (!data.deliveryStatus) {
          if (data.status === 'out_for_delivery' || data.status_entrega === 'out_for_delivery' || data.status === 'delivering') {
            updates.deliveryStatus = 'IN_TRANSIT';
            updates.canonicalStatus = 'IN_TRANSIT';
          } else if (data.status === 'delivered' || data.status_entrega === 'delivered' || data.status === 'completed' || data.status === 'entregue') {
            updates.deliveryStatus = 'DELIVERED';
            updates.canonicalStatus = 'DELIVERED';
          } else if (data.status === 'accepted' || data.status === 'aceito') {
            updates.deliveryStatus = 'ACCEPTED';
            updates.canonicalStatus = 'ASSIGNED';
          } else if (data.driverId || data.assignedDriverId || data.entregador_id) {
            updates.deliveryStatus = 'ASSIGNED';
            updates.canonicalStatus = 'ASSIGNED';
          } else {
            updates.deliveryStatus = 'UNASSIGNED';
            updates.canonicalStatus = 'UNASSIGNED';
          }
        }

        if (!data.paymentStatus) {
          if (data.pago) {
            updates.paymentStatus = 'SETTLED';
          } else if (data.paymentCollectedByDriver) {
            updates.paymentStatus = 'AWAITING_DRIVER_SETTLEMENT';
          } else {
            updates.paymentStatus = 'PENDING';
          }
        }

        if (!data.assignedDriverId && (data.driverId || data.entregador_id)) {
          updates.assignedDriverId = data.driverId || data.entregador_id;
        }

        if (Object.keys(updates).length > 0) {
          totalUpdated++;
          simulationLogs.push({
            orderId: orderDoc.id,
            original: {
              status: data.status,
              status_entrega: data.status_entrega,
              pago: data.pago,
              driverId: data.driverId
            },
            proposedUpdates: updates
          });

          if (!dryRun) {
            batches[currentBatchIdx].update(orderDoc.ref, updates);
            operationCount++;
            if (operationCount >= 400) {
              batches.push(db.batch());
              currentBatchIdx++;
              operationCount = 0;
            }
          }
        }
      }

      if (!dryRun) {
        for (const batch of batches) {
          await batch.commit();
        }
      }

      res.json({
        success: true,
        dryRun,
        restaurantId: targetRestaurantId,
        totalExamined,
        totalUpdated,
        simulationLogs: simulationLogs.slice(0, 50)
      });
    } catch (err: any) {
      console.error('Error migrating orders:', err);
      res.status(500).json({ error: 'Erro ao migrar pedidos.' });
    }
  });

  return router;
}
