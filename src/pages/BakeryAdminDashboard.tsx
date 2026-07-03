import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
// VERSION: 2026-04-29-V3-SOFT-DELETE
import { collection, query, where, onSnapshot, serverTimestamp, doc, setDoc, deleteDoc, updateDoc, getDoc, writeBatch, getDocs, addDoc, runTransaction, increment } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../hooks/useSound';
import { exportOrdersToExcel, generateOrderPDF } from '../lib/exportUtils';
import { OrderDetailsModal } from '../components/OrderDetailsModal';

import { createLog } from '../services/logService';
import { APP_VERSION } from '../version';

import { DrageesCostSetup } from './DrageesCostSetup';
import { CorporateChocolateQuote } from './CorporateChocolateQuote';
import { DrageesProduction } from '../components/DrageesProduction';
import { BatchProductionLogs } from '../components/BatchProductionLogs';
import { DailySummaryDashboard } from '../components/DailySummaryDashboard';
import { AttendanceDashboard } from './AttendanceDashboard';
import { PayrollManagement } from './PayrollManagement';

// Extracted admin subcomponents
import { AccountRepairModal } from '../components/bakery-admin/AccountRepairModal';
import { DealersManager } from '../components/bakery-admin/DealersManager';
import { StaffManager } from '../components/bakery-admin/StaffManager';
import { CustomerDatabase } from '../components/bakery-admin/CustomerDatabase';
import { AnalyticsReports } from '../components/bakery-admin/AnalyticsReports';
import { BillingPayments } from '../components/bakery-admin/BillingPayments';
import { BakerySettings } from '../components/bakery-admin/BakerySettings';
import { RecipeManager } from '../components/bakery-admin/RecipeManager';

