const admin = require('firebase-admin');

const shouldWrite = process.argv.includes('--write');

admin.initializeApp();

const db = admin.firestore();

const plannedUpdates = [];

const queueUpdate = (ref, data, reason) => {
  plannedUpdates.push({ ref, data, reason });
  console.log(`[plan] ${ref.path} -> ${JSON.stringify(data)} (${reason})`);
};

const scanIssues = async () => {
  const snapshot = await db.collection('issues').get();

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const patch = {};

    if (!data.type) patch.type = 'issue';
    if (!data.source) patch.source = 'legacy-issues-collection';
    if (!data.reporterRole) patch.reporterRole = 'unknown';

    if (Object.keys(patch).length > 0) {
      queueUpdate(docSnapshot.ref, patch, 'Normalize legacy issue documents.');
    }
  });
};

const scanSuggestions = async () => {
  const snapshot = await db.collection('suggestions').get();

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    if (!data.type) {
      queueUpdate(docSnapshot.ref, { type: 'suggestion' }, 'Add missing suggestion type.');
    }
  });
};

const scanReportedDonations = async () => {
  const snapshot = await db.collection('donations').where('status', '==', 'reported').get();

  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    if (data.reportMeta || !data.reportedBy) {
      return;
    }

    queueUpdate(
      docSnapshot.ref,
      {
        reportMeta: {
          reporterId: data.reportedBy,
          reporterName: data.claimedBy || 'Legacy NGO',
          reporterRole: 'receiver',
        },
      },
      'Backfill missing reported-donation metadata from existing report fields.'
    );
  });
};

const commitUpdates = async () => {
  if (!plannedUpdates.length) {
    console.log('No legacy documents need backfill.');
    return;
  }

  if (!shouldWrite) {
    console.log(`Dry run complete. ${plannedUpdates.length} document(s) would be updated.`);
    console.log('Re-run with --write to apply these changes.');
    return;
  }

  while (plannedUpdates.length > 0) {
    const batch = db.batch();
    const slice = plannedUpdates.splice(0, 400);

    slice.forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true });
    });

    await batch.commit();
    console.log(`Committed ${slice.length} document(s).`);
  }
};

const run = async () => {
  await scanIssues();
  await scanSuggestions();
  await scanReportedDonations();
  await commitUpdates();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
