import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export type LandingMetrics = {
  impactStats: {
    donations: number;
    donors: number;
    meals: number;
    foodKg: number;
  };
  foodLeaders: Array<{
    name: string;
    karma: number;
    donations: number;
    badge: string;
    message: string;
  }>;
  moneyLeaders: Array<{
    name: string;
    amount: number;
    message: string;
  }>;
};

const getLandingMetricsCallable = httpsCallable<void, LandingMetrics>(functions, 'getLandingMetrics');
const claimDonationCallable = httpsCallable<{ donationId: string }, { otp: string }>(functions, 'claimDonation');
const verifyDonationOtpCallable = httpsCallable<{ donationId: string; otp: string }, { status: string }>(
  functions,
  'verifyDonationOtp'
);
const reportDonationCallable = httpsCallable<{ donationId: string; reason: string }, { status: string }>(
  functions,
  'reportDonation'
);
const acceptVolunteerPickupCallable = httpsCallable<{ donationId: string }, { status: string }>(
  functions,
  'acceptVolunteerPickup'
);
const completeVolunteerPickupCallable = httpsCallable<{ donationId: string }, { status: string }>(
  functions,
  'completeVolunteerPickup'
);
const releaseVolunteerPickupCallable = httpsCallable<{ donationId: string }, { status: string }>(
  functions,
  'releaseVolunteerPickup'
);

export const getLandingMetrics = async () => {
  const result = await getLandingMetricsCallable();
  return result.data;
};

export const claimDonation = async (donationId: string) => {
  const result = await claimDonationCallable({ donationId });
  return result.data;
};

export const verifyDonationOtp = async (donationId: string, otp: string) => {
  const result = await verifyDonationOtpCallable({ donationId, otp });
  return result.data;
};

export const reportDonation = async (donationId: string, reason: string) => {
  const result = await reportDonationCallable({ donationId, reason });
  return result.data;
};

export const acceptVolunteerPickup = async (donationId: string) => {
  const result = await acceptVolunteerPickupCallable({ donationId });
  return result.data;
};

export const completeVolunteerPickup = async (donationId: string) => {
  const result = await completeVolunteerPickupCallable({ donationId });
  return result.data;
};

export const releaseVolunteerPickup = async (donationId: string) => {
  const result = await releaseVolunteerPickupCallable({ donationId });
  return result.data;
};
