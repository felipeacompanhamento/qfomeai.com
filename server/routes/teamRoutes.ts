import express from 'express';
import { createVerifyRestaurant } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { extractServerCommonData, extractServerRoleSpecificData, checkServerProfileCompleteness } from '../validators/teamValidators';
import { validatePermissionsForRole, getDefaultPermissionsForRole } from '../../src/domain/permissions/canonicalPermissions';

export function createTeamRouter(authAdmin: any, db: any) {
  const router = express.Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);
  const passwordResetLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Muitas tentativas de redefinição de senha. Por favor, aguarde alguns minutos.'
  });
  const adminOpLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Muitas solicitações administrativas. Por favor, aguarde.'
  });

  // GET: List all team members of the restaurant with pagination and filters
  router.get('/', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || req.query.limit || '20', 10), 1), 100);
      const cursor = (req.query.cursor || req.query.nextCursor || req.query.startAfter || '').toString().trim();
      const roleFilter = (req.query.role || req.query.perfil || 'ALL').toString().toUpperCase();
      const statusFilter = (req.query.status || 'ALL').toString().toUpperCase();
      const search = (req.query.search || req.query.q || '').toString().toLowerCase().trim();

      // Fetch users
      const snapshot = await db.collection('users').where('restaurantId', '==', restaurantId).get();
      const teamRawMap = new Map<string, any>();

      snapshot.forEach(docSnap => {
        const u = docSnap.data();
        if (u.accountType !== 'CLIENT' && u.tipo_usuario !== 'cliente' && u.role !== 'ADMIN' && u.tipo_usuario !== 'admin') {
          teamRawMap.set(docSnap.id, { id: docSnap.id, uid: docSnap.id, ...u });
        }
      });

      // Include owner if not returned
      const ownerDoc = await db.collection('users').doc(restaurantId).get();
      if (ownerDoc.exists) {
        const ownerUser = ownerDoc.data()!;
        if (ownerUser.restaurantId === restaurantId && !teamRawMap.has(ownerDoc.id)) {
          if (ownerUser.accountType !== 'CLIENT' && ownerUser.tipo_usuario !== 'cliente' && ownerUser.role !== 'ADMIN' && ownerUser.tipo_usuario !== 'admin') {
            teamRawMap.set(ownerDoc.id, { id: ownerDoc.id, uid: ownerDoc.id, ...ownerUser });
          }
        }
      }

      const team = Array.from(teamRawMap.values());

      // Fetch operational profiles
      const staffProfilesSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').get();
      const staffProfilesMap = new Map<string, any>();
      staffProfilesSnap.forEach(pDoc => {
        staffProfilesMap.set(pDoc.id, pDoc.data());
      });

      let normalizedTeam = team.map(member => {
        let role = member.role;
        const legacyTipo = member.tipo_usuario;
        if (!role && legacyTipo) {
          if (legacyTipo === 'restaurant' || legacyTipo === 'restaurante') role = 'OWNER';
          else if (legacyTipo === 'restaurant_admin') role = 'RESTAURANT_ADMIN';
          else if (legacyTipo === 'manager') role = 'MANAGER';
          else if (legacyTipo === 'waiter' || legacyTipo === 'garcom') role = 'WAITER';
          else if (legacyTipo === 'delivery_driver' || legacyTipo === 'entregador') role = 'DRIVER';
          else if (legacyTipo === 'cashier') role = 'CASHIER';
          else if (legacyTipo === 'kitchen') role = 'KITCHEN';
        }

        const cleanRole = role ? role.toUpperCase() : 'WAITER';
        const memberStatus = member.status || (member.active !== false ? 'ACTIVE' : 'INACTIVE');

        // Load operational profile if available
        let profile = staffProfilesMap.get(member.id);
        let commonOperationalData = profile?.commonOperationalData || extractServerCommonData(member);
        let roleSpecificData = profile?.roleSpecificData || extractServerRoleSpecificData(cleanRole, member);

        // Standardize nested operationalConfig structure
        const operationalConfig: any = {};
        const roleKey = cleanRole === 'OWNER' ? 'ownerConfig' :
                        cleanRole === 'RESTAURANT_ADMIN' ? 'adminConfig' :
                        cleanRole === 'MANAGER' ? 'managerConfig' :
                        cleanRole === 'WAITER' ? 'waiterConfig' :
                        cleanRole === 'DRIVER' ? 'driverConfig' :
                        cleanRole === 'CASHIER' ? 'cashierConfig' :
                        cleanRole === 'KITCHEN' ? 'kitchenConfig' : null;

        if (roleKey) {
          operationalConfig[roleKey] = roleSpecificData;
        }

        return {
          id: member.id,
          uid: member.uid || member.id,
          nome: member.nome || member.name || '',
          displayName: member.displayName || member.nome || member.name || '',
          email: member.email || '',
          phone: member.phone || member.telefone || '',
          photoUrl: member.photoUrl || commonOperationalData.photoUrl || '',
          jobTitle: member.jobTitle || commonOperationalData.jobTitle || '',
          employeeId: member.employeeId || commonOperationalData.employeeId || '',
          admissionDate: member.admissionDate || commonOperationalData.admissionDate || '',
          shift: member.shift || commonOperationalData.shift || '',
          workDays: member.workDays || commonOperationalData.workDays || [],
          emergencyContact: member.emergencyContact || commonOperationalData.emergencyContact || '',
          observations: member.observations || commonOperationalData.observations || '',
          mustChangePassword: member.mustChangePassword ?? false,
          role: cleanRole,
          status: memberStatus,
          active: memberStatus === 'ACTIVE',
          data_criacao: member.createdAt || member.data_criacao || '',
          permissions: member.permissions || [],
          operationalConfig
        };
      });

      // Apply filters
      if (roleFilter !== 'ALL') {
        normalizedTeam = normalizedTeam.filter(m => m.role === roleFilter);
      }

      if (statusFilter !== 'ALL') {
        normalizedTeam = normalizedTeam.filter(m => m.status === statusFilter);
      }

      if (search) {
        normalizedTeam = normalizedTeam.filter(m => 
          (m.nome || '').toLowerCase().includes(search) ||
          (m.displayName || '').toLowerCase().includes(search) ||
          (m.email || '').toLowerCase().includes(search) ||
          (m.phone || '').includes(search)
        );
      }

      // Cursor-based pagination
      let startIndex = 0;
      if (cursor) {
        const cursorIdx = normalizedTeam.findIndex(m => m.id === cursor);
        if (cursorIdx !== -1) {
          startIndex = cursorIdx + 1;
        }
      }

      const paginatedTeam = normalizedTeam.slice(startIndex, startIndex + pageSize);
      const hasMore = startIndex + pageSize < normalizedTeam.length;
      const nextCursor = paginatedTeam.length > 0 ? paginatedTeam[paginatedTeam.length - 1].id : null;

      res.json({
        success: true,
        team: paginatedTeam,
        hasMore,
        nextCursor,
        pageSize,
        totalLoaded: paginatedTeam.length,
        totalCount: normalizedTeam.length
      });
    } catch (error: any) {
      console.error('Error fetching team members:', error);
      res.status(500).json({ error: 'Erro ao carregar membros da equipe.' });
    }
  });

  // GET: Permissions Audit Report for Restaurant Team
  router.get('/permissions-audit', verifyRestaurant, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    if (!['OWNER', 'RESTAURANT', 'RESTAURANTE', 'RESTAURANT_ADMIN'].includes(opRole)) {
      return res.status(403).json({ error: 'Acesso restrito a administradores do restaurante.' });
    }

    try {
      const snap = await db.collection('users').where('restaurantId', '==', restaurantId).get();
      const auditResults: any[] = [];
      let totalUsers = 0;
      let compliantCount = 0;
      let reviewRequiredCount = 0;

      snap.forEach(doc => {
        totalUsers++;
        const data = doc.data();
        const role = (data.role || 'WAITER').toUpperCase();
        const rawPerms = data.permissions;

        const val = validatePermissionsForRole(role, rawPerms);
        const isLegacyObject = rawPerms && !Array.isArray(rawPerms) && typeof rawPerms === 'object';
        const hasUnknown = val.unknownPermissions.length > 0;
        const hasRejected = val.rejectedPermissions.length > 0;
        const needsReview = hasUnknown || hasRejected || isLegacyObject;

        if (needsReview) {
          reviewRequiredCount++;
        } else {
          compliantCount++;
        }

        auditResults.push({
          userId: doc.id,
          name: data.name || data.nome || 'Sem Nome',
          email: data.email || '',
          role,
          needsReview,
          isLegacyFormat: isLegacyObject,
          currentPermissionsCount: Array.isArray(rawPerms) ? rawPerms.length : Object.keys(rawPerms || {}).length,
          canonicalPermissionsCount: val.validPermissions.length,
          unknownPermissions: val.unknownPermissions,
          rejectedPermissions: val.rejectedPermissions,
          addedDependencies: val.addedDependencies
        });
      });

      res.json({
        success: true,
        restaurantId,
        totalUsers,
        compliantCount,
        reviewRequiredCount,
        auditDate: new Date().toISOString(),
        users: auditResults
      });
    } catch (error: any) {
      console.error('Error auditing permissions:', error);
      res.status(500).json({ error: 'Erro ao auditar permissões da equipe.' });
    }
  });

  // POST: Create a new team member
  router.post('/', verifyRestaurant, async (req: any, res: any) => {
    const { 
      name, nome, displayName, email, password, role, status, phone, telefone, permissions,
      photoUrl, jobTitle, employeeId, admissionDate, shift, workDays, emergencyContact, observations, mustChangePassword
    } = req.body;

    const restaurantId = req.user.restaurantId;
    const operatorId = req.user.uid;

    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
    const tRole = (role || '').toUpperCase();
    
    // Explicitly block client / customer / platform_admin roles from being registered as internal team members
    const FORBIDDEN_TEAM_ROLES = ['CLIENT', 'CLIENTE', 'CUSTOMER', 'PLATFORM_ADMIN'];
    const ALLOWED_INTERNAL_ROLES = ['OWNER', 'RESTAURANT', 'RESTAURANTE', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'DRIVER', 'CASHIER', 'KITCHEN'];

    if (FORBIDDEN_TEAM_ROLES.includes(tRole) || !ALLOWED_INTERNAL_ROLES.includes(tRole)) {
      return res.status(400).json({ error: 'Não é permitido cadastrar perfil de cliente ou administrador de plataforma como membro interno da equipe.' });
    }

    let canCreate = false;
    if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canCreate = true;
    else if (opRole === 'RESTAURANT_ADMIN') {
      if (tRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode criar OWNER.' });
      canCreate = true;
    } else if (opRole === 'MANAGER') {
      if (tRole === 'OWNER' || tRole === 'RESTAURANT_ADMIN') return res.status(403).json({ error: 'MANAGER não pode criar OWNER ou RESTAURANT_ADMIN.' });
      canCreate = true;
    }

    if (!canCreate) {
      return res.status(403).json({ error: 'Apenas administradores podem gerenciar a equipe.' });
    }

    const memberName = name || nome;
    const memberPhone = phone || telefone || '';

    if (!memberName || !email || !password || !role) {
      return res.status(400).json({ error: 'Nome, e-mail, senha e perfil são obrigatórios.' });
    }

    try {
      try {
        await authAdmin.getUserByEmail(email);
        return res.status(409).json({ error: 'Este e-mail já está em uso por outro usuário.' });
      } catch (authErr: any) {
        if (authErr.code !== 'auth/user-not-found') throw authErr;
      }

      const memberStatus = status || 'ACTIVE';
      const userRecord = await authAdmin.createUser({
        email,
        password,
        displayName: displayName || memberName,
        disabled: memberStatus !== 'ACTIVE'
      });

      const userId = userRecord.uid;

      // Wrap all post-Auth-creation steps in an inner try/catch block to guarantee clean rollback
      try {
        const nowIso = new Date().toISOString();
        const legacyTipo = tRole === 'RESTAURANT_ADMIN' ? 'restaurant_admin' : (tRole === 'MANAGER' ? 'manager' : (tRole === 'WAITER' ? 'waiter' : (tRole === 'DRIVER' ? 'delivery_driver' : tRole.toLowerCase())));

        // Extract and validate operational details
        const commonOperationalData = extractServerCommonData(req.body);
        const roleSpecificData = extractServerRoleSpecificData(tRole, req.body);
        
        // Enforce secondary OWNER protection: primaryOwner MUST always be false for created team members
        if (tRole === 'OWNER') {
          roleSpecificData.primaryOwner = false;
        }

        const completeness = checkServerProfileCompleteness(tRole, { roleSpecificData, commonOperationalData });

        if (permissions !== undefined && permissions !== null && !Array.isArray(permissions)) {
          throw new Error('O formato das permissões enviadas é inválido. Deve ser uma lista de permissões.');
        }

        const rawPermsInput = Array.isArray(permissions) && permissions.length > 0 ? permissions : getDefaultPermissionsForRole(tRole);
        const permValidation = validatePermissionsForRole(tRole, rawPermsInput);
        const validatedPermissions = permValidation.validPermissions;

        // Keep user doc completely lean and canonical
        const userDocData: any = {
          uid: userId,
          name: memberName,
          nome: memberName,
          displayName: displayName || memberName,
          email,
          phone: memberPhone,
          telefone: memberPhone,
          photoUrl: photoUrl || '',
          jobTitle: jobTitle || '',
          employeeId: employeeId || '',
          admissionDate: admissionDate || '',
          shift: shift || '',
          workDays: workDays || [],
          emergencyContact: emergencyContact || '',
          observations: observations || '',
          mustChangePassword: mustChangePassword ?? true,
          accountType: 'RESTAURANT',
          role: tRole,
          tipo_usuario: legacyTipo,
          restaurantId,
          permissions: validatedPermissions,
          status: memberStatus,
          active: memberStatus === 'ACTIVE',
          schemaVersion: '1.0',
          createdAt: nowIso,
          data_criacao: nowIso,
          updatedAt: nowIso,
          createdBy: operatorId
        };

        if (roleSpecificData.pinCode) userDocData.pinCode = roleSpecificData.pinCode;
        if (roleSpecificData.cpf) userDocData.cpf = roleSpecificData.cpf;
        if (roleSpecificData.vehiclePlate) userDocData.vehiclePlate = roleSpecificData.vehiclePlate;

        // Create rich operational profile document
        const staffProfileData: any = {
          uid: userId,
          restaurantId,
          role: tRole,
          operationalStatus: memberStatus === 'ACTIVE' ? 'AVAILABLE' : 'INACTIVE',
          profileComplete: completeness.profileComplete,
          profileVersion: '1.0',
          commonOperationalData,
          roleSpecificData,
          roleHistory: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: operatorId
        };

        const batch = db.batch();
        batch.set(db.collection('users').doc(userId), userDocData);
        batch.set(db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(userId), staffProfileData);
        
        batch.set(db.collection('audit_logs').doc(), {
          action: 'TEAM_MEMBER_CREATED',
          restaurantId,
          operatorId,
          targetUserId: userId,
          targetRole: tRole,
          createdAt: nowIso
        });

        await batch.commit();
        return res.status(201).json({ success: true, userId, member: userDocData });
      } catch (innerErr: any) {
        console.error(`[ROLLBACK EQUIPA] Erro após criação no Auth para UID ${userId}:`, innerErr);
        // Rollback: delete newly created Auth user and any partial Firestore documents
        await authAdmin.deleteUser(userId).catch((aErr: any) => console.error('[ROLLBACK EQUIPA] Erro ao deletar usuário do Auth:', aErr));
        await db.collection('users').doc(userId).delete().catch(() => {});
        await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(userId).delete().catch(() => {});
        return res.status(400).json({ error: innerErr.message || 'Erro de validação ou persistência ao criar membro da equipe. A criação de conta foi revertida.' });
      }
    } catch (error: any) {
      console.error('Error creating team member:', error);
      res.status(500).json({ error: 'Erro ao cadastrar membro da equipe.' });
    }
  });

  // POST: Migrate/Normalize Team Member Permissions
  router.post('/permissions-migrate', verifyRestaurant, adminOpLimiter, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
    const { userIds, dryRun = false } = req.body;

    if (!['OWNER', 'RESTAURANT', 'RESTAURANTE', 'RESTAURANT_ADMIN'].includes(opRole)) {
      return res.status(403).json({ error: 'Acesso restrito a administradores do restaurante.' });
    }

    try {
      const snap = await db.collection('users').where('restaurantId', '==', restaurantId).get();
      const batch = db.batch();
      let migratedCount = 0;
      const logs: any[] = [];

      snap.forEach(doc => {
        if (userIds && Array.isArray(userIds) && !userIds.includes(doc.id)) {
          return;
        }

        const data = doc.data();
        const role = (data.role || 'WAITER').toUpperCase();
        const rawPerms = data.permissions;

        const val = validatePermissionsForRole(role, rawPerms);

        if (!dryRun) {
          batch.update(doc.ref, {
            permissions: val.validPermissions,
            updatedAt: new Date().toISOString()
          });
        }

        migratedCount++;
        logs.push({
          userId: doc.id,
          name: data.name || data.nome,
          role,
          oldPermissionsCount: Array.isArray(rawPerms) ? rawPerms.length : 0,
          newPermissionsCount: val.validPermissions.length,
          addedDependencies: val.addedDependencies
        });
      });

      if (!dryRun && migratedCount > 0) {
        batch.set(db.collection('audit_logs').doc(), {
          action: 'TEAM_PERMISSIONS_MIGRATED',
          restaurantId,
          operatorId: req.user.uid,
          migratedUsersCount: migratedCount,
          createdAt: new Date().toISOString()
        });
        await batch.commit();
      }

      res.json({
        success: true,
        dryRun,
        migratedCount,
        logs
      });
    } catch (error: any) {
      console.error('Error migrating permissions:', error);
      res.status(500).json({ error: 'Erro ao migrar permissões.' });
    }
  });

  // POST: Audit & Sanitize restaurant team and profiles
  router.post('/audit-sanitize', verifyRestaurant, adminOpLimiter, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const operatorId = req.user.uid;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
    const nowIso = new Date().toISOString();

    if (opRole !== 'OWNER' && opRole !== 'RESTAURANT_ADMIN') {
      return res.status(403).json({ error: 'Apenas proprietários ou administradores de restaurante podem auditar dados.' });
    }

    try {
      // 1. Fetch current users, staffProfiles, and legacy collections (waiters, drivers)
      const usersSnap = await db.collection('users').where('restaurantId', '==', restaurantId).get();
      const usersList: any[] = [];
      usersSnap.forEach(snap => {
        usersList.push({ id: snap.id, ...snap.data() });
      });

      const staffProfilesSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').get();
      const staffProfilesList: any[] = [];
      const profilesMap = new Map<string, any>();
      staffProfilesSnap.forEach(snap => {
        const data = snap.data();
        staffProfilesList.push({ id: snap.id, ...data });
        profilesMap.set(snap.id, data);
      });

      const report = {
        totalUsersAnalyzed: usersList.length,
        totalNormalized: 0,
        duplicates: [] as string[],
        incompatibles: [] as string[],
        orphans: [] as string[]
      };

      const batch = db.batch();
      let hasWrites = false;

      const cpfsSeen = new Set<string>();

      // 2. Map and match each user doc to their staffProfile configuration
      for (const u of usersList) {
        const role = (u.role || '').toUpperCase();

        if (role === 'CLIENT' || role === 'PLATFORM_ADMIN') {
          continue; // Skip restricted non-team roles
        }

        // Gather and merge legacy data if applicable
        const legacyWaiterRef = db.collection('restaurants').doc(restaurantId).collection('waiters').doc(u.id);
        const legacyWaiterDoc = await legacyWaiterRef.get();
        const legacyDriverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(u.id);
        const legacyDriverDoc = await legacyDriverRef.get();

        const mergedData = {
          ...u,
          ...(legacyWaiterDoc.exists ? legacyWaiterDoc.data() : {}),
          ...(legacyDriverDoc.exists ? legacyDriverDoc.data() : {})
        };

        const commonOperationalData = extractServerCommonData(mergedData);
        const roleSpecificData = extractServerRoleSpecificData(role, mergedData);

        // Check CPF duplicates for drivers
        if (role === 'DRIVER' && roleSpecificData.cpf) {
          const cpfClean = String(roleSpecificData.cpf).replace(/\D/g, '');
          if (cpfClean) {
            if (cpfsSeen.has(cpfClean)) {
              report.duplicates.push(`CPF duplicado detectado: ${roleSpecificData.cpf} no entregador ${u.name || u.id}.`);
            } else {
              cpfsSeen.add(cpfClean);
            }
          }
        }

        const completeness = checkServerProfileCompleteness(role, { roleSpecificData, commonOperationalData });
        if (!completeness.profileComplete) {
          report.incompatibles.push(`Perfil de ${u.name || u.nome || u.id} (${role}) está incompleto: ${completeness.reasons.join('; ')}`);
        }

        // Check if staff profile already exists
        const existingProfile = profilesMap.get(u.id);
        const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(u.id);

        if (!existingProfile) {
          // Sync new staff profile
          const staffProfileData: any = {
            uid: u.id,
            restaurantId,
            role,
            operationalStatus: u.status === 'ACTIVE' || u.active !== false ? 'AVAILABLE' : 'INACTIVE',
            profileComplete: completeness.profileComplete,
            profileVersion: '1.0',
            commonOperationalData,
            roleSpecificData,
            roleHistory: [],
            createdAt: u.createdAt || u.data_criacao || nowIso,
            updatedAt: nowIso,
            createdBy: u.createdBy || operatorId
          };
          batch.set(staffProfileRef, staffProfileData);
          hasWrites = true;
        }

        // Clean up canonical user document (no extensive operational data)
        const userRef = db.collection('users').doc(u.id);
        const cleanedUserDoc: any = {
          uid: u.id,
          name: u.name || u.nome || '',
          nome: u.nome || u.name || '',
          displayName: u.displayName || u.name || u.nome || '',
          email: u.email || '',
          phone: u.phone || u.telefone || '',
          telefone: u.telefone || u.phone || '',
          photoUrl: u.photoUrl || u.photoURL || '',
          photoURL: u.photoURL || u.photoUrl || '',
          jobTitle: u.jobTitle || commonOperationalData.jobTitle || '',
          employeeId: u.employeeId || u.internalCode || '',
          internalCode: u.internalCode || u.employeeId || '',
          admissionDate: u.admissionDate || commonOperationalData.admissionDate || '',
          shift: u.shift || commonOperationalData.shift || '',
          workDays: u.workDays || commonOperationalData.workDays || [],
          emergencyContact: u.emergencyContact || commonOperationalData.emergencyContact || '',
          observations: u.observations || commonOperationalData.observations || '',
          mustChangePassword: u.mustChangePassword ?? false,
          requirePasswordChange: u.mustChangePassword ?? false,
          accountType: 'RESTAURANT',
          role,
          tipo_usuario: u.tipo_usuario || role.toLowerCase(),
          restaurantId,
          permissions: u.permissions || [],
          status: u.status || (u.active !== false ? 'ACTIVE' : 'INACTIVE'),
          active: u.status === 'ACTIVE' || (u.active !== false && u.status !== 'INACTIVE'),
          schemaVersion: '1.0',
          createdAt: u.createdAt || u.data_criacao || nowIso,
          updatedAt: nowIso,
          updatedBy: operatorId
        };

        // Remove any extensive configs inside users/{id}
        batch.set(userRef, cleanedUserDoc);
        hasWrites = true;
        report.totalNormalized++;
      }

      // 3. Scan legacy collections to detect orphans
      const waitersSnap = await db.collection('restaurants').doc(restaurantId).collection('waiters').get();
      waitersSnap.forEach(wSnap => {
        if (!usersList.some(x => x.id === wSnap.id)) {
          report.orphans.push(`Registro órfão na antiga coleção 'waiters': ${wSnap.data().name || wSnap.id} (ID: ${wSnap.id})`);
        }
      });

      const driversSnap = await db.collection('restaurants').doc(restaurantId).collection('drivers').get();
      driversSnap.forEach(dSnap => {
        if (!usersList.some(x => x.id === dSnap.id)) {
          report.orphans.push(`Registro órfão na antiga coleção 'drivers': ${dSnap.data().name || dSnap.id} (ID: ${dSnap.id})`);
        }
      });

      if (hasWrites) {
        await batch.commit();
      }

      res.json({ success: true, report });
    } catch (error: any) {
      console.error('Audit and sanitize error:', error);
      res.status(500).json({ error: 'Erro durante a auditoria e saneamento dos dados.' });
    }
  });

  // POST: Migration Engine with dry-run, backup, migrate, validate, rollback modes
  router.post('/migration-engine', verifyRestaurant, adminOpLimiter, async (req: any, res: any) => {
    const { mode, backupId } = req.body;
    const restaurantId = req.user.restaurantId;
    const operatorId = req.user.uid;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();
    const nowIso = new Date().toISOString();

    if (opRole !== 'OWNER' && opRole !== 'RESTAURANT_ADMIN') {
      return res.status(403).json({ error: 'Apenas proprietários ou administradores podem gerenciar migrações.' });
    }

    try {
      // 1. Fetch current users, staffProfiles, and legacy collections (waiters, drivers)
      const usersSnap = await db.collection('users').where('restaurantId', '==', restaurantId).get();
      const users: any[] = [];
      usersSnap.forEach(snap => {
        users.push({ id: snap.id, ...snap.data() });
      });

      const staffProfilesSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').get();
      const staffProfiles: any[] = [];
      staffProfilesSnap.forEach(snap => {
        staffProfiles.push({ id: snap.id, ...snap.data() });
      });

      const waitersSnap = await db.collection('restaurants').doc(restaurantId).collection('waiters').get();
      const waiters: any[] = [];
      waitersSnap.forEach(snap => {
        waiters.push({ id: snap.id, ...snap.data() });
      });

      const driversSnap = await db.collection('restaurants').doc(restaurantId).collection('drivers').get();
      const drivers: any[] = [];
      driversSnap.forEach(snap => {
        drivers.push({ id: snap.id, ...snap.data() });
      });

      // ----------------- MODE: DRY-RUN -----------------
      if (mode === 'dry-run') {
        const report = {
          mode: 'dry-run',
          analyzedCount: users.length,
          readyToMigrateCount: 0,
          incompleteCount: 0,
          conflictsCount: 0,
          usersWithoutCanonical: [] as string[],
          orphansInLegacy: [] as string[],
          multipleProfiles: [] as string[],
          divergentRestaurants: [] as string[],
          divergentRoles: [] as string[],
          duplicateEmails: [] as string[],
          docsWithoutUid: [] as string[],
          docsWithoutRestaurant: [] as string[],
          incompatibleFields: [] as string[],
          criticalConflicts: [] as string[]
        };

        const emailsSeen = new Set<string>();
        const cpfsSeen = new Set<string>();

        // Check legacy waiters orphans
        for (const w of waiters) {
          if (!users.some(u => u.id === w.id)) {
            report.orphansInLegacy.push(`Garçom órfão em legacy: ${w.name || w.id} (ID: ${w.id})`);
          }
        }
        // Check legacy drivers orphans
        for (const d of drivers) {
          if (!users.some(u => u.id === d.id)) {
            report.orphansInLegacy.push(`Entregador órfão em legacy: ${d.name || d.id} (ID: ${d.id})`);
          }
        }

        for (const u of users) {
          const uRole = (u.role || '').toUpperCase();
          if (uRole === 'CLIENT' || uRole === 'PLATFORM_ADMIN') {
            report.criticalConflicts.push(`Usuário ${u.name || u.id} possui perfil restrito: ${uRole}`);
            report.conflictsCount++;
            continue;
          }

          if (!u.id) {
            report.docsWithoutUid.push(`Documento sem ID/UID encontrado na coleção users.`);
            report.conflictsCount++;
            continue;
          }

          if (!u.restaurantId) {
            report.docsWithoutRestaurant.push(`Usuário ${u.name || u.id} não possui restaurantId associado.`);
            report.conflictsCount++;
            continue;
          }

          if (u.restaurantId !== restaurantId) {
            report.divergentRestaurants.push(`Usuário ${u.name || u.id} possui restaurantId divergente (${u.restaurantId}).`);
            report.conflictsCount++;
            continue;
          }

          // Check duplicate email
          if (u.email) {
            const emailLower = u.email.toLowerCase();
            if (emailsSeen.has(emailLower)) {
              report.duplicateEmails.push(`E-mail duplicado: ${u.email} no usuário ${u.name || u.id}.`);
              report.conflictsCount++;
            } else {
              emailsSeen.add(emailLower);
            }
          }

          // Check if multiple profiles apply to same user (e.g. user exists in legacy waiters and drivers)
          const inWaiters = waiters.some(w => w.id === u.id);
          const inDrivers = drivers.some(d => d.id === u.id);
          if (inWaiters && inDrivers) {
            report.multipleProfiles.push(`Usuário ${u.name || u.id} possui múltiplos perfis operacionais ativos (Garçom e Entregador).`);
            report.criticalConflicts.push(`Múltiplos perfis para ${u.name || u.id} impedem migração direta.`);
            report.conflictsCount++;
            continue;
          }

          // Build operational data to analyze completeness
          const common = extractServerCommonData(u);
          const spec = extractServerRoleSpecificData(uRole, u);
          const completeness = checkServerProfileCompleteness(uRole, { ...common, ...spec });

          if (!completeness.profileComplete) {
            report.incompleteCount++;
            report.incompatibleFields.push(`${u.name || u.id} (${uRole}): ${completeness.reasons.join('; ')}`);
          } else {
            report.readyToMigrateCount++;
          }
        }

        return res.json({ success: true, report });
      }

      // ----------------- MODE: BACKUP -----------------
      if (mode === 'backup') {
        const idBackup = `backup_${Date.now()}`;
        const backupRef = db.collection('restaurants').doc(restaurantId).collection('migration_backups').doc(idBackup);

        await backupRef.set({
          backupId: idBackup,
          createdAt: nowIso,
          createdBy: operatorId,
          users,
          staffProfiles,
          waiters,
          drivers
        });

        return res.json({ success: true, backupId: idBackup, message: 'Backup concluído com sucesso.' });
      }

      // ----------------- MODE: MIGRATE -----------------
      if (mode === 'migrate') {
        // Automatically perform a backup first to be totally secure
        const idBackup = `auto_backup_${Date.now()}`;
        await db.collection('restaurants').doc(restaurantId).collection('migration_backups').doc(idBackup).set({
          backupId: idBackup,
          createdAt: nowIso,
          createdBy: operatorId,
          users,
          staffProfiles,
          waiters,
          drivers
        });

        const report = {
          migratedCount: 0,
          skippedCount: 0,
          conflicts: [] as string[]
        };

        const batch = db.batch();
        let hasWrites = false;

        const emailsSeen = new Set<string>();

        for (const u of users) {
          const uRole = (u.role || '').toUpperCase();

          // Skip restricted roles or invalid configurations
          if (uRole === 'CLIENT' || uRole === 'PLATFORM_ADMIN' || !u.id || !u.restaurantId || u.restaurantId !== restaurantId) {
            report.skippedCount++;
            report.conflicts.push(`Ignorado usuário ${u.name || u.id} (Papel: ${uRole}, Restaurante: ${u.restaurantId})`);
            continue;
          }

          // Duplicate checks in migration run
          if (u.email) {
            const emailLower = u.email.toLowerCase();
            if (emailsSeen.has(emailLower)) {
              report.skippedCount++;
              report.conflicts.push(`Ignorada duplicação de e-mail para ${u.email} no ID: ${u.id}`);
              continue;
            }
            emailsSeen.add(emailLower);
          }

          const inWaiters = waiters.some(w => w.id === u.id);
          const inDrivers = drivers.some(d => d.id === u.id);
          if (inWaiters && inDrivers) {
            report.skippedCount++;
            report.conflicts.push(`Conflito: múltiplos perfis legados para usuário ${u.name || u.id}.`);
            continue;
          }

          // Extract and compile operational profiles
          let legacyData: any = {};
          if (uRole === 'WAITER') {
            legacyData = waiters.find(w => w.id === u.id) || {};
          } else if (uRole === 'DRIVER') {
            legacyData = drivers.find(d => d.id === u.id) || {};
          }

          const merged = { ...u, ...legacyData };
          const commonOperationalData = extractServerCommonData(merged);
          const roleSpecificData = extractServerRoleSpecificData(uRole, merged);
          const completeness = checkServerProfileCompleteness(uRole, { roleSpecificData, commonOperationalData });

          const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(u.id);
          const staffProfileData: any = {
            uid: u.id,
            restaurantId,
            role: uRole,
            operationalStatus: u.status === 'ACTIVE' || u.active !== false ? 'AVAILABLE' : 'INACTIVE',
            profileComplete: completeness.profileComplete,
            profileVersion: '1.0',
            commonOperationalData,
            roleSpecificData,
            roleHistory: [],
            sourceCollection: legacyData.id ? (uRole === 'WAITER' ? 'waiters' : 'drivers') : 'users',
            sourceDocument: legacyData.id || u.id,
            migrationVersion: '1.0',
            migratedAt: nowIso,
            createdAt: u.createdAt || u.data_criacao || nowIso,
            updatedAt: nowIso,
            createdBy: u.createdBy || operatorId
          };

          batch.set(staffProfileRef, staffProfileData, { merge: true });

          // Lean user document
          const userRef = db.collection('users').doc(u.id);
          const cleanedUser: any = {
            uid: u.id,
            name: u.name || u.nome || '',
            nome: u.nome || u.name || '',
            displayName: u.displayName || u.name || u.nome || '',
            email: u.email || '',
            phone: u.phone || u.telefone || '',
            telefone: u.telefone || u.phone || '',
            photoUrl: u.photoUrl || u.photoURL || '',
            photoURL: u.photoURL || u.photoUrl || '',
            mustChangePassword: u.mustChangePassword ?? false,
            requirePasswordChange: u.mustChangePassword ?? false,
            accountType: 'RESTAURANT',
            role: uRole,
            tipo_usuario: u.tipo_usuario || uRole.toLowerCase(),
            restaurantId,
            permissions: u.permissions || [],
            status: u.status || (u.active !== false ? 'ACTIVE' : 'INACTIVE'),
            active: u.status === 'ACTIVE' || (u.active !== false && u.status !== 'INACTIVE'),
            schemaVersion: '1.0',
            migratedAt: nowIso,
            createdAt: u.createdAt || u.data_criacao || nowIso,
            updatedAt: nowIso,
            updatedBy: operatorId
          };

          batch.set(userRef, cleanedUser);
          hasWrites = true;
          report.migratedCount++;
        }

        if (hasWrites) {
          batch.set(db.collection('audit_logs').doc(), {
            action: 'TEAM_MIGRATION_EXECUTED',
            restaurantId,
            operatorId,
            backupId: idBackup,
            createdAt: nowIso
          });
          await batch.commit();
        }

        return res.json({ success: true, autoBackupId: idBackup, report });
      }

      // ----------------- MODE: VALIDATE -----------------
      if (mode === 'validate') {
        const report = {
          totalUsers: users.length,
          totalProfiles: staffProfiles.length,
          matchingUidsCount: 0,
          matchingRestaurantsCount: 0,
          compatibleRolesCount: 0,
          zeroOrphans: true,
          zeroDuplicates: true,
          profileCompletenessRate: 0,
          validationPassed: true,
          errors: [] as string[]
        };

        const uidsInUsers = new Set(users.map(u => u.id));
        let completeCount = 0;

        for (const p of staffProfiles) {
          if (!uidsInUsers.has(p.uid)) {
            report.errors.push(`Perfil órfão detectado em staffProfiles: ID ${p.uid}`);
            report.zeroOrphans = false;
          } else {
            report.matchingUidsCount++;
          }

          if (p.restaurantId !== restaurantId) {
            report.errors.push(`Perfil ${p.uid} possui restaurantId incorreto.`);
          } else {
            report.matchingRestaurantsCount++;
          }

          const correlatedUser = users.find(u => u.id === p.uid);
          if (correlatedUser) {
            if ((correlatedUser.role || '').toUpperCase() !== (p.role || '').toUpperCase()) {
              report.errors.push(`Divergência de cargo para ID ${p.uid}: Usuário é ${correlatedUser.role}, Perfil é ${p.role}`);
            } else {
              report.compatibleRolesCount++;
            }
          }

          if (p.profileComplete) {
            completeCount++;
          }
        }

        report.profileCompletenessRate = staffProfiles.length > 0 ? (completeCount / staffProfiles.length) * 100 : 100;
        report.validationPassed = report.errors.length === 0;

        return res.json({ success: true, report });
      }

      // ----------------- MODE: ROLLBACK -----------------
      if (mode === 'rollback') {
        const bId = backupId;
        if (!bId) {
          return res.status(400).json({ error: 'Parâmetro backupId é obrigatório para rollback.' });
        }

        const backupDoc = await db.collection('restaurants').doc(restaurantId).collection('migration_backups').doc(bId).get();
        if (!backupDoc.exists) {
          return res.status(404).json({ error: `Backup ${bId} não encontrado.` });
        }

        const backupData = backupDoc.data()!;
        const bUsers = backupData.users || [];
        const bStaffProfiles = backupData.staffProfiles || [];
        const bWaiters = backupData.waiters || [];
        const bDrivers = backupData.drivers || [];

        const batch = db.batch();

        // 1. Restore users
        for (const u of bUsers) {
          batch.set(db.collection('users').doc(u.id), u);
        }

        // 2. Delete existing staffProfiles and restore original ones
        for (const p of staffProfiles) {
          batch.delete(db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(p.uid));
        }
        for (const p of bStaffProfiles) {
          batch.set(db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(p.uid), p);
        }

        // 3. Restore legacy waiters/drivers if any were modified or removed
        for (const w of bWaiters) {
          batch.set(db.collection('restaurants').doc(restaurantId).collection('waiters').doc(w.id), w);
        }
        for (const d of bDrivers) {
          batch.set(db.collection('restaurants').doc(restaurantId).collection('drivers').doc(d.id), d);
        }

        batch.set(db.collection('audit_logs').doc(), {
          action: 'TEAM_MIGRATION_ROLLED_BACK',
          restaurantId,
          operatorId,
          backupId: bId,
          createdAt: nowIso
        });

        await batch.commit();

        return res.json({ success: true, message: `Rollback executado com sucesso a partir do backup ${bId}.` });
      }

      return res.status(400).json({ error: 'Modo inválido.' });
    } catch (err: any) {
      console.error('Migration-engine error:', err);
      return res.status(500).json({ error: 'Erro interno no motor de migração.' });
    }
  });

  // POST: Reset password
  router.post('/:id/reset-password', verifyRestaurant, passwordResetLimiter, async (req: any, res: any) => {
    const { id } = req.params;
    const { password } = req.body;
    const restaurantId = req.user.restaurantId;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      if (userSnap.data()!.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });
      
      const currentRole = (userSnap.data()!.role || '').toUpperCase();
      let canEdit = false;
      if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canEdit = true;
      else if (opRole === 'RESTAURANT_ADMIN') {
        if (currentRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode alterar OWNER.' });
        canEdit = true;
      }
      if (!canEdit) return res.status(403).json({ error: 'Apenas administradores podem redefinir senha.' });

      if (!password || password.length < 6) return res.status(400).json({ error: 'Mínimo de 6 caracteres.' });

      await authAdmin.updateUser(id, { password });

      await db.collection('audit_logs').add({
        action: 'TEAM_MEMBER_PASSWORD_UPDATED',
        restaurantId,
        operatorId: req.user.uid,
        targetUserId: id,
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao redefinir senha.' });
    }
  });

  // PUT: Full update for team member
  router.put('/:id', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { 
      name, nome, displayName, phone, telefone, email, role, status, permissions,
      photoUrl, jobTitle, employeeId, admissionDate, shift, workDays, emergencyContact, observations, mustChangePassword
    } = req.body;

    const restaurantId = req.user.restaurantId;
    const operatorId = req.user.uid;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      const userData = userSnap.data()!;
      if (userData.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });

      const currentRole = (userData.role || '').toUpperCase();
      const tRole = (role || currentRole).toUpperCase();

      let canEdit = false;
      if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canEdit = true;
      else if (opRole === 'RESTAURANT_ADMIN') {
        if (currentRole === 'OWNER' || tRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode gerenciar OWNER.' });
        canEdit = true;
      } else if (opRole === 'MANAGER') {
        if (currentRole === 'OWNER' || currentRole === 'RESTAURANT_ADMIN' || tRole === 'OWNER' || tRole === 'RESTAURANT_ADMIN') {
          return res.status(403).json({ error: 'MANAGER não pode gerenciar OWNER ou RESTAURANT_ADMIN.' });
        }
        canEdit = true;
      }

      if (!canEdit) return res.status(403).json({ error: 'Sem permissão para editar este membro.' });

      const memberName = name || nome || userData.name || userData.nome;
      const memberPhone = phone || telefone || userData.phone || userData.telefone;
      const memberStatus = status || userData.status || 'ACTIVE';

      // Auth update if displayName changed
      if (displayName && displayName !== userData.displayName) {
        try {
          await authAdmin.updateUser(id, { displayName });
        } catch (authErr) {
          console.warn('Auth displayName update warning:', authErr);
        }
      }

      if (status && status !== userData.status) {
        try {
          await authAdmin.updateUser(id, { disabled: memberStatus !== 'ACTIVE' });
        } catch (authErr) {
          console.warn('Auth disabled status update warning:', authErr);
        }
      }

      const nowIso = new Date().toISOString();
      const legacyTipo = tRole === 'RESTAURANT_ADMIN' ? 'restaurant_admin' : (tRole === 'MANAGER' ? 'manager' : (tRole === 'WAITER' ? 'waiter' : (tRole === 'DRIVER' ? 'delivery_driver' : tRole.toLowerCase())));

      // Maintain Role History & Operational Data
      const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(id);
      const staffProfileSnap = await staffProfileRef.get();
      
      let existingProfile: any = null;
      let history: any[] = [];
      if (staffProfileSnap.exists) {
        existingProfile = staffProfileSnap.data();
        history = existingProfile.roleHistory || [];
      }

      // Check if role changed to archive the previous operational configurations
      if (existingProfile && existingProfile.role !== tRole) {
        history.push({
          role: existingProfile.role,
          roleSpecificData: existingProfile.roleSpecificData,
          commonOperationalData: existingProfile.commonOperationalData,
          endedAt: nowIso,
          changedBy: operatorId,
          reason: `Alteração de perfil operacional de ${existingProfile.role} para ${tRole}`
        });
      }

      const commonOperationalData = {
        ...(existingProfile?.commonOperationalData || {}),
        ...extractServerCommonData(req.body)
      };

      const newSpecific = extractServerRoleSpecificData(tRole, req.body);
      const roleSpecificData = {
        ...(existingProfile?.roleSpecificData || {}),
        ...newSpecific
      };

      const completeness = checkServerProfileCompleteness(tRole, { roleSpecificData, commonOperationalData });

      const rawPermsInput = permissions || userData.permissions || getDefaultPermissionsForRole(tRole);
      const permValidation = validatePermissionsForRole(tRole, rawPermsInput);

      // Lean updates to user document
      const updates: any = {
        name: memberName,
        nome: memberName,
        displayName: displayName || memberName,
        phone: memberPhone,
        telefone: memberPhone,
        photoUrl: photoUrl ?? userData.photoUrl ?? '',
        jobTitle: jobTitle ?? userData.jobTitle ?? '',
        employeeId: employeeId ?? userData.employeeId ?? '',
        admissionDate: admissionDate ?? userData.admissionDate ?? '',
        shift: shift ?? userData.shift ?? '',
        workDays: workDays ?? userData.workDays ?? [],
        emergencyContact: emergencyContact ?? userData.emergencyContact ?? '',
        observations: observations ?? userData.observations ?? '',
        mustChangePassword: mustChangePassword ?? userData.mustChangePassword ?? false,
        role: tRole,
        tipo_usuario: legacyTipo,
        status: memberStatus,
        active: memberStatus === 'ACTIVE',
        permissions: permValidation.validPermissions,
        schemaVersion: '1.0',
        updatedAt: nowIso
      };

      if (roleSpecificData.pinCode) updates.pinCode = roleSpecificData.pinCode;
      if (roleSpecificData.cpf) updates.cpf = roleSpecificData.cpf;
      if (roleSpecificData.vehiclePlate) updates.vehiclePlate = roleSpecificData.vehiclePlate;

      const staffProfileData: any = {
        uid: id,
        restaurantId,
        role: tRole,
        operationalStatus: memberStatus === 'ACTIVE' ? 'AVAILABLE' : 'INACTIVE',
        profileComplete: completeness.profileComplete,
        profileVersion: '1.0',
        commonOperationalData,
        roleSpecificData,
        roleHistory: history,
        createdAt: existingProfile?.createdAt || nowIso,
        updatedAt: nowIso,
        createdBy: existingProfile?.createdBy || operatorId,
        updatedBy: operatorId
      };

      const batch = db.batch();
      batch.update(userRef, updates);
      batch.set(staffProfileRef, staffProfileData, { merge: true });

      batch.set(db.collection('audit_logs').doc(), {
        action: 'TEAM_MEMBER_FULL_UPDATED',
        restaurantId,
        operatorId,
        targetUserId: id,
        targetRole: tRole,
        createdAt: nowIso
      });

      await batch.commit();

      res.json({ success: true, member: { uid: id, ...userData, ...updates } });
    } catch (error: any) {
      console.error('Error updating team member:', error);
      res.status(500).json({ error: error.message || 'Erro ao atualizar membro da equipe.' });
    }
  });

  // PUT: Update basic data
  router.put('/:id/basic', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { name, phone, email } = req.body;
    const restaurantId = req.user.restaurantId;

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      const userData = userSnap.data()!;
      if (userData.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });

      const authUpdates: any = {};
      if (email && email !== userData.email) authUpdates.email = email;
      if (name) authUpdates.displayName = name;

      if (Object.keys(authUpdates).length > 0) {
        try {
          await authAdmin.updateUser(id, authUpdates);
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-exists') {
             return res.status(409).json({ error: 'Este e-mail já está em uso.' });
          }
          console.warn('Auth update warning:', authErr);
        }
      }

      const updates: any = { updatedAt: new Date().toISOString() };
      if (name) { updates.name = name; updates.nome = name; }
      if (phone) { updates.phone = phone; updates.telefone = phone; }
      if (email) updates.email = email;

      const batch = db.batch();
      batch.update(userRef, updates);
      batch.set(db.collection('audit_logs').doc(), {
        action: 'TEAM_MEMBER_BASIC_UPDATED',
        restaurantId,
        operatorId: req.user.uid,
        targetUserId: id,
        createdAt: new Date().toISOString()
      });
      await batch.commit();

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao atualizar dados básicos.' });
    }
  });

  // PUT: Update role and permissions
  router.put('/:id/role', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { role, permissions } = req.body;
    const restaurantId = req.user.restaurantId;
    
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      const userData = userSnap.data()!;
      if (userData.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });
      
      const tRole = (role || userData.role || '').toUpperCase();
      const currentRole = (userData.role || '').toUpperCase();

      let canEdit = false;
      if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canEdit = true;
      else if (opRole === 'RESTAURANT_ADMIN') {
        if (currentRole === 'OWNER' || tRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode gerenciar OWNER.' });
        canEdit = true;
      } else if (opRole === 'MANAGER') {
        if (currentRole === 'OWNER' || currentRole === 'RESTAURANT_ADMIN' || tRole === 'OWNER' || tRole === 'RESTAURANT_ADMIN') {
           return res.status(403).json({ error: 'MANAGER não pode gerenciar OWNER ou RESTAURANT_ADMIN.' });
        }
        canEdit = true;
      }

      if (!canEdit) return res.status(403).json({ error: 'Sem permissão.' });

      const rawPermsInput = permissions || userData.permissions || getDefaultPermissionsForRole(tRole);
      const permValidation = validatePermissionsForRole(tRole, rawPermsInput);

      const legacyTipo = tRole === 'RESTAURANT_ADMIN' ? 'restaurant_admin' : (tRole === 'MANAGER' ? 'manager' : (tRole === 'WAITER' ? 'waiter' : (tRole === 'DRIVER' ? 'delivery_driver' : tRole.toLowerCase())));
      const updates: any = { 
        role: tRole, 
        tipo_usuario: legacyTipo,
        permissions: permValidation.validPermissions,
        updatedAt: new Date().toISOString() 
      };

      const batch = db.batch();
      batch.update(userRef, updates);
      batch.set(db.collection('audit_logs').doc(), {
        action: 'TEAM_MEMBER_ROLE_UPDATED',
        restaurantId,
        operatorId: req.user.uid,
        targetUserId: id,
        newRole: tRole,
        validPermissionsCount: permValidation.validPermissions.length,
        rejectedCount: permValidation.rejectedPermissions.length,
        createdAt: new Date().toISOString()
      });
      await batch.commit();

      res.json({ success: true, permissions: permValidation.validPermissions });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao alterar perfil.' });
    }
  });

  // PUT: Activate / Deactivate
  router.put('/:id/status', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user.restaurantId;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      const userData = userSnap.data()!;
      if (userData.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });
      
      const currentRole = (userData.role || '').toUpperCase();
      let canEdit = false;
      if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canEdit = true;
      else if (opRole === 'RESTAURANT_ADMIN') {
        if (currentRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode desativar OWNER.' });
        canEdit = true;
      } else if (opRole === 'MANAGER') {
        if (currentRole === 'OWNER' || currentRole === 'RESTAURANT_ADMIN') return res.status(403).json({ error: 'Sem permissão para desativar este perfil.' });
        canEdit = true;
      }
      if (!canEdit) return res.status(403).json({ error: 'Sem permissão.' });

      const isActive = status === 'ACTIVE';

      // Check if removing last owner
      if (!isActive && currentRole === 'OWNER') {
        const ownersSnap = await db.collection('users')
          .where('restaurantId', '==', restaurantId)
          .where('role', '==', 'OWNER')
          .where('status', '==', 'ACTIVE')
          .get();
        if (ownersSnap.size <= 1) {
          return res.status(400).json({ error: 'Não é possível desativar o último OWNER ativo do restaurante.' });
        }
      }

      await authAdmin.updateUser(id, { disabled: !isActive });

      const batch = db.batch();
      batch.update(userRef, { 
        status, 
        active: isActive, 
        updatedAt: new Date().toISOString() 
      });

      // Update staff profile if exists
      const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(id);
      const staffProfileSnap = await staffProfileRef.get();
      if (staffProfileSnap.exists) {
        batch.update(staffProfileRef, {
          operationalStatus: isActive ? 'AVAILABLE' : 'INACTIVE',
          updatedAt: new Date().toISOString()
        });
      }

      batch.set(db.collection('audit_logs').doc(), {
        action: 'TEAM_MEMBER_STATUS_UPDATED',
        restaurantId,
        operatorId: req.user.uid,
        targetUserId: id,
        newStatus: status,
        createdAt: new Date().toISOString()
      });
      await batch.commit();

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  });

  // DELETE: Secure delete
  router.delete('/:id', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const restaurantId = req.user.restaurantId;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    if (id === req.user.uid) {
      return res.status(400).json({ error: 'Você não pode excluir a si próprio.' });
    }

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      const userData = userSnap.data()!;
      if (userData.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });
      
      const currentRole = (userData.role || '').toUpperCase();
      let canEdit = false;
      if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canEdit = true;
      else if (opRole === 'RESTAURANT_ADMIN') {
        if (currentRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode excluir OWNER.' });
        canEdit = true;
      } else if (opRole === 'MANAGER') {
        if (currentRole === 'OWNER' || currentRole === 'RESTAURANT_ADMIN') return res.status(403).json({ error: 'Sem permissão.' });
        canEdit = true;
      }
      if (!canEdit) return res.status(403).json({ error: 'Sem permissão.' });

      // Check if removing last owner
      if (currentRole === 'OWNER') {
        const ownersSnap = await db.collection('users')
          .where('restaurantId', '==', restaurantId)
          .where('role', '==', 'OWNER')
          .get();
        if (ownersSnap.size <= 1) {
          return res.status(400).json({ error: 'Não é possível excluir o último OWNER do restaurante.' });
        }
      }

      // Secure Delete - Dependency check
      let hasDependencies = false;
      const dependencies = [];

      const ordersQuery = await db.collection('restaurants').doc(restaurantId).collection('orders')
        .where('waiterId', '==', id).limit(1).get();
      if (!ordersQuery.empty) dependencies.push('orders');

      const deliveriesQuery = await db.collection('restaurants').doc(restaurantId).collection('deliveries')
        .where('driverId', '==', id).limit(1).get();
      if (!deliveriesQuery.empty) dependencies.push('deliveries');

      if (dependencies.length > 0) {
        return res.status(409).json({ 
          error: 'O usuário possui registros operacionais vinculados e não pode ser excluído fisicamente.', 
          dependencies 
        });
      }

      // If no dependencies, proceed with physical deletion
      const batch = db.batch();
      batch.delete(userRef);
      // Legacy waiters collection cleanup just in case
      const waiterRef = db.collection('restaurants').doc(restaurantId).collection('waiters').doc(id);
      batch.delete(waiterRef);
      
      // Cleanup staffProfile
      const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(id);
      batch.delete(staffProfileRef);

      batch.set(db.collection('audit_logs').doc(), {
        action: 'TEAM_MEMBER_DELETED',
        restaurantId,
        operatorId: req.user.uid,
        targetUserId: id,
        createdAt: new Date().toISOString()
      });

      await authAdmin.deleteUser(id);
      await batch.commit();

      res.json({ success: true, message: 'Usuário excluído com sucesso.' });
    } catch (error: any) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
  });

  // POST: LGPD Anonymize
  router.post('/:id/anonymize', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const restaurantId = req.user.restaurantId;
    const opRole = (req.user.role || req.user.tipo_usuario || '').toUpperCase();

    if (id === req.user.uid) {
      return res.status(400).json({ error: 'Você não pode anonimizar a si próprio.' });
    }

    try {
      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: 'Membro não encontrado.' });
      const userData = userSnap.data()!;
      if (userData.restaurantId !== restaurantId) return res.status(403).json({ error: 'Acesso negado.' });

      const currentRole = (userData.role || '').toUpperCase();
      let canEdit = false;
      if (opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE') canEdit = true;
      else if (opRole === 'RESTAURANT_ADMIN') {
        if (currentRole === 'OWNER') return res.status(403).json({ error: 'RESTAURANT_ADMIN não pode anonimizar OWNER.' });
        canEdit = true;
      }
      if (!canEdit) return res.status(403).json({ error: 'Sem permissão.' });

      const nowIso = new Date().toISOString();
      const anonId = id.substring(0, 8);

      // 1. Update Firebase Auth user
      try {
        await authAdmin.updateUser(id, {
          disabled: true,
          displayName: 'Anonimizado',
          email: `anonimo_${anonId}@removido.local`
        });
      } catch (authErr) {
        console.warn('Auth anonymization warning:', authErr);
      }

      // 2. Anonymize user document in Firestore
      const batch = db.batch();
      batch.update(userRef, {
        name: 'Usuário Anonimizado',
        nome: 'Usuário Anonimizado',
        displayName: 'Anonimizado',
        email: `anonimo_${anonId}@removido.local`,
        phone: '00000000000',
        telefone: '00000000000',
        photoUrl: '',
        photoURL: '',
        status: 'INACTIVE',
        active: false,
        isAnonymized: true,
        anonymizedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: req.user.uid
      });

      // 3. Anonymize Staff Profile if exists
      const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(id);
      const staffProfileSnap = await staffProfileRef.get();
      if (staffProfileSnap.exists) {
        batch.update(staffProfileRef, {
          'commonOperationalData.employeeId': 'ANONIMIZADO',
          'commonOperationalData.internalCode': 'ANONIMIZADO',
          'commonOperationalData.jobTitle': 'ANONIMIZADO',
          'commonOperationalData.admissionDate': '',
          'commonOperationalData.shift': '',
          'commonOperationalData.workDays': [],
          'commonOperationalData.emergencyContact': 'REMOVIDO',
          'commonOperationalData.observations': 'Usuário anonimizado em conformidade com as regras LGPD.',
          'commonOperationalData.photoUrl': '',
          operationalStatus: 'INACTIVE',
          isAnonymized: true,
          anonymizedAt: nowIso,
          updatedAt: nowIso,
          updatedBy: req.user.uid
        });
      }

      batch.set(db.collection('audit_logs').doc(), {
        action: 'TEAM_MEMBER_ANONYMIZED',
        restaurantId,
        operatorId: req.user.uid,
        targetUserId: id,
        createdAt: nowIso
      });

      await batch.commit();
      res.json({ success: true, message: 'Usuário anonimizado com sucesso.' });
    } catch (error: any) {
      console.error('Anonymize user error:', error);
      res.status(500).json({ error: 'Erro ao anonimizar usuário.' });
    }
  });

  return router;
}
