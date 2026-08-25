import type { Request, Response, NextFunction } from 'express';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { logDriverResolutionAudit } from '../utils/audit';
import { logger, updateLogContext } from '../utils/logger';

export function createVerifyAdmin(authAdmin: Auth, db: Firestore) {
  return async (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized: Token missing' });
    }

    try {
      logger.debug('Verifying token...');
      let decodedToken: DecodedIdToken;
      if (idToken.startsWith('test_token_')) {
        if (process.env.NODE_ENV === 'production') {
          return res.status(401).json({ error: 'Unauthorized: Test tokens not allowed in production' });
        }
        const uid = idToken.replace('test_token_', '');
        decodedToken = { uid, email: `${uid}@test.com` } as any;
      } else {
        decodedToken = await authAdmin.verifyIdToken(idToken);
      }
      
      updateLogContext({ uid: decodedToken.uid, perfil: 'admin' });
      logger.debug('Token verified. UID: ' + decodedToken.uid);
      
      logger.debug('Fetching user doc...');
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      logger.debug('User doc fetched. Exists: ' + userDoc.exists);
      
      const userData = userDoc.data();
      logger.debug('User data loaded');

      if (userData && (userData.tipo_usuario === 'admin' || userData.tipo_usuario === 'PLATFORM_ADMIN' || userData.role === 'PLATFORM_ADMIN' || userData.role === 'ADMIN')) {
        req.user = decodedToken;
        next();
      } else {
        logger.warn(`Forbidden: User ${decodedToken.uid} is not an admin. Type: ${userData?.tipo_usuario}`);
        res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
    } catch (error: any) {
      logger.error('Error verifying admin token', { error });
      res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
  };
}

export function createVerifyRestaurant(authAdmin: Auth, db: Firestore) {
  return async (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized: Token missing' });
    }

    try {
      let decodedToken: DecodedIdToken;
      if (idToken.startsWith('test_token_')) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('[SECURITY] Tentativa de usar token de teste em produção bloqueada');
          return res.status(401).json({ error: 'Não autorizado: Tokens de teste não são permitidos em ambiente de produção' });
        }
        const uid = idToken.replace('test_token_', '');
        decodedToken = { uid, email: `${uid}@test.com` } as any;
      } else {
        try {
          decodedToken = await authAdmin.verifyIdToken(idToken);
        } catch (tokenErr: any) {
          return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
      }
      
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (userData && (userData.status === 'INACTIVE' || userData.active === false)) {
        return res.status(403).json({ error: 'Sua conta está desativada. Entre em contato com o proprietário.' });
      }

      const roleUpper = (userData?.role || '').toUpperCase();
      const tipoUpper = (userData?.tipo_usuario || '').toUpperCase();
      const isRestaurant = Boolean(
        userData?.restaurantId ||
        ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'DRIVER', 'CASHIER', 'KITCHEN', 'ADMIN'].includes(roleUpper) ||
        ['RESTAURANT', 'RESTAURANTE', 'ADMIN', 'RESTAURANT_ADMIN', 'OWNER', 'MANAGER', 'WAITER', 'GARCOM', 'DRIVER', 'CASHIER', 'KITCHEN'].includes(tipoUpper)
      );

      if (userData && isRestaurant) {
        const restaurantId = userData.restaurantId || decodedToken.uid;
        updateLogContext({
          uid: decodedToken.uid,
          restaurantId,
          perfil: userData.role || userData.tipo_usuario || ''
        });

        req.user = {
          ...decodedToken,
          restaurantId,
          tipo_usuario: userData.tipo_usuario || '',
          role: userData.role || ''
        };
        next();
      } else {
        res.status(403).json({ error: 'Forbidden: Restaurant access required' });
      }
    } catch (error: any) {
      logger.error('Error verifying restaurant token', { error });
      res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
  };
}

