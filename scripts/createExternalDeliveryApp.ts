import admin from 'firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

/**
 * CLI Administrative script to create or update an External Delivery App registration in Firestore.
 *
 * Usage example:
 *   npx tsx scripts/createExternalDeliveryApp.ts \
 *     --appId=flash_deliveries \
 *     --name="Flash Deliveries App" \
 *     --mode=JWT_HMAC \
 *     --issuer=https://auth.flashdeliveries.com \
 *     --audience=qfomeai-external-delivery-api \
 *     --scopes="delivery:read,delivery:preview,delivery:claim,delivery:start,delivery:complete,delivery:fail" \
 *     --rateLimit=120
 *
 *   OR for Public Key Mode:
 *   npx tsx scripts/createExternalDeliveryApp.ts \
 *     --appId=flash_deliveries \
 *     --name="Flash Deliveries App" \
 *     --mode=JWT_PUBLIC_KEY \
 *     --issuer=https://auth.flashdeliveries.com \
 *     --publicKeyFile=./public_key.pem
 */

function getDb() {
  if (admin.apps.length === 0) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
        const json = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        credential = admin.credential.cert(json);
      } catch (e) {
        credential = admin.credential.applicationDefault();
      }
    } else {
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({ credential, projectId });
  }

  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

  return databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
}

function hashSecret(secret: string): string {
  const salt = process.env.EXTERNAL_API_SECRET_SALT || 'qfomeai_default_secret_salt_2026';
  return crypto.createHmac('sha256', salt).update(secret).digest('hex');
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, ...valParts] = arg.substring(2).split('=');
      args[key] = valParts.join('=');
    }
  }
  return args;
}

async function run() {
  const db = getDb();
  const args = parseArgs();

  const appId = args.appId || 'demo_delivery_app';
  const name = args.name || 'Demo Delivery Platform';
  const mode = (args.mode || 'JWT_HMAC') as 'JWT_HMAC' | 'JWT_PUBLIC_KEY';
  const issuer = args.issuer || 'https://auth.demodelivery.com';
  const audience = args.audience || process.env.EXTERNAL_API_AUDIENCE || 'qfomeai-external-delivery-api';
  const scopesArg = args.scopes || 'delivery:read,delivery:preview,delivery:claim,delivery:start,delivery:complete,delivery:fail';
  const allowedScopes = scopesArg.split(',').map((s) => s.trim());
  const rateLimitPerMinute = Number(args.rateLimit) || 60;
  const rotateSecret = args.rotateSecret === 'true';

  const appRef = db.collection('externalDeliveryApps').doc(appId);
  const existingDoc = await appRef.get();

  let secretHash: string | undefined = undefined;
  let rawSecretForConsole: string | undefined = undefined;
  let publicKeyPem: string | undefined = undefined;

  if (mode === 'JWT_HMAC') {
    if (!existingDoc.exists || rotateSecret || args.secret) {
      const secretToUse = args.secret || crypto.randomBytes(32).toString('hex');
      secretHash = hashSecret(secretToUse);
      rawSecretForConsole = secretToUse;
    } else {
      secretHash = existingDoc.data()?.secretHash;
    }
  } else if (mode === 'JWT_PUBLIC_KEY') {
    if (args.publicKey) {
      publicKeyPem = args.publicKey.replace(/\\n/g, '\n');
    } else if (existingDoc.exists) {
      publicKeyPem = existingDoc.data()?.publicKeyPem;
    } else {
      console.error('ERROR: --publicKey is required when creating a new app in JWT_PUBLIC_KEY mode.');
      process.exit(1);
    }
  }

  const credentialVersion = existingDoc.exists && rotateSecret ? (existingDoc.data()?.credentialVersion || 1) + 1 : existingDoc.data()?.credentialVersion || 1;

  const appData = {
    appId,
    name,
    status: 'ACTIVE',
    authenticationMode: mode,
    ...(secretHash ? { secretHash } : {}),
    ...(publicKeyPem ? { publicKeyPem } : {}),
    issuer,
    audience,
    allowedScopes,
    rateLimitPerMinute,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existingDoc.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    credentialVersion,
  };

  await appRef.set(appData, { merge: true });

  console.log('\n======================================================');
  console.log(` SUCCESS: External Delivery App '${appId}' registered.`);
  console.log('======================================================');
  console.log(`  App ID:             ${appId}`);
  console.log(`  Name:               ${name}`);
  console.log(`  Status:             ACTIVE`);
  console.log(`  Auth Mode:          ${mode}`);
  console.log(`  Issuer (iss):       ${issuer}`);
  console.log(`  Audience (aud):     ${audience}`);
  console.log(`  Allowed Scopes:     ${allowedScopes.join(', ')}`);
  console.log(`  Rate Limit:         ${rateLimitPerMinute} req/min`);
  console.log(`  Credential Version: ${credentialVersion}`);

  if (rawSecretForConsole) {
    console.log('\n------------------------------------------------------');
    console.log(' ATTENTION: HMAC Plain Secret generated (displaying ONCE):');
    console.log(` Secret: ${rawSecretForConsole}`);
    console.log(' Store this secret securely in the external platform backend.');
    console.log(' QFomeAI stores only the salted HMAC hash and will never show this again.');
    console.log('------------------------------------------------------\n');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to create external delivery app:', err);
  process.exit(1);
});
