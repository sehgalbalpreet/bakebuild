import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Clock, User, Phone, Package, Tag, Hash, FileText, Image as ImageIcon, Download, Share2, Ban, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { Order, ChocolateDetails, CakeDetails, Dealer, OrderStatus } from '../types';
import { formatCurrency } from '../lib/utils';
import { generateOrderPDF } from '../lib/exportUtils';
import { cn } from '../lib/utils';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { createLog } from '../services/logService';

interface OrderDetailsModalProps {
  order: Order;
  bakery: any;
  dealer?: Dealer;
  userRole?: string;
  onClose: () => void;
  onStatusUpdate?: () => void;
  onSilence?: () => void;
  isSuperAdmin?: boolean;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, bakery, dealer, userRole, onClose, onStatusUpdate, onSilence, isSuperAdmin = false }) => {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReasonLocal, setCancelReasonLocal] = useState('Incorrect Details');
  const [cancelCustomReasonLocal, setCancelCustomReasonLocal] = useState('');

  useEffect(() => {
    if (onSilence) onSilence();
  }, [onSilence]);

  const isChocolate = order.type === 'chocolate';
  const cakeDetails = !isChocolate ? (order.details as CakeDetails) : null;
  const chocolateDetails = isChocolate ? (order.details as ChocolateDetails) : null;
  
  const photoUrl = cakeDetails?.photoUrl || chocolateDetails?.slipUrl;
  const isSlip = !!chocolateDetails?.slipUrl;

  const handleShare = () => {
    const text = `Order Details: ${order.displayId || order.id}\nStatus: ${order.status.toUpperCase()}\nDelivery: ${order.deliveryDate} @ ${order.deliveryTime}\nFlavor: ${order.details.flavor}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
    setCancelReasonLocal('Incorrect Details');
    setCancelCustomReasonLocal('');
  };

  const confirmCancel = async () => {
    const finalReason = cancelReasonLocal === 'Other' ? (cancelCustomReasonLocal || 'Cancelled by Staff') : cancelReasonLocal;
    if (onSilence) onSilence();
    
    try {
      const orderRef = doc(db, 'orders', order.id);
      const staffName = auth.currentUser?.displayName || auth.currentUser?.email || 'Staff';

      await updateDoc(orderRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
        cancelledAt: serverTimestamp(),
        cancelledBy: staffName,
        cancelledReason: finalReason,
        cancelSeenByDealer: false
      });
      
      await createLog('order', `Order #${order.id.slice(-6)} was CANCELLED by ${staffName}: ${finalReason}`, auth.currentUser?.uid || undefined, auth.currentUser?.email || undefined, bakery?.id);
      
      if (onStatusUpdate) onStatusUpdate();
      setShowCancelConfirm(false);
      onClose();
    } catch (err: any) {
      console.error("Cancel failed:", err);
      alert("Failed to cancel order: " + (err.message || String(err)));
    }
  };

  const handleDealerResolveProblem = async (action: 'cancel' | 'acknowledge') => {
    try {
      const orderRef = doc(db, 'orders', order.id);
      const staffName = auth.currentUser?.displayName || auth.currentUser?.email || 'Dealer Staff';
      
      const updates: any = {
        updatedAt: serverTimestamp(),
        problemSeenByDealer: true, // Mark as seen to stop sounds
      };

      if (action === 'cancel') {
        setShowCancelConfirm(true);
        setCancelReasonLocal('Other');
        setCancelCustomReasonLocal(`Confirmed by dealer: ${order.problemDetails?.reason || 'Production requested'}`);
        return;
      } else {
        updates.problemDetails = null; // Clearing problemDetails resolves the "Active Problem" state
      }

      await updateDoc(orderRef, updates);
      
      await createLog('order', 
        `DEALER RESOLVED PROBLEM: ${action.toUpperCase()} action for #${order.id.slice(-6)}`, 
        auth.currentUser?.uid || undefined, 
        auth.currentUser?.email || undefined, 
        bakery?.id
      );

      if (onStatusUpdate) onStatusUpdate();
      onClose();
    } catch (err: any) {
      console.error("Resolution failed:", err);
      alert("Action failed: " + (err.message || String(err)));
    }
  };

  const isDealer = userRole === 'dealer' || userRole === 'dealer_admin' || userRole === 'dealer_staff';
  const isAdmin = userRole === 'bakery_admin' || userRole === 'super_admin' || isSuperAdmin;
  const hasProblem = !!order.problemDetails;

  useEffect(() => {
    // If dealer opens an order with an unseen problem, mark it as seen automatically
    if (isDealer && hasProblem && !order.problemSeenByDealer) {
      const orderRef = doc(db, 'orders', order.id);
      updateDoc(orderRef, {
        problemSeenByDealer: true,
        updatedAt: serverTimestamp()
      }).catch(err => console.warn("Failed to mark problem as seen:", err));
    }
  }, [isDealer, hasProblem, order.problemSeenByDealer, order.id]);

  const showCancel = order.status !== 'sent' && order.status !== 'cancelled' && (isAdmin || 
                     ((userRole === 'production' || userRole === 'chocolate_production' || userRole === 'sales') && 
                      (order.status === 'pending' || order.status === 'received' || hasProblem)));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 relative">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Order Details</h2>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                order.status === 'pending' ? "bg-slate-100 text-slate-500" :
                order.status === 'in_progress' ? "bg-indigo-100 text-indigo-600" :
                order.status === 'ready' ? "bg-green-100 text-green-600" :
                "bg-blue-100 text-blue-600"
              )}>
                {order.status}
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ID: {order.displayId || order.id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Problem Resolution Banner */}
          {(isDealer || isAdmin) && hasProblem && (
            <div className={cn(
              "border-2 rounded-3xl p-6 animate-pulse-subtle shadow-lg",
              isDealer ? "bg-amber-50 border-amber-200 shadow-amber-100" : "bg-rose-50 border-rose-200 shadow-rose-100"
            )}>
              <div className="flex items-start gap-4 mb-6">
                <div className={cn(
                  "w-12 h-12 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0",
                  isDealer ? "bg-amber-500 shadow-amber-200" : "bg-rose-500 shadow-rose-200"
                )}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={cn(
                    "text-sm font-black uppercase tracking-tight mb-1",
                    isDealer ? "text-amber-900" : "text-rose-900"
                  )}>
                    {isDealer ? "Production Issue Reported" : "Urgent: Resolution Required"}
                  </h3>
                  <p className={cn(
                    "text-xs font-bold leading-relaxed",
                    isDealer ? "text-amber-700" : "text-rose-700"
                  )}>
                    Reason: <span className="uppercase font-black">{order.problemDetails?.reason}</span>
                    <br />
                    Note: {order.problemDetails?.description || 'Please coordinate resolution.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => handleDealerResolveProblem('acknowledge')}
                  className={cn(
                    "flex-1 bg-white border-2 px-4 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                    isDealer ? "hover:bg-amber-100 text-amber-700 border-amber-200" : "hover:bg-rose-100 text-rose-700 border-rose-200"
                  )}
                >
                  <History className="w-4 h-4" />
                  {isDealer ? "Extend Delivery / Resolved" : "Acknowledge & Mark Resolved"}
                </button>
                <button 
                  onClick={() => handleDealerResolveProblem('cancel')}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-200"
                >
                  <Ban className="w-4 h-4" />
                  Confirm Cancellation
                </button>
              </div>
              <p className={cn(
                "text-[9px] font-bold mt-4 text-center",
                isDealer ? "text-amber-500" : "text-rose-500"
              )}>
                {isDealer ? "Action will be logged and production will be notified." : "Resolution will update the order status and notify the dealer."}
              </p>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Delivery Date</span>
              </div>
              <p className="text-sm font-black text-slate-700">{order.deliveryDate}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Time</span>
              </div>
              <p className="text-sm font-black text-slate-700">{order.deliveryTime}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Type</span>
              </div>
              <p className="text-sm font-black text-slate-700 uppercase">{order.type.replace('_', ' ')}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  {isChocolate ? 'Quantity' : 'Weight'}
                </span>
              </div>
              <p className="text-sm font-black text-slate-700">
                {isChocolate ? chocolateDetails?.quantity : `${cakeDetails?.weight} KG`}
              </p>
            </div>
          </div>

          {/* Action Tracking & Progress Logs */}
          <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-[2rem] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100/80 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" />
                <h4 className="text-[10px] font-black text-indigo-950 uppercase tracking-wider">
                  Order Lifecycle & Staff Logs
                </h4>
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-full">
                Real-Time Tracking
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {order.status === 'cancelled' && (
                <div className="sm:col-span-2 bg-rose-50 border border-rose-100 p-4 rounded-2xl space-y-2 text-rose-950 animate-pulse-subtle">
                  <div className="flex items-center gap-2 text-rose-600">
                    <Ban className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase tracking-widest">⚠️ Order Cancelled</span>
                  </div>
                  <div className="text-xs space-y-1 font-bold">
                    <p>
                      Reason: <span className="uppercase text-rose-700 font-extrabold">{order.cancelledReason || 'No reason specified'}</span>
                    </p>
                    <p>
                      Cancelled By: <span className="text-slate-700 font-extrabold">{order.cancelledBy || 'Staff'}</span>
                    </p>
                    {order.cancelledAt && (
                      <p className="text-[9px] font-bold text-rose-500/80 uppercase">
                        Cancelled At: {(() => {
                          const ts = order.cancelledAt;
                          if (!ts) return 'N/A';
                          if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
                          if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                          const d = new Date(ts);
                          return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {order.sentBy && (
                <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 block mb-1">🚚 Dispatched / Delivered</span>
                    <p className="text-xs font-black text-slate-700">By: {order.sentBy}</p>
                  </div>
                  {order.sentAt && (
                    <p className="text-[9px] font-bold text-slate-400 mt-2">
                      {(() => {
                        const ts = order.sentAt;
                        if (!ts) return 'N/A';
                        if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
                        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
                      })()}
                    </p>
                  )}
                </div>
              )}

              {order.readyBy && (
                <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 block mb-1">🍰 Marked Ready</span>
                    <p className="text-xs font-black text-slate-700">By: {order.readyBy}</p>
                  </div>
                  {order.readyAt && (
                    <p className="text-[9px] font-bold text-slate-400 mt-2">
                      {(() => {
                        const ts = order.readyAt;
                        if (!ts) return 'N/A';
                        if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
                        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
                      })()}
                    </p>
                  )}
                </div>
              )}

              {order.inProgressBy && (
                <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 block mb-1">⚡ Production In Progress</span>
                    <p className="text-xs font-black text-slate-700">By: {order.inProgressBy}</p>
                  </div>
                  {order.inProgressAt && (
                    <p className="text-[9px] font-bold text-slate-400 mt-2">
                      {(() => {
                        const ts = order.inProgressAt;
                        if (!ts) return 'N/A';
                        if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
                        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
                      })()}
                    </p>
                  )}
                </div>
              )}

              {order.receivedBy && (
                <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 block mb-1">📥 Order Received</span>
                    <p className="text-xs font-black text-slate-700">By: {order.receivedBy}</p>
                  </div>
                  {order.receivedAt && (
                    <p className="text-[9px] font-bold text-slate-400 mt-2">
                      {(() => {
                        const ts = order.receivedAt;
                        if (!ts) return 'N/A';
                        if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
                        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
                      })()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Core Info */}
            <div className="space-y-6">
              {/* Customer Box */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Details</h3>
                <div className="bg-white border-2 border-slate-100 p-4 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">
                      {order.customerDetails?.name?.[0] || 'W'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{order.customerDetails?.name || 'Walk-in Customer'}</p>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Phone size={10} />
                        <span className="text-[10px] font-bold">{order.customerDetails?.phone || 'No Phone'}</span>
                      </div>
                    </div>
                  </div>
                  {order.dealerCompanyName && (
                    <div className="pt-3 border-t border-slate-50 space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Booked via Dealer</p>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-black text-indigo-600">{order.dealerCompanyName}</p>
                          {dealer && (
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">{dealer.staffName}</p>
                          )}
                        </div>
                        {dealer?.phone && (
                          <a 
                            href={`tel:${dealer.phone}`}
                            className="bg-indigo-50 text-indigo-600 p-2 rounded-lg hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1.5"
                          >
                            <Phone size={12} />
                            <span className="text-[10px] font-black">{dealer.phone}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Info */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Info</h3>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400">FLAVOR</span>
                    <span className="text-xs font-black text-slate-700 uppercase">{order.details.flavor}</span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Special Instructions</h3>
                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl italic text-xs text-slate-600 leading-relaxed min-h-[60px]">
                  {order.details.instruction ? order.details.instruction : 'Standard product, no special instructions provided.'}
                </div>
              </div>

              {/* Amount Box - Only if not dealer cake or shown to admin */}
              {order.type !== 'dealer_cake' && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Summary</h3>
                  <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-lg shadow-indigo-200">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/20">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Amount</span>
                      <span className="text-2xl font-black">{formatCurrency(order.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold opacity-80 uppercase tracking-tight">Advance Shared</span>
                      <span className="font-black">{formatCurrency(order.advanceReceived || 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Reference Image */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {isSlip ? 'Order Slip Reference' : 'Reference Image'}
              </h3>
              {photoUrl ? (
                <div className="relative group rounded-3xl overflow-hidden border-4 border-slate-50 shadow-xl bg-slate-100 aspect-[4/5]">
                  <img src={photoUrl} alt="Reference" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-4">
                    <button 
                      onClick={() => window.open(photoUrl, '_blank')}
                      className="p-3 bg-white text-indigo-600 rounded-full hover:scale-110 transition-transform shadow-xl"
                    >
                      <ImageIcon size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-[4/5] bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <ImageIcon size={48} className="mb-4 opacity-20" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No Image Reference Provided</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-3">
          <button 
            onClick={() => generateOrderPDF(order, bakery)}
            className="flex-1 min-w-[150px] bg-white border border-slate-200 text-slate-700 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
          >
            <Download size={16} />
            Download Job Sheet
          </button>
          
          {showCancel && (
            <button 
              onClick={handleCancel}
              className="flex-1 min-w-[150px] bg-rose-50 text-rose-600 border border-rose-100 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
            >
              <Ban size={16} />
              Cancel Order
            </button>
          )}

          <button 
            onClick={handleShare}
            className="px-6 py-4 bg-green-50 text-green-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-100 transition-all"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>

        {/* Cancel Confirm Modal Overlay inside relative parent */}
        {showCancelConfirm && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-6 rounded-[32px]">
            <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 text-center relative">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center mb-4 mx-auto">
                <Ban className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-1 uppercase">Cancel Order</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4 block">
                OrderID: {order.displayId || order.id.slice(-6).toUpperCase()}
              </p>
              
              <div className="space-y-3 text-left mb-6">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                  Cancellation Reason
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Incorrect Details",
                    "Out of Stock",
                    "Customer Request",
                    "Other"
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCancelReasonLocal(r)}
                      className={cn(
                        "p-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider text-center transition-all",
                        cancelReasonLocal === r 
                          ? "bg-red-50 border-red-500 text-red-600 ring-2 ring-red-100" 
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {cancelReasonLocal === 'Other' && (
                  <input
                    type="text"
                    value={cancelCustomReasonLocal}
                    onChange={(e) => setCancelCustomReasonLocal(e.target.value)}
                    placeholder="Type custom reason..."
                    className="w-full p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-red-500 block"
                  />
                )}
              </div>
              
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Go Back
                </button>
                <button 
                  type="button"
                  onClick={confirmCancel}
                  className="flex-1 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all shadow-md shadow-red-100"
                >
                  Yes, Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
