
import React, { useState } from 'react';
// Build 2026-05-09-v138
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { auth, db } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { BakerySignup } from './pages/BakerySignup';
import { CustomerFeedbackRating } from './pages/CustomerFeedbackRating';
import { Layout } from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import { ProductionDashboard } from './pages/ProductionDashboard';
import { DealerDashboard } from './pages/DealerDashboard';
import { BakeryAdminDashboard } from './pages/BakeryAdminDashboard';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { AttendanceDashboard } from './pages/AttendanceDashboard';
import { DesignQuote } from './pages/DesignQuote';
import { DrageesCostSetup } from './pages/DrageesCostSetup';
import { ProductionTimeTracking } from './pages/ProductionTimeTracking';
import { TrialBanner } from './components/TrialBanner';
import { Volume2, Play, ShieldAlert, Clock, Zap } from 'lucide-react';
import { useSound } from './hooks/useSound';
import { useVersionCheck } from './hooks/useVersionCheck';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

import { APP_VERSION } from './version';

const DashboardHome = () => {
  const { profile, bakery, isSuperAdmin, impersonatedProfile } = useAuth();
  
  window.scrollTo(0, 0);
  const scrollContainer = document.querySelector('main > div.overflow-y-auto');
  if (scrollContainer) scrollContainer.scrollTo(0, 0);

  return (
    <div className="space-y-6">
      {/* Role-Based Dashboard Controller */}
      {isSuperAdmin && !impersonatedProfile ? (
        <SuperAdminDashboard />
      ) : (
        <>
          {(profile?.role === 'bakery_admin' || profile?.role === 'sales') && <BakeryAdminDashboard />}
          {profile?.role === 'staff' && <AttendanceDashboard />}
          {(profile?.role === 'production' || profile?.role === 'chocolate_production') && <ProductionDashboard />}
          {(profile?.role === 'dealer' || profile?.role === 'dealer_staff') && <DealerDashboard />}
        </>
      )}
    </div>
  );
};

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin, impersonatedProfile, realProfile, stopImpersonating, bakery, profile } = useAuth();
  const location = useLocation();
  const { playPending, stopPending, playReady, stopReady, playSent } = useSound();
  const [connectionState, setConnectionState] = useState<'online' | 'reconnecting' | 'offline'>('online');
  const [offlineTime, setOfflineTime] = useState<number | null>(null);
  const { showUpdateModal, showUpdateBanner, appConfig, dismissModalAndBypass } = useVersionCheck(isSuperAdmin);

  const isDashboardRoute = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/production') || location.pathname.startsWith('/admin');

  React.useEffect(() => {
    // Connection Monitor
    const handleOnline = () => {
      setConnectionState('reconnecting');
      setOfflineTime(null);
      setTimeout(() => setConnectionState('online'), 2000);
    };

    const handleOffline = () => {
      setConnectionState('offline');
      setOfflineTime(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Timer to force re-render for the offline banner
    let offlineInterval: NodeJS.Timeout;
    if (connectionState === 'offline') {
      offlineInterval = setInterval(() => {
        setOfflineTime(prev => prev);
      }, 5000);
    }

    // Global Error Monitor for Firestore Internal Failures
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const errorText = (event instanceof ErrorEvent ? event.message : (event as any).reason?.message) || '';
      if (errorText.includes('INTERNAL ASSERTION FAILED') || errorText.includes('Unexpected state')) {
        console.error("CRITICAL FIRESTORE ERROR DETECTED. Triggering auto-repair...");
        localStorage.removeItem('bakesync_version');
        sessionStorage.clear();
        localStorage.setItem('bakesync_repair_loop_guard', Date.now().toString());
        window.location.search = "force_upgrade=true&repair=auto";
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    // Register service worker for PWA (allowed by default)
    const pwaEnabled = localStorage.getItem('bakesync_pwa_enabled') !== 'false';
    if (pwaEnabled && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          registration.update();
        }).catch(error => {
          console.error('SW registration failed:', error);
        });
      });
    }

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (offlineInterval) clearInterval(offlineInterval);
    };
  }, [connectionState]);

  const isLongOffline = connectionState === 'offline' && offlineTime && (Date.now() - offlineTime > 30000);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Global Connection/Syncing Indicators */}
      <AnimatePresence>
        {connectionState === 'reconnecting' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-400 text-amber-950 text-[9px] font-black uppercase tracking-[0.2em] py-1 px-4 flex items-center justify-center gap-2 sticky top-0 z-[1000] shadow-sm overflow-hidden"
          >
            <div className="w-1.5 h-1.5 bg-amber-950/40 rounded-full animate-pulse"></div>
            Reconnecting to server...
          </motion.div>
        )}

        {isLongOffline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider py-3 px-6 flex items-center justify-center gap-3 sticky top-0 z-[1000] border-b border-amber-200"
          >
            <ShieldAlert className="w-4 h-4" />
            You are offline — changes will sync when connection is restored
          </motion.div>
        )}

        {showUpdateBanner && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-blue-600 text-white py-3 px-6 flex items-center justify-between gap-4 sticky top-0 z-[1100] shadow-xl"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest">A new version is available — tap to update</span>
            </div>
            <button 
              onClick={() => {
                window.location.href = window.location.pathname + '?force_upgrade=true';
              }}
              className="bg-white text-blue-600 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors"
            >
              Refresh Now
            </button>
          </motion.div>
        )}

        {impersonatedProfile && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-slate-900 border-b border-slate-800 text-white py-1.5 px-6 flex items-center justify-between gap-4 sticky top-0 z-[1200] shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Simulation: <span className="text-white">{bakery?.name}</span>
              </span>
            </div>
            <button 
              onClick={stopImpersonating}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[9px] font-black uppercase tracking-widest transition-all"
            >
              Exit Simulation
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <TrialBanner bakery={bakery} />

      {/* Force Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[2000] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Version Conflict</h2>
            <p className="text-slate-600 mb-8 font-medium leading-relaxed">
              {appConfig?.updateMessage || "BakeSync has been updated. Please refresh to continue."}
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  window.location.href = window.location.pathname + '?force_upgrade=true';
                }}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3"
              >
                Refresh Now
              </button>
              <button 
                onClick={dismissModalAndBypass}
                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
              >
                Dismiss & Proceed to App (v{APP_VERSION})
              </button>
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode, adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const { user, profile, loading, isSuperAdmin, bakery } = useAuth();
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
      <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
      <p className="text-gray-900 font-black uppercase tracking-widest text-sm animate-pulse mb-2">Bakesync Core v{APP_VERSION}</p>
      <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Warming up systems...</p>
      
      <div className="mt-12 flex flex-col items-center gap-4">
        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Connection Issues?</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={() => {
              localStorage.removeItem('bakesync_version');
              window.location.reload();
            }}
            className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all"
          >
            Soft Reload
          </button>
          
          <button 
            onClick={() => {
              if (confirm("EMERGENCY REPAIR: This will sign you out and clear ALL local cache. Recommended if the app is frozen or stuck. Proceed?")) {
                localStorage.clear();
                window.location.href = "/";
              }
            }}
            className="px-6 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
          >
            Deep Repair (Reset App)
          </button>
        </div>
      </div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" />;

  // Auth check for Super Admin
  if (isSuperAdmin) return <Layout>{children}</Layout>;

  // Authorization check: User must have a profile
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 font-bold max-w-md">
          you are not authorised by the superadmin
        </p>
        <button 
          onClick={() => auth.signOut()}
          className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // Bakery Status Check
  const isDealer = profile?.role === 'dealer' || profile?.role === 'dealer_staff';
  
  if (bakery && !isDealer && (bakery.subscriptionStatus === 'pending_verification' || bakery.subscriptionStatus === 'expired')) {
    const isPending = bakery.subscriptionStatus === 'pending_verification';
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
        <div className={cn(
          "w-20 h-20 rounded-3xl flex items-center justify-center mb-6",
          isPending ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
        )}>
          {isPending ? <Clock className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">
          {isPending ? 'Approval Pending' : 'Subscription Expired'}
        </h1>
        <p className="text-slate-500 font-bold max-w-md">
          {isPending 
            ? `Your registration for "${bakery.name}" is being reviewed. Please wait for the system administrator to approve your access.`
            : `Your subscription for "${bakery.name}" has expired. Please contact support or renew your plan to continue using the system.`
          }
        </p>
        <div className="flex gap-4 mt-8">
          {!isPending && (
            <button className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all">
              Renew Plan
            </button>
          )}
          <button 
            onClick={() => auth.signOut()}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ENFORCEMENT: ONLY users with phone number linked in database are allowed
  if (!profile.phone) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Registration Incomplete</h1>
        <p className="text-slate-500 font-bold max-w-md">
          you are not authorised by the superadmin (No phone number linked to your profile)
        </p>
        <button 
          onClick={() => auth.signOut()}
          className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (adminOnly && !isSuperAdmin) return <Navigate to="/dashboard" />;
  
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <AppShell>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<BakerySignup />} />
            <Route path="/rate/:bakeryId/:orderId" element={<CustomerFeedbackRating />} />
            <Route path="/dashboard/orders-manager" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="orders" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/users" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="users" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/logs" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="logs" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/subscriptions" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="subscriptions" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/system" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="system" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardHome />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/orders" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="orders" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/production" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="production" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/summary" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="summary" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/custom-cakes" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="custom-cakes" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/chocolates" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="chocolates" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/dealers" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="dealers" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/staff" element={
              <ProtectedRoute>
                <StaffRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/analytics" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="analytics" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/billing" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="billing" />
              </ProtectedRoute>
            } />
            <Route path="/admin/orders/:orderId/design-quote" element={
              <ProtectedRoute>
                <DesignQuote />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/customers" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="customers" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/settings" element={
              <ProtectedRoute>
                <SettingsRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/recipes" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="recipes" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/catalog" element={
              <ProtectedRoute>
                {/* Dynamically select dashboard based on role */}
                <CatalogRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/history" element={
              <ProtectedRoute>
                <HistoryRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/admin/dragees-cost-setup" element={
              <ProtectedRoute>
                <DrageesCostSetup />
              </ProtectedRoute>
            } />
            <Route path="/production/batch/:batchId/tracking" element={
              <ProtectedRoute>
                <ProductionTimeTracking />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/dragees-cost" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="dragees-cost" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/dragees-production" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="dragees-production" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/batch-logs" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="batch-logs" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/corporate-quote" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="corporate-quote" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/attendance" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="attendance" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/payroll" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="payroll" />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </AppShell>
      </Router>
    </AuthProvider>
  );
}

const CatalogRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer' || profile?.role === 'dealer_staff') return <DealerDashboard view="catalog" />;
  return <BakeryAdminDashboard view="catalog" />;
};

const HistoryRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer' || profile?.role === 'dealer_staff') return <DealerDashboard view="history" />;
  return <Navigate to="/dashboard" />;
};

const StaffRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer') return <DealerDashboard view="staff" />;
  return <BakeryAdminDashboard view="staff" />;
};

const SettingsRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer' || profile?.role === 'dealer_staff') return <DealerDashboard view="settings" />;
  return <BakeryAdminDashboard view="settings" />;
};
