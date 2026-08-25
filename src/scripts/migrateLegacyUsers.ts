import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
} else {
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({
  credential,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'flutterflow-buscando-sheets'
});

const dbId = process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-62098aac-79bb-45ec-a026-48c52eebeb00';
const db = getFirestore(admin.app(), dbId);

const MODE = process.argv[2] || 'dry-run';
const REPORTS_DIR = path.join(process.cwd(), 'migration_reports');

// Mapping legacy types to Canonical Model
const MAPPING: Record<string, { role: string, accountType: string }> = {
  'restaurante': { role: 'OWNER', accountType: 'RESTAURANT' },
  'restaurant': { role: 'OWNER', accountType: 'RESTAURANT' },
  'proprietario': { role: 'OWNER', accountType: 'RESTAURANT' },
  'restaurant_admin': { role: 'RESTAURANT_ADMIN', accountType: 'RESTAURANT' },
  'admin_restaurante': { role: 'RESTAURANT_ADMIN', accountType: 'RESTAURANT' },
  'gerente': { role: 'MANAGER', accountType: 'RESTAURANT' },
  'manager': { role: 'MANAGER', accountType: 'RESTAURANT' },
  'garçom': { role: 'WAITER', accountType: 'RESTAURANT' },
  'garcom': { role: 'WAITER', accountType: 'RESTAURANT' },
  'waiter': { role: 'WAITER', accountType: 'RESTAURANT' },
  'entregador': { role: 'DRIVER', accountType: 'DRIVER' },
  'delivery_driver': { role: 'DRIVER', accountType: 'DRIVER' },
  'driver': { role: 'DRIVER', accountType: 'DRIVER' },
  'caixa': { role: 'CASHIER', accountType: 'RESTAURANT' },
  'cashier': { role: 'CASHIER', accountType: 'RESTAURANT' },
  'cozinha': { role: 'KITCHEN', accountType: 'RESTAURANT' },
  'kitchen': { role: 'KITCHEN', accountType: 'RESTAURANT' },
  'cliente': { role: 'CLIENT', accountType: 'CLIENT' },
  'client': { role: 'CLIENT', accountType: 'CLIENT' },
  'admin': { role: 'ADMIN', accountType: 'ADMIN' },
  'platform_admin': { role: 'ADMIN', accountType: 'ADMIN' }
};

async function run() {
  console.log(`Starting migration script in ${MODE.toUpperCase()} mode...`);
  
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR);
  }

  const usersSnap = await db.collection('users').get();
  
  const report = {
    totalUsersBefore: usersSnap.size,
    processed: 0,
    migrated: 0,
    ignored: 0,
    conflicts: [] as string[],
    pending: [] as string[],
    errors: [] as string[]
  };

  const batch = db.batch();
  let operationCount = 0;
  let batchCount = 0;
  const BATCH_SIZE = 400;

  const commitBatch = async () => {
    if (operationCount > 0) {
      if (MODE === 'migrate' || MODE === 'rollback') {
        await batch.commit();
        console.log(`Committed batch ${++batchCount}`);
      }
      operationCount = 0;
    }
  };

  // Maps for detecting duplicates
  const emails = new Map();
  const phones = new Map();

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    report.processed++;

    const uid = doc.id;
    const email = data.email || data.email_address;
    const phone = data.telefone || data.phone || data.phone_number;

    if (email && emails.has(email)) report.conflicts.push(`Duplicate email found: ${email} (UIDs: ${uid}, ${emails.get(email)})`);
    if (phone && phones.has(phone)) report.conflicts.push(`Duplicate phone found: ${phone} (UIDs: ${uid}, ${phones.get(phone)})`);
    
    if (email) emails.set(email, uid);
    if (phone) phones.set(phone, uid);

    if (MODE === 'rollback') {
      // Rollback to original if we saved the previous state
      if (data._migrationBackup) {
        // We restore original fields and delete canonical ones
        const restoreData: any = { ...data._migrationBackup };
        restoreData.role = FieldValue.delete();
        restoreData.accountType = FieldValue.delete();
        restoreData.permissions = FieldValue.delete();
        restoreData._migrationBackup = FieldValue.delete();
        restoreData._migratedAt = FieldValue.delete();
        restoreData._migrationVersion = FieldValue.delete();
        
        batch.update(doc.ref, restoreData);
        operationCount++;
      }
      continue;
    }

    if (data._migratedAt && data.role !== 'PLATFORM_ADMIN' && MODE === 'migrate') {
      report.ignored++;
      continue; // Already migrated
    }

    let legacyType = (data.tipo_usuario || data.role || 'cliente').toLowerCase();
    const mapped = MAPPING[legacyType];

    if (!mapped) {
      report.errors.push(`Unknown legacy type for UID ${uid}: ${legacyType}`);
      report.ignored++;
      continue;
    }

    // Determine restaurantId
    let restId = data.restaurantId || data.restaurante_id || data.restaurant_id;
    
    // Check conflicts (user in multiple restaurants?) - In this data structure we just have one field, 
    // but if it's an array or they exist in multiple places, we flag it. Here we just check if restId is an array.
    if (Array.isArray(restId)) {
      report.conflicts.push(`UID ${uid} has multiple restaurant IDs. Flagged as conflict.`);
      continue;
    }

    if (mapped.accountType === 'RESTAURANT' && mapped.role !== 'PLATFORM_ADMIN') {
      if (!restId) {
        report.pending.push(`Internal user UID ${uid} has no restaurantId.`);
      }
    }

    // Prepare migration payload
    const migrationBackup = {
      tipo_usuario: data.tipo_usuario || null,
      role: data.role || null,
      accountType: data.accountType || null
    };

    const updateData: any = {
      role: mapped.role,
      accountType: mapped.accountType,
      _migratedAt: new Date().toISOString(),
      _migrationVersion: '1.0.0',
      _migrationBackup: migrationBackup
    };

    if (restId) {
      updateData.restaurantId = restId;
    }

    // Standardize status
    if (!data.status) {
      updateData.status = data.active !== false ? 'ACTIVE' : 'INACTIVE';
    }

    // Convert legacy permissions to canonical (e.g. from boolean flags to array)
    // If they have legacy format like { pdv: true, dashboard: false }
    if (data.permissoes && typeof data.permissoes === 'object' && !Array.isArray(data.permissoes)) {
      const perms = [];
      for (const [k, v] of Object.entries(data.permissoes)) {
        if (v) perms.push(k.toUpperCase());
      }
      updateData.permissions = perms;
    } else if (!data.permissions) {
      updateData.permissions = [];
    }

    if (MODE === 'migrate') {
      batch.update(doc.ref, updateData);
      operationCount++;
      report.migrated++;

      if (operationCount >= BATCH_SIZE) {
        await commitBatch();
      }
    } else if (MODE === 'dry-run') {
      report.migrated++; // we count it as would-be migrated
    }
  }

  if (MODE === 'migrate' || MODE === 'rollback') {
    await commitBatch();
  }

  // VALIDATION MODE
  if (MODE === 'validate') {
    console.log('\n--- Running Validations ---');
    let errors = 0;
    
    const postUsersSnap = await db.collection('users').get();
    console.log(`Total users before: ${report.totalUsersBefore}, after: ${postUsersSnap.size}`);
    if (report.totalUsersBefore !== postUsersSnap.size) {
      console.error('Mismatch in user count!');
      errors++;
    }

    postUsersSnap.docs.forEach(d => {
      const data = d.data();
      if (data.accountType === 'RESTAURANT' && data.role !== 'PLATFORM_ADMIN' && !data.restaurantId) {
         console.warn(`Validation Warning: Internal user ${d.id} has no restaurantId`);
      }
      if (data.role === 'PLATFORM_ADMIN' && data.restaurantId) {
         console.warn(`Validation Warning: Platform admin ${d.id} has a restaurantId (${data.restaurantId})`);
      }
      if (!data.role || !data.accountType) {
         console.error(`Validation Error: User ${d.id} is missing canonical role/accountType`);
         errors++;
      }
    });

    if (errors === 0) {
      console.log('All validations passed.');
    } else {
      console.error(`Validations failed with ${errors} errors.`);
    }
  }

  // Generate Report File
  const reportFilename = path.join(REPORTS_DIR, `migration_${MODE}_${Date.now()}.json`);
  fs.writeFileSync(reportFilename, JSON.stringify(report, null, 2));
  console.log(`\nReport generated at ${reportFilename}`);
  
  if (MODE === 'dry-run') {
    console.log(`Dry-run results:
      Total Users: ${report.totalUsersBefore}
      Would Migrate: ${report.migrated}
      Conflicts: ${report.conflicts.length}
      Pending (no restId): ${report.pending.length}
      Errors: ${report.errors.length}
    `);
  }
}

run().catch(console.error);
