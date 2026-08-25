import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let testEnv: RulesTestEnvironment;

const runFirestoreTests = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!runFirestoreTests)('Firestore Security Rules: Users & Team Management', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'qfomeai-test',
      firestore: {
        rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    
    // Seed initial users using Admin bypass
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // Restaurant 1
      await db.doc('users/rest1_owner').set({
        role: 'OWNER', accountType: 'RESTAURANT', restaurantId: 'rest1', name: 'Owner Rest1'
      });
      await db.doc('users/rest1_manager').set({
        role: 'MANAGER', accountType: 'RESTAURANT', restaurantId: 'rest1', name: 'Manager Rest1'
      });
      await db.doc('users/rest1_waiter').set({
        role: 'WAITER', accountType: 'RESTAURANT', restaurantId: 'rest1', name: 'Waiter Rest1'
      });
      
      // Restaurant 2
      await db.doc('users/rest2_owner').set({
        role: 'OWNER', accountType: 'RESTAURANT', restaurantId: 'rest2', name: 'Owner Rest2'
      });
      
      // Clients
      await db.doc('users/client1').set({
        role: 'CLIENT', accountType: 'CLIENT', name: 'Client 1'
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  // 1. usuário lê o próprio documento
  it('USER_READS_SELF: Authenticated user can read their own document', async () => {
    const db = testEnv.authenticatedContext('rest1_waiter').firestore();
    await assertSucceeds(db.doc('users/rest1_waiter').get());
  });

  // 2. OWNER lista equipe do próprio restaurante
  it('OWNER_LISTS_TEAM: OWNER can read users from their own restaurant', async () => {
    const db = testEnv.authenticatedContext('rest1_owner').firestore();
    await assertSucceeds(db.doc('users/rest1_manager').get());
  });

  // 3. usuário tenta ler equipe de outro restaurante
  it('USER_READS_OTHER_REST: User cannot read users from another restaurant', async () => {
    const db = testEnv.authenticatedContext('rest1_manager').firestore();
    await assertFails(db.doc('users/rest2_owner').get());
  });

  // 4. MANAGER tenta promover usuário para RESTAURANT_ADMIN
  it('MANAGER_PROMOTES_ADMIN: MANAGER cannot promote user to RESTAURANT_ADMIN via frontend', async () => {
    const db = testEnv.authenticatedContext('rest1_manager').firestore();
    // Cannot update protected fields
    await assertFails(db.doc('users/rest1_waiter').update({ role: 'RESTAURANT_ADMIN' }));
  });

  // 5. WAITER tenta editar equipe
  it('WAITER_EDITS_TEAM: WAITER cannot edit team members', async () => {
    const db = testEnv.authenticatedContext('rest1_waiter').firestore();
    await assertFails(db.doc('users/rest1_manager').update({ name: 'Hacked Manager' }));
  });

  // 6. usuário tenta trocar o próprio restaurantId
  it('USER_CHANGES_REST_ID: User cannot alter their own restaurantId', async () => {
    const db = testEnv.authenticatedContext('rest1_waiter').firestore();
    await assertFails(db.doc('users/rest1_waiter').update({ restaurantId: 'rest2' }));
  });

  // 7. usuário tenta se promover
  it('USER_SELF_PROMOTES: User cannot promote themselves', async () => {
    const db = testEnv.authenticatedContext('rest1_waiter').firestore();
    await assertFails(db.doc('users/rest1_waiter').update({ role: 'OWNER' }));
  });

  // 8. usuário tenta ativar a própria conta
  it('USER_ACTIVATES_SELF: User cannot activate their own account', async () => {
    const db = testEnv.authenticatedContext('rest1_waiter').firestore();
    await assertFails(db.doc('users/rest1_waiter').update({ status: 'ACTIVE', active: true }));
  });

  // 9. frontend tenta gravar campo protegido
  it('FRONTEND_WRITES_PROTECTED: Frontend cannot write protected fields directly', async () => {
    const db = testEnv.authenticatedContext('rest1_owner').firestore();
    // Even an owner cannot change role from frontend
    await assertFails(db.doc('users/rest1_manager').update({ role: 'OWNER' }));
  });

  // 10. backend autorizado mantém funcionamento
  it('BACKEND_OPERATES: Authorized backend operations succeed by bypassing rules', async () => {
    // We simulate backend Admin SDK by disabling security rules
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await assertSucceeds(db.doc('users/rest1_manager').update({ role: 'OWNER' }));
    });
  });

  // 11. CLIENT tenta acessar equipe
  it('CLIENT_READS_TEAM: CLIENT cannot read internal team users', async () => {
    const db = testEnv.authenticatedContext('client1').firestore();
    await assertFails(db.doc('users/rest1_owner').get());
  });

  // 12. auditoria não pode ser editada pelo frontend
  it('EDIT_AUDIT_LOGS: Frontend cannot edit audit logs', async () => {
    const db = testEnv.authenticatedContext('rest1_owner').firestore();
    await assertFails(db.doc('audit_logs/123').set({ action: 'DELETE' }));
    await assertFails(db.doc('audit_logs/123').update({ action: 'DELETE' }));
    await assertFails(db.doc('audit_logs/123').delete());
  });
});