export function createVerifyDriver(authAdmin: Auth, db: Firestore) {
  return async (req: any, res: Response, next: NextFunction) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em createVerifyDriver', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado: Token não informado' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Não autorizado: Token não informado' });
    }

    try {
      let decodedToken: DecodedIdToken;
      if (idToken.startsWith('test_token_')) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('[SECURITY] Tentativa de usar token de teste em produção bloqueada');
          return res.status(401).json({ error: 'Não autorizado: Tokens de teste não são permitidos em ambiente de produção' });
        }
        const uid = idToken.replace('test_token_', '');
        decodedToken = { uid, email: `${uid}@test.com` } as any;
      } else {
        try {
          decodedToken = await authAdmin.verifyIdToken(idToken);
        } catch (tokenErr: any) {
          return res.status(401).json({ error: 'Não autorizado: Token inválido' });
        }
      }

      updateLogContext({ uid: decodedToken.uid });

      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        await logDriverResolutionAudit(db, {
          requestId,
          uid: decodedToken.uid,
          perfisEncontrados: 0,
          restaurantIdsEncontrados: [],
          resultadoValidacao: 'USER_NOT_FOUND',
          httpStatus: 403
        });
        return res.status(403).json({
          error: 'DRIVER_PROFILE_NOT_FOUND',
          code: 'DRIVER_PROFILE_NOT_FOUND',
          message: 'Acesso negado: Perfil de usuário não encontrado.'
        });
      }
      const userData = userDoc.data()!;

      const isAccountActive = userData.status === 'ACTIVE' && userData.active !== false;
      if (!isAccountActive) {
        await logDriverResolutionAudit(db, {
          requestId,
          uid: decodedToken.uid,
          perfisEncontrados: 0,
          restaurantIdsEncontrados: [],
          resultadoValidacao: 'USER_ACCOUNT_INACTIVE',
          httpStatus: 403
        });
        return res.status(403).json({
          error: 'DRIVER_PROFILE_NOT_FOUND',
          code: 'DRIVER_PROFILE_NOT_FOUND',
          message: 'Acesso negado: Perfil de usuário inativo ou bloqueado.'
        });
      }

      const roleUpper = (userData.role || '').toUpperCase();
      const tipoUpper = (userData.tipo_usuario || '').toUpperCase();

      const isDriverRole = roleUpper === 'DRIVER' || 
                           roleUpper === 'DELIVERY_DRIVER' || 
                           roleUpper === 'ENTREGADOR' || 
                           tipoUpper === 'DRIVER' ||
                           tipoUpper === 'DELIVERY_DRIVER' || 
                           tipoUpper === 'ENTREGADOR';

      if (!isDriverRole) {
        await logDriverResolutionAudit(db, {
          requestId,
          uid: decodedToken.uid,
          perfisEncontrados: 0,
          restaurantIdsEncontrados: [],
          resultadoValidacao: 'USER_ROLE_NOT_DRIVER',
          httpStatus: 403
        });
        return res.status(403).json({
          error: 'DRIVER_PROFILE_NOT_FOUND',
          code: 'DRIVER_PROFILE_NOT_FOUND',
          message: 'Acesso negado: Perfil de entregador necessário.'
        });
      }

      const profilesQuery = await db.collectionGroup('staffProfiles').where('uid', '==', decodedToken.uid).get();

      const activeDriverProfiles: Array<{ doc: any; restaurantId: string; data: any }> = [];
      const restaurantIdsFoundSet = new Set<string>();

      profilesQuery.docs.forEach((pDoc) => {
        const pData = pDoc.data();
        const pRole = (pData.role || '').toUpperCase();
        const pOpStatus = (pData.operationalStatus || pData.status || '').toUpperCase();
        const rId = pData.restaurantId;

        const isDriver = pRole === 'DRIVER' || pRole === 'DELIVERY_DRIVER' || pRole === 'ENTREGADOR';
        const isActiveStatus = pOpStatus !== 'INACTIVE';

        if (isDriver && isActiveStatus && rId && typeof rId === 'string' && rId.trim() !== '') {
          activeDriverProfiles.push({ doc: pDoc, restaurantId: rId.trim(), data: pData });
          restaurantIdsFoundSet.add(rId.trim());
        }
      });

      const perfisEncontrados = activeDriverProfiles.length;
      const restaurantIdsEncontrados = Array.from(restaurantIdsFoundSet);

      if (perfisEncontrados === 0) {
        await logDriverResolutionAudit(db, {
          requestId,
          uid: decodedToken.uid,
          perfisEncontrados: 0,
          restaurantIdsEncontrados: [],
          resultadoValidacao: 'DRIVER_PROFILE_NOT_FOUND',
          httpStatus: 403
        });
        return res.status(403).json({
          error: 'DRIVER_PROFILE_NOT_FOUND',
          code: 'DRIVER_PROFILE_NOT_FOUND',
          message: 'Nenhum perfil de entregador ativo encontrado para este usuário.'
        });
      }

      if (perfisEncontrados > 1 || restaurantIdsEncontrados.length > 1) {
        await logDriverResolutionAudit(db, {
          requestId,
          uid: decodedToken.uid,
          perfisEncontrados,
          restaurantIdsEncontrados,
          resultadoValidacao: 'DRIVER_MULTIPLE_RESTAURANTS',
          httpStatus: 409
        });
        return res.status(409).json({
          error: 'DRIVER_MULTIPLE_RESTAURANTS',
          code: 'DRIVER_MULTIPLE_RESTAURANTS',
          message: 'Múltiplos vínculos ativos de entregador encontrados. Entre em contato com o suporte.'
        });
      }

      const selectedProfile = activeDriverProfiles[0];
      const staffRestaurantId = selectedProfile.restaurantId;
      const profileData = selectedProfile.data;

      if (userData.restaurantId && typeof userData.restaurantId === 'string' && userData.restaurantId.trim() !== '') {
        if (userData.restaurantId.trim() !== staffRestaurantId) {
          await logDriverResolutionAudit(db, {
            requestId,
            uid: decodedToken.uid,
            perfisEncontrados: 1,
            restaurantIdsEncontrados: [staffRestaurantId, userData.restaurantId.trim()],
            resultadoValidacao: 'MISMATCHED_RESTAURANT_ID',
            httpStatus: 403,
            restaurantId: staffRestaurantId
          });
          return res.status(403).json({
            error: 'DRIVER_PROFILE_NOT_FOUND',
            code: 'DRIVER_PROFILE_NOT_FOUND',
            message: 'Incompatibilidade entre o restaurante cadastrado e o perfil de entregador.'
          });
        }
      }

      updateLogContext({ restaurantId: staffRestaurantId, perfil: 'DRIVER' });

      const roleData = profileData.roleSpecificData || {};

      const opDriverRef = db.collection('restaurants').doc(staffRestaurantId).collection('drivers').doc(decodedToken.uid);
      const opDriverSnap = await opDriverRef.get();
      if (!opDriverSnap.exists) {
        await opDriverRef.set({
          id: decodedToken.uid,
          uid: decodedToken.uid,
          restaurantId: staffRestaurantId,
          role: 'DRIVER',
          nome: userData.nome || userData.name || roleData.nickname || 'Entregador',
          operationalStatus: profileData.operationalStatus || 'ACTIVE',
          availabilityStatus: roleData.availability || 'OFFLINE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      await logDriverResolutionAudit(db, {
        requestId,
        uid: decodedToken.uid,
        perfisEncontrados: 1,
        restaurantIdsEncontrados: [staffRestaurantId],
        resultadoValidacao: 'SUCCESS',
        httpStatus: 200,
        restaurantId: staffRestaurantId
      });

      req.driver = {
        id: decodedToken.uid,
        uid: decodedToken.uid,
        restaurantId: staffRestaurantId,
        name: userData.nome || userData.name || roleData.nickname || 'Entregador',
        phone: userData.phone || userData.telefone || '',
        email: userData.email || '',
        status: userData.status || 'ACTIVE',
        availabilityStatus: roleData.availability || 'OFFLINE',
        ...profileData
      };
      next();
    } catch (error: any) {
      logger.error('Error verifying driver token', { error });
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: `Erro interno ao validar o entregador: ${error.message}`
      });
    }
  };
}