import { Dealer, UserProfile, Order, Bakery, OrderStatus, MenuItem, Customer, CakeDetails, ChocolateDetails, OperationType, PaymentSettings } from '../types';
import { getActiveFeatures } from '../utils/subscriptionUtils';
import { DEALER_COMPANIES, SOUND_PATHS, CAKE_FLAVORS, DEALER_COLORS } from '../constants';
import { cn, formatCurrency, generateWhatsAppInviteLink, generateCustomerFeedbackWhatsAppLink, triggerAutoFeedback, buildAutoFeedbackPrompt } from '../lib/utils';
import { 
  Users, UserPlus, TrendingUp, Calendar, Phone, Trash2, Edit2, LayoutGrid, List, Store, 
  MessageCircle, Printer, PieChart, ShoppingBag, CheckCircle2, Clock, Package, 
  Image as ImageIcon, Settings, Wallet, Layers, Heart, Bell, ChevronRight, Truck, 
  Search, Filter, Plus, FileText, Download, Check, X, Volume2, Globe, Palette, Candy, User, IndianRupee, Tag, Zap, Upload, ImagePlus, ExternalLink, ShieldAlert, Database, BellOff, FileSpreadsheet, XCircle, UtensilsCrossed, Receipt, Ban, AlertCircle, ShoppingCart, Wrench, RefreshCw
} from 'lucide-react';
import { format, startOfMonth, differenceInDays, subMonths, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

const shareToWhatsApp = (order: Order, bakeryName?: string) => {
  const isCake = 'weight' in order.details;
  const description = isCake ? `${(order.details as any).weight}kg ${(order.details as any).flavor}` : 'Order details';
  const text = encodeURIComponent(`*Order Update - ${order.displayId || `#${order.id.slice(-6).toUpperCase()}`}*\n\nStatus: *${order.status.toUpperCase()}*\n\nDetails:\n- ${description}\n- Delivery: ${order.deliveryDate} @ ${order.deliveryTime}\n\nThank you!\n-${bakeryName || 'The Bakery'}`);
  const phone = order.details && 'phone' in order.details ? (order.details as any).phone : '';
  if (phone) {
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`, '_blank');
  }
};

const RenderLockedFeature: React.FC<{ title: string, description: string, icon: any, featureName: string }> = ({ title, description, icon: IconComponent, featureName }) => {
  const navigate = useNavigate();
  return (
    <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-[2.5rem] border border-slate-200/80 shadow-sm text-center space-y-6 animate-fade-in text-left">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
        <IconComponent className="w-8 h-8" />
      </div>
      
      <div className="space-y-2 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 uppercase tracking-widest">
          👑 Premium Package Multi-Module Feature
        </span>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">{title}</h2>
        <p className="text-slate-500 font-medium text-xs leading-relaxed max-w-sm mx-auto">
          {description}
        </p>
      </div>

      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100/80 inline-block text-left w-full">
        <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Included in Paid subscription:</h4>
        <ul className="space-y-2 text-[10px] font-black text-slate-600 uppercase tracking-tight">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500 text-sm">✓</span> Geofenced GPS Attendance Protocol
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500 text-sm">✓</span> Smart Payroll Ledgers & Multi-Role Calculations
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500 text-sm">✓</span> Unlimited Staff Operations
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500 text-sm">✓</span> Unlimited Dealer Network Integrations
          </li>
        </ul>
      </div>

      <div className="flex gap-2.5 justify-center max-w-xs mx-auto">
        <button
          onClick={() => navigate('/dashboard/billing')}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 text-[10px] uppercase font-black tracking-widest transition-all shadow-md hover:shadow-indigo-100 hover:scale-[1.02] active:scale-95"
        >
          View Plans
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3.5 text-[10px] uppercase font-black tracking-widest transition-all text-center border border-slate-200"
        >
          Go Back
        </button>
      </div>
    </div>
  );
};

const handleCancelOrderAction = async (orderId: string, bakeryId: string, profile: any, onSilence?: () => void) => {
  if (!window.confirm("Are you sure you want to CANCEL this order? This will notify the staff and dealer.")) return;
  
  const reason = window.prompt("Enter reason for cancellation (optional):", "Cancelled by Admin");
  if (reason === null) return;
  
  if (onSilence) onSilence();
  
  try {
    const orderRef = doc(db, 'orders', orderId);
    const staffName = profile?.displayName || auth.currentUser?.displayName || auth.currentUser?.email || 'Admin';
    
    await updateDoc(orderRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: staffName,
      cancelledReason: reason || 'Cancelled by admin',
      cancelSeenByDealer: false,
      updatedAt: serverTimestamp()
    });
    await createLog('order', `Order #${orderId.slice(-6)} CANCELLED by ${staffName}: ${reason || 'No reason'}`, auth.currentUser?.uid || profile?.uid, auth.currentUser?.email || profile?.email, bakeryId);
    alert("Order cancelled successfully.");
  } catch (err: any) {
    console.error("Cancellation failed:", err);
    alert("Failed to cancel order: " + (err.message || String(err)));
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
};

const MenuAIScanModal: React.FC<{ bakeryId: string, onClose: () => void, onComplete: () => void }> = ({ bakeryId, onClose, onComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  };

  const startScan = async () => {
    if (!preview) return;
    setScanning(true);
    try {
      const response = await fetch("/api/bakery/analyze-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: preview,
          mimeType: file?.type || "image/jpeg"
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      console.error(err);
      alert('AI Scan failed. Please try a clearer image.');
    } finally {
      setScanning(false);
    }
  };

  const addAllItems = async () => {
    setAdding(true);
    try {
      for (const group of results) {
        for (const item of group.items) {
          const itemId = `item_${Math.random().toString(36).substring(2, 9)}`;
          try {
            await setDoc(doc(db, 'menu_items', itemId), {
              bakeryId,
              name: item.name,
              price: item.price,
              category: group.categoryName.toLowerCase(),
              gstPercent: 5,
              description: item.description || '',
              createdAt: serverTimestamp()
            });
          } catch (err) {
            console.error(`Failed to add item ${item.name}:`, err);
            // Continue with other items
          }
        }
      }
      onComplete();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'menu_items/batch');
      alert('Failed to add some items to catalog. Check console for details.');
    } finally {
      setAdding(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">AI Menu Automation</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Powered by Gemini Vision</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 overflow-y-auto space-y-8">
          {!results.length ? (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center gap-4 hover:border-blue-300 transition-all cursor-pointer relative">
                <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                {preview ? (
                  <img src={preview} className="w-48 h-48 object-cover rounded-2xl shadow-lg" alt="Menu Preview" />
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Upload physical menu photo</p>
                      <p className="text-xs text-slate-400 font-bold mt-1">We'll automatically extract items, prices & categories</p>
                    </div>
                  </>
                )}
              </div>

              {preview && (
                <button 
                  onClick={startScan}
                  disabled={scanning}
                  className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {scanning ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Analyzing Layout & Headlines...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5" />
                      Start Vision Analysis
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Extracted Catalogue</h3>
                <button onClick={() => setResults([])} className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg">Rescan Image</button>
              </div>
              
              <div className="space-y-8">
                {results.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-[2px] flex-1 bg-slate-100"></div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{group.categoryName}</h4>
                      <div className="h-[2px] flex-1 bg-slate-100"></div>
                    </div>
                    <div className="grid gap-3">
                      {group.items.map((item: any, iIdx: number) => (
                        <div key={iIdx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:border-blue-200 transition-all shadow-sm shadow-transparent hover:shadow-blue-50">
                          <div>
                            <p className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{item.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold max-w-[200px] truncate">{item.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-900">₹{item.price}</p>
                            <p className="text-[8px] text-slate-300 font-black uppercase tracking-tighter">Unit Price</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 sticky bottom-0 bg-white">
                <button 
                  onClick={addAllItems}
                  disabled={adding}
                  className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 hover:bg-slate-800 transition-all"
                >
                  {adding ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Building Product Listings...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Add all {results.reduce((acc, g) => acc + g.items.length, 0)} items to Catalogue
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const MenuManager: React.FC<{ bakeryId: string }> = ({ bakeryId }) => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showAIScan, setShowAIScan] = useState(false);
  const [loading, setLoading] = useState(true);

  // Bulk States
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);

  // Bulk Add States
  const [bulkNamesText, setBulkNamesText] = useState('');
  const [bulkPrice, setBulkPrice] = useState('500');
  const [bulkCategory, setBulkCategory] = useState<string>('1kg cake');
  const [bulkGst, setBulkGst] = useState('5');
  const [bulkHsn, setBulkHsn] = useState('');
  const [bulkWeight, setBulkWeight] = useState('1kg');

  // Bulk Edit States
  const [bulkEditHsn, setBulkEditHsn] = useState('');
  const [bulkEditGst, setBulkEditGst] = useState('5');
  const [bulkEditWeight, setBulkEditWeight] = useState('');
  const [bulkEditPrice, setBulkEditPrice] = useState('');
  const [bulkEditCategory, setBulkEditCategory] = useState<string>('1kg cake');

  const [updateHsnEnabled, setUpdateHsnEnabled] = useState(false);
  const [updateGstEnabled, setUpdateGstEnabled] = useState(false);
  const [updateWeightEnabled, setUpdateWeightEnabled] = useState(false);
  const [updatePriceEnabled, setUpdatePriceEnabled] = useState(false);
  const [updateCategoryEnabled, setUpdateCategoryEnabled] = useState(false);

  // Form State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string>('cake');
  const [gst, setGst] = useState('5');
  const [hsn, setHsn] = useState('');
  const [desc, setDesc] = useState('');
  const [weight, setWeight] = useState('');
  const [isSourced, setIsSourced] = useState(false);
  const [supplierName, setSupplierName] = useState('');

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

  useEffect(() => {
    if (!bakeryId) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(query(collection(db, 'menu_items'), where('bakeryId', '==', bakeryId)), (snap) => {
      setItems(snap.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as MenuItem))
        .filter(i => !i.isDeleted)
      );
      setLoading(false);
    });
    return unsub;
  }, [bakeryId]);

  const toggleSelectItem = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    const shownIds = filteredItems.map(i => i.id);
    const allSelected = shownIds.length > 0 && shownIds.every(id => selectedItems.includes(id));
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !shownIds.includes(id)));
    } else {
      setSelectedItems(prev => Array.from(new Set([...prev, ...shownIds])));
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkNamesText.trim()) return;
    setLoading(true);
    const names = bulkNamesText
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    try {
      const batch = writeBatch(db);
      names.forEach(productName => {
        const itemId = `item_${Math.random().toString(36).substring(2, 9)}`;
        const ref = doc(db, 'menu_items', itemId);
        batch.set(ref, {
          bakeryId,
          name: productName,
          price: parseFloat(bulkPrice) || 0,
          category: bulkCategory,
          gstPercent: parseFloat(bulkGst) || 0,
          hsnCode: bulkHsn,
          weight: bulkWeight,
          description: `Bulk created product`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      setShowBulkAddModal(false);
      setBulkNamesText('');
      alert(`Successfully added ${names.length} products to catalogue!`);
    } catch (err) {
      console.error("Bulk add error:", err);
      alert("Failed to batch add items.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      selectedItems.forEach(itemId => {
        const ref = doc(db, 'menu_items', itemId);
        const updateData: any = { updatedAt: serverTimestamp() };
        if (updateHsnEnabled) updateData.hsnCode = bulkEditHsn;
        if (updateGstEnabled) updateData.gstPercent = parseFloat(bulkEditGst) || 0;
        if (updateWeightEnabled) updateData.weight = bulkEditWeight;
        if (updateCategoryEnabled) updateData.category = bulkEditCategory;
        if (updatePriceEnabled) updateData.price = parseFloat(bulkEditPrice) || 0;

        batch.update(ref, updateData);
      });

      await batch.commit();
      setSelectedItems([]);
      setShowBulkEditModal(false);
      alert(`Successfully updated ${selectedItems.length} products!`);
    } catch (err) {
      console.error("Bulk edit error:", err);
      alert("Failed to batch edit items.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedItems.length === 0) return;
    confirmAction(
      'Bulk Delete Products?',
      `Are you sure you want to remove the ${selectedItems.length} selected products? This will hide them from the catalogue.`,
      'Confirm Bulk Removal',
      async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          selectedItems.forEach(itemId => {
            const ref = doc(db, 'menu_items', itemId);
            batch.update(ref, {
              isDeleted: true,
              deletedAt: serverTimestamp()
            });
          });
          await batch.commit();
          setSelectedItems([]);
          alert(`Successfully removed ${selectedItems.length} products.`);
        } catch (err) {
          console.error("Bulk delete error:", err);
          alert("Failed to bulk delete items.");
        } finally {
          setLoading(false);
          setPendingAction(null);
        }
      }
    );
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemId = editingItem ? editingItem.id : `item_${Math.random().toString(36).substring(2, 9)}`;
    const itemData = {
      bakeryId,
      name,
      price: parseFloat(price) || 0,
      category,
      gstPercent: parseFloat(gst) || 0,
      hsnCode: hsn,
      description: desc,
      weight,
      isSourced,
      supplierName: isSourced ? supplierName : '',
      updatedAt: serverTimestamp()
    };

    if (!editingItem) {
      (itemData as any).createdAt = serverTimestamp();
    }

    try {
      await setDoc(doc(db, 'menu_items', itemId), itemData, { merge: true });
      setShowForm(false);
      setEditingItem(null);
      setName(''); setPrice(''); setDesc(''); setHsn(''); setGst('5'); setWeight('');
      setIsSourced(false); setSupplierName('');
    } catch (err) {
      handleFirestoreError(err, editingItem ? OperationType.UPDATE : OperationType.WRITE, `menu_items/${itemId}`);
    }
  };

  const startEdit = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(item.price.toString());
    setCategory(item.category as any || 'cake');
    setGst(item.gstPercent?.toString() || '5');
    setHsn(item.hsnCode || '');
    setDesc(item.description || '');
    setWeight(item.weight || '');
    setIsSourced(!!item.isSourced);
    setSupplierName(item.supplierName || '');
    setShowForm(true);
  };

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeCategory, setActiveCategory] = useState('All');
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');

  const categories = ['All', ...Array.from(new Set(items.map(item => item.category)))];
  const filteredItems = items.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = catalogSearchQuery === '' || 
      item.name.toLowerCase().includes(catalogSearchQuery.toLowerCase()) || 
      (item.category && item.category.toLowerCase().includes(catalogSearchQuery.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(catalogSearchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const removeItem = (id: string, name: string) => {
    confirmAction(
      'Remove Product?',
      `Are you sure you want to remove "${name}" from your catalogue? It will no longer be visible to dealers.`,
      'Confirm Removal',
      async () => {
        try {
          await updateDoc(doc(db, 'menu_items', id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
          });
          alert('Product removed from catalog.');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `menu_items/${id}`);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{pendingAction.title}</h3>
            <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
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
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100 transition-all"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Product Catalogue & Pricing</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Manage your offerings and taxes</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggles */}
          <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center gap-1 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:bg-slate-50"
              )}
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:bg-slate-50"
              )}
            >
              <List size={16} />
            </button>
          </div>

          <button 
            onClick={() => setShowAIScan(true)} 
            className="bg-blue-50 text-blue-600 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
          >
            <Zap className="w-4 h-4" />
            AI Menu Scan
          </button>
          <button 
            onClick={() => setShowForm(true)} 
            className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-800 shadow-md"
          >
            + Add Product
          </button>
          <button 
            onClick={() => {
              setBulkNamesText('');
              setBulkPrice('300');
              setBulkCategory('1kg cake');
              setBulkGst('5');
              setBulkHsn('');
              setBulkWeight('1kg');
              setShowBulkAddModal(true);
            }} 
            className="bg-indigo-600 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-indigo-700 shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            + Bulk Add Products
          </button>
        </div>
      </div>

      {/* Modern Catalog Search Bar */}
      <div className="relative w-full">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <Search className="w-4 h-4" />
        </span>
        <input 
          type="text"
          placeholder="Search catalog products by name, category, or description..."
          value={catalogSearchQuery}
          onChange={e => setCatalogSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-11 py-3.5 font-bold text-xs placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm outline-none"
        />
        {catalogSearchQuery && (
          <button 
            type="button"
            onClick={() => setCatalogSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
            title="Clear Search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border whitespace-nowrap",
              activeCategory === cat 
                ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100" 
                : "bg-white text-slate-400 border-slate-200 hover:border-blue-200"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Selection & Bulk Action Bar */}
      {filteredItems.length > 0 && (
        <div className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <input 
              type="checkbox"
              id="select-all-filtered"
              checked={filteredItems.length > 0 && filteredItems.every(item => selectedItems.includes(item.id))}
              onChange={toggleSelectAll}
              className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="select-all-filtered" className="text-xs font-black text-slate-600 uppercase tracking-wider cursor-pointer select-none">
              {filteredItems.every(item => selectedItems.includes(item.id)) ? 'Deselect All' : 'Select All'} ({filteredItems.length} products listed)
            </label>
          </div>

          {selectedItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-3.5 py-2 rounded-2xl uppercase tracking-widest">
                {selectedItems.length} Selected
              </span>
              <button 
                onClick={() => {
                  setBulkEditHsn('');
                  setBulkEditPrice('');
                  setBulkEditGst('5');
                  setBulkEditWeight('');
                  setUpdateHsnEnabled(false);
                  setUpdatePriceEnabled(false);
                  setUpdateGstEnabled(false);
                  setUpdateWeightEnabled(false);
                  setUpdateCategoryEnabled(false);
                  setShowBulkEditModal(true);
                }}
                className="bg-blue-600 text-white hover:bg-blue-700 px-4.5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-blue-100"
              >
                ✏️ Bulk Edit HSN / Details
              </button>
              <button 
                onClick={handleBulkDelete}
                className="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-100 px-4.5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                🗑️ Bulk Remove
              </button>
              <button 
                onClick={() => setSelectedItems([])}
                className="text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-widest px-2 py-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className={cn("bg-white p-6 rounded-3xl border shadow-sm transition-all group relative overflow-hidden flex flex-col", selectedItems.includes(item.id) ? "border-blue-500 ring-4 ring-blue-50" : "border-slate-200 hover:border-blue-200")}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => toggleSelectItem(item.id)}
                    className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => startEdit(item)} 
                    className="p-2 text-slate-300 hover:text-blue-500 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => removeItem(item.id, item.name)} 
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-1 leading-tight">{item.name}</h3>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase tracking-tighter">{item.category}</span>
                {item.weight && <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase tracking-tighter">{item.weight}</span>}
                {item.isSourced ? (
                  <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-black uppercase tracking-tighter animate-pulse">
                    Sourced: {item.supplierName || 'Third-Party'}
                  </span>
                ) : (
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-black uppercase tracking-tighter">
                    In-House
                  </span>
                )}
                <p className="text-[9px] text-blue-500 font-bold uppercase tracking-widest">HSN: {item.hsnCode || 'N/A'}</p>
              </div>
              <p className="text-xs text-slate-400 font-bold mb-4 line-clamp-2">{item.description || 'No description provided.'}</p>
              <div className="flex justify-between items-end mt-auto">
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Price + {item.gstPercent}% GST</p>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(item.price + (item.price * item.gstPercent / 100))}</p>
                </div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No products found in this category.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(new Set(filteredItems.map(i => i.category))).map(cat => (
            <div key={cat} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50/50 px-8 py-3 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.25em]">{cat}</h3>
                <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">{filteredItems.filter(i => i.category === cat).length} Products</span>
              </div>
              <div className="divide-y divide-slate-50">
                {filteredItems.filter(i => i.category === cat).map(item => (
                  <div key={item.id} className="px-8 py-4 hover:bg-slate-50/50 transition-all flex items-center justify-between group gap-4">
                    <div className="flex items-center gap-4 shrink-0">
                      <input 
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-sm font-black text-slate-900">{item.name}</h4>
                        {item.weight && (
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest border border-blue-100 px-2 py-0.5 rounded-full bg-blue-50">
                            {item.weight}
                          </span>
                        )}
                        {item.isSourced ? (
                          <span className="text-[8px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded uppercase tracking-wider">
                            Sourced: {item.supplierName || 'Third-Party'}
                          </span>
                        ) : (
                          <span className="text-[8px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded uppercase tracking-wider">
                            In-House
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.description || 'No description'}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900">{formatCurrency(item.price + (item.price * item.gstPercent / 100))}</p>
                        <p className="text-[8px] text-slate-300 font-black uppercase tracking-tighter">inc. {item.gstPercent}% GST</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => removeItem(item.id, item.name)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
             <div className="py-20 text-center bg-white rounded-[2rem] border border-slate-100">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No products found in this category.</p>
            </div>
          )}
        </div>
      )}

      {showForm && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Product' : 'Catalogue Entry'}</h2>
              <button onClick={() => {
                setShowForm(false);
                setEditingItem(null);
              }} className="text-slate-400 hover:text-white">×</button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-6 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Product Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Base Price (₹)</label>
                  <input required type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Weight / Qty</label>
                  <input placeholder="e.g. 500g, 1kg" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">GST %</label>
                <input required type="number" value={gst} onChange={e => setGst(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">HSN Code</label>
                <input value={hsn} onChange={e => setHsn(e.target.value)} placeholder="e.g. 1905" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {['500g cake', '1kg cake', 'chocolate', 'snack', 'other'].map(c => (
                      <button 
                        key={c}
                        type="button"
                        onClick={() => setCategory(c as any)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          category === c ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <input 
                    placeholder="Or type custom category..."
                    value={category}
                    onChange={(e) => setCategory(e.target.value.toLowerCase() as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold h-24" />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Product Supplier Source</label>
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSourced(false);
                      setSupplierName('');
                    }}
                    className={cn(
                      "py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                      !isSourced ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Self-Manufactured In-House
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSourced(true)}
                    className={cn(
                      "py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                      isSourced ? "bg-white text-amber-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Sourced from Vendor / Third-party
                  </button>
                </div>
              </div>

              {isSourced && (
                <div className="space-y-1.5 animate-[fadeIn_0.2s_ease-out]">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier Name / Sourced Company *</label>
                  <input 
                    required={isSourced}
                    type="text" 
                    placeholder="e.g. Barry Callebaut, Rich Products, Crusts & Crumbles"
                    value={supplierName} 
                    onChange={e => setSupplierName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-amber-500/10 transition-all" 
                  />
                </div>
              )}

              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg">Save to Catalog</button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showAIScan && (
        <MenuAIScanModal 
          bakeryId={bakeryId} 
          onClose={() => setShowAIScan(false)} 
          onComplete={() => {
            setShowAIScan(false);
            // Items list will auto-refresh via onSnapshot
          }} 
        />
      )}

      {showBulkAddModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-black">⚡ Bulk Add Products</h2>
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider mt-0.5">Add multiple products/cakes at once</p>
              </div>
              <button onClick={() => setShowBulkAddModal(false)} className="text-slate-400 hover:text-white text-2xl font-black">×</button>
            </div>
            
            <form onSubmit={handleBulkAdd} className="p-8 space-y-6 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Product / Cake Names (Type one per line)
                </label>
                <textarea 
                  required
                  rows={4}
                  value={bulkNamesText}
                  onChange={e => setBulkNamesText(e.target.value)}
                  placeholder="e.g.&#10;Vanilla Velvet Cake&#10;Butterscotch Delight Cake&#10;Premium Black Forest Cake"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-xs placeholder:text-slate-300 focus:border-blue-500 focus:outline-none h-28"
                  id="bulk-names-textarea"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5" id="bulk-price-lbl">Base Price (₹) for all</label>
                  <input 
                    required 
                    type="number" 
                    value={bulkPrice} 
                    onChange={e => setBulkPrice(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" 
                    id="bulk-price-input"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5" id="bulk-weight-lbl">Weight / Qty (e.g. 1kg, 500g)</label>
                  <input 
                    required
                    placeholder="e.g. 1kg" 
                    value={bulkWeight} 
                    onChange={e => setBulkWeight(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" 
                    id="bulk-weight-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5" id="bulk-gst-lbl">GST %</label>
                  <input 
                    required 
                    type="number" 
                    value={bulkGst} 
                    onChange={e => setBulkGst(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" 
                    id="bulk-gst-input"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5" id="bulk-hsn-lbl">HSN Code</label>
                  <input 
                    placeholder="e.g. 1905" 
                    value={bulkHsn} 
                    onChange={e => setBulkHsn(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" 
                    id="bulk-hsn-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2" id="bulk-cat-lbl">Category</label>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {['500g cake', '1kg cake', 'chocolate', 'snack', 'other'].map(c => (
                      <button 
                        key={c}
                        type="button"
                        onClick={() => setBulkCategory(c)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          bulkCategory === c ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"
                        )}
                        id={`bulk-cat-btn-${c.replace(' ', '-')}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <input 
                    placeholder="Or type custom category..."
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value.toLowerCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                    id="bulk-category-input"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all text-sm flex items-center justify-center gap-2"
                  id="bulk-add-submit-btn"
                >
                  {loading ? 'Generating Products...' : '⚡ Generate All Products'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showBulkEditModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-black">✏️ Bulk Edit Selection</h2>
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider mt-0.5">Updating {selectedItems.length} selected items</p>
              </div>
              <button onClick={() => setShowBulkEditModal(false)} className="text-slate-400 hover:text-white text-2xl font-black">×</button>
            </div>
            
            <form onSubmit={handleBulkEdit} className="p-8 space-y-6 overflow-y-auto">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed bg-blue-50 border border-blue-100/50 p-4 rounded-2xl">
                Only the fields you **enable** via checkboxes below will be updated across all {selectedItems.length} items. Other fields will remain untouched!
              </p>

              {/* HSN CODE UPDATE */}
              <div className="border border-slate-100 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="update-hsn-toggle"
                    checked={updateHsnEnabled}
                    onChange={e => setUpdateHsnEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="update-hsn-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                    Update HSN Code
                  </label>
                </div>
                {updateHsnEnabled && (
                  <input 
                    placeholder="e.g. 1905" 
                    value={bulkEditHsn} 
                    onChange={e => setBulkEditHsn(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs" 
                    id="bulk-edit-hsn"
                  />
                )}
              </div>

              {/* BASE PRICE UPDATE */}
              <div className="border border-slate-100 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="update-price-toggle"
                    checked={updatePriceEnabled}
                    onChange={e => setUpdatePriceEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="update-price-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                    Update Base Price (₹)
                  </label>
                </div>
                {updatePriceEnabled && (
                  <input 
                    type="number"
                    placeholder="e.g. 500" 
                    value={bulkEditPrice} 
                    onChange={e => setBulkEditPrice(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs" 
                    id="bulk-edit-price"
                  />
                )}
              </div>

              {/* GST UPDATE */}
              <div className="border border-slate-100 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="update-gst-toggle"
                    checked={updateGstEnabled}
                    onChange={e => setUpdateGstEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="update-gst-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                    Update GST %
                  </label>
                </div>
                {updateGstEnabled && (
                  <input 
                    type="number"
                    placeholder="e.g. 18" 
                    value={bulkEditGst} 
                    onChange={e => setBulkEditGst(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs" 
                    id="bulk-edit-gst"
                  />
                )}
              </div>

              {/* WEIGHT UPDATE */}
              <div className="border border-slate-100 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="update-weight-toggle"
                    checked={updateWeightEnabled}
                    onChange={e => setUpdateWeightEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="update-weight-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                    Update Weight / Size
                  </label>
                </div>
                {updateWeightEnabled && (
                  <input 
                    placeholder="e.g. 1kg or 500g" 
                    value={bulkEditWeight} 
                    onChange={e => setBulkEditWeight(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs" 
                    id="bulk-edit-weight"
                  />
                )}
              </div>

              {/* CATEGORY UPDATE */}
              <div className="border border-slate-100 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="update-category-toggle"
                    checked={updateCategoryEnabled}
                    onChange={e => setUpdateCategoryEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="update-category-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                    Update Category
                  </label>
                </div>
                {updateCategoryEnabled && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {['500g cake', '1kg cake', 'chocolate', 'snack', 'other'].map(c => (
                        <button 
                          key={c}
                          type="button"
                          onClick={() => setBulkEditCategory(c)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all",
                            bulkEditCategory === c ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-slate-50 text-slate-400 border-slate-100"
                          )}
                          id={`bulk-edit-cat-${c.replace(' ', '-')}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <input 
                      placeholder="Or enter custom category..." 
                      value={bulkEditCategory} 
                      onChange={e => setBulkEditCategory(e.target.value.toLowerCase())} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                      id="bulk-edit-custom-cat"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading || (!updateHsnEnabled && !updateGstEnabled && !updateWeightEnabled && !updatePriceEnabled && !updateCategoryEnabled)}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 transition-all text-sm flex items-center justify-center gap-2"
                  id="bulk-edit-submit-btn"
                >
                  {loading ? 'Saving updates...' : 'Save Bulk Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const NewOrderModal: React.FC<{ 
  onClose: () => void, 
  bakeryId: string, 
  catalog?: MenuItem[],
  initialType?: 'dealer_cake' | 'custom_cake' | 'chocolate',
  dealers: Dealer[]
}> = ({ onClose, bakeryId, catalog = [], initialType = 'custom_cake', dealers }) => {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [anniversary, setAnniversary] = useState('');
  const [engagement, setEngagement] = useState('');
  const [delDate, setDelDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [delTime, setDelTime] = useState('18:00');
  const [flavor, setFlavor] = useState('');
  const [showFlavorSearch, setShowFlavorSearch] = useState(false);
  const flavorSearchRef = useRef<HTMLDivElement>(null);

  const flavorSuggestions = catalog.filter(item => {
    const isMatchedType = (type === 'chocolate' && item.category === 'chocolate') || 
                        (type !== 'chocolate' && item.category.includes('cake'));
    return isMatchedType && item.name.toLowerCase().includes(flavor.toLowerCase()) && flavor.length > 0;
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (flavorSearchRef.current && !flavorSearchRef.current.contains(event.target as Node)) {
        setShowFlavorSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [weight, setWeight] = useState('0.5');
  const [qty, setQty] = useState('1');
  const [instr, setInstr] = useState('');
  const [price, setPrice] = useState('');
  const [adv, setAdv] = useState('0');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [chocolateSlip, setChocolateSlip] = useState<string | null>(null);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Please upload an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setPhotoUrl(''); // Clear URL if file is uploaded
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Please upload an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setChocolateSlip(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !phone) {
          setPhone(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    fetchISD();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;
      let displayId = `#${orderId.slice(-6).toUpperCase()}`;
      let dealerCompanyName = '';
      
      const orderRef = doc(db, 'orders', orderId);
      
      await runTransaction(db, async (transaction) => {
        if (type === 'dealer_cake' && selectedDealerId) {
          const dealerRef = doc(db, 'dealers', selectedDealerId);
          const dealerSnap = await transaction.get(dealerRef);
          
          if (dealerSnap.exists()) {
            const dealerData = dealerSnap.data() as Dealer;
            const sequence = (dealerData.lastOrderSequence || 0) + 1;
            const prefix = dealerData.orderPrefix || dealerData.companyName.slice(0, 2).toUpperCase();
            displayId = `${prefix}${sequence.toString().padStart(3, '0')}`;
            dealerCompanyName = dealerData.companyName;
            
            // Increment sequence on dealer document
            transaction.update(dealerRef, { lastOrderSequence: sequence });
          }
        }
        
        const orderData = {
          bakeryId,
          type,
          displayId,
          dealerId: type === 'dealer_cake' ? selectedDealerId : null,
          dealerCompanyName,
          status: 'pending',
          quoteTag: type === 'custom_cake' ? 'DESIGN QUOTE PENDING' : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          deliveryDate: delDate,
          deliveryTime: delTime,
          customerDetails: {
            name,
            phone,
            birthday,
            anniversary,
            engagementDate: engagement
          },
          details: type === 'chocolate' ? {
            quantity: parseInt(qty) || 1,
            productType: 'bites',
            flavor: flavor,
            slipUrl: chocolateSlip || '',
            instruction: instr
          } : {
            weight: parseFloat(weight) || 0.5,
            flavor,
            isPhotoCake: !!(photoUrl || uploadedImage),
            photoUrl: photoUrl || uploadedImage || '',
            instruction: instr
          },
          totalAmount: parseFloat(price) || 0,
          advanceReceived: parseFloat(adv) || 0,
        };
        
        transaction.set(orderRef, orderData);
      });

      // CRM Sync with increment (isolated per bakery to support multi-tenancy and prevent cross-bakery data leakage or overwrites)
      const customerId = `cust_${bakeryId}_${phone}`;
      const customerDoc = doc(db, 'customers', customerId);
      const customerSnap = await getDoc(customerDoc);
      const isNew = !customerSnap.exists();
      
      const customerPayload: any = {
        id: customerId,
        bakeryId,
        name,
        phone,
        birthday: birthday || null,
        anniversary: anniversary || null,
        engagementDate: engagement || null,
        lastOrderAt: serverTimestamp(),
        totalOrders: increment(1)
      };
      
      if (isNew) {
        customerPayload.createdAt = serverTimestamp();
      }

      await setDoc(customerDoc, customerPayload, { merge: true });

      setUploadedImage(null);
      setChocolateSlip(null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <h2 className="text-sm sm:text-xl font-bold uppercase tracking-widest">New Retail Order</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl px-2">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto custom-scrollbar">
          {/* Order Type */}
          <div className="flex flex-wrap gap-2">
            {['custom_cake', 'chocolate', 'dealer_cake'].map(t => (
              <button 
                key={t}
                type="button"
                onClick={() => setType(t as any)}
                className={cn(
                  "flex-1 min-w-[100px] py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                  type === t ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200" : "bg-slate-50 text-slate-400 border-slate-100"
                )}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          {type === 'dealer_cake' && (
            <div className="animate-in slide-in-from-top-2 duration-300">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Partner Dealer</label>
              <select 
                value={selectedDealerId} 
                onChange={e => setSelectedDealerId(e.target.value)} 
                className="w-full bg-blue-50 border border-blue-100 p-4 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="">Choose a Dealer...</option>
                {Array.from(new Map<string, Dealer>((dealers || []).filter(d => d && d.id).map(d => [d.id, d])).values()).map((d) => (
                  <option key={d.id} value={d.id}>{d.companyName} ({d.staffName})</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Customer Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Client Profile</h3>
              <input required placeholder="Client Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
              <input required placeholder="Mobile Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Birth</label>
                  <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} className="w-full text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg font-bold" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Anniversary</label>
                  <input type="date" value={anniversary} onChange={e => setAnniversary(e.target.value)} className="w-full text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg font-bold" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Engage</label>
                  <input type="date" value={engagement} onChange={e => setEngagement(e.target.value)} className="w-full text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg font-bold" />
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Order Specs</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Deliv. Date</label>
                  <input type="date" required value={delDate} onChange={e => setDelDate(e.target.value)} className="w-full text-xs bg-blue-50 border border-blue-100 p-3 rounded-xl font-bold" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Deliv. Time</label>
                  <input type="time" required value={delTime} onChange={e => setDelTime(e.target.value)} className="w-full text-xs bg-blue-50 border border-blue-100 p-3 rounded-xl font-bold" />
                </div>
              </div>

              <div className="relative" ref={flavorSearchRef}>
                <label className="block text-[10px] font-black text-blue-600 uppercase mb-2">What flavor is it?</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600">
                    <Search size={18} className="text-slate-300" />
                  </div>
                  <input 
                    required 
                    placeholder={type === 'chocolate' ? "Search chocolate flavors..." : "Search cake flavors (e.g. Pineapple, Velvet)..."}
                    value={flavor} 
                    onFocus={() => setShowFlavorSearch(true)}
                    onChange={e => {
                      setFlavor(e.target.value);
                      setShowFlavorSearch(true);
                    }} 
                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 focus:bg-white p-5 pl-12 rounded-[2rem] font-black text-slate-900 transition-all shadow-inner" 
                  />
                </div>
                {showFlavorSearch && flavorSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-3 bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl z-[120] max-h-64 overflow-y-auto p-3 space-y-1 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-slate-50 mb-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recommended from Catalogue</p>
                    </div>
                    {flavorSuggestions.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setFlavor(item.name);
                          setPrice(item.price.toString());
                          if (item.category.includes('500g')) setWeight('0.5');
                          if (item.category.includes('1kg')) setWeight('1');
                          setShowFlavorSearch(false);
                        }}
                        className="w-full text-left p-4 hover:bg-blue-50 rounded-2xl transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Tag size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 group-hover:text-blue-700">{item.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{item.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-blue-600">₹{item.price}</p>
                          <p className="text-[9px] text-slate-300 font-bold uppercase">Select</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {type === 'chocolate' ? (
                <div className="space-y-4">
                  <input required type="number" placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
                  
                  <div className="space-y-3">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Order Slip / Manual Slip</label>
                    <div className="grid grid-cols-1 gap-4">
                      {chocolateSlip ? (
                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 group">
                          <img src={chocolateSlip} alt="Slip Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setChocolateSlip(null)}
                            className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <button 
                            type="button"
                            onClick={() => slipInputRef.current?.click()}
                            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 p-5 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-400 hover:text-indigo-600 group"
                          >
                            <FileText className="w-6 h-6 transition-transform group-hover:rotate-12" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Upload Order Slip</span>
                          </button>
                          <input 
                            type="file" 
                            ref={slipInputRef}
                            className="hidden" 
                            accept="image/*"
                            onChange={handleSlipChange}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <input required step="0.5" type="number" placeholder="Weight (kg)" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
                  
                  <div className="space-y-3">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Cake Reference Image</label>
                    <div className="grid grid-cols-1 gap-4">
                      {uploadedImage ? (
                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 group">
                          <img src={uploadedImage} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setUploadedImage(null)}
                            className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-2">
                            <button 
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 p-4 rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-400 hover:text-blue-600 group"
                            >
                              <ImagePlus className="w-5 h-5 transition-transform group-hover:scale-110" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Upload Photo</span>
                            </button>
                            <input 
                              type="file" 
                              ref={fileInputRef}
                              className="hidden" 
                              accept="image/*"
                              onChange={handleFileChange}
                            />
                          </div>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                              <ExternalLink size={14} className="text-slate-300" />
                            </div>
                            <input 
                              placeholder="Or paste reference URL..." 
                              value={photoUrl} 
                              onChange={e => {
                                setPhotoUrl(e.target.value);
                                if (e.target.value) setUploadedImage(null);
                              }} 
                              className="w-full bg-slate-50 border border-slate-200 p-4 pl-10 rounded-2xl text-[11px] font-bold" 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Total Order Value</label>
                  <input required type="number" placeholder="Total Price" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-blue-50 border border-blue-100 p-4 rounded-2xl font-black text-blue-700" />
                </div>
                <div>
                  <label className={`block text-[8px] font-black ${type === 'dealer_cake' ? 'text-slate-400' : 'text-green-600'} uppercase mb-1`}>
                    Advance Payment {type === 'dealer_cake' && '(Optional)'}
                  </label>
                  <input 
                    required={type !== 'dealer_cake'} 
                    type="number" 
                    placeholder="Advance" 
                    value={adv} 
                    onChange={e => setAdv(e.target.value)} 
                    className={`w-full ${type === 'dealer_cake' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-green-50 border-green-100 text-green-700'} p-4 rounded-2xl font-black`} 
                  />
                </div>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl">
                <div className="flex justify-between items-center text-white">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Balance Payment</span>
                  <span className="text-xl font-black text-blue-400">₹{(Math.max(0, parseFloat(price || '0') - parseFloat(adv || '0')) || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Visuals & Notes</h3>
            <textarea placeholder="Specific instructions for production team..." value={instr} onChange={e => setInstr(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold h-24" />
          </div>

          <button disabled={loading} type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl disabled:opacity-50">
            {loading ? 'SYNCING...' : 'Process Order & Update CRM'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

const DashboardOverview: React.FC<{ orders: Order[], bakery: Bakery | null, onNewOrder: (t?: any) => void }> = ({ orders, bakery, onNewOrder }) => {
  const navigate = useNavigate();
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => o.createdAt?.toDate?.()?.toDateString() === today && !o.isDeleted);
  const pendingOrders = orders.filter(o => o.status === 'pending' && !o.isDeleted);
  const inProduction = orders.filter(o => o.status === 'in_progress' && !o.isDeleted);
  const readyOrders = orders.filter(o => o.status === 'ready' && !o.isDeleted);
  const thisMonthOrders = orders.filter(o => {
    const d = o.createdAt?.toDate?.();
    return d && d >= startOfMonth(new Date()) && !o.isDeleted;
  }).length;
  const yesterdayDate = new Date(new Date().setDate(new Date().getDate() - 1)).toDateString();
  const yesterdayOrders = orders.filter(o => o.createdAt?.toDate?.()?.toDateString() === yesterdayDate && o.status !== 'cancelled' && !o.isDeleted);
  const todayRevenue = todayOrders.reduce((acc, o) => acc + (o.status !== 'cancelled' ? (o.totalAmount || 0) : 0), 0);
  const yesterdayRevenue = yesterdayOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const revGrowth = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0;

  // Dynamic Revenue Velocity (Last 10 days)
  const last10Days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (9 - i));
    return d;
  });

  const dailyRevenues = last10Days.map(day => {
    const dateStr = day.toDateString();
    const dayOrders = orders.filter(o => o.createdAt?.toDate?.()?.toDateString() === dateStr && o.status !== 'cancelled' && !o.isDeleted);
    const rev = dayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = `${day.getDate()} ${monthNames[day.getMonth()]}`;
    return {
      label,
      revenue: rev
    };
  });

  const maxVal = Math.max(...dailyRevenues.map(r => r.revenue), 1);

  return (
    <div className="space-y-6">
      {/* Mobile & Tablet Quick Launch Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:hidden">
        <button 
          onClick={() => navigate('/dashboard/production')}
          className="aspect-square bg-slate-900 rounded-[2rem] flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-xl shadow-slate-200"
        >
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-3 group-hover:bg-amber-500 transition-colors">
            <UtensilsCrossed size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest leading-tight">Live<br/>Pipeline</span>
        </button>
        <button 
          onClick={() => navigate('/dashboard/orders')}
          className="aspect-square bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-sm"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Receipt size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">Order<br/>History</span>
        </button>
        <button 
          onClick={() => navigate('/dashboard/catalog')}
          className="aspect-square bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-sm"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Tag size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">Product<br/>Menu</span>
        </button>
        <button 
          onClick={() => navigate('/dashboard/staff')}
          className="aspect-square bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-sm"
        >
          <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Users size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">Staff<br/>Portal</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          label="Today's Orders" 
          value={todayOrders.length} 
          icon={ShoppingBag} 
          color="blue" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="Pending Approval" 
          value={pendingOrders.length} 
          icon={Clock} 
          color="red" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="In Production" 
          value={inProduction.length} 
          icon={Layers} 
          color="amber" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="Ready to Dispatch" 
          value={readyOrders.length} 
          icon={CheckCircle2} 
          color="green" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="Monthly Orders" 
          value={thisMonthOrders} 
          icon={Calendar} 
          color="purple" 
          onClick={() => navigate('/dashboard/orders')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Today's Cash Flow</p>
           <h4 className="text-xl font-black text-slate-900">{formatCurrency(todayRevenue)}</h4>
           <div className="flex items-center gap-1 mt-1">
             {revGrowth >= 0 ? <TrendingUp size={12} className="text-emerald-500" /> : <Users size={12} className="text-rose-500" />}
             <span className={cn("text-[9px] font-black uppercase", revGrowth >= 0 ? "text-emerald-500" : "text-rose-500")}>
               {Math.abs(Math.round(revGrowth))}% {revGrowth >= 0 ? 'higher' : 'lower'} than yesterday
             </span>
           </div>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cancellations Today</p>
           <h4 className="text-xl font-black text-slate-900">{todayOrders.filter(o => o.status === 'cancelled').length}</h4>
           <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 leading-none">Accounting Protection Active</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Loyalty Pulse</p>
           <h4 className="text-xl font-black text-slate-900">{orders.filter(o => o.confirmationReminderSentAt && o.createdAt?.toDate().toDateString() === new Date().toDateString()).length}</h4>
           <p className="text-[9px] text-blue-500 font-bold uppercase mt-1 leading-none">Reminders Dispatched</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dispatch Pipeline</p>
           <h4 className="text-xl font-black text-slate-900">{readyOrders.length > 0 ? Math.round((readyOrders.length / (todayOrders.length || 1)) * 100) : 0}%</h4>
           <p className="text-[9px] text-emerald-500 font-bold uppercase mt-1 leading-none">Readiness Score</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Revenue Velocity</h3>
            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Live</span>
          </div>
          <div className="h-48 flex items-end gap-1 sm:gap-2 px-1 sm:px-4">
            {dailyRevenues.map((item, i) => {
              const heightPct = Math.max(8, Math.round((item.revenue / maxVal) * 100));
              return (
                <div key={i} className="flex-1 bg-blue-100 rounded-t-lg hover:bg-blue-600 transition-all cursor-pointer group relative" style={{ height: `${heightPct}%` }}>
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-lg">
                    ₹{(item.revenue || 0).toLocaleString()} ({item.label})
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-4 text-[10px] text-slate-400 font-black uppercase tracking-widest px-4">
            <span>{dailyRevenues[0]?.label}</span>
            <span>{dailyRevenues[dailyRevenues.length - 1]?.label}</span>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl shadow-slate-200 flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Internal Operations</h3>
            <h2 className="text-2xl font-black mb-6">Quick Entries</h2>
          </div>
          <div className="space-y-3 relative z-10">
            <button onClick={() => onNewOrder('dealer_cake')} className="w-full bg-white/10 hover:bg-white/20 px-4 py-4 rounded-2xl flex items-center gap-3 transition-all text-left group">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Package className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-black uppercase tracking-widest">Normal Order</span>
            </button>
            <button onClick={() => onNewOrder('custom_cake')} className="w-full bg-white/10 hover:bg-white/20 px-4 py-4 rounded-2xl flex items-center gap-3 transition-all text-left group">
              <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Palette className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-black uppercase tracking-widest">Custom Cake</span>
            </button>
            <button onClick={() => onNewOrder('chocolate')} className="w-full bg-white/10 hover:bg-white/20 px-4 py-4 rounded-2xl flex items-center gap-3 transition-all text-left group">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Candy className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-black uppercase tracking-widest">Chocolate Batch</span>
            </button>
          </div>
          {/* Background Gradient */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20"></div>
        </div>
      </div>
    </div>
  );
};

const OrdersManager: React.FC<{ orders: Order[], dealers: Dealer[], bakery: Bakery | null, onSilence?: () => void }> = ({ orders, dealers, bakery, onSilence }) => {
  const { profile, user: authUser, isSuperAdmin } = useAuth();
  const [filter, setFilter] = useState<'all' | 'today' | 'pending' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'dealer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [rangeStart, setRangeStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('Incorrect Details');
  const [cancelCustomReason, setCancelCustomReason] = useState('');

  const handleCancelOrder = (orderId: string) => {
    const o = orders.find(ord => ord.id === orderId);
    if (o) {
      setCancelModalOrder(o);
      setCancelReason('Incorrect Details');
      setCancelCustomReason('');
    }
  };

  const confirmCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const finalReason = cancelReason === 'Other' ? (cancelCustomReason || 'Cancelled by Admin') : cancelReason;
    if (onSilence) onSilence();
    try {
      const orderRef = doc(db, 'orders', cancelModalOrder.id);
      const staffName = profile?.displayName || authUser?.displayName || authUser?.email || 'Admin';
      
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: staffName,
        cancelledReason: finalReason,
        cancelSeenByDealer: false,
        updatedAt: serverTimestamp()
      });
      await createLog('order', `Order #${cancelModalOrder.id.slice(-6)} CANCELLED by ${staffName}: ${finalReason}`, authUser?.uid, authUser?.email, bakery?.id || '');
      setCancelModalOrder(null);
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      alert("Failed to cancel order: " + (err.message || String(err)));
      handleFirestoreError(err, OperationType.UPDATE, `orders/${cancelModalOrder.id}`);
    }
  };

  const handleSendReminder = async (order: Order) => {
    if (!order.customerDetails?.phone) return;

    try {
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        confirmationReminderSentAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const message = `Namaste ${order.customerDetails.name}! This is a friendly reminder for your order at ${bakery?.name || 'Bakesync'}. Your order (#${order.displayId || order.id.slice(-6)}) for ${order.deliveryDate} is currently ${order.status.toUpperCase()}. Looking forward to serving you!`;
      const waUrl = `https://wa.me/91${order.customerDetails.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
      
      await createLog('order', `Confirmation reminder sent to ${order.customerDetails.phone}`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };
  
  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          order.customerDetails?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          order.dealerCompanyName?.toLowerCase().includes(searchTerm.toLowerCase());
    if (filter === 'today') return matchesSearch && order.createdAt?.toDate().toDateString() === new Date().toDateString();
    if (filter === 'pending') return matchesSearch && (order.status === 'pending');
    if (filter === 'completed') return matchesSearch && order.status === 'sent';
    return matchesSearch;
  }).sort((a, b) => {
    if (sortBy === 'date') {
      const timeA = a.createdAt?.toDate().getTime() || 0;
      const timeB = b.createdAt?.toDate().getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    } else {
      const nameA = a.dealerCompanyName || 'Retail';
      const nameB = b.dealerCompanyName || 'Retail';
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredOrders.length, itemsPerPage, currentPage, totalPages]);

  const setPreset = (type: 'last_month' | 'three_months' | 'this_month' | 'today') => {
    const today = new Date();
    if (type === 'today') {
      const todayStr = format(today, 'yyyy-MM-dd');
      setRangeStart(todayStr);
      setRangeEnd(todayStr);
    } else if (type === 'this_month') {
      setRangeStart(format(startOfMonth(today), 'yyyy-MM-dd'));
      setRangeEnd(format(today, 'yyyy-MM-dd'));
    } else if (type === 'last_month') {
      const lastMonth = subMonths(today, 1);
      setRangeStart(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
    } else if (type === 'three_months') {
      setRangeStart(format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd'));
      setRangeEnd(format(today, 'yyyy-MM-dd'));
    }
  };

  const handleRangeExport = () => {
    setExporting(true);
    try {
      const rangeOrders = orders.filter(o => o.deliveryDate >= rangeStart && o.deliveryDate <= rangeEnd);
      if (rangeOrders.length === 0) {
        alert("No orders found for this range.");
        return;
      }
      exportOrdersToExcel(rangeOrders, bakery?.name || 'Bakery', `Range_${rangeStart}_to_${rangeEnd}`);
      setShowExportModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-white p-6 rounded-3xl border border-slate-200">
        <div className="flex p-1 bg-slate-100 rounded-2xl w-full lg:w-auto overflow-x-auto no-scrollbar">
          {['all', 'today', 'pending', 'completed'].map(t => (
            <button 
              key={t}
              onClick={() => setFilter(t as any)}
              className={cn(
                "flex-1 lg:flex-none px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                filter === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2 shrink-0">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
            <select 
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-[10px] font-bold bg-transparent outline-none appearance-none cursor-pointer hover:text-indigo-600 transition-colors"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </div>
          <button 
            onClick={() => setShowExportModal(true)}
            className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
            title="Download Excel Report"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Export All</span>
          </button>
        </div>
      </div>

      {/* Advanced Export Modal */}
      {showExportModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-start justify-center p-4 pt-[5vh] overflow-y-auto">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-top-10 duration-300 flex flex-col mb-8">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900">Export Orders</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Excel Report Generator</p>
                </div>
              </div>
              <button onClick={() => setShowExportModal(false)} className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all">
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Presets */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quick Selection</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setPreset('today')}
                    className="px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:bg-indigo-100 transition-all text-indigo-600"
                  >
                    Today Only
                  </button>
                  <button 
                    onClick={() => setPreset('this_month')}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:border-indigo-500 transition-all text-slate-600"
                  >
                    This Month
                  </button>
                  <button 
                    onClick={() => setPreset('last_month')}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:border-indigo-500 transition-all text-slate-600"
                  >
                    Last Month
                  </button>
                  <button 
                    onClick={() => setPreset('three_months')}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:border-indigo-500 transition-all text-slate-600"
                  >
                    3 Month History
                  </button>
                </div>
              </div>

              {/* Custom Range */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Date Range</label>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-slate-400 ml-1 uppercase">From</p>
                    <input 
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-slate-400 ml-1 uppercase">To</p>
                    <input 
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleRangeExport}
                disabled={exporting}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {exporting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {exporting ? 'Generating...' : 'Download Export'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        {selectedOrder && (
          <OrderDetailsModal 
            order={selectedOrder} 
            bakery={bakery}
            dealer={dealers.find(d => d.id === selectedOrder.dealerId)}
            userRole={profile?.role}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setSelectedOrder(null)} 
            onSilence={onSilence}
          />
        )}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 text-left min-w-[100px] md:min-w-[120px]">
                  <button 
                    onClick={() => {
                      if (sortBy === 'date') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      else setSortBy('date');
                    }}
                    className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                  >
                    Sort: Time {sortBy === 'date' && (sortOrder === 'desc' ? '▼' : '▲')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left min-w-[180px] md:min-w-[200px]">Details</th>
                <th className="hidden sm:table-cell px-6 py-4 text-left min-w-[150px]">Delivery</th>
                <th className="hidden lg:table-cell px-6 py-4 text-left min-w-[150px]">
                  <button 
                    onClick={() => {
                      if (sortBy === 'dealer') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      else setSortBy('dealer');
                    }}
                    className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                  >
                    Sort: Dealer {sortBy === 'dealer' && (sortOrder === 'desc' ? '▼' : '▲')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left min-w-[100px] md:min-w-[120px]">Status</th>
                <th className="hidden md:table-cell px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[120px]">Payment Status</th>
                <th className="px-4 py-4 md:px-6 md:py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[80px] md:min-w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No orders match your current filters.</td>
                </tr>
              ) : (
                paginatedOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <td className="px-6 py-4">
                    <div className="text-xs font-black text-slate-900">{order.displayId || `#${order.id.slice(-6).toUpperCase()}`}</div>
                    <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      {order.receivedBy && <span>REC: {order.receivedBy.split(' ')[0]} </span>}
                      {order.readyBy && <span>• RDY: {order.readyBy.split(' ')[0]} </span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">
                      {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : 'Chocolate Batch'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold flex flex-wrap gap-x-2">
                       <span>{order.customerDetails?.name || 'Customer'}</span>
                       <span className="lg:hidden text-indigo-500">• {order.dealerCompanyName || 'Direct'}</span>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-black text-red-600 bg-red-50 w-fit px-2 py-1 rounded">
                      <Clock className="w-3 h-3" />
                      {order.deliveryDate ? format(new Date(order.deliveryDate), 'dd MMM') : '-'} @ {order.deliveryTime || '-'}
                    </div>
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4">
                    <div className="flex items-center gap-2">
                      {order.dealerId && (
                        <div 
                          className="w-2 h-2 rounded-full shrink-0" 
                          style={{ backgroundColor: dealers.find(d => d.id === order.dealerId)?.color || '#6366f1' }}
                        />
                      )}
                      <div className="text-xs font-bold text-slate-700">{order.dealerCompanyName || 'Direct'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-tighter border",
                      order.status === 'pending' ? "bg-red-50 text-red-600 border-red-100" :
                      order.status === 'sent' ? "bg-green-50 text-green-600 border-green-100" :
                      order.status === 'cancelled' ? "bg-slate-100 text-slate-500 border-slate-200" :
                      "bg-blue-50 text-blue-600 border-blue-100"
                    )}>
                      {order.status}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <div className="text-right">
                      {order.type !== 'dealer_cake' ? (
                        <>
                          <div className="text-xs font-black text-slate-900">{formatCurrency(order.totalAmount)}</div>
                          {order.advanceReceived > 0 && (
                            <div className="text-[9px] font-bold text-green-600">Paid: {formatCurrency(order.advanceReceived)}</div>
                          )}
                          {order.totalAmount - (order.advanceReceived || 0) > 0 && (
                            <div className="text-[9px] font-bold text-red-500">Bal: {formatCurrency(order.totalAmount - (order.advanceReceived || 0))}</div>
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] font-bold text-slate-400 italic">Dealer Pricing</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 md:px-6 md:py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 md:gap-2">
                      {order.status !== 'cancelled' && order.status !== 'sent' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSendReminder(order); }}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            order.confirmationReminderSentAt ? "bg-green-50 text-green-600 border border-green-200" : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
                          )}
                          title="Send Confirmation Reminder"
                        >
                          <MessageCircle size={14} className={order.confirmationReminderSentAt ? "animate-pulse" : ""} />
                        </button>
                      )}
                      {order.status !== 'sent' && order.status !== 'cancelled' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                          className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                          title="Cancel Order"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => generateOrderPDF(order, bakery)}
                        className="p-2 text-slate-400 hover:text-blue-600 transition-colors bg-slate-50 md:bg-transparent rounded-lg border border-slate-100 md:border-0"
                        title="Download PDF Job Sheet"
                      >
                        <FileText size={16} />
                      </button>
                      {(('photoUrl' in order.details && (order.details as any).photoUrl) || ('slipUrl' in order.details && (order.details as any).slipUrl)) && (
                        <button 
                          onClick={() => {
                            const url = ('photoUrl' in order.details ? (order.details as any).photoUrl : (order.details as any).slipUrl);
                            if (url) window.open(url, '_blank');
                          }}
                          className="p-2 text-slate-400 hover:text-blue-500 transition-colors bg-slate-50 md:bg-transparent rounded-lg border border-slate-100 md:border-0"
                          title="View Reference Image / Slip"
                        >
                          <ImageIcon size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        
        {filteredOrders.length > itemsPerPage && (
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Showing {(currentPage-1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredOrders.length)} of {filteredOrders.length}
            </p>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
              >
                Prev
              </button>
              <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
                   let p = i + 1;
                   if (totalPages > 10 && currentPage > 5) {
                     p = currentPage - 5 + i;
                     if (p + 10 > totalPages) p = totalPages - 9;
                   }
                   if (p > totalPages) return null;
                   return (
                    <button 
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-[10px] font-black transition-all shrink-0 font-mono",
                        currentPage === p ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Ban className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase text-center">Cancel Order</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">
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
                    className="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
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
    </div>
  );
};

const ProductionCore: React.FC<{ orders: Order[], bakery: Bakery | null, dealers?: Dealer[], onSilence?: () => void }> = ({ orders, bakery, dealers = [], onSilence }) => {
  const navigate = useNavigate();
  const { user: authUser, profile, isSuperAdmin } = useAuth();
  const { playReady, stopReady, playSent, stopPending } = useSound();
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'dealers' | 'custom'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Force re-render periodically for the 5-minute linger logic
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isRecentlySent = (order: Order) => {
    if (order.status !== 'sent' || !order.sentAt) return false;
    const sentTime = order.sentAt.toDate().getTime();
    const diffInMinutes = (currentTime.getTime() - sentTime) / (1000 * 60);
    return diffInMinutes < 5;
  };

  const isInProgressTooLong = (order: Order) => {
    if (order.status !== 'in_progress' || !order.inProgressAt) return false;
    const inProgressTime = order.inProgressAt.toDate().getTime();
    const diffInMinutes = (currentTime.getTime() - inProgressTime) / (1000 * 60);
    return diffInMinutes > 20;
  };
  
  // Action State for Modal
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onResolve: () => void;
  } | null>(null);

  // WhatsApp Feedback Prompt State
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ url: string; customerName: string } | null>(null);

  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('Incorrect Details');
  const [cancelCustomReason, setCancelCustomReason] = useState('');

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void) => {
    setPendingAction({ title, message, confirmText, onResolve });
  };
  
  const updateStatus = async (orderId: string, currentStatus: OrderStatus) => {
    const docRef = doc(db, 'orders', orderId);
    const order = orders.find(o => o.id === orderId);
    const staffName = auth?.currentUser?.displayName || auth?.currentUser?.email || 'System';
    
    let next: OrderStatus = 'received';
    const isDirectToProduction = order?.type === 'dealer_cake' || order?.type === 'custom_cake' || order?.type === 'chocolate' || !!order?.dealerId;

    if (currentStatus === 'pending') {
      next = isDirectToProduction ? 'in_progress' : 'received';
    } else if (currentStatus === 'received') {
      next = 'in_progress';
    } else if (currentStatus === 'in_progress') {
      next = 'ready';
    } else if (currentStatus === 'ready') {
      next = 'sent';
    } else {
      return;
    }
    
    // Payment Verification for Retail Custom Cakes & Chocolates (Dealers are billed monthly)
    if (next === 'sent') {
      const order = orders.find(o => o.id === orderId);
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
                  status: 'sent', 
                  updatedAt: serverTimestamp(),
                  sentAt: serverTimestamp(),
                  sentBy: staffName
                });
                await createLog('order', `Order #${orderId.slice(-6)} delivered by ${staffName} (Payment Verified)`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
                if (order) {
                  const fbPrompt = buildAutoFeedbackPrompt(order, bakery?.name, bakery?.id);
                  if (fbPrompt) setFeedbackPrompt(fbPrompt);
                }
              } catch (err) {
                handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
              } finally {
                setPendingAction(null);
              }
            }
          );
          return;
        }
      }
    }

    try {
      const updateData: any = { 
        status: next, 
        updatedAt: serverTimestamp(),
      };

      if (next === 'received') {
        updateData.receivedAt = serverTimestamp();
        updateData.receivedBy = staffName;
      } else if (next === 'in_progress') {
        updateData.inProgressAt = serverTimestamp();
        updateData.inProgressBy = staffName;
        updateData.problemDetails = null;
        updateData.problemSeenByDealer = false;
      } else if (next === 'ready') {
        updateData.readyAt = serverTimestamp();
        updateData.readyBy = staffName;
        updateData.readySeenByDealer = false;
      } else if (next === 'sent') {
        updateData.sentAt = serverTimestamp();
        updateData.sentBy = staffName;
      }

      await updateDoc(docRef, updateData);
      await createLog('order', `Order #${orderId.slice(-6)} status: ${next} by ${staffName}`, authUser?.uid, authUser?.email, bakery?.id || '');
      if (next === 'sent') {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          const fbPrompt = buildAutoFeedbackPrompt(order, bakery?.name, bakery?.id);
          if (fbPrompt) setFeedbackPrompt(fbPrompt);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleCancelOrder = (orderId: string) => {
    const o = orders.find(ord => ord.id === orderId);
    if (o) {
      setCancelModalOrder(o);
      setCancelReason('Incorrect Details');
      setCancelCustomReason('');
    }
  };

  const confirmCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const finalReason = cancelReason === 'Other' ? (cancelCustomReason || 'Cancelled by Admin') : cancelReason;
    stopPending();
    stopReady();
    if (onSilence) onSilence();
    try {
      const orderRef = doc(db, 'orders', cancelModalOrder.id);
      const staffName = profile?.displayName || authUser?.displayName || authUser?.email || 'Admin';
      
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: staffName,
        cancelledReason: finalReason,
        cancelSeenByDealer: false,
        updatedAt: serverTimestamp()
      });
      await createLog('order', `Order #${cancelModalOrder.id.slice(-6)} CANCELLED by ${staffName}: ${finalReason}`, authUser?.uid, authUser?.email, bakery?.id || '');
      setCancelModalOrder(null);
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      alert("Failed to cancel order: " + (err.message || String(err)));
      handleFirestoreError(err, OperationType.UPDATE, `orders/${cancelModalOrder.id}`);
    }
  };

  const statusCols: OrderStatus[] = ['pending', 'in_progress', 'ready', 'sent'];

  return (
    <div className="space-y-6">
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

      {/* Tabs */}
      {selectedOrder && (
        <OrderDetailsModal 
          order={selectedOrder} 
          bakery={bakery}
          dealer={dealers.find(d => d.id === selectedOrder.dealerId)}
          userRole={profile?.role}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedOrder(null)} 
          onSilence={() => { stopPending(); stopReady(); if (onSilence) onSilence(); }}
        />
      )}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('active')}
          className={cn(
            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            activeTab === 'active' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Active Production ({orders.filter(o => (o.status !== 'sent' && o.status !== 'cancelled') || isRecentlySent(o)).length})
        </button>
        <button 
          onClick={() => setActiveTab('completed')}
          className={cn(
            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            activeTab === 'completed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          History Today ({orders.filter(o => (o.status === 'sent' && !isRecentlySent(o)) || o.status === 'cancelled').length})
        </button>
      </div>

      {activeTab === 'active' ? (
        <>
          {orders.filter(o => (o.status !== 'sent' && o.status !== 'cancelled') || isRecentlySent(o)).length === 0 && (
            <div className="py-4 text-center text-slate-400 text-[13px] font-medium">
              No active orders right now
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {statusCols.map(status => (
          <div key={status} className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {status === 'sent' ? 'Sent' : status.replace('_', ' ')}
                </h3>
                {status === 'ready' && orders.filter(o => o.status === 'ready').length > 0 && (
                  <button 
                    onClick={() => stopReady()} 
                    className="bg-red-50 text-red-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    Mute
                  </button>
                )}
              </div>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-black">
                {orders.filter(o => {
                  if (status === 'sent') return isRecentlySent(o);
                  return status === 'in_progress' ? (o.status === 'in_progress' || o.status === 'received') : o.status === status;
                }).length}
              </span>
            </div>
            <div className="space-y-4">
              {orders.filter(o => {
                if (status === 'sent') return isRecentlySent(o);
                return status === 'in_progress' ? (o.status === 'in_progress' || o.status === 'received') : o.status === status;
              }).map(order => {
                const dealer = order.dealerId ? dealers.find(d => d.id === order.dealerId) : null;
                const dealerColor = dealer?.color;
                return (
                  <div 
                    key={order.id} 
                    className={cn(
                      "bg-white p-4 rounded-2xl border border-slate-200 shadow-sm group transition-all border-l-4",
                      !order.dealerId && (
                        status === 'pending' ? "border-l-slate-400" :
                        status === 'in_progress' ? "border-l-amber-400" :
                        status === 'ready' ? "border-l-green-400" :
                        "border-l-blue-400"
                      ),
                      (order.status === 'pending' || order.status === 'received') && !order.dealerId && "bg-red-50 border-red-200 animate-flash",
                      isInProgressTooLong(order) && "bg-red-50 border-red-200 animate-pulse border-l-red-600",
                      order.status === 'sent' && "opacity-80"
                    )}
                    style={{ 
                      borderLeftColor: order.dealerId ? (dealerColor || '#6366f1') : undefined,
                      backgroundColor: order.dealerId ? `${dealerColor || '#6366f1'}15` : undefined 
                    }}
                  >
                  <div className="cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-900 uppercase">
                        {order.displayId || `#${order.id.slice(-4).toUpperCase()}`}
                      </span>
                      {isInProgressTooLong(order) && (
                        <span className="text-[8px] font-black text-red-600 animate-pulse">⚠️ OVER 20 MINS IN PROG</span>
                      )}
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                        {order.dealerCompanyName || 'Retail'}
                        {order.receivedBy && <span className="ml-1 text-blue-500"> • Rec: {order.receivedBy.split(' ')[0]}</span>}
                        {order.readyBy && <span className="ml-1 text-green-500"> • Rdy: {order.readyBy.split(' ')[0]}</span>}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-black text-slate-800 mb-2">
                    {'weight' in order.details ? (
                      <div className="flex items-center flex-wrap gap-2">
                        <span>{order.details.weight}kg {order.details.flavor}</span>
                        {'quantity' in order.details && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-black text-[10px] shadow-sm">
                            QTY: {(order.details as any).quantity || 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center flex-wrap gap-2">
                        <span>{('flavor' in order.details ? order.details.flavor : 'Custom Order')}</span>
                        {'quantity' in order.details && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-black text-[10px] shadow-sm">
                            QTY: {(order.details as any).quantity || 1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-black mb-3">
                    <Calendar className="w-3 h-3" />
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
                        if (diff === 0) return "text-red-600";
                        if (diff === 1) return "text-amber-600";
                        return "text-slate-400";
                      })()
                    )}>
                      {order.deliveryDate ? format(new Date(order.deliveryDate), 'dd MMM') : '-'} | {order.deliveryTime || '-'}
                      <span className="ml-1 uppercase text-[11px]">
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
                          if (diff === 0) return "🔴 SAME DAY";
                          if (diff === 1) return "🟡 TOMORROW";
                          return "⚪ SCHEDULED";
                        })()}
                      </span>
                    </span>
                  </div>

                  {order.quoteTag && (
                    <div className={cn(
                      "mb-3 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest w-fit border-2",
                      order.quoteTag === 'DESIGN QUOTE PENDING' ? "bg-amber-50 text-amber-600 border-amber-100/50 flex items-center gap-2" :
                      order.quoteTag === 'QUOTE SENT — AWAITING CONFIRM' ? "bg-blue-50 text-blue-600 border-blue-100 flex items-center gap-2" :
                      order.quoteTag === 'CONFIRMED' ? "bg-green-50 text-green-600 border-green-100 flex items-center gap-2" :
                      "bg-slate-50 text-slate-600 border-slate-100 flex items-center gap-2"
                    )}>
                      {order.quoteTag === 'DESIGN QUOTE PENDING' && <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      {order.quoteTag}
                    </div>
                  )}

                  {order.type === 'custom_cake' && (
                    <div className="mb-3 space-y-2">
                       {!order.isQuoteLocked && (
                         <button 
                           onClick={() => navigate(`/admin/orders/${order.id}/design-quote`)}
                           className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-2"
                         >
                           <Palette className="w-3 h-3" />
                           {order.designQuote ? 'Modify Quote' : 'Add Design Quote'}
                         </button>
                       )}
                       {order.designQuote && (
                         <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                            <div className="flex justify-between items-center text-[10px] font-black">
                               <span className="text-slate-400 text-[8px] uppercase">Quoted Total</span>
                               <span className="text-blue-600">₹{(order.totalAmount || 0).toLocaleString()}</span>
                            </div>
                         </div>
                       )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {order.type === 'chocolate' && order.status === 'ready' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); stopReady(); }}
                        className="px-4 py-2 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white rounded-xl border border-amber-100 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
                        title="Silence Alert"
                      >
                        <BellOff size={14} />
                        Silence
                      </button>
                    )}
                    <div className="flex items-center gap-2 mt-auto">
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.status); }}
                        disabled={order.status === 'sent'}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm",
                          order.status === 'pending' ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white" :
                          order.status === 'sent' ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed" :
                          "bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white border-slate-100"
                        )}
                      >
                        {order.status === 'pending' ? 'Start Production →' : 
                         order.status === 'in_progress' ? 'Mark Ready →' :
                         order.status === 'ready' ? 'Mark Sent →' : 'Sent →'}
                      </button>
                      {order.status !== 'sent' && order.status !== 'cancelled' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                          className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl border border-rose-100 transition-all shadow-sm flex items-center justify-center"
                          title="Cancel Order"
                        >
                          <Ban size={16} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); generateOrderPDF(order, bakery); }}
                        className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-all shadow-sm flex items-center justify-center"
                        title="Download PDF"
                      >
                        <FileText size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
</>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Completed Deliveries</h3>
            <div className="flex bg-slate-200/50 p-1 rounded-xl">
              {(['all', 'dealers', 'custom'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    historyFilter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {f === 'all' ? 'All' : f === 'dealers' ? 'Car Dealers' : 'Custom'}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {orders
              .filter(o => (o.status === 'sent' && !isRecentlySent(o)) || o.status === 'cancelled')
              .filter(o => {
                if (historyFilter === 'all') return true;
                const isDealer = o.dealerId || o.type === 'dealer_cake';
                if (historyFilter === 'dealers') return isDealer;
                if (historyFilter === 'custom') return !isDealer;
                return true;
              })
              .map(order => (
              <div key={order.id} className="p-8 hover:bg-slate-50 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    order.status === 'cancelled' ? "bg-rose-50 text-rose-600" : "bg-green-50 text-green-600"
                  )}>
                    {order.status === 'cancelled' ? <Ban className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="font-black text-slate-900">{order.displayId || `#${order.id.slice(-6).toUpperCase()}`}</h4>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-tighter",
                        order.status === 'cancelled' ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"
                      )}>
                        {order.status === 'cancelled' ? 'CANCELLED' : (order.dealerCompanyName || 'Retail')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-bold mt-1">
                      {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : ('flavor' in order.details ? order.details.flavor : 'Custom')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">
                    {order.status === 'cancelled' 
                      ? format(order.cancelledAt?.toDate() || new Date(), 'dd MMM, HH:mm')
                      : format(order.sentAt?.toDate() || new Date(), 'dd MMM, HH:mm')}
                  </p>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">
                    {order.status === 'cancelled' ? `By ${order.cancelledBy || 'Staff'}` : `Sent by ${order.sentBy || 'Staff'}`}
                  </p>
                </div>
              </div>
            ))}
            {orders
              .filter(o => (o.status === 'sent' && !isRecentlySent(o)) || o.status === 'cancelled')
              .filter(o => {
                if (historyFilter === 'all') return true;
                const isDealer = o.dealerId || o.type === 'dealer_cake';
                if (historyFilter === 'dealers') return isDealer;
                if (historyFilter === 'custom') return !isDealer;
                return true;
              }).length === 0 && (
              <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
                No orders found for the selected filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[250] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Ban className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase text-center">Cancel Order</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">
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
                    className="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
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
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase text-center">Order Dispatched!</h3>
            <p className="text-xs font-bold text-slate-500 mb-6 leading-relaxed text-center">
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
    </div>
  );
};

const CustomCakesGallery: React.FC<{ orders: Order[], onNew: () => void }> = ({ orders, onNew }) => {
  const customOrders = orders.filter(o => o.type === 'custom_cake' && !o.isDeleted && o.status !== 'sent');

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-black uppercase tracking-widest">Pending Approval</span>;
      case 'in_progress': return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-black uppercase tracking-widest">Designing</span>;
      case 'ready': return <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-black uppercase tracking-widest">Ready</span>;
      default: return <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded font-black uppercase tracking-widest">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Design Portfolio</h2>
          <p className="text-xs font-bold text-slate-900">{customOrders.length} active custom bookings</p>
        </div>
        <button onClick={onNew} className="bg-purple-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">+ New Custom Cake</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {customOrders.map(order => (
          <div key={order.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
            <div className="aspect-square bg-slate-100 relative">
              {('photoUrl' in order.details && order.details.photoUrl) ? (
                <img src={order.details.photoUrl} className="w-full h-full object-cover" alt="Cake Design" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                  <ImageIcon className="w-12 h-12 mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">No Preview</span>
                </div>
              )}
              <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md text-white text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest">
                {'weight' in order.details ? order.details.flavor : 'Custom'}
              </div>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                {getStatusBadge(order.status)}
                <div className="text-right">
                  <span className="text-xs font-black text-slate-900 block">₹{(order.totalAmount || 0).toLocaleString()}</span>
                  {(order.advanceReceived || 0) > 0 && (
                    <span className="text-[9px] font-bold text-green-600">Advance: ₹{(order.advanceReceived || 0).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold text-slate-800 line-clamp-2">
                {'instruction' in order.details ? order.details.instruction : 'No instructions provided.'}
              </p>
            </div>
          </div>
        ))}
        {customOrders.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No active custom cake orders.</div>}
      </div>
    </div>
  );
};

const ChocolateProduction: React.FC<{ orders: Order[], onNew: () => void }> = ({ orders, onNew }) => {
  const chocolateOrders = orders.filter(o => o.type === 'chocolate' && !o.isDeleted && o.status !== 'sent');

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-8 rounded-3xl flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black">Chocolate Batch Factory</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Manage Dragees, Bites & Center-filled</p>
        </div>
        <button onClick={onNew} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
          + Create New Batch
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {chocolateOrders.map(order => (
          <div key={order.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex gap-6">
            <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300">
              <Candy className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded font-black uppercase tracking-widest">
                  {'productType' in order.details ? order.details.productType : 'Chocolate'}
                </span>
                <span className="text-xs font-black text-slate-900">Qty: {'quantity' in order.details ? order.details.quantity : '0'}</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-1">{'flavor' in order.details ? order.details.flavor : 'Assorted'}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">ORDER #{order.id.slice(-6).toUpperCase()}</p>
            </div>
          </div>
        ))}
        {chocolateOrders.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs border border-dashed border-slate-200 rounded-3xl">No chocolate batches in production.</div>}
      </div>
    </div>
  );
};













const StatCard: React.FC<{ 
  label: string, 
  value: string | number, 
  icon: any, 
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple',
  onClick?: () => void 
}> = ({ label, value, icon: Icon, color, onClick }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-5 rounded-[2rem] border shadow-sm transition-all hover:scale-[1.02] flex flex-col justify-between min-h-[140px]", 
        colors[color],
        onClick && "cursor-pointer active:scale-95"
      )}
    >
      <div className="w-10 h-10 rounded-2xl bg-white/50 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 opacity-80" />
      </div>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.1em] mb-1 opacity-60">{label}</div>
        <div className="text-2xl font-black">{value}</div>
      </div>
    </div>
  );
};

export const BakeryAdminDashboard: React.FC<{ view?: string }> = ({ view = 'dashboard' }) => {
  const { bakery, isSuperAdmin, profile: authUser } = useAuth();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<'dealer_cake' | 'custom_cake' | 'chocolate' | undefined>();
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [repairPhone, setRepairPhone] = useState('');
  const { playPending, stopPending, playReady, stopReady, playSent } = useSound();
  const [isSilenced, setIsSilenced] = useState(false);
  const prevCount = useRef(0);
  const prevStatuses = useRef<Record<string, OrderStatus>>({});
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'payment_settings', 'phonepe'), (snap) => {
      if (snap.exists()) {
        setPaymentSettings(snap.data() as PaymentSettings);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!bakery?.id) return;
    
    setLoading(true);
    const dUnsub = onSnapshot(query(collection(db, 'dealers'), where('bakeryId', '==', bakery.id)), (snap) => {
      const uniqueDealers = new Map<string, Dealer>();
      snap.docs.forEach(doc => {
        const d = { ...doc.data(), id: doc.id } as Dealer;
        if (!d.isDeleted) {
          uniqueDealers.set(doc.id, d);
        }
      });
      const dealersData = Array.from(uniqueDealers.values())
        .sort((a, b) => a.companyName.localeCompare(b.companyName));
      setDealers(dealersData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dealers');
    });

    const mUnsub = onSnapshot(query(collection(db, 'menu_items'), where('bakeryId', '==', bakery.id)), (snap) => {
      setItems(snap.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as MenuItem))
        .filter(i => !i.isDeleted)
      );
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'menu_items');
    });

    const oUnsub = onSnapshot(query(collection(db, 'orders'), where('bakeryId', '==', bakery.id)), (snap) => {
      const newOrders = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
      
      // Play sound if new orders are received
      const currentAlerts = newOrders.filter(o => o.status === 'pending').length;
      if (currentAlerts > prevCount.current) {
        setIsSilenced(false); // Reset silence when new ones arrive
        playPending();
      } else if (currentAlerts === 0) {
        stopPending();
      }
      prevCount.current = currentAlerts;

      // Transition sounds for Admin (Ready/Sent = single play)
      newOrders.forEach(order => {
        const prev = prevStatuses.current[order.id];
        if (prev && prev !== order.status) {
          if (order.status === 'ready') playReady(); // plays once by default
          if (order.status === 'sent') playSent();
        }
        prevStatuses.current[order.id] = order.status;
      });

      const sortedOrders = newOrders.sort((a, b) => {
        const nameA = a.dealerCompanyName || 'Retail';
        const nameB = b.dealerCompanyName || 'Retail';
        return nameA.localeCompare(nameB);
      });

      setOrders(sortedOrders);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'orders');
    });

    const sUnsub = onSnapshot(query(collection(db, 'users'), where('bakeryId', '==', bakery.id)), (snap) => {
      const uniqueUsers = new Map<string, UserProfile>();
      snap.docs.forEach(doc => {
        const u = { ...doc.data(), uid: doc.id } as UserProfile;
        if (!u.isDeleted && !u.isSessionDoc) {
          // Aggressive deduplication: prefer phone/email over UID to catch multiple legacy entries
          // Normalize to last 10 digits for phone
          const phoneKey = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : null;
          const emailKey = u.email ? u.email.toLowerCase().trim() : null;
          
          let identifier = u.uid || doc.id;
          
          // Look for existing by phone
          if (phoneKey && phoneKey.length >= 10) {
            const existing = Array.from(uniqueUsers.values()).find(ex => (ex.phone ? ex.phone.replace(/\D/g, '').slice(-10) : null) === phoneKey);
            if (existing) return;
          }
          
          // Look for existing by email
          if (emailKey) {
            const existing = Array.from(uniqueUsers.values()).find(ex => (ex.email ? ex.email.toLowerCase().trim() : null) === emailKey);
            if (existing) return;
          }

          if (!uniqueUsers.has(identifier)) {
            uniqueUsers.set(identifier, u);
          }
        }
      });
      setStaff(Array.from(uniqueUsers.values()));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    const nUnsub = onSnapshot(query(collection(db, 'notifications'), where('bakeryId', '==', bakery.id)), (snap) => {
      const notifsList = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
      notifsList.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setSystemNotifications(notifsList);
    }, (err) => {
      console.error("Failed to list notifications:", err);
    });

    return () => { dUnsub(); oUnsub(); sUnsub(); mUnsub(); nUnsub(); };
  }, [bakery]);

  const openOrder = (t?: any) => {
    setOrderType(t);
    setShowOrderModal(true);
  };

  const renderView = () => {
    const handleSilence = () => {
      setIsSilenced(true);
      stopPending();
      stopReady();
    };
    
    const activeFeatures = getActiveFeatures(bakery, paymentSettings);
    
    switch (view) {
      case 'dashboard': return <DashboardOverview orders={orders} bakery={bakery} onNewOrder={openOrder} />;
      case 'orders': return <OrdersManager orders={orders} dealers={dealers} bakery={bakery} onSilence={handleSilence} />;
      case 'summary': return <DailySummaryDashboard orders={orders} items={items} dealers={dealers} />;
      case 'production': return <ProductionCore orders={orders} bakery={bakery} dealers={dealers} onSilence={handleSilence} />;
      case 'custom-cakes': return <CustomCakesGallery orders={orders} onNew={() => openOrder('custom_cake')} />;
      case 'chocolates': return <ChocolateProduction orders={orders} onNew={() => openOrder('chocolate')} />;
      case 'dealers': return <DealersManager dealers={dealers} orders={orders} bakeryId={bakery?.id || ''} onRepairCheck={(p) => { setRepairPhone(p || ''); setShowRepairModal(true); }} />;
      case 'catalog': return <MenuManager bakeryId={bakery?.id || ''} />;
      case 'staff': return <StaffManager staff={staff} bakeryId={bakery?.id || ''} onRepairCheck={(p) => { setRepairPhone(p || ''); setShowRepairModal(true); }} />;
      case 'analytics': return <AnalyticsReports orders={orders} dealers={dealers} />;
      case 'billing': return <BillingPayments orders={orders} dealers={dealers} />;
      case 'customers': return <CustomerDatabase orders={orders} />;
      case 'dragees-cost': return <DrageesCostSetup />;
      case 'corporate-quote': return <CorporateChocolateQuote />;
      case 'dragees-production': return <DrageesProduction />;
      case 'batch-logs': return <BatchProductionLogs />;
      case 'attendance': 
        if (!activeFeatures.attendanceEnabled) {
          return (
            <RenderLockedFeature 
              title="Attendance Tracking Protocol"
              description="Track your team's check-ins and check-outs real-time with reliable geofenced GPS verification. Ensure strict accuracy, eliminate buddy punching and keep operation logs perfect."
              icon={Clock}
              featureName="Attendance"
            />
          );
        }
        return <AttendanceDashboard />;
      case 'payroll': 
        if (!activeFeatures.payrollEnabled) {
          return (
            <RenderLockedFeature 
              title="Smart Integrated Payroll Management"
              description="Automate monthly payroll, wages calculations, attendance-linked adjustments, and generation of ready-to-share details in seconds."
              icon={IndianRupee}
              featureName="Payroll"
            />
          );
        }
        return <PayrollManagement />;
      case 'settings': return <BakerySettings bakery={bakery} />;
      case 'recipes': return <RecipeManager />;
      default: return <DashboardOverview orders={orders} bakery={bakery} onNewOrder={openOrder} />;
    }
  };

  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pendingCount = orders.filter(o => o.status === 'pending' && !o.isDeleted).length;
  const unreadSystemCount = systemNotifications.filter(n => !n.read).length;
  const totalAlertCount = pendingCount + unreadSystemCount;
  
  const isOverdue = (order: Order) => {
    if (order.status === 'sent') return false;
    const now = new Date();
    const delDate = new Date(order.deliveryDate);
    const delTime = order.deliveryTime || '23:59';
    const [h, m] = delTime.split(':').map(Number);
    delDate.setHours(h, m, 0, 0);
    return now > delDate;
  };

  const hasOverdue = orders.some(o => isOverdue(o) && !o.isDeleted);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
        <div className="shrink-0">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {view.replaceAll('-', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 tracking-[0.2em]">{bakery?.name} • Portal</p>
        </div>
        
        <div className="flex items-center gap-4 self-end md:self-center" ref={notificationRef}>
          {(pendingCount > 0 || systemNotifications.length > 0) && (
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  "p-2.5 rounded-xl transition-all relative border",
                  hasOverdue || unreadSystemCount > 0 
                    ? "bg-red-50 text-red-600 border-red-100 animate-pulse" 
                    : "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                )}
              >
                <Bell className="w-5 h-5" />
                {totalAlertCount > 0 && (
                  <span className={cn(
                    "absolute -top-1 -right-1 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white",
                    hasOverdue || unreadSystemCount > 0 ? "bg-red-600" : "bg-amber-600"
                  )}>
                    {totalAlertCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[120] overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Active Alerts</h4>
                      {unreadSystemCount > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            const unreadList = systemNotifications.filter(n => !n.read);
                            const batch = writeBatch(db);
                            unreadList.forEach(notif => {
                              batch.update(doc(db, 'notifications', notif.id), { read: true });
                            });
                            await batch.commit();
                          }}
                          className="text-[8px] font-black uppercase text-indigo-600 hover:text-indigo-800 tracking-wider transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                      {/* Order Notifications */}
                      {orders.filter(o => o.status === 'pending' && !o.isDeleted).map(order => (
                        <div key={order.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">{order.dealerCompanyName || 'Retail Order'}</p>
                            <p className="text-[9px] text-slate-400 font-bold">New Pending Approval</p>
                          </div>
                          <button 
                            onClick={() => {
                              stopPending();
                              setIsSilenced(true);
                              setShowNotifications(false);
                            }}
                            className="shrink-0 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest"
                          >
                            Dismiss
                          </button>
                        </div>
                      ))}

                      {/* System Alerts / Geofence Auto Clock Outs */}
                      {systemNotifications.length === 0 && orders.filter(o => o.status === 'pending' && !o.isDeleted).length === 0 && (
                        <div className="p-8 text-center text-slate-400">
                          <p className="text-[9px] font-black uppercase tracking-widest">All caught up!</p>
                        </div>
                      )}

                      {systemNotifications.map(notif => (
                        <div key={notif.id} className={cn("p-4 hover:bg-slate-50 transition-colors flex items-start justify-between gap-3 text-left", !notif.read && "bg-amber-50/20")}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0", 
                                notif.type === 'geofence_autologoff_away' ? "bg-red-500" : "bg-indigo-500"
                              )} />
                              <p className="text-[10px] font-black text-slate-900 leading-tight">{notif.title}</p>
                            </div>
                            <p className="text-[9px] text-slate-500 font-medium mt-1 leading-normal break-words">{notif.message}</p>
                            <p className="text-[7px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                              {notif.createdAt?.toDate ? format(notif.createdAt.toDate(), 'HH:mm • MMM d') : 'Just now'}
                            </p>
                          </div>
                          {!notif.read && (
                            <button 
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const notifRef = doc(db, 'notifications', notif.id);
                                  await updateDoc(notifRef, { read: true });
                                } catch (error) {
                                  console.error("Failed to mark read:", error);
                                }
                              }}
                              className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1 rounded"
                              title="Mark Read"
                            >
                              <Check size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] py-20 text-center">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 relative"
          >
            <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-2xl animate-spin opacity-20"></div>
            <Package className="w-8 h-8 animate-bounce" />
          </motion.div>
          <p className="font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse text-[10px]">Bakery Admin Syncing...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      )}

      {showOrderModal && (
        <NewOrderModal 
          bakeryId={bakery?.id || ''} 
          catalog={items}
          onClose={() => setShowOrderModal(false)} 
          initialType={orderType} 
          dealers={dealers}
        />
      )}

      {showRepairModal && (
        <AccountRepairModal
          isOpen={showRepairModal}
          onClose={() => setShowRepairModal(false)}
          bakeryId={bakery?.id || ''}
          initialPhone={repairPhone}
        />
      )}

      {/* Alert Testing Panel (Only for Admins) */}
      {(authUser?.role === 'bakery_admin' || isSuperAdmin) && (
        <div className="mt-12 px-2 pb-12">
           <div className="bg-white p-6 rounded-[2rem] border border-dashed border-gray-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-gray-400" />
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Alert Testing Panel</h3>
                </div>
                <button 
                  onClick={() => {
                    stopPending();
                    stopReady();
                  }} 
                  className="text-[9px] font-black bg-gray-900 text-white px-3 py-1 rounded-lg uppercase"
                >
                  Kill All
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => playPending()} className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-700 rounded-xl font-bold text-[9px] uppercase hover:bg-red-100 transition-colors">
                  Trigger RING (Pending)
                </button>
                <button onClick={() => playReady()} className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold text-[9px] uppercase hover:bg-blue-100 transition-colors">
                  Trigger DING (Ready)
                </button>
                <button onClick={() => playSent()} className="flex items-center justify-center gap-2 py-3 bg-green-50 text-green-700 rounded-xl font-bold text-[9px] uppercase hover:bg-green-100 transition-colors">
                  Trigger SUCCESS (Sent)
                </button>
              </div>
           </div>
        </div>
      )}
    </motion.div>
  );
};
