import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp as deleteClientApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth';
import { doc, getDoc, connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { deleteApp as deleteAdminApp, getApp as getAdminApp, getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

type TestRole = 'donor' | 'receiver' | 'admin';

type SeedUser = {
  uid: string;
  email: string;
  password: string;
  name: string;
  role: TestRole;
  banned?: boolean;
  claims?: Record<string, unknown>;
};

type ClientSession = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  user: SeedUser;
};

const projectId = process.env.GCLOUD_PROJECT || 'demo-onemeal';
const [firestoreHost, firestorePortValue] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const [authHost, authPortValue] = (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099').split(':');
const functionsHost = '127.0.0.1';
const functionsPort = 5001;
const firestorePort = Number(firestorePortValue || 8080);
const authPort = Number(authPortValue || 9099);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
const firebaseConfig = {
  apiKey: 'demo-api-key',
  appId: '1:1234567890:web:onemeal-tests',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
};

let testEnv: RulesTestEnvironment;
let counter = 0;
const activeClients: ClientSession[] = [];

const nextId = (prefix: string) => `${prefix}-${++counter}`;

const adminApp = () => {
  if (!getAdminApps().length) {
    initializeAdminApp({ projectId }, 'onemeal-emulator-tests');
  }
  return getAdminApp('onemeal-emulator-tests');
};

const adminDb = () => getAdminFirestore(adminApp());
const adminAuth = () => getAdminAuth(adminApp());

const createUser = async ({
  role,
  banned = false,
  claims,
  name = `${role} user`,
}: Partial<SeedUser> & Pick<SeedUser, 'role'>): Promise<SeedUser> => {
  const uid = nextId(role);
  const email = `${uid}@example.com`;
  const password = 'Passw0rd!';

  await adminAuth().createUser({
    uid,
    email,
    password,
    displayName: name,
  });

  if (claims) {
    await adminAuth().setCustomUserClaims(uid, claims);
  }

  await adminDb().collection('users').doc(uid).set({
    uid,
    name,
    email,
    role,
    banned,
    createdAt: FieldValue.serverTimestamp(),
    lastLogin: FieldValue.serverTimestamp(),
  });

  return {
    uid,
    email,
    password,
    name,
    role,
    banned,
    claims,
  };
};

const createClientSession = async (user: SeedUser): Promise<ClientSession> => {
  const app = initializeApp(firebaseConfig, nextId('client'));
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });

  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, firestoreHost, firestorePort);

  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, functionsHost, functionsPort);

  await signInWithEmailAndPassword(auth, user.email, user.password);

  const session = { app, auth, firestore, functions, user };
  activeClients.push(session);
  return session;
};

