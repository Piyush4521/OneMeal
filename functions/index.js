const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();

const db = admin.firestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const DEFAULT_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';
const DEFAULT_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash';
const serverTimestamp = () => FieldValue.serverTimestamp();
const deleteField = () => FieldValue.delete();

const ensureString = (value, fieldName, maxLength = 5000) => {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `${fieldName} is too long.`);
  }

  return trimmed;
};

const ensureAuth = (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  return uid;
};

const getProfile = async (uid) => {
  const snapshot = await db.collection('users').doc(uid).get();
  if (!snapshot.exists) {
    throw new HttpsError('failed-precondition', 'User profile not found.');
  }

  return snapshot.data() || {};
};

const ensureActiveRole = async (uid, role) => {
  const profile = await getProfile(uid);
  if (profile.banned) {
    throw new HttpsError('permission-denied', 'This account is banned.');
  }
  if (profile.role !== role) {
    throw new HttpsError('permission-denied', `${role} access required.`);
  }
  return profile;
};

const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const createOtp = () => String(100000 + Math.floor(Math.random() * 900000));

const parseQuantityKg = (value) => {
  if (typeof value !== 'string') return 0;
  const cleaned = value.toLowerCase();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return 0;
  if (/\bkg\b/.test(cleaned)) return amount;
  if (/\b(g|gm|gram|grams)\b/.test(cleaned)) return amount / 1000;
  return 0;
};

const getFoodBadge = (karma) => {
  if (karma >= 120) return 'Hunger Slayer';
  if (karma >= 70) return 'Food Ninja';
  return 'Food Hero';
};

const extractReplyText = (data) => {
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof reply === 'string' ? reply.trim() : '';
};

const callGemini = async ({ apiKey, model, body }) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new HttpsError('internal', data?.error?.message || 'AI request failed.');
  }

  return data;
};

exports.generateGeminiText = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  const prompt = ensureString(request.data?.prompt, 'prompt', 6000);
  const temperature = typeof request.data?.temperature === 'number' ? request.data.temperature : 0.3;
  const maxOutputTokens = typeof request.data?.maxOutputTokens === 'number'
    ? request.data.maxOutputTokens
    : 256;
  const model = typeof request.data?.model === 'string' && request.data.model.trim()
    ? request.data.model.trim()
    : DEFAULT_TEXT_MODEL;

  const data = await callGemini({
    apiKey: GEMINI_API_KEY.value(),
    model,
    body: {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    },
  });

  return { text: extractReplyText(data), model };
});

exports.verifyFoodImage = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  const mimeType = ensureString(request.data?.mimeType, 'mimeType', 100);
  const data = ensureString(request.data?.base64Data, 'base64Data', 10_000_000);

  const result = await callGemini({
    apiKey: GEMINI_API_KEY.value(),
    model: DEFAULT_VISION_MODEL,
    body: {
      contents: [
        {
          parts: [
            {
              text: "Look at this image. Is this real, edible cooked food or raw ingredients suitable for donation? If it is food, return ONLY the word 'YES'. If it is a person, object, blur, or inappropriate, return 'NO'.",
            },
            {
              inlineData: {
                mimeType,
                data,
              },
            },
          ],
        },
      ],
    },
  });

  const reply = extractReplyText(result).toUpperCase();
  return { isFood: reply.includes('YES') };
});

exports.getLandingMetrics = onCall(async () => {
  const donationsSnapshot = await db.collection('donations').where('status', '==', 'completed').get();
  const moneySnapshot = await db.collection('moneyDonations').where('status', '==', 'paid').get();

  const foodLeaders = {};
  const moneyLeaders = {};
  const donors = new Set();
  let totalKg = 0;

  donationsSnapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const donorName = data.donorName || data.donorId || 'Anonymous';
    donors.add(String(donorName));

    const existing = foodLeaders[donorName] || { donations: 0, karma: 0 };
    foodLeaders[donorName] = {
      donations: existing.donations + 1,
      karma: existing.karma + 10,
    };

    totalKg += parseQuantityKg(data.quantity);
  });

  moneySnapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const donorName = data.donorName || data.name || 'Anonymous';
    const amount = Number(data.amount ?? data.value ?? data.total ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const existing = moneyLeaders[donorName] || { amount: 0, message: '' };
    moneyLeaders[donorName] = {
      amount: existing.amount + amount,
      message: typeof data.message === 'string' ? data.message.trim() : existing.message,
    };
  });

  const donationCount = donationsSnapshot.size;
  const safeFoodKg = Math.round(totalKg * 10) / 10;
  const estimatedMeals = safeFoodKg > 0 ? Math.round(safeFoodKg * 2.5) : donationCount * 5;

  return {
    impactStats: {
      donations: donationCount,
      donors: donors.size,
      meals: estimatedMeals,
      foodKg: safeFoodKg,
    },
    foodLeaders: Object.entries(foodLeaders)
      .map(([name, stats]) => ({
        name,
        donations: stats.donations,
        karma: stats.karma,
        badge: getFoodBadge(stats.karma),
        message: `${stats.donations} completed donations`,
      }))
      .sort((a, b) => b.karma - a.karma)
      .slice(0, 3),
    moneyLeaders: Object.entries(moneyLeaders)
      .map(([name, stats]) => ({
        name,
        amount: stats.amount,
        message: stats.message || 'Paid support for operations',
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3),
  };
});

