const admin = require('firebase-admin');

const identifier = process.argv[2];

if (!identifier) {
  console.error('Usage: npm run set-admin -- <uid-or-email>');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const resolveUser = async (value) => {
  if (value.includes('@')) {
    return admin.auth().getUserByEmail(value);
  }
  return admin.auth().getUser(value);
};

const run = async () => {
  const user = await resolveUser(identifier);
  const nextClaims = {
    ...(user.customClaims || {}),
    admin: true,
  };

  await admin.auth().setCustomUserClaims(user.uid, nextClaims);
  await db.collection('users').doc(user.uid).set(
    {
      uid: user.uid,
      email: user.email || null,
      name: user.displayName || 'Admin',
      role: 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Admin claim granted to ${user.uid}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
