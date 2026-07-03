import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from '../version';
import { 
  LogOut, 
  User, 
  Building2, 
  Store, 
  LayoutDashboard, 
  UtensilsCrossed, 
  Users, 
  Receipt, 
  Zap,
  CreditCard,
  FileText,
  Tag,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Candy,
  TrendingUp,
  IndianRupee,
  Clock,
  ChefHat,
  Settings,
  Layers
} from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { differenceInDays, format } from 'date-fns';
import { TRIAL_DAYS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, realProfile, bakery, impersonatedProfile, stopImpersonating, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [isPunchingOut, setIsPunchingOut] = useState(false);
  const [showPunchOutConfirm, setShowPunchOutConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const recordId = `${profile.uid}_${todayStr}`;
    const unsub = onSnapshot(doc(db, 'attendance', recordId), (snapshot) => {
      if (snapshot.exists()) {
        setTodayAttendance(snapshot.data());
      } else {
        setTodayAttendance(null);
      }
    });
    return () => unsub();
  }, [profile?.uid]);

  const handlePunchOut = async () => {
    if (!profile?.uid) return;
    setIsPunchingOut(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const recordId = `${profile.uid}_${todayStr}`;
      const recordRef = doc(db, 'attendance', recordId);
      await updateDoc(recordRef, {
        clockOut: serverTimestamp()
      });
      setShowPunchOutConfirm(false);
    } catch (err: any) {
      console.error("Punch-Out from top-bar failed:", err);
      alert("Failed to punch out: " + err.message);
    } finally {
      setIsPunchingOut(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavItems = () => {
    if (isSuperAdmin && !impersonatedProfile) {
      return [
        { label: 'Platform Home', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Global Orders', icon: Receipt, path: '/dashboard/orders-manager' },
        { label: 'User Directory', icon: Users, path: '/dashboard/users' },
        { label: 'Subscriptions', icon: CreditCard, path: '/dashboard/subscriptions' },
        { label: 'System Audit', icon: FileText, path: '/dashboard/logs' },
        { label: 'System Management', icon: Zap, path: '/dashboard/system' },
      ];
    }

    if (profile?.role === 'bakery_admin') {
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Daily Pulse', icon: TrendingUp, path: '/dashboard/summary' },
        { label: 'Orders', icon: Receipt, path: '/dashboard/orders' },
        { label: 'Production', icon: UtensilsCrossed, path: '/dashboard/production' },
        { label: 'Recipes', icon: ChefHat, path: '/dashboard/recipes' },
        { label: 'Custom Cakes', icon: Building2, path: '/dashboard/custom-cakes' },
        { label: 'Dealers', icon: Users, path: '/dashboard/dealers' },
        { label: 'Staff', icon: Users, path: '/dashboard/staff' },
        { label: 'Dragee Calculator', icon: Candy, path: '/dashboard/dragees-cost' },
        { label: 'Dragees Production', icon: Layers, path: '/dashboard/dragees-production' },
        { label: 'Batch Logs', icon: FileText, path: '/dashboard/batch-logs' },
        { label: 'Corporate Quotes', icon: FileText, path: '/dashboard/corporate-quote' },
        { label: 'Analytics', icon: Zap, path: '/dashboard/analytics' },
        { label: 'Customers', icon: User, path: '/dashboard/customers' },
        { label: 'Attendance', icon: Clock, path: '/dashboard/attendance' },
        { label: 'Payroll', icon: IndianRupee, path: '/dashboard/payroll' },
        { label: 'Settings', icon: Settings, path: '/dashboard/settings' },
      ];
    }

    if (profile?.role === 'production' || profile?.role === 'chocolate_production') {
      return [
        { label: 'Production', icon: UtensilsCrossed, path: '/dashboard' },
        { label: 'Orders', icon: Receipt, path: '/dashboard/orders' },
        { label: 'Recipes', icon: ChefHat, path: '/dashboard/recipes' },
        { label: 'Custom Cakes', icon: Building2, path: '/dashboard/custom-cakes' },
        { label: 'Chocolate', icon: Store, path: '/dashboard/chocolates' },
        { label: 'Dragees Production', icon: Layers, path: '/dashboard/dragees-production' },
        { label: 'Batch Logs', icon: FileText, path: '/dashboard/batch-logs' },
        { label: 'My Attendance', icon: Clock, path: '/dashboard/attendance' },
      ];
    }

    if (profile?.role === 'dealer') {
      return [
        { label: 'Place Orders', icon: Store, path: '/dashboard' },
        { label: 'Browse Catalog', icon: Tag, path: '/dashboard/catalog' },
        { label: 'My History', icon: Receipt, path: '/dashboard/history' },
        { label: 'My Team', icon: Users, path: '/dashboard/staff' },
        { label: 'Settings', icon: Settings, path: '/dashboard/settings' },
      ];
    }

    if (profile?.role === 'dealer_staff') {
      return [
        { label: 'Place Orders', icon: Store, path: '/dashboard' },
        { label: 'Browse Catalog', icon: Tag, path: '/dashboard/catalog' },
        { label: 'My History', icon: Receipt, path: '/dashboard/history' },
        { label: 'Settings', icon: Settings, path: '/dashboard/settings' },
      ];
    }

    if (profile?.role === 'sales') {
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Daily Pulse', icon: TrendingUp, path: '/dashboard/summary' },
        { label: 'Orders', icon: Receipt, path: '/dashboard/orders' },
        { label: 'Customers', icon: User, path: '/dashboard/customers' },
        { label: 'Corporate Quotes', icon: FileText, path: '/dashboard/corporate-quote' },
        { label: 'My Attendance', icon: Clock, path: '/dashboard/attendance' },
      ];
    }

    return [{ label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' }];
  };

  const navItems = getNavItems();

  const trialStart = bakery?.trialStartedAt?.toDate ? bakery.trialStartedAt.toDate() : (bakery?.trialStartedAt ? new Date(bakery.trialStartedAt) : new Date());
  const daysRemaining = Math.max(0, TRIAL_DAYS - differenceInDays(new Date(), trialStart));

  // Only show trial alert for bakery admins on trial (skip for free partners)
  const showTrialAlert = profile?.role === 'bakery_admin' && 
                        bakery?.subscriptionStatus === 'trial';

  const navigateAndClose = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isCollapsed ? 80 : 256,
          x: isMobileMenuOpen ? 0 : (typeof window !== 'undefined' && window.innerWidth < 1024 ? -256 : 0)
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "bg-slate-900 flex flex-col flex-shrink-0 relative group z-[70] h-full transition-shadow duration-300",
          "lg:relative fixed inset-y-0 left-0",
          isMobileMenuOpen ? "shadow-2xl" : ""
        )}
      >
        {/* Toggle Button (Desktop) */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-900 border border-slate-700 rounded-full hidden lg:flex items-center justify-center text-slate-400 hover:text-white z-50 transition-colors shadow-lg"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Close Button (Mobile) */}
        <button 
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute right-4 top-6 lg:hidden text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <div className={cn("p-6 flex items-center", isCollapsed ? "lg:justify-center lg:px-0" : "gap-3")}>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-amber-500/20 shrink-0">B</div>
          <AnimatePresence mode="wait">
            {(!isCollapsed || isMobileMenuOpen) && (
              <div className="flex flex-col">
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="text-white font-bold text-lg tracking-tight whitespace-nowrap"
                >
                  BakeSync
                </motion.span>
                {bakery?.subscriptionStatus === 'free_partner' && (
                  <span className="text-[7px] font-black bg-purple-500 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter mt-0.5 w-fit">Partner</span>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar py-4">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigateAndClose(item.path)}
              className={cn(
                "w-full rounded-md text-sm font-medium flex items-center transition-colors overflow-hidden",
                isCollapsed && !isMobileMenuOpen ? "lg:justify-center lg:p-2" : "px-3 py-2 gap-3",
                location.pathname === item.path 
                  ? "bg-amber-500/10 text-amber-400" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", location.pathname === item.path ? "text-amber-400" : "text-slate-500")} />
              {(!isCollapsed || isMobileMenuOpen) && <span className="whitespace-nowrap">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className={cn("p-4 border-t border-slate-800", isCollapsed && !isMobileMenuOpen && "lg:flex lg:justify-center")}>
          {(!isCollapsed || isMobileMenuOpen) ? (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Powered by Flourish SaaS</div>
              <div className="text-[9px] text-slate-600 font-bold tracking-tight">v{APP_VERSION}</div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 font-bold">{APP_VERSION}</div>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={24} />
            </button>

            {isSuperAdmin && !impersonatedProfile ? (
              <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-600 text-white rounded-full text-[8px] sm:text-[10px] font-black italic border border-blue-700 whitespace-nowrap shadow-sm">
                PLATFORM CONTROL
              </span>
            ) : impersonatedProfile ? (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-rose-600 text-white rounded-full text-[8px] sm:text-[10px] font-black italic border border-rose-700 whitespace-nowrap shadow-sm">
                  SIMULATION ACTIVE
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-bold text-slate-700 truncate text-sm sm:text-base">{bakery?.name}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-6">
            {profile?.role && !['bakery_admin', 'super_admin', 'dealer', 'dealer_staff'].includes(profile.role) && todayAttendance && todayAttendance.clockIn && !todayAttendance.clockOut && (
              <button
                type="button"
                onClick={() => setShowPunchOutConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-extrabold text-[9px] sm:text-[10px] uppercase tracking-wider rounded-xl border border-rose-200 shadow-sm transition-all hover:scale-[1.02] active:scale-95 shrink-0"
              >
                <Clock className="w-3.5 h-3.5 text-rose-500 animate-pulse shrink-0" />
                Punch Out
              </button>
            )}

            {showTrialAlert && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Trial Countdown</span>
                <span className={cn("text-xs font-bold", daysRemaining < 10 ? "text-red-500" : "text-amber-600")}>
                  {daysRemaining} Days
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-6 border-l border-slate-100">
              <div className="hidden sm:flex flex-col items-end mr-1">
                <span className="text-xs font-bold text-slate-900">{realProfile?.displayName}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter shrink-0">
                  {impersonatedProfile ? 'ACTING AS ' + profile?.role.replace('_', ' ') : realProfile?.role.replace('_', ' ')}
                </span>
              </div>
              <button 
                onClick={() => setShowLogoutConfirm(true)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 transition-all shrink-0"
              >
                {(realProfile?.displayName || '?').charAt(0).toUpperCase()}
              </button>
            </div>
          </div>
        </header>


        {/* Views Pane */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6">
          {children}
        </div>
      </main>

      {/* Punch Out Confirmation Overlay */}
      <AnimatePresence>
        {showPunchOutConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl text-center space-y-5"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900">Confirm Punch Out?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you absolutely sure you want to clock out for today? This will log your shift end.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPunchOutConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition animate-active"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePunchOut}
                  disabled={isPunchingOut}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5"
                >
                  {isPunchingOut ? 'Punching...' : 'Yes, Punch Out'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Overlay */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl text-center space-y-5"
            >
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <LogOut className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900">Confirm Log Out?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to log out of the system? If you need to re-login, you will be prompted for security credentials.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    handleLogout();
                  }}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5"
                >
                  Yes, Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
