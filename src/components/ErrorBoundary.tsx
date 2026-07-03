import React, { Component, ErrorInfo, useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Copy, Check, Info, FileText, Database, Shield, Radio, Key, LogOut } from 'lucide-react';
import { errorHub, AppError } from '../utils/errorHub';
import { APP_VERSION } from '../version';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Emit the caught error into our tracking hub so the whole diagnostic system is unified
    errorHub.emit({
      name: error.name || 'ComponentException',
      message: error.message || 'Error occurred during lifecycle render',
      stack: error.stack || errorInfo.componentStack || undefined,
      type: 'render',
      context: {
        componentStack: errorInfo.componentStack
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <DiagnosticsDashboard 
          error={this.state.error} 
          errorInfo={this.state.errorInfo}
          onReset={() => {
            this.setState({ hasError: false, error: null, errorInfo: null });
            errorHub.clear();
          }}
        />
      );
    }

    return <ErrorBoundaryHandlerWrapper>{this.props.children}</ErrorBoundaryHandlerWrapper>;
  }
}

// Separate component that hooks into errorHub to catch ANY asynchronous / subscription exceptions
// and overlays a beautiful non-blocking Diagnostic Console when requested or on active crash.
const ErrorBoundaryHandlerWrapper = ({ children }: { children: React.ReactNode }) => {
  const [asyncError, setAsyncError] = useState<AppError | null>(null);

  useEffect(() => {
    const unsub = errorHub.subscribe((latestError) => {
      // Opt-in: Only trigger persistent full screen takeover for severe issues (like Database Rules Denials or hard crashes)
      if (latestError.type === 'database' || latestError.type === 'render') {
        setAsyncError(latestError);
      }
    });
    return unsub;
  }, []);

  if (asyncError) {
    return (
      <DiagnosticsDashboard 
        appError={asyncError}
        onReset={() => {
          setAsyncError(null);
          errorHub.clear();
        }}
      />
    );
  }

  return <>{children}</>;
};

interface DiagnosticsDashboardProps {
  error?: Error | null;
  errorInfo?: ErrorInfo | null;
  appError?: AppError | null;
  onReset: () => void;
}

