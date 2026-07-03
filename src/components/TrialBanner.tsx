import React from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import { Clock, AlertTriangle } from 'lucide-react';
import { Bakery } from '../types';
import { TRIAL_DAYS } from '../constants';

interface TrialBannerProps {
  bakery: Bakery | null;
}

export const TrialBanner: React.FC<TrialBannerProps> = ({ bakery }) => {
  const navigate = useNavigate();

  if (!bakery || bakery.subscriptionStatus === 'active' || bakery.subscriptionStatus === 'free_partner') return null;

  let daysRemaining = 0;
  let isExpired = bakery.subscriptionStatus === 'expired';

  if (bakery.subscriptionEndsAt) {
    const end = bakery.subscriptionEndsAt.toDate();
    daysRemaining = Math.max(0, differenceInDays(end, new Date()));
    isExpired = daysRemaining <= 0;
  } else {
    const trialStart = bakery.trialStartedAt?.toDate() || new Date();
    const daysUsed = differenceInDays(new Date(), trialStart);
    daysRemaining = Math.max(0, TRIAL_DAYS - daysUsed);
    isExpired = daysRemaining <= 0;
  }

  return (
    <div className={`p-4 rounded-xl border flex items-center justify-between mb-6 ${
      isExpired ? 'bg-red-50 border-red-200 text-red-800' : 'bg-indigo-50 border-indigo-200 text-indigo-800'
    }`}>
      <div className="flex items-center gap-3">
        {isExpired ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
        <div>
          <p className="font-bold text-sm">
            {isExpired ? 'FREE TRIAL EXPIRED' : `FREE TRIAL: ${daysRemaining} DAYS REMAINING`}
          </p>
          <p className="text-xs opacity-80">
            {isExpired ? 'Please upgrade to continue using your bakery features.' : 'Upgrade to Pro for unlimited orders and premium features.'}
          </p>
        </div>
      </div>
      
      <button 
        onClick={() => navigate('/dashboard/billing')}
        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
          isExpired ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {isExpired ? 'UPGRADE NOW' : 'UPGRADE'}
      </button>
    </div>
  );
};
