import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, setDoc, addDoc, orderBy, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../hooks/useSound';
import { Order, OrderStatus, OperationType, Dealer, OrderType } from '../types';
import { cn, formatCurrency, safeGetTime, safeTimestampToDate, triggerAutoFeedback, buildAutoFeedbackPrompt } from '../lib/utils';
import { CheckCircle2, Truck, Bell, Coffee, ChevronRight, Package, Image as ImageIcon, ShieldAlert, Calendar, FileText, Download, BellOff, Clock, AlertTriangle, Trash2, Ban, Volume2, Play, Copy, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { createLog } from '../services/logService';
import { exportOrdersToExcel, generateOrderPDF } from '../lib/exportUtils';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { APP_VERSION } from '../version';

export const ProductionDashboard: React.FC = () => {
  const { profile, bakery, isSuperAdmin, loading: authLoading } = useAuth();
  const { playPending, stopPending, playReady, playReadySingle, playSent, stopReady, stopAllSounds } = useSound();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // WhatsApp Feedback Prompt State
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ url: string; customerName: string } | null>(null);

  // Action State for Modal
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onResolve: () => void;
  } | null>(null);

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void) => {
    setPendingAction({ title, message, confirmText, onResolve });
  };

  const [isSilenced, setIsSilenced] = useState(false);
  const [activeTab, setActiveTab] = useState<'production' | 'completed' | 'tomorrow'>('production');
  const [pipelineSortBy, setPipelineSortBy] = useState<'date' | 'dealer'>('date');
  const [pipelineSortOrder, setPipelineSortOrder] = useState<'asc' | 'desc'>('asc');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'dealers' | 'custom'>('all');
  const [historySortBy, setHistorySortBy] = useState<'date' | 'dealer'>('date');
  const [historySortOrder, setHistorySortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentTime, setCurrentTime] = useState(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = format(tomorrowDate, 'yyyy-MM-dd');
  const [problemModalOrder, setProblemModalOrder] = useState<Order | null>(null);
  const [problemReason, setProblemReason] = useState<'electricity' | 'oven' | 'delay' | 'cancel' | 'other'>('delay');
  const [problemDescription, setProblemDescription] = useState('');

  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('Incorrect Details');
  const [cancelCustomReason, setCancelCustomReason] = useState('');

  const confirmCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const finalReason = cancelReason === 'Other' ? (cancelCustomReason || 'Cancelled by Staff') : cancelReason;
    stopAllSounds();
    try {
      const orderRef = doc(db, 'orders', cancelModalOrder.id);
      const staffName = profile?.displayName || auth.currentUser?.displayName || auth.currentUser?.email || 'Production Staff';
      
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: staffName,
        cancelledReason: finalReason,
        cancelSeenByDealer: false,
        updatedAt: serverTimestamp()
      });
      await createLog('order', `Order #${cancelModalOrder.id.slice(-6)} CANCELLED by ${staffName}: ${finalReason}`, auth.currentUser?.uid || profile?.uid, auth.currentUser?.email || profile?.email, bakery?.id || '');
      setCancelModalOrder(null);
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      alert("Failed to cancel order: " + (err.message || String(err)));
      handleFirestoreError(err, OperationType.UPDATE, `orders/${cancelModalOrder.id}`);
    }
  };

  const reportProblem = async () => {
    if (!problemModalOrder) return;
    
    // Immediate silence for any reported issue
    setIsSilenced(true);
    stopAllSounds();
    
    try {
      const docRef = doc(db, 'orders', problemModalOrder.id);
      const updateData: any = {
        problemDetails: {
          reason: problemReason,
          description: problemDescription || `Issue reported: ${problemReason}`,
          reportedAt: serverTimestamp()
        },
        problemSeenByDealer: false,
        updatedAt: serverTimestamp()
      };

      // If it's a cancellation, update the status too
      if (problemReason === 'cancel') {
        updateData.status = 'cancelled';
        updateData.cancelledAt = serverTimestamp();
        updateData.cancelledBy = auth.currentUser?.email || profile?.email || 'production_staff';
        updateData.cancelledReason = problemDescription || 'Cancelled in production';
        updateData.cancelSeenByDealer = false;
      }

      await updateDoc(docRef, updateData);
      await createLog('order', `PRODUCTION ${problemReason === 'cancel' ? 'CANCEL' : 'PROBLEM'}: ${problemReason} reported for #${problemModalOrder.displayId || problemModalOrder.id.slice(-6)}`, auth.currentUser?.uid || profile?.uid, auth.currentUser?.email || profile?.email, bakery?.id || '');
      
      if (problemReason === 'cancel') {
        alert("Order cancelled successfully.");
      }
      
      setProblemModalOrder(null);
      setProblemReason('delay');
      setProblemDescription('');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${problemModalOrder.id}`);
    }
  };

  const clearProblem = async (orderId: string) => {
    try {
      const docRef = doc(db, 'orders', orderId);
      await updateDoc(docRef, {
        problemDetails: null,
        updatedAt: serverTimestamp()
      });
      await createLog('order', `PROBLEM CLEARED for #${orderId.slice(-6)}`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  // Force re-render every minute to update the "5-minute Linger" logic
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000); // Check every 30s
    return () => clearInterval(timer);
  }, []);

  const isRecentlySent = (order: Order) => {
    if (order.status !== 'sent' || !order.sentAt) return false;
    const sentTime = safeGetTime(order.sentAt);
    const diffInMinutes = (currentTime.getTime() - sentTime) / (1000 * 60);
    return diffInMinutes < 5;
  };

  const isInProgressTooLong = (order: Order) => {
    if (order.status !== 'in_progress' || !order.inProgressAt) return false;
    const inProgressTime = safeGetTime(order.inProgressAt);
    const diffInMinutes = (currentTime.getTime() - inProgressTime) / (1000 * 60);
    return diffInMinutes > 20;
  };

  // Safety timeout: If loading takes too long, stop the spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setLoadError("Loading is taking longer than expected. Please check your connection or try refreshing.");
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!bakery) {
      // If we are not loading auth anymore, and still no bakery, something is wrong
      if (!authLoading) {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setLoadError(null);

    // Load 100 most recent orders. We don't order in the query to avoid composite index requirements
    // and to ensure documents missing the 'updatedAt' field are still included.
    const q = query(
      collection(db, 'orders'),
      where('bakeryId', '==', bakery.id),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const ordersData: Order[] = snapshot.docs
           .map(doc => ({ ...doc.data(), id: doc.id } as Order))
           .filter(o => !o.isDeleted);
        
        const sortedData = ordersData.sort((a, b) => {
          const timeA = safeGetTime(a.updatedAt || a.createdAt);
          const timeB = safeGetTime(b.updatedAt || b.createdAt);
          return timeB - timeA;
        });

        setOrders(sortedData);
      } catch (err) {
        console.error('Data Processing Error:', err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('Production Query Error:', error);
      setLoading(false);
      // We don't throw here to avoid stopping the app, just log it
      // handleFirestoreError will alert the user
      try {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      } catch (e) {
        // Silent catch for the throw in handleFirestoreError
      }
    });

    // Fetch dealers for color coding
    const dealersUnsub = onSnapshot(query(collection(db, 'dealers'), where('bakeryId', '==', bakery.id)), (snap) => {
      const uniqueDealers = new Map<string, Dealer>();
      snap.docs.forEach(doc => {
        const d = { ...doc.data(), id: doc.id } as Dealer;
        if (!d.isDeleted) {
          uniqueDealers.set(doc.id, d);
        }
      });
      setDealers(Array.from(uniqueDealers.values()));
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, 'dealers');
    });

    return () => {
      unsubscribe();
      dealersUnsub();
    };
  }, [bakery?.id, authLoading]);

  const lastPendingState = useRef(false);
  const lastReadyState = useRef(false);
  const lastPendingCount = useRef(0);
  const lastReadyCount = useRef(0);

  const prevStatuses = useRef<Record<string, OrderStatus>>({});

  // Separate effect for sound alerts to avoid subscription loops
  useEffect(() => {
    // Filter for "active" orders for sounds (last 12 hours) to avoid zombie alerts
    const recentThreshold = Date.now() - (12 * 60 * 60 * 1000);
    const soundTargetOrders = orders.filter(o => {
      const updatedAt = safeGetTime(o.updatedAt || o.createdAt);
      return updatedAt > recentThreshold;
    });

    const hasPending = soundTargetOrders.some(o => o.status === 'pending');
    const hasReady = soundTargetOrders.some(o => o.status === 'ready');
    const readyCount = soundTargetOrders.filter(o => o.status === 'ready').length;
    const pendingCount = soundTargetOrders.filter(o => o.status === 'pending').length;

    // Reset silence if number of alerts increases
    if (readyCount > lastReadyCount.current || pendingCount > lastPendingCount.current) {
      setIsSilenced(false);
    }
    lastReadyCount.current = readyCount;
    lastPendingCount.current = pendingCount;

    if (hasPending && !isSilenced) {
      if (!lastPendingState.current) {
        playPending();
        lastPendingState.current = true;
      }
    } else {
      if (lastPendingState.current) {
        stopPending();
        lastPendingState.current = false;
      }
    }

    if (hasReady && !isSilenced) {
      if (!lastReadyState.current) {
        playReady(true); // Loop in production
        lastReadyState.current = true;
      }
    } else {
      if (lastReadyState.current) {
        stopReady();
        lastReadyState.current = false;
      }
    }

    // Single trigger transitions for 'ready' and 'sent'
    orders.forEach(order => {
      const prev = prevStatuses.current[order.id];
      if (prev && prev !== order.status) {
        if (order.status === 'ready') {
          playReadySingle();
        }
        if (order.status === 'sent') {
          playSent();
        }
      }
      prevStatuses.current[order.id] = order.status;
    });
  }, [orders, isSilenced, playPending, stopPending, playReady, playReadySingle, stopReady, playSent]);

  // Global cleanup when dashboard unmounts
  useEffect(() => {
    return () => {
      stopPending();
      stopReady();
      lastPendingState.current = false;
      lastReadyState.current = false;
    };
  }, [stopPending, stopReady]);

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const isAdmin = profile?.role === 'bakery_admin' || profile?.role === 'super_admin';
  const isProduction = profile?.role === 'production';
  const isChocolate = profile?.role === 'chocolate_production';

  const canMarkThisOrderReady = (orderType: OrderType) => {
    if (isAdmin) return true;
    if (orderType === 'chocolate' && isChocolate) return true;
    if ((orderType === 'custom_cake' || orderType === 'dealer_cake') && isProduction) return true;
    return false;
  };

  const updateStatus = async (orderId: string, currentStatus: OrderStatus) => {
    if (updatingIds.has(orderId)) return;
    
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Silence sounds
    stopAllSounds();
    setIsSilenced(true);

    // Check permissions for specific transitions
    if (currentStatus === 'in_progress' && !canMarkThisOrderReady(order.type)) {
      const sectionNeeded = order.type === 'chocolate' ? 'Chocolate' : 'Bakery';
      alert(`Access Denied: Only ${sectionNeeded} Section staff can mark this order as Ready.`);
      return;
    }

    setUpdatingIds(prev => new Set(prev).add(orderId));
    try {
      const docRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      const staffName = profile?.displayName || profile?.email || 'System';
      let nextStatus: OrderStatus;
      const updates: any = { 
        updatedAt: serverTimestamp(),
      };

      const isDirectToProductionType = order?.type === 'dealer_cake' || order?.type === 'custom_cake' || order?.type === 'chocolate' || !!order?.dealerId;

      switch (currentStatus) {
        case 'pending': 
          if (isDirectToProductionType) {
            nextStatus = 'in_progress';
            updates.receivedAt = serverTimestamp();
            updates.receivedBy = staffName;
            updates.inProgressAt = serverTimestamp();
            updates.inProgressBy = staffName;
          } else {
            nextStatus = 'received'; 
            updates.receivedAt = serverTimestamp();
            updates.receivedBy = staffName;
          }
          break;
        case 'received': 
          nextStatus = 'in_progress'; 
          updates.inProgressAt = serverTimestamp();
          updates.inProgressBy = staffName;
          break;
        case 'in_progress': 
          nextStatus = 'ready'; 
          updates.readyAt = serverTimestamp();
          updates.readyBy = staffName;
          updates.readySeenByDealer = false;
          break;
        case 'ready': 
          nextStatus = 'sent'; 
          updates.sentAt = serverTimestamp();
          updates.sentBy = staffName;
          break;
        default: return;
      }

      if (nextStatus === 'sent') {
        const isDealerOrder = !!order?.dealerId;
        if (order && !isDealerOrder && (order.type === 'custom_cake' || order.type === 'chocolate')) {
          const balance = order.totalAmount - (order.advanceReceived || 0);
          if (balance > 0) {
            confirmAction(
              'Balance Payment Verification',
              `Order Total: ₹${(order.totalAmount || 0).toLocaleString()}\nAdvance Paid: ₹${(order.advanceReceived || 0).toLocaleString()}\n\nPENDING BALANCE: ₹${(balance || 0).toLocaleString()}\n\nHas the balance amount been collected by the staff?`,
              'Confirm Payment & Dispatch',
              async () => {
                try {
                  await updateDoc(docRef, { 
                    ...updates,
                    status: 'sent', 
                    sentBy: staffName
                  });
                  await createLog('order', `Order #${orderId.slice(-6)} delivered by ${staffName} (Payment Verified)`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
                  const fbPrompt = buildAutoFeedbackPrompt(order, bakery?.name, bakery?.id);
                  if (fbPrompt) setFeedbackPrompt(fbPrompt);
                } catch (err) {
                  console.error(err);
                } finally {
                  setPendingAction(null);
                  setUpdatingIds(prev => {
                    const next = new Set(prev);
                    next.delete(orderId);
                    return next;
                  });
                }
              }
            );
            return;
          }
        }
      }

      if (nextStatus === 'in_progress') {
        updates.problemDetails = null;
        updates.problemSeenByDealer = false;
      }

      updates.status = nextStatus;
      await updateDoc(docRef, updates);
      await createLog('order', `Order #${orderId.slice(-6)} status: ${nextStatus} by ${staffName}`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
      if (nextStatus === 'sent' && order) {
        const fbPrompt = buildAutoFeedbackPrompt(order, bakery?.name, bakery?.id);
        if (fbPrompt) setFeedbackPrompt(fbPrompt);
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const productionColumns: { status: OrderStatus; label: string; color: string; badge: string }[] = [
    { status: 'pending', label: 'Pending', color: 'bg-rose-50 text-rose-600 border-rose-100', badge: 'bg-rose-600' },
    { status: 'in_progress', label: 'In Progress', color: 'bg-amber-50 text-amber-600 border-amber-100', badge: 'bg-amber-600' },
    { status: 'ready', label: 'Ready', color: 'bg-indigo-50 text-indigo-600 border-indigo-100', badge: 'bg-indigo-600' },
    { status: 'sent', label: 'Sent', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', badge: 'bg-emerald-600' },
  ];

  const renderTomorrowWorkload = () => {
    const tomorrowOrders = orders.filter(
      o => o.deliveryDate === tomorrowStr && o.status !== 'cancelled' && o.status !== 'sent'
    );

    // Let's aggregate cakes
    const cakeAggregates: Record<string, { totalWeight: number; count: number; flavor: string }> = {};
    // Let's aggregate chocolates
    const chocolateAggregates: Record<string, { totalQuantity: number; productType: string; flavor?: string }> = {};

    tomorrowOrders.forEach(order => {
      const isCake = 'weight' in order.details;
      const details = order.details as any;
      const quantity = details.quantity || 1;

      if (isCake) {
        const flavor = details.flavor || 'Unknown Flavor';
        const weight = details.weight || 0;
        const totalWeightForOrder = weight * quantity;
        
        if (!cakeAggregates[flavor]) {
          cakeAggregates[flavor] = {
            totalWeight: 0,
            count: 0,
            flavor
          };
        }
        cakeAggregates[flavor].totalWeight += totalWeightForOrder;
        cakeAggregates[flavor].count += quantity;
      } else {
        const productType = details.productType || 'chocolate';
        const flavor = details.flavor || '';
        const key = flavor ? `${productType} - ${flavor}` : productType;
        const totalQtyForOrder = details.quantity || 0;

        if (!chocolateAggregates[key]) {
          chocolateAggregates[key] = {
            totalQuantity: 0,
            productType,
            flavor
          };
        }
        chocolateAggregates[key].totalQuantity += totalQtyForOrder;
      }
    });

    const cakeList = Object.values(cakeAggregates).sort((a, b) => b.totalWeight - a.totalWeight);
    const chocolateList = Object.values(chocolateAggregates).sort((a, b) => b.totalQuantity - a.totalQuantity);

    const copyPrepSheet = () => {
      let text = `📋 KITCHEN PREP-SHEET FOR TOMORROW (${tomorrowStr})\n`;
      text += `==============================================\n\n`;
      
      if (cakeList.length > 0) {
        text += `🎂 CAKES:\n`;
        cakeList.forEach(item => {
          text += `- ${item.totalWeight}kg ${item.flavor} (${item.count} Cakes)\n`;
        });
        text += `\n`;
      }

      if (chocolateList.length > 0) {
        text += `🍫 CHOCOLATES & ASSORTED:\n`;
        chocolateList.forEach(item => {
          const unit = item.productType === 'dragees' ? 'kg' : 'Boxes/Pcs';
          text += `- ${item.totalQuantity}${unit} ${item.flavor || item.productType.toUpperCase()}\n`;
        });
        text += `\n`;
      }

      if (tomorrowOrders.length === 0) {
        text += `No items scheduled for tomorrow.`;
      }

      navigator.clipboard.writeText(text);
      alert('Prep-sheet copied to clipboard!');
    };

    const printPrepSheet = () => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const html = `
        <html>
          <head>
            <title>Tomorrow's Kitchen Prep Sheet - ${tomorrowStr}</title>
            <style>
              body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; }
              h1 { font-size: 24px; font-weight: 900; text-transform: uppercase; margin-bottom: 5px; letter-spacing: -0.025em; }
              .date { font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 30px; letter-spacing: 0.05em; }
              .section-title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; }
              .grid { display: grid; grid-template-cols: repeat(2, 1fr); gap: 20px; }
              .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; background: #f8fafc; }
              .qty { font-size: 20px; font-weight: 900; color: #2563eb; }
              .label { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 4px; }
              .footer { margin-top: 50px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
              @media print {
                body { padding: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>Kitchen Prep-Sheet</h1>
            <div class="date">Due: ${format(tomorrowDate, 'eeee, dd MMMM yyyy')}</div>

            ${cakeList.length > 0 ? `
              <div class="section-title">🎂 Cake Workload</div>
              <div class="grid">
                ${cakeList.map(item => `
                  <div class="card">
                    <div class="qty">${item.totalWeight} kg</div>
                    <div class="label">${item.flavor}</div>
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px;">Total Orders: ${item.count}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${chocolateList.length > 0 ? `
              <div class="section-title">🍫 Chocolate Workload</div>
              <div class="grid">
                ${chocolateList.map(item => `
                  <div class="card">
                    <div class="qty">${item.totalQuantity} ${item.productType === 'dragees' ? 'kg' : 'Boxes/Pcs'}</div>
                    <div class="label">${item.flavor || item.productType.toUpperCase()}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${tomorrowOrders.length === 0 ? '<p style="font-weight: 700; color: #64748b; font-size: 14px;">No items scheduled for tomorrow.</p>' : ''}

            <div class="footer">Kreative Chocolates Production Management System</div>
            <script>window.print();</script>
          </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
    };

    return (
      <div className="flex-1 lg:overflow-y-auto overflow-visible p-4 sm:p-6 bg-slate-50 flex flex-col">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Tomorrow's Workload</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                Prep list for {format(tomorrowDate, 'eeee, dd MMM yyyy')} ({tomorrowOrders.length} Pending Orders)
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={copyPrepSheet}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all active:scale-95 animate-in fade-in"
              >
                <Copy size={14} /> Copy Prep-Sheet
              </button>
              <button
                onClick={printPrepSheet}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all active:scale-95 animate-in fade-in"
              >
                <Printer size={14} /> Print Prep-Sheet
              </button>
            </div>
          </div>

          {tomorrowOrders.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <Calendar className="w-12 h-12 text-slate-100 mx-auto mb-4" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                No orders scheduled for delivery tomorrow.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Aggregated view */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cakes block */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200/60 shadow-sm">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    🎂 Cake Quantities
                  </h4>
                  {cakeList.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400 uppercase">No cakes scheduled</p>
                  ) : (
                    <div className="space-y-3">
                      {cakeList.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                          <div>
                            <span className="text-xs font-black text-slate-900 uppercase block">{item.flavor}</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mt-0.5">
                              {item.count} {item.count === 1 ? 'Order' : 'Orders'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-black text-blue-600 block leading-none">{item.totalWeight} <span className="text-[10px]">kg</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chocolates block */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200/60 shadow-sm">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    🍫 Chocolates & Packs
                  </h4>
                  {chocolateList.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400 uppercase">No chocolates scheduled</p>
                  ) : (
                    <div className="space-y-3">
                      {chocolateList.map((item, idx) => {
                        const unit = item.productType === 'dragees' ? 'kg' : 'Boxes/Pcs';
                        return (
                          <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                            <div>
                              <span className="text-xs font-black text-slate-900 uppercase block">
                                {item.flavor || item.productType.toUpperCase().replace('_', ' ')}
                              </span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mt-0.5">
                                Type: {item.productType.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-black text-emerald-600 block leading-none">
                                {item.totalQuantity} <span className="text-[10px]">{unit}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed Orders table */}
              <div className="bg-white rounded-[2rem] border border-slate-200/60 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    Detailed Orders Breakdown
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {tomorrowOrders.map(order => (
                    <div key={order.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-900">{order.displayId || `#${order.id.slice(-6).toUpperCase()}`}</span>
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-slate-900 text-white uppercase tracking-wider">
                            {order.dealerCompanyName || 'Retail'}
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border",
                            order.status === 'ready' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                            order.status === 'in_progress' ? "bg-amber-50 text-amber-600 border-amber-100" :
                            "bg-slate-50 text-slate-600 border-slate-100"
                          )}>
                            {order.status === 'ready' ? 'Ready' : order.status === 'in_progress' ? 'In Progress' : 'Pending'}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-700 mt-1">
                          {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : ('flavor' in order.details ? order.details.flavor : 'Custom Order')}
                        </p>
                        {order.details.instruction && (
                          <p className="text-[10px] font-medium text-slate-400 mt-0.5">Instruction: {order.details.instruction}</p>
                        )}
                      </div>
                      <div className="text-left sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase leading-none">Delivery Time</p>
                          <p className="text-xs font-bold text-slate-900 mt-1">{order.deliveryTime || 'Anytime'}</p>
                        </div>
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-all sm:mt-2"
                        >
                          View Order
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCompletedTab = () => {
    const completedOrders = orders
      .filter(o => (o.status === 'sent' && !isRecentlySent(o)) || o.status === 'cancelled')
      .filter(o => {
        if (historyFilter === 'all') return true;
        const isDealer = o.dealerId || o.type === 'dealer_cake';
        if (historyFilter === 'dealers') return isDealer;
        if (historyFilter === 'custom') return !isDealer;
        return true;
      })
      .sort((a, b) => {
        if (historySortBy === 'date') {
          const timeA = a.sentAt?.toDate().getTime() || 0;
          const timeB = b.sentAt?.toDate().getTime() || 0;
          return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        } else {
          const nameA = a.dealerCompanyName || 'Retail';
          const nameB = b.dealerCompanyName || 'Retail';
          return historySortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
      });

    return (
      <div className="flex-1 lg:overflow-y-auto overflow-visible p-4 sm:p-6 bg-slate-50 flex flex-col">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Dispatched History</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Showing last {completedOrders.length} dispatched orders</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                {(['all', 'dealers', 'custom'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setHistoryFilter(f)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                      historyFilter === f ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'dealers' ? 'Dealers' : 'Retail'}
                  </button>
                ))}
              </div>
              
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <button
                  onClick={() => {
                    if (historySortBy === 'date') setHistorySortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    else setHistorySortBy('date');
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    historySortBy === 'date' ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-50"
                  )}
                >
                  Sort: Time {historySortBy === 'date' && (historySortOrder === 'desc' ? '▼' : '▲')}
                </button>
                <button
                  onClick={() => {
                    if (historySortBy === 'dealer') setHistorySortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    else setHistorySortBy('dealer');
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                    historySortBy === 'dealer' ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-50"
                  )}
                >
                  Sort: Dealer {historySortBy === 'dealer' && (historySortOrder === 'desc' ? '▼' : '▲')}
                </button>
              </div>
            </div>
          </div>

          {completedOrders.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-slate-100 mx-auto mb-4" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                No {historyFilter === 'all' ? '' : historyFilter} orders completed today.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {completedOrders.map(order => (
                <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center font-black text-xs">
                      SNT
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-900">{order.displayId || `#${order.id.slice(-4).toUpperCase()}`}</span>
                        <span className="text-[8px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter w-fit">
                          {order.dealerCompanyName || 'Retail'}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-700 mt-1">
                        {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : ('flavor' in order.details ? order.details.flavor : 'Custom Item')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-none">Sent At</p>
                    <p className="text-xs font-bold text-slate-900">{order.sentAt ? format(order.sentAt.toDate(), 'HH:mm') : '--:--'}</p>
                    <p className="text-[8px] font-bold text-slate-300 mt-0.5 uppercase tracking-tighter">By {order.sentBy?.split(' ')[0]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };


  if (loading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Production Flow Syncing (v{APP_VERSION})...</div>
      </div>
    );
  }

  if (loadError || !bakery) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">
            {!bakery ? 'No Bakery Assigned' : 'Pipeline Connection Error'}
          </h2>
          <p className="text-sm font-medium text-slate-500 leading-relaxed">
            {!bakery 
              ? "Your account isn't linked to a specific bakery yet. Please contact your administrator." 
              : loadError}
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-95"
        >
          Refresh Dashboard
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full lg:h-[calc(100vh-10rem)] bg-white rounded-2xl border border-slate-200 shadow-lg flex flex-col lg:overflow-hidden overflow-visible relative"
    >
      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 text-center">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{pendingAction.title}</h3>
            <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed whitespace-pre-line">
              {pendingAction.message}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingAction(null)}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
              >
                Cancel
              </button>
              <button 
                onClick={pendingAction.onResolve}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailsModal 
          order={selectedOrder} 
          bakery={bakery}
          dealer={dealers.find(d => d.id === selectedOrder.dealerId)}
          userRole={profile?.role}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedOrder(null)} 
          onSilence={() => { setIsSilenced(true); stopAllSounds(); }}
        />
      )}

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6 w-full lg:w-auto">
          <div className="flex items-center justify-between w-full lg:w-auto">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">Production</h2>
            <span className="lg:hidden px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[9px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
              Staff: {profile?.displayName?.split(' ')[0]}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
            <div className="flex bg-slate-200/50 p-1 rounded-2xl overflow-x-auto scrollbar-none whitespace-nowrap max-w-full shrink-0">
              <button 
                onClick={() => setActiveTab('production')}
                className={cn(
                  "px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all focus:ring-2 focus:ring-blue-500 shrink-0",
                  activeTab === 'production' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <span className="inline sm:hidden">Live ({orders.filter(o => (o.status !== 'sent' && o.status !== 'cancelled') || isRecentlySent(o)).length})</span>
                <span className="hidden sm:inline">Live Pipeline ({orders.filter(o => (o.status !== 'sent' && o.status !== 'cancelled') || isRecentlySent(o)).length})</span>
              </button>
              <button 
                onClick={() => setActiveTab('tomorrow')}
                className={cn(
                  "px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all focus:ring-2 focus:ring-blue-500 shrink-0",
                  activeTab === 'tomorrow' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <span className="inline sm:hidden">Tomorrow ({orders.filter(o => o.deliveryDate === tomorrowStr && o.status !== 'cancelled' && o.status !== 'sent').length})</span>
                <span className="hidden sm:inline">Tomorrow's Work ({orders.filter(o => o.deliveryDate === tomorrowStr && o.status !== 'cancelled' && o.status !== 'sent').length})</span>
              </button>
              <button 
                onClick={() => setActiveTab('completed')}
                className={cn(
                  "px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all focus:ring-2 focus:ring-blue-500 shrink-0",
                  activeTab === 'completed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <span className="inline sm:hidden">History ({orders.filter(o => (o.status === 'sent' && !isRecentlySent(o)) || o.status === 'cancelled').length})</span>
                <span className="hidden sm:inline">Dispatched History ({orders.filter(o => (o.status === 'sent' && !isRecentlySent(o)) || o.status === 'cancelled').length})</span>
              </button>
            </div>

            {activeTab === 'production' && (
              <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit shrink-0">
                <button
                  onClick={() => {
                    if (pipelineSortBy === 'date') setPipelineSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    else setPipelineSortBy('date');
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                    pipelineSortBy === 'date' ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-50"
                  )}
                >
                  Time {pipelineSortBy === 'date' && (pipelineSortOrder === 'desc' ? '▼' : '▲')}
                </button>
                <button
                  onClick={() => {
                    if (pipelineSortBy === 'dealer') setPipelineSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    else setPipelineSortBy('dealer');
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                    pipelineSortBy === 'dealer' ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-50"
                  )}
                >
                  Dealer {pipelineSortBy === 'dealer' && (pipelineSortOrder === 'desc' ? '▼' : '▲')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2 justify-end">
          <span className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
            Staff: {profile?.displayName?.split(' ')[0]}
          </span>
        </div>
      </div>
      
      {activeTab === 'production' ? (
        <>
          {orders.filter(o => (o.status !== 'sent' && o.status !== 'cancelled') || isRecentlySent(o)).length === 0 && (
            <div className="py-20 text-center text-slate-400">
               <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <Package className="w-8 h-8 text-slate-200" />
               </div>
               <p className="text-xs font-black uppercase tracking-widest">No active orders right now</p>
            </div>
          )}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 lg:overflow-hidden overflow-visible">
          {productionColumns.map(col => (
            <div key={col.status} className="flex flex-col min-h-0">
              <div className={cn("p-4 text-[11px] font-black uppercase tracking-widest border-b flex justify-between items-center transition-colors", col.color)}>
                <span>{col.label}</span>
                <span className={cn("px-2.5 py-1 rounded-lg text-white font-black text-[10px] shadow-sm", col.badge)}>
                  {orders.filter(o => {
                    const statusMatch = col.status === 'in_progress' ? (o.status === 'in_progress' || o.status === 'received') : o.status === col.status;
                    if (col.status === 'sent') return isRecentlySent(o);
                    return statusMatch;
                  }).length}
                </span>
              </div>
              <div className="flex-1 lg:overflow-y-auto p-3 space-y-3 custom-scrollbar overflow-visible">
                {orders
                  .filter(o => {
                    const statusMatch = col.status === 'in_progress' ? (o.status === 'in_progress' || o.status === 'received') : o.status === col.status;
                    if (col.status === 'sent') return isRecentlySent(o);
                    return statusMatch;
                  })
                  .sort((a, b) => {
                    if (pipelineSortBy === 'date') {
                      const timeA = safeGetTime(a.createdAt);
                      const timeB = safeGetTime(b.createdAt);
                      return pipelineSortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                    } else {
                      const nameA = a.dealerCompanyName || 'Retail';
                      const nameB = b.dealerCompanyName || 'Retail';
                      return pipelineSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                    }
                  })
                  .map(order => {
                  const dealer = order.dealerId ? dealers.find(d => d.id === order.dealerId) : null;
                  const dealerColor = dealer?.color;
                  return (
                    <div 
                      key={order.id} 
                      className={cn(
                        "p-3 rounded-xl border shadow-sm transition-all animate-in fade-in slide-in-from-top-4 border-l-4",
                        !order.dealerId && (
                          order.status === 'pending' || order.status === 'received' ? "border-l-rose-500" :
                          order.status === 'in_progress' ? "border-l-amber-500" :
                          order.status === 'ready' ? "border-l-indigo-500" :
                          "border-l-emerald-500"
                        ),
                        (order.status === 'pending' || order.status === 'received') && !order.dealerId && "bg-rose-50 border-rose-200 animate-flash",
                        isInProgressTooLong(order) && "bg-red-50 border-red-200 animate-pulse border-l-red-600"
                      )}
                      style={{ 
                        borderLeftColor: order.dealerId ? (dealerColor || '#6366f1') : undefined,
                        backgroundColor: order.dealerId ? `${dealerColor || '#6366f1'}15` : (
                          order.status === 'pending' ? '#fff1f2' : 
                          order.status === 'in_progress' ? '#fffbeb' :
                          order.status === 'ready' ? '#eef2ff' :
                          '#f0fdf4'
                        )
                      }}
                    >
                    <div className="cursor-pointer" onClick={() => setSelectedOrder(order)}>
                      <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-900 uppercase">
                            {order.displayId || `#${order.id.slice(-4).toUpperCase()}`}
                          </span>
                          {(('isPhotoCake' in order.details && order.details.isPhotoCake) || ('photoUrl' in order.details && order.details.photoUrl)) && (
                            <span className="text-[8px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">
                              PHOTO CAKE
                            </span>
                          )}
                        </div>
                        {isInProgressTooLong(order) && (
                          <span className="text-[8px] font-black text-red-600 animate-pulse mt-0.5">⚠️ OVER 20 MINS IN PROG</span>
                        )}
                        <span className="text-[8px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter w-fit mt-1">
                          {order.dealerCompanyName || 'Retail'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-300 font-mono">
                        {order.createdAt?.toDate() ? format(order.createdAt.toDate(), 'HH:mm') : 'Now'}
                      </span>
                    </div>
                    
                    <div className="text-sm font-bold text-slate-900 mb-1">
                    {'weight' in order.details ? (
                      <div className="flex items-center flex-wrap gap-2">
                        <span>{order.details.weight}kg {order.details.flavor}</span>
                        {'quantity' in order.details && (
                          <span className="px-3 py-1 bg-blue-600 text-white rounded-lg font-black text-xs shadow-sm">
                            QTY: {(order.details as any).quantity || 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center flex-wrap gap-2">
                        <span>{('flavor' in order.details ? order.details.flavor : 'Custom Order')}</span>
                        {'quantity' in order.details && (
                          <span className="px-3 py-1 bg-blue-600 text-white rounded-lg font-black text-xs shadow-sm">
                            QTY: {(order.details as any).quantity || 1}
                          </span>
                        )}
                      </div>
                    )}
                    </div>
                    
                    {/* Photo cake badge moved to top for better visibility */}

                    {'slipUrl' in order.details && order.details.slipUrl && (
                      <div className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase mb-3 ml-1">
                        SLIP ATTACHED
                      </div>
                    )}

                    {order.type === 'custom_cake' && order.designQuote && (
                      <div className="mt-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100/30 space-y-2">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase">
                          <span className="text-slate-400">Spec: {order.designQuote.fondantType} Fondant</span>
                          <span className="text-blue-600">₹{(order.totalAmount || 0).toLocaleString()}</span>
                        </div>
                        {(order.designQuote.characters.small > 0 || order.designQuote.characters.large > 0 || order.designQuote.flowers.fondant > 0 || order.designQuote.flowers.real > 0) && (
                          <div className="text-[8px] font-bold text-slate-500 uppercase flex gap-2">
                            {order.designQuote.characters.small + order.designQuote.characters.large > 0 && <span>• {order.designQuote.characters.small + order.designQuote.characters.large} Characters</span>}
                            {order.designQuote.flowers.fondant + order.designQuote.flowers.real > 0 && <span>• {order.designQuote.flowers.fondant + order.designQuote.flowers.real} Flowers</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {order.problemDetails && (
                      <div className="mt-2 p-2 bg-rose-600 text-white rounded-lg shadow-sm animate-pulse flex items-center gap-2">
                        <AlertTriangle size={12} className="shrink-0" />
                        <div className="flex-1 overflow-hidden">
                          <p className="text-[9px] font-black uppercase tracking-widest truncate">{order.problemDetails.reason}: {order.problemDetails.description}</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); clearProblem(order.id); }}
                          className="bg-white/20 hover:bg-white/30 p-1 rounded"
                        >
                          <CheckCircle2 size={10} />
                        </button>
                      </div>
                    )}

                    <div className="mt-3 flex flex-col gap-1.5 mb-3">
                      <div className="flex items-center gap-1.5 p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                        <Clock className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-black text-slate-900 uppercase">Delivery Due:</span>
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded ml-auto",
                          (() => {
                            const now = new Date();
                            const deliveryTime = order.deliveryTime || '23:59';
                            const [hours, mins] = deliveryTime.split(':').map(Number);
                            const fullDeliveryDate = new Date(order.deliveryDate);
                            fullDeliveryDate.setHours(hours, mins, 0, 0);
                            
                            if (now > fullDeliveryDate && order.status !== 'sent') return "bg-red-600 text-white animate-pulse";
                            return "bg-blue-600 text-white";
                          })()
                        )}>
                          {order.deliveryTime || '--:--'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-black px-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span className={cn(
                          "flex items-center gap-1",
                          (() => {
                            const delDate = new Date(order.deliveryDate);
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            delDate.setHours(0,0,0,0);
                            const diff = (delDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
                            
                            // Overdue check
                            const now = new Date();
                            const deliveryTime = order.deliveryTime || '23:59';
                            const [hours, mins] = deliveryTime.split(':').map(Number);
                            const fullDeliveryDate = new Date(order.deliveryDate);
                            fullDeliveryDate.setHours(hours, mins, 0, 0);
                            
                            if (now > fullDeliveryDate && order.status !== 'sent') return "text-red-600";
                            if (diff <= 0) return "text-red-600";
                            if (diff === 1) return "text-amber-600";
                            return "text-slate-400";
                          })()
                        )}>
                          {order.deliveryDate ? format(new Date(order.deliveryDate), 'dd MMM') : '-'}
                          <span className="ml-1 uppercase text-[9px]">
                            {(() => {
                              const delDate = new Date(order.deliveryDate);
                              const today = new Date();
                              today.setHours(0,0,0,0);
                              delDate.setHours(0,0,0,0);
                              const diff = (delDate.getTime() - today.getTime()) / (1000 * 3600 * 24);

                              const now = new Date();
                              const deliveryTime = order.deliveryTime || '23:59';
                              const [hours, mins] = deliveryTime.split(':').map(Number);
                              const fullDeliveryDate = new Date(order.deliveryDate);
                              fullDeliveryDate.setHours(hours, mins, 0, 0);

                              if (now > fullDeliveryDate && order.status !== 'sent') return "🔴 OVERDUE";
                              if (diff <= 0) return "🔴 TODAY";
                              if (diff === 1) return "🟡 TOMORROW";
                              return "⚪ SCHEDULED";
                            })()}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 mb-3">
                      {order.receivedBy && (
                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">
                          Rec: {order.receivedBy.split(' ')[0]}
                        </span>
                      )}
                      {order.readyBy && (
                        <span className="text-[8px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase">
                          Rdy: {order.readyBy.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {order.status === 'ready' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsSilenced(true); stopAllSounds(); }}
                        className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white rounded border border-slate-200 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
                        title="Silence Alert"
                      >
                        <BellOff size={14} />
                        Silence
                      </button>
                    )}
                    <button 
                      onClick={() => updateStatus(order.id, order.status)}
                      disabled={order.status === 'sent' || updatingIds.has(order.id) || (order.status === 'in_progress' && !canMarkThisOrderReady(order.type))}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm",
                        updatingIds.has(order.id) ? "opacity-50 cursor-wait bg-slate-400" : (
                          order.status === 'in_progress' && !canMarkThisOrderReady(order.type) ? "bg-slate-200 text-slate-400 cursor-not-allowed" : (
                            order.status === 'pending' || order.status === 'received' ? "bg-rose-600 text-white animate-flash shadow-rose-100" :
                            order.status === 'in_progress' ? "bg-amber-500 text-white shadow-amber-100" :
                            order.status === 'ready' ? "bg-indigo-600 text-white shadow-indigo-100" :
                            "bg-emerald-600 text-white shadow-emerald-100"
                          )
                        )
                      )}
                    >
                      {updatingIds.has(order.id) ? 'Updating...' : (
                        order.status === 'in_progress' && !canMarkThisOrderReady(order.type) ? (order.type === 'chocolate' ? 'Chocolate Team' : 'Bakery Team') : (
                          order.status === 'pending' ? 'Start Production →' : 
                          order.status === 'received' ? 'Start Production →' :
                          order.status === 'in_progress' ? 'Mark Ready →' : 
                          order.status === 'ready' ? 'Mark Sent →' : 'Sent →'
                        )
                      )}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); generateOrderPDF(order, bakery); }}
                      className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-all flex items-center justify-center shadow-sm"
                      title="Download PDF"
                    >
                      <FileText size={16} />
                    </button>
                    {(order.status === 'pending' || order.status === 'received' || order.status === 'in_progress' || order.status === 'ready') && (
                       <>
                         {!order.problemDetails && (
                           <button 
                             onClick={(e) => { e.stopPropagation(); setProblemModalOrder(order); setIsSilenced(true); stopAllSounds(); }}
                             className="p-2.5 bg-amber-50 text-amber-500 hover:bg-amber-100 rounded-xl border border-amber-100 transition-all flex items-center justify-center shadow-sm"
                             title="Report Production Issue"
                           >
                             <AlertTriangle size={16} />
                           </button>
                         )}
                         <button 
                           onClick={(e) => {
                              e.stopPropagation();
                              setCancelModalOrder(order);
                              setCancelReason('Incorrect Details');
                              setCancelCustomReason('');
                            }}
                            className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl border border-rose-100 transition-all flex items-center justify-center shadow-sm"
                            title="Cancel Order"
                          >
                            <Ban size={16} />
                          </button>
                       </>
                    )}
                    {false && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setProblemModalOrder(order); setIsSilenced(true); stopAllSounds(); }}
                        className="p-2.5 bg-amber-50 text-amber-500 hover:bg-amber-100 rounded-xl border border-amber-100 transition-all flex items-center justify-center shadow-sm"
                        title="Report Production Issue"
                      >
                        <AlertTriangle size={16} />
                      </button>
                    )}
                    {(('photoUrl' in order.details && (order.details as any).photoUrl) || ('slipUrl' in order.details && (order.details as any).slipUrl)) && (
                      <button 
                        onClick={() => {
                          const url = ('photoUrl' in order.details ? (order.details as any).photoUrl : (order.details as any).slipUrl);
                          if (url) window.open(url, '_blank');
                        }}
                        className="p-2.5 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl border border-slate-100 transition-all flex items-center justify-center shadow-sm"
                        title="View Reference Image / Slip"
                      >
                        <ImageIcon size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>

    {/* Problem Reporting Modal */}
    {problemModalOrder && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2 uppercase text-center">Report Issue</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Order: {problemModalOrder.displayId || problemModalOrder.id.slice(-6)}</p>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'electricity', label: 'No Electricity', icon: '⚡' },
                { id: 'oven', label: 'Oven Stuck', icon: '🔥' },
                { id: 'delay', label: 'Staff Delay', icon: '⏰' },
                ...(problemModalOrder?.status === 'pending' ? [{ id: 'cancel', label: 'Cancel Order', icon: '🚫' }] : []),
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setProblemReason(opt.id as any);
                    setProblemDescription(`PRODUCTION ALERT: ${opt.label}`);
                  }}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    problemReason === opt.id ? "bg-rose-50 border-rose-600 ring-2 ring-rose-100" : "bg-white border-slate-100 hover:bg-slate-50"
                  )}
                >
                  <span className="text-xl mb-2 block">{opt.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest block">{opt.label}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Custom Message (Optional)</label>
              <textarea
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder="Enter more details..."
                className="w-full h-24 p-4 rounded-2xl bg-slate-50 border-none text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button 
              onClick={() => { setProblemModalOrder(null); setProblemDescription(''); }}
              className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
            >
              Back
            </button>
            <button 
              onClick={reportProblem}
              className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all"
            >
              Report to Dealer
            </button>
          </div>
        </div>
      </div>
    )}
  </>
      ) : activeTab === 'tomorrow' ? (
        renderTomorrowWorkload()
      ) : renderCompletedTab()}
      {/* Alert Testing Panel (Only for Production/Admin) */}
      {(profile?.role === 'production' || profile?.role === 'chocolate_production' || isSuperAdmin) && (
        <div className="p-6 pt-0">
           <div className="bg-white p-6 rounded-[2rem] border border-dashed border-slate-300 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-slate-300" />
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">Alert Verification System</h3>
                </div>
                <button 
                  onClick={stopAllSounds} 
                  className="text-[9px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-slate-700 transition-all"
                >
                  Silence All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button 
                  onClick={playPending} 
                  className="flex items-center justify-center gap-2 py-4 bg-rose-50 text-rose-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100"
                >
                  <Play className="w-4 h-4" /> Test New Order Alert
                </button>
                <button 
                  onClick={() => playReady(true)} 
                  className="flex items-center justify-center gap-2 py-4 bg-blue-50 text-blue-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all border border-blue-100"
                >
                  <Play className="w-4 h-4" /> Test Ready Loop
                </button>
                <button 
                  onClick={playSent} 
                  className="flex items-center justify-center gap-2 py-4 bg-emerald-50 text-emerald-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100"
                >
                  <Play className="w-4 h-4" /> Test Success Chime
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[260] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Ban className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase text-center">Cancel Order</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 text-center block">
              Order ID: {cancelModalOrder.displayId || cancelModalOrder.id.slice(-6).toUpperCase()}
            </p>
            
            <div className="space-y-4 text-left">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                  Reason for Cancellation
                </label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    "Incorrect Details",
                    "Out of Stock",
                    "Customer Request",
                    "Other"
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCancelReason(r)}
                      className={cn(
                        "p-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider text-center transition-all",
                        cancelReason === r 
                          ? "bg-red-50 border-red-500 text-red-600 ring-2 ring-red-100" 
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {cancelReason === 'Other' && (
                  <input
                    type="text"
                    value={cancelCustomReason}
                    onChange={(e) => setCancelCustomReason(e.target.value)}
                    placeholder="Type custom reason..."
                    className="w-full p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500 block"
                  />
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => { setCancelModalOrder(null); setCancelReason('Incorrect Details'); setCancelCustomReason(''); }}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
              >
                Nevermind
              </button>
              <button 
                onClick={confirmCancelOrder}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all shadow-md shadow-red-100"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Feedback Modal */}
      {feedbackPrompt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[260] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Truck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase">Order Dispatched!</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 leading-relaxed">
              Would you like to send the completion & feedback request link to <strong>{feedbackPrompt.customerName}</strong> via WhatsApp?
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setFeedbackPrompt(null)}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
              >
                Skip
              </button>
              <a 
                href={feedbackPrompt.url} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={() => setFeedbackPrompt(null)}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all text-center shadow-lg shadow-emerald-100 flex items-center justify-center"
              >
                Send WhatsApp Message
              </a>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