const DiagnosticsDashboard: React.FC<DiagnosticsDashboardProps> = ({
  error,
  errorInfo,
  appError,
  onReset
}) => {
  const [copied, setCopied] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [bypassLoading, setBypassLoading] = useState(false);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  // Format details
  const errorTitle = appError?.name || error?.name || 'Application Error';
  const errorMessage = appError?.message || error?.message || 'An unexpected exception occurred';
  const errorStack = appError?.stack || error?.stack || errorInfo?.componentStack || '';
  const errorType = appError?.type || 'render';

  // Find exact resolution matching common error signatures
  const getResolutionTips = () => {
    const combinedText = `${errorTitle} ${errorMessage}`.toLowerCase();

    if (combinedText.includes('permission-denied') || combinedText.includes('insufficient permissions')) {
      return {
        step: "Validate Tenant & Account Roles",
        details: "This is a Firestore Security Rules violation. It happens when your active login is either missing from the 'users' collection or doesn't have permissions to watch this data. Try accessing the Dashboard to sync your token, or click 'Emergency Logout' to log in with correct credentials."
      };
    }
    
    if (combinedText.includes('tolist') || combinedText.includes('tolowercase') || combinedText.includes('to_string') || combinedText.includes('tolocaleseries') || combinedText.includes('tolocalestring')) {
      return {
        step: "Corrupted Field Type / Empty Value Handling",
        details: "The system attempted to format or parse an undefined database field (often currency values like `revenue` or `totalAmount`, or a date object). The system has been robustly patched to fallback to ₹0 or 'N/A' automatically. Clicking 'Deep Reset & Repair' will purge old offline caches."
      };
    }

    if (combinedText.includes('failed to fetch') || combinedText.includes('network') || !isOnline) {
      return {
        step: "Network Offline / DNS Restructuring",
        details: "Communication between your client browser and Google firestore host was interrupted. Check your router, or let the app continue locally."
      };
    }

    return {
      step: "Automated Core Upgrade",
      details: "An unexpected runtime condition was caught in the React layout engine. Click 'Deep Reset & Repair' to scrub session variables, download the latest cloud-side code bundle and load high-integrity schemas."
    };
  };

  const tip = getResolutionTips();

  // Create JSON report for copying
  const generateDiagnosticReport = () => {
    const reportObj = {
      app: 'Bakesync Portal',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      online: isOnline,
      windowSize: `${window.innerWidth}x${window.innerHeight}`,
      sessionStoreKeys: Object.keys(sessionStorage),
      localStoreKeys: Object.keys(localStorage),
      activeRoute: window.location.pathname + window.location.search,
      error: {
        title: errorTitle,
        message: errorMessage,
        type: errorType,
        stackSnapshot: errorStack.substring(0, 1500)
      }
    };
    return JSON.stringify(reportObj, null, 2);
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateDiagnosticReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeepRepair = () => {
    if (confirm("EMERGENCY ACTION: This will completely flush all cached variables, reset local configurations, sign you out of active sessions, and force download the fresh build from production servers. Run Repair?")) {
      localStorage.clear();
      sessionStorage.clear();
      // Force reload with cache-busting query
      window.location.href = window.location.pathname + `?force_upgrade=true&repair=deep&t=${Date.now()}`;
    }
  };

  const handleLogout = () => {
    if (confirm("Sign out of active account to cure session/permission locks?")) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login?trigger=logout';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-text">
      {/* Visual Header / Subdued Grid Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950 to-slate-950 pointer-events-none -z-10" />

      {/* Main Engineering Dashboard Wrapper */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col justify-center">
        
        {/* Core Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl overflow-hidden relative mb-6">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-500" />
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 shrink-0 animate-pulse">
                <ShieldAlert className="w-10 h-10" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                    KERNEL STAGE CRASH
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20">
                    {errorType} error
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                  Diagnostics Inspector
                </h1>
                <p className="text-slate-400 text-xs font-semibold mt-1">
                  Platform Core: <span className="text-indigo-400">BakeSync Enterprise Suite v{APP_VERSION}</span>
                </p>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="flex flex-wrap md:flex-col gap-2 md:self-stretch justify-end">
              <button 
                onClick={onReset}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg hover:shadow-indigo-500/20"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Soft Relaunch
              </button>
              <button 
                onClick={handleDeepRepair}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
              >
                Deep reset & Repair
              </button>
            </div>
          </div>

          {/* Active Error Code block */}
          <div className="mt-8 p-5 bg-black/60 border border-slate-900 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono">
                Unhandled Exception Stream
              </div>
            </div>
            <p className="text-rose-400 font-mono text-sm font-bold break-all leading-relaxed bg-rose-500/5 px-3 py-2 border border-rose-500/10 rounded-lg">
              {errorTitle}: {errorMessage}
            </p>
          </div>
        </div>

        {/* 2-Column System Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left Column: Context Checklist & Action Advice */}
          <div className="md:col-span-7 space-y-6">
            
            {/* Resolution Checklist Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5 flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-400" /> Suggested Resolution
              </h3>
              
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl mb-4">
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block mb-2">
                  Action Recommended
                </span>
                <h4 className="text-white font-black text-sm mb-1">{tip.step}</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-semibold">
                  {tip.details}
                </p>
              </div>

              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl text-[10px] text-slate-400 font-medium">
                <span>Still stuck or seeing this page? Contact support.</span>
                <button 
                  onClick={handleLogout}
                  className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/30 hover:border-rose-700/50 text-rose-400 rounded-lg font-black uppercase transition-all flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" /> Logout
                </button>
              </div>
            </div>

            {/* Platform Metrics Console */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" /> Environmental Diagnostics
              </h3>

              <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col gap-1">
                  <span className="text-slate-500 font-bold uppercase text-[8px] tracking-wider block">Network Status</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                    <Radio className={`w-3.5 h-3.5 ${isOnline ? 'text-green-500' : 'text-rose-500'}`} />
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col gap-1">
                  <span className="text-slate-500 font-bold uppercase text-[8px] tracking-wider block">Bakesync Core</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    v{APP_VERSION}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex flex-col col-span-2 gap-1">
                  <span className="text-slate-500 font-bold uppercase text-[8px] tracking-wider block">Active URL Stack</span>
                  <div className="text-slate-300 font-medium truncate">
                    {window.location.host}{window.location.pathname}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: High-Integrity Stack/Trace Terminal snippet */}
          <div className="md:col-span-5 flex flex-col">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" /> Exception Trace
                </h3>

                <button 
                  onClick={handleCopyReport}
                  className="px-3 py-1.5 bg-slate-855 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-green-400" /> Copied Repo
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Logs
                    </>
                  )}
                </button>
              </div>

              {/* Monospace Code Editor Pane */}
              <div className="flex-1 bg-black/80 rounded-2xl p-4 font-mono text-[9px] leading-relaxed overflow-auto max-h-[280px] md:max-h-none text-slate-400 border border-slate-950 select-text">
                <span className="text-slate-600 block mb-2">// Captured Stack Frame trace</span>
                {errorStack ? (
                  <pre className="whitespace-pre-wrap break-all">{errorStack}</pre>
                ) : (
                  <div className="text-slate-500 italic py-6 text-center">
                    No active callstack trace context is cached.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer Credit */}
        <div className="mt-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">
          SYSTEM AUTOMATION CORE • SECURE WORKSPACE
        </div>

      </div>
    </div>
  );
};
