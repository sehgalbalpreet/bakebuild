import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Order, Dealer } from '../../types';
import { Zap, Store, ChevronRight, CheckCircle2, Sparkles, ChefHat, Shield, Users, MapPin, ReceiptText, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../../lib/utils';

interface BillingPaymentsProps {
  orders: Order[];
  dealers: Dealer[];
}

export const BillingPayments: React.FC<BillingPaymentsProps> = ({ orders, dealers }) => {
  const { bakery } = useAuth();
  // Group dealerships by company name and sort alphabetically
  const dealerships = Array.from(new Set(dealers.map(d => d.companyName))).sort();
  
  const [submitting, setSubmitting] = useState(false);
  const [paymentSettings, setPaymentSettings] = React.useState<any | null>(null);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'payment_settings', 'phonepe'), (snap) => {
      if (snap.exists()) {
        setPaymentSettings(snap.data());
      }
    });
    return () => unsub();
  }, []);

  const monthlyPlan = paymentSettings?.plans?.find((p: any) => p.id === 'monthly') || { name: 'Premium Monthly', price: 999, durationDays: 30, description: 'All features included.' };
  const yearlyPlan = paymentSettings?.plans?.find((p: any) => p.id === 'yearly') || { name: 'Professional Annual', price: 8388, durationDays: 365, description: 'Best value for growing bakeries.' };
  const trialDays = paymentSettings?.trialDays || 90;
  const trialDescription = paymentSettings?.trialDescription || "Includes base order placement, catalog viewing, and basic attendance.";

  const upgradePlan = async (plan: 'monthly' | 'yearly') => {
    if (!bakery) return;
    setSubmitting(true);
    try {
      const endsAt = new Date();
      if (plan === 'monthly') endsAt.setMonth(endsAt.getMonth() + 1);
      else endsAt.setFullYear(endsAt.getFullYear() + 1);

      await updateDoc(doc(db, 'bakeries', bakery.id), {
        subscriptionStatus: 'active',
        plan,
        subscriptionEndsAt: endsAt,
        updatedAt: serverTimestamp()
      });
      alert(`Success! You have been moved to the ${plan} plan.`);
    } catch (err) {
      console.error(err);
      alert('Subscription upgrade failed. Please contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Subscription Card */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-10 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 text-center sm:text-left">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <div className="flex justify-center sm:justify-start items-center gap-2 text-blue-400 font-black uppercase tracking-[0.2em] text-[10px] mb-3">
                <Zap className="w-4 h-4 fill-current text-blue-400" />
                BakeSync Platform Subscription
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white">Manage Your Workspace</h2>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 mx-auto sm:mx-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Status</p>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  bakery?.subscriptionStatus === 'active' ? "bg-green-500" : "bg-amber-500"
                )}></div>
                <p className="text-lg font-black uppercase text-white">{bakery?.subscriptionStatus?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Plan Display */}
            <div className="lg:col-span-2 bg-white/5 rounded-3xl p-8 border border-white/10 text-left">
              <div className="flex flex-col sm:flex-row justify-between gap-8">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Plan Details</p>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-300">Active Plan</h3>
                      <p className="text-xl font-black text-white">{bakery?.subscriptionPlan === 'yearly' ? yearlyPlan.name.toUpperCase() : bakery?.subscriptionPlan === 'monthly' ? monthlyPlan.name.toUpperCase() : 'FREE TRIAL'}</p>
                    </div>
                    {bakery?.subscriptionEndsAt && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-300">Renewal Date</h3>
                        <p className="text-xl font-black text-white">{format((bakery.subscriptionEndsAt as any).toDate ? (bakery.subscriptionEndsAt as any).toDate() : new Date(bakery.subscriptionEndsAt), 'dd MMMM, yyyy')}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                   <div className="bg-blue-600 px-6 py-4 rounded-2xl">
                    <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Estimated Cost</p>
                    <p className="text-2xl font-black text-white">
                      {bakery?.subscriptionPlan === 'yearly' ? `₹${yearlyPlan.price.toLocaleString()}` : bakery?.subscriptionPlan === 'monthly' ? `₹${monthlyPlan.price.toLocaleString()}` : 'FREE'}
                      <span className="text-xs font-bold text-blue-200 ml-1">/{bakery?.subscriptionPlan === 'yearly' ? 'yr' : 'mo'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Upgrade Options */}
            <div className="space-y-4 text-left">
              <button 
                onClick={() => upgradePlan('monthly')}
                disabled={submitting || bakery?.subscriptionPlan === 'monthly'}
                className="w-full bg-white text-slate-900 p-6 rounded-3xl font-black text-left group hover:bg-blue-500 hover:text-white transition-all disabled:opacity-50 text-xs"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-[#0c111d] group-hover:text-white">{monthlyPlan.name}</span>
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xl">₹{monthlyPlan.price.toLocaleString()} <span className="text-xs font-bold opacity-60">/ {monthlyPlan.durationDays} days</span></p>
                <p className="text-[9px] font-bold text-slate-400 group-hover:text-blue-100 mt-1 uppercase tracking-widest leading-tight">{monthlyPlan.description}</p>
              </button>

              <button 
                onClick={() => upgradePlan('yearly')}
                disabled={submitting || bakery?.subscriptionPlan === 'yearly'}
                className="w-full bg-blue-600 text-white p-6 rounded-3xl font-black text-left group hover:bg-blue-500 transition-all border border-white/10 disabled:opacity-50 text-xs"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-blue-200">{yearlyPlan.name} (Best Value)</span>
                  <div className="bg-white/20 px-2 py-0.5 rounded text-[8px]">SAVE {Math.round(100 - (yearlyPlan.price / (monthlyPlan.price * (yearlyPlan.durationDays / monthlyPlan.durationDays))) * 100)}%</div>
                </div>
                <p className="text-xl text-white">₹{yearlyPlan.price.toLocaleString()} <span className="text-xs font-bold text-white opacity-60">/ {yearlyPlan.durationDays} days</span></p>
                <p className="text-[9px] font-bold text-blue-200 mt-1 uppercase tracking-widest">{yearlyPlan.description}</p>
              </button>
            </div>
          </div>
        </div>
        
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-[120px] opacity-20 -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full blur-[100px] opacity-10 -ml-32 -mb-32"></div>
      </div>

      {/* Premium Suite Features Grid */}
      <div className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Premium Suite Highlights
            </div>
            <h2 className="text-2xl font-black text-slate-950 tracking-tight">Included in Your BakeSync Subscription</h2>
            <p className="text-slate-500 text-xs mt-1">
              Every feature is unlocked during your {trialDays} days free trial period. Continue on {monthlyPlan.name} or {yearlyPlan.name} to maintain access. {trialDescription && `Trial details: ${trialDescription}`}
            </p>
          </div>
          <div className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-2.5 rounded-2xl font-black uppercase tracking-wider shrink-0">
            {trialDays}-Day Trial Enabled
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-colors flex gap-4 text-left">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight">Universal Order Flow</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Seamless real-time synchronization of Custom Cakes, Dealer base orders, and gourmet Chocolate products.
              </p>
            </div>
          </div>

          <div className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-colors flex gap-4 text-left">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight">AI-Engine Cake Estimator</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Automated cost calculations covering tiers, characters, fondant volume weights, and rush order surcharges.
              </p>
            </div>
          </div>

          <div className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-colors flex gap-4 text-left">
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight">Smart Batch Timer Insights</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Machine-specific timer trackings with auto-pause limits and dynamic wholesale/retail pricing margin logs.
              </p>
            </div>
          </div>

          <div className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-colors flex gap-4 text-left">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight">Geofence Attendance Verification</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Smart location restriction zones, camera facial authentication captures, and instant off-premises alerts.
              </p>
            </div>
          </div>

          <div className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-colors flex gap-4 text-left">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight">Smart Automated Payroll</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Auto-generates payslips based on base rates, active time-records, bonuses, and tax deductions.
              </p>
            </div>
          </div>

          <div className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-slate-50 transition-colors flex gap-4 text-left">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight">Instant System Handlers</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Geofence autologoff triggers, real-time alert notifications, and continuous cloud-hosted backup sync.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Partner Billing Summaries</h2>
        <div className="space-y-4">
          {dealerships.map(company => {
            const companyDealers = dealers.filter(d => d.companyName === company);
            const dealerIds = companyDealers.map(d => d.id);
            const companyOrders = orders.filter(o => o.dealerId && dealerIds.includes(o.dealerId));
            const total = companyOrders.reduce((a, b) => a + (b.totalAmount || 0), 0);
            
            // Calculate last 30 days sent orders
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const recentSentOrders = companyOrders.filter(o => 
              o.status === 'sent' && 
              o.sentAt && 
              ((o.sentAt as any).toDate ? (o.sentAt as any).toDate() : new Date(o.sentAt)) >= thirtyDaysAgo
            );

            return (
              <div key={company} className="p-6 border border-slate-100 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-slate-50 transition-colors text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600"><Store className="w-6 h-6 border-transparent" /></div>
                  <div>
                    <h3 className="font-black text-slate-900">{company}</h3>
                    <div className="flex flex-col sm:flex-row items-center gap-3 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {companyDealers.length} Employees
                      </p>
                      <span className="w-1 h-1 bg-slate-200 rounded-full hidden sm:inline-block"></span>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        <span className="text-[10px] text-green-600 font-black uppercase tracking-widest">
                          {recentSentOrders.length} Sent (Last 30 Days)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col sm:flex-row items-center gap-8">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Total Outstanding (All Time)</p>
                    <p className="text-xl font-black text-slate-900">{formatCurrency(total)}</p>
                  </div>
                  <button className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-xs">Generate Bill</button>
                </div>
              </div>
            );
          })}
          {dealerships.length === 0 && (
            <div className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No dealerships registered.</div>
          )}
        </div>
      </div>
    </div>
  );
};