exports.claimDonation = onCall(async (request) => {
  const uid = ensureAuth(request);
  const profile = await ensureActiveRole(uid, 'receiver');
  const donationId = ensureString(request.data?.donationId, 'donationId', 120);
  const donationRef = db.collection('donations').doc(donationId);
  const secretRef = db.collection('donationSecrets').doc(donationId);
  const otp = createOtp();

  await db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      throw new HttpsError('not-found', 'Donation not found.');
    }

    const donation = donationSnapshot.data() || {};
    if (donation.status !== 'available') {
      throw new HttpsError('failed-precondition', 'Pickup already in progress.');
    }

    transaction.update(donationRef, {
      status: 'claimed',
      claimedBy: profile.name || request.auth.token.name || 'NGO',
      claimedById: uid,
      claimedAt: serverTimestamp(),
      otpHash: hashOtp(otp),
      reportReason: deleteField(),
      reportedAt: deleteField(),
      reportedBy: deleteField(),
      reportMeta: deleteField(),
    });

    transaction.set(secretRef, {
      donationId,
      claimedById: uid,
      otp,
      createdAt: serverTimestamp(),
    });
  });

  return { otp };
});

exports.verifyDonationOtp = onCall(async (request) => {
  const uid = ensureAuth(request);
  await ensureActiveRole(uid, 'donor');
  const donationId = ensureString(request.data?.donationId, 'donationId', 120);
  const otp = ensureString(request.data?.otp, 'otp', 12);
  const donationRef = db.collection('donations').doc(donationId);
  const secretRef = db.collection('donationSecrets').doc(donationId);

  await db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      throw new HttpsError('not-found', 'Donation not found.');
    }

    const donation = donationSnapshot.data() || {};
    if (donation.donorId !== uid) {
      throw new HttpsError('permission-denied', 'Only the donor can verify this OTP.');
    }
    if (!['claimed', 'on_way'].includes(donation.status)) {
      throw new HttpsError('failed-precondition', 'This donation cannot be completed right now.');
    }
    if (!donation.otpHash || donation.otpHash !== hashOtp(otp)) {
      throw new HttpsError('failed-precondition', 'Incorrect OTP.');
    }

    transaction.update(donationRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      otpVerifiedAt: serverTimestamp(),
      otpVerifiedBy: uid,
      otpHash: deleteField(),
    });
    transaction.delete(secretRef);
  });

  return { status: 'completed' };
});

exports.reportDonation = onCall(async (request) => {
  const uid = ensureAuth(request);
  const profile = await ensureActiveRole(uid, 'receiver');
  const donationId = ensureString(request.data?.donationId, 'donationId', 120);
  const reason = ensureString(request.data?.reason, 'reason', 600);
  const donationRef = db.collection('donations').doc(donationId);
  const secretRef = db.collection('donationSecrets').doc(donationId);

  await db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      throw new HttpsError('not-found', 'Donation not found.');
    }

    const donation = donationSnapshot.data() || {};
    if (!['available', 'claimed', 'on_way'].includes(donation.status)) {
      throw new HttpsError('failed-precondition', 'This donation cannot be reported right now.');
    }

    transaction.update(donationRef, {
      status: 'reported',
      reportReason: reason,
      reportedAt: serverTimestamp(),
      reportedBy: uid,
      reportMeta: {
        reporterId: uid,
        reporterName: profile.name || request.auth.token.name || 'NGO',
        reporterRole: 'receiver',
      },
    });
    transaction.delete(secretRef);
  });

  return { status: 'reported' };
});

exports.acceptVolunteerPickup = onCall(async (request) => {
  const uid = ensureAuth(request);
  const profile = await ensureActiveRole(uid, 'donor');
  const donationId = ensureString(request.data?.donationId, 'donationId', 120);
  const donationRef = db.collection('donations').doc(donationId);

  await db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      throw new HttpsError('not-found', 'Donation not found.');
    }

    const donation = donationSnapshot.data() || {};
    if (donation.status !== 'available') {
      throw new HttpsError('failed-precondition', 'Pickup already assigned.');
    }

    transaction.update(donationRef, {
      status: 'on_way',
      volunteerId: uid,
      volunteerName: profile.name || request.auth.token.name || 'Volunteer',
      volunteerStatus: 'accepted',
      volunteerAcceptedAt: serverTimestamp(),
    });
  });

  return { status: 'on_way' };
});

exports.completeVolunteerPickup = onCall(async (request) => {
  const uid = ensureAuth(request);
  await ensureActiveRole(uid, 'donor');
  const donationId = ensureString(request.data?.donationId, 'donationId', 120);
  const donationRef = db.collection('donations').doc(donationId);

  await db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      throw new HttpsError('not-found', 'Donation not found.');
    }

    const donation = donationSnapshot.data() || {};
    if (donation.volunteerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the assigned volunteer can complete this pickup.');
    }
    if (!['on_way', 'claimed'].includes(donation.status)) {
      throw new HttpsError('failed-precondition', 'This pickup is not active.');
    }

    transaction.update(donationRef, {
      status: 'completed',
      volunteerStatus: 'completed',
      volunteerCompletedAt: serverTimestamp(),
    });
  });

  return { status: 'completed' };
});

exports.releaseVolunteerPickup = onCall(async (request) => {
  const uid = ensureAuth(request);
  await ensureActiveRole(uid, 'donor');
  const donationId = ensureString(request.data?.donationId, 'donationId', 120);
  const donationRef = db.collection('donations').doc(donationId);

  await db.runTransaction(async (transaction) => {
    const donationSnapshot = await transaction.get(donationRef);
    if (!donationSnapshot.exists) {
      throw new HttpsError('not-found', 'Donation not found.');
    }

    const donation = donationSnapshot.data() || {};
    if (donation.volunteerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the assigned volunteer can release this pickup.');
    }

    transaction.update(donationRef, {
      status: 'available',
      volunteerId: deleteField(),
      volunteerName: deleteField(),
      volunteerStatus: 'released',
      volunteerReleasedAt: serverTimestamp(),
    });
  });

  return { status: 'available' };
});