const seedDonation = async (
  overrides: Record<string, unknown> = {}
) => {
  const donationId = nextId('donation');
  await adminDb().collection('donations').doc(donationId).set({
    foodItem: 'Veg Biryani',
    quantity: '5 kg',
    address: 'MG Road',
    location: { lat: 12.9716, lng: 77.5946 },
    phone: '9999999999',
    foodType: 'veg',
    pickupPreference: 'asap',
    donorName: 'Seed Donor',
    donorId: 'seed-donor',
    status: 'available',
    verified: true,
    createdAt: FieldValue.serverTimestamp(),
    createdAtClient: Date.now(),
    ...overrides,
  });

  return donationId;
};

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Firestore and Auth emulators must be running for emulator tests.');
  }

  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: firestoreHost,
      port: firestorePort,
      rules: readFileSync(rulesPath, 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterEach(async () => {
  await Promise.all(
    activeClients.splice(0).map(async ({ auth, app }) => {
      await signOut(auth).catch(() => {});
      await deleteClientApp(app).catch(() => {});
    })
  );
});

afterAll(async () => {
  await testEnv.cleanup();

  if (getAdminApps().length) {
    await deleteAdminApp(adminApp());
  }
});

describe('Firestore rules', () => {
  it('requires an admin custom claim to read admin-only issues', async () => {
    await adminDb().collection('users').doc('admin-user').set({
      uid: 'admin-user',
      role: 'admin',
      banned: false,
    });
    await adminDb().collection('issues').doc('issue-1').set({
      title: 'Legacy issue',
      type: 'issue',
      message: 'Needs review',
      userId: 'donor-1',
      userName: 'Donor One',
      createdAt: new Date(),
      reporterRole: 'donor',
      source: 'test',
    });

    const withoutClaim = testEnv.authenticatedContext('admin-user').firestore();
    const withClaim = testEnv.authenticatedContext('admin-user', { admin: true }).firestore();

    await assertFails(getDoc(doc(withoutClaim, 'issues', 'issue-1')));
    await assertSucceeds(getDoc(doc(withClaim, 'issues', 'issue-1')));
  });
});

describe('Callable Functions', () => {
  it('denies banned users before they can claim a donation', async () => {
    const bannedReceiver = await createUser({
      role: 'receiver',
      banned: true,
      name: 'Banned NGO',
    });
    const donationId = await seedDonation();
    const receiverClient = await createClientSession(bannedReceiver);
    const claimDonation = httpsCallable<{ donationId: string }, { otp: string }>(receiverClient.functions, 'claimDonation');

    await expect(claimDonation({ donationId })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });

  it('prevents claimDonation races with a single winner', async () => {
    const donor = await createUser({
      role: 'donor',
      name: 'Donor A',
    });
    const firstReceiver = await createUser({
      role: 'receiver',
      name: 'Receiver One',
    });
    const secondReceiver = await createUser({
      role: 'receiver',
      name: 'Receiver Two',
    });
    const donationId = await seedDonation({
      donorId: donor.uid,
      donorName: donor.name,
    });

    const [firstClient, secondClient] = await Promise.all([
      createClientSession(firstReceiver),
      createClientSession(secondReceiver),
    ]);

    const firstClaim = httpsCallable<{ donationId: string }, { otp: string }>(firstClient.functions, 'claimDonation');
    const secondClaim = httpsCallable<{ donationId: string }, { otp: string }>(secondClient.functions, 'claimDonation');
    const [firstResult, secondResult] = await Promise.allSettled([
      firstClaim({ donationId }),
      secondClaim({ donationId }),
    ]);

    const results = [firstResult, secondResult];
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<{ data: { otp: string } }> => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as { code?: string }).code).toBe('functions/failed-precondition');
    expect(fulfilled[0].value.data.otp).toMatch(/^\d{6}$/);

    const donationSnapshot = await adminDb().collection('donations').doc(donationId).get();
    const secretSnapshot = await adminDb().collection('donationSecrets').doc(donationId).get();

    expect(donationSnapshot.data()?.status).toBe('claimed');
    expect([firstReceiver.uid, secondReceiver.uid]).toContain(donationSnapshot.data()?.claimedById);
    expect(secretSnapshot.data()?.otp).toBe(fulfilled[0].value.data.otp);
  });

  it('verifies donation OTPs only when the donor provides the correct code', async () => {
    const donor = await createUser({
      role: 'donor',
      name: 'Otp Donor',
    });
    const receiver = await createUser({
      role: 'receiver',
      name: 'Otp NGO',
    });
    const donationId = await seedDonation({
      donorId: donor.uid,
      donorName: donor.name,
    });

    const receiverClient = await createClientSession(receiver);
    const donorClient = await createClientSession(donor);
    const claimDonation = httpsCallable<{ donationId: string }, { otp: string }>(receiverClient.functions, 'claimDonation');
    const verifyDonationOtp = httpsCallable<{ donationId: string; otp: string }, { status: string }>(
      donorClient.functions,
      'verifyDonationOtp'
    );

    const claimResult = await claimDonation({ donationId });

    await expect(verifyDonationOtp({ donationId, otp: '000000' })).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });

    const success = await verifyDonationOtp({ donationId, otp: claimResult.data.otp });
    const donationSnapshot = await adminDb().collection('donations').doc(donationId).get();
    const secretSnapshot = await adminDb().collection('donationSecrets').doc(donationId).get();

    expect(success.data.status).toBe('completed');
    expect(donationSnapshot.data()?.status).toBe('completed');
    expect(donationSnapshot.data()?.otpVerifiedBy).toBe(donor.uid);
    expect(secretSnapshot.exists).toBe(false);
  });

  it('stores report reason and reporter metadata on reportDonation', async () => {
    const donor = await createUser({
      role: 'donor',
      name: 'Report Donor',
    });
    const receiver = await createUser({
      role: 'receiver',
      name: 'Report NGO',
    });
    const donationId = await seedDonation({
      donorId: donor.uid,
      donorName: donor.name,
    });

    const receiverClient = await createClientSession(receiver);
    const reportDonation = httpsCallable<{ donationId: string; reason: string }, { status: string }>(
      receiverClient.functions,
      'reportDonation'
    );

    const result = await reportDonation({
      donationId,
      reason: 'Food was mislabeled and unsafe to distribute.',
    });

    const donationSnapshot = await adminDb().collection('donations').doc(donationId).get();
    const donationData = donationSnapshot.data() || {};

    expect(result.data.status).toBe('reported');
    expect(donationData.status).toBe('reported');
    expect(donationData.reportReason).toBe('Food was mislabeled and unsafe to distribute.');
    expect(donationData.reportedBy).toBe(receiver.uid);
    expect(donationData.reportMeta).toMatchObject({
      reporterId: receiver.uid,
      reporterName: receiver.name,
      reporterRole: 'receiver',
    });
  });

  it('enforces volunteer accept, complete, and release authorization', async () => {
    const assignedVolunteer = await createUser({
      role: 'donor',
      name: 'Assigned Volunteer',
    });
    const otherVolunteer = await createUser({
      role: 'donor',
      name: 'Other Volunteer',
    });

    const releaseDonationId = await seedDonation();
    const completeDonationId = await seedDonation();

    const [assignedClient, otherClient] = await Promise.all([
      createClientSession(assignedVolunteer),
      createClientSession(otherVolunteer),
    ]);

    const acceptPickup = httpsCallable<{ donationId: string }, { status: string }>(
      assignedClient.functions,
      'acceptVolunteerPickup'
    );
    const completePickupByAssigned = httpsCallable<{ donationId: string }, { status: string }>(
      assignedClient.functions,
      'completeVolunteerPickup'
    );
    const releasePickupByAssigned = httpsCallable<{ donationId: string }, { status: string }>(
      assignedClient.functions,
      'releaseVolunteerPickup'
    );
    const completePickupByOther = httpsCallable<{ donationId: string }, { status: string }>(
      otherClient.functions,
      'completeVolunteerPickup'
    );
    const releasePickupByOther = httpsCallable<{ donationId: string }, { status: string }>(
      otherClient.functions,
      'releaseVolunteerPickup'
    );

    const acceptedReleaseDonation = await acceptPickup({ donationId: releaseDonationId });
    expect(acceptedReleaseDonation.data.status).toBe('on_way');

    await expect(completePickupByOther({ donationId: releaseDonationId })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    await expect(releasePickupByOther({ donationId: releaseDonationId })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });

    const releaseResult = await releasePickupByAssigned({ donationId: releaseDonationId });
    expect(releaseResult.data.status).toBe('available');

    await acceptPickup({ donationId: completeDonationId });
    const completeResult = await completePickupByAssigned({ donationId: completeDonationId });
    const completedDonationSnapshot = await adminDb().collection('donations').doc(completeDonationId).get();

    expect(completeResult.data.status).toBe('completed');
    expect(completedDonationSnapshot.data()?.status).toBe('completed');
    expect(completedDonationSnapshot.data()?.volunteerId).toBe(assignedVolunteer.uid);
  });
});
