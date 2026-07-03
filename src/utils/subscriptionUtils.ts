import { Bakery, PaymentSettings, FeatureLimits } from '../types';

export const DEFAULT_TRIAL_FEATURES: FeatureLimits = {
  attendanceEnabled: false,
  payrollEnabled: false,
  maxStaff: 5,
  maxDealers: 3,
  maxMembersPerDealer: 2,
};

export const DEFAULT_PAID_FEATURES: FeatureLimits = {
  attendanceEnabled: true,
  payrollEnabled: true,
  maxStaff: -1, // Unlimited
  maxDealers: -1, // Unlimited
  maxMembersPerDealer: -1, // Unlimited
};

export function getActiveFeatures(bakery: Bakery | null, paymentSettings: PaymentSettings | null): FeatureLimits {
  if (!bakery) {
    return DEFAULT_TRIAL_FEATURES;
  }

  // Active or free_partner represent the paid/unlocked tiers
  const isPaid = bakery.subscriptionStatus === 'active' || bakery.subscriptionStatus === 'free_partner';

  if (!isPaid) {
    return {
      attendanceEnabled: paymentSettings?.trialFeatures?.attendanceEnabled ?? DEFAULT_TRIAL_FEATURES.attendanceEnabled,
      payrollEnabled: paymentSettings?.trialFeatures?.payrollEnabled ?? DEFAULT_TRIAL_FEATURES.payrollEnabled,
      maxStaff: paymentSettings?.trialFeatures?.maxStaff !== undefined ? Number(paymentSettings.trialFeatures.maxStaff) : DEFAULT_TRIAL_FEATURES.maxStaff,
      maxDealers: paymentSettings?.trialFeatures?.maxDealers !== undefined ? Number(paymentSettings.trialFeatures.maxDealers) : DEFAULT_TRIAL_FEATURES.maxDealers,
      maxMembersPerDealer: paymentSettings?.trialFeatures?.maxMembersPerDealer !== undefined ? Number(paymentSettings.trialFeatures.maxMembersPerDealer) : DEFAULT_TRIAL_FEATURES.maxMembersPerDealer,
    };
  } else {
    return {
      attendanceEnabled: paymentSettings?.paidFeatures?.attendanceEnabled ?? DEFAULT_PAID_FEATURES.attendanceEnabled,
      payrollEnabled: paymentSettings?.paidFeatures?.payrollEnabled ?? DEFAULT_PAID_FEATURES.payrollEnabled,
      maxStaff: paymentSettings?.paidFeatures?.maxStaff !== undefined ? Number(paymentSettings.paidFeatures.maxStaff) : DEFAULT_PAID_FEATURES.maxStaff,
      maxDealers: paymentSettings?.paidFeatures?.maxDealers !== undefined ? Number(paymentSettings.paidFeatures.maxDealers) : DEFAULT_PAID_FEATURES.maxDealers,
      maxMembersPerDealer: paymentSettings?.paidFeatures?.maxMembersPerDealer !== undefined ? Number(paymentSettings.paidFeatures.maxMembersPerDealer) : DEFAULT_PAID_FEATURES.maxMembersPerDealer,
    };
  }
}
