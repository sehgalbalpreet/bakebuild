import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { query, collection, where, onSnapshot, serverTimestamp, doc, updateDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { MenuItem, Dealer } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Plus, List, LayoutGrid, Tag, Edit2, Trash2, Check, Send, ShoppingCart, Calendar, Zap, ShoppingBag, Search, X
} from 'lucide-react';
import { format, addDays, addMinutes } from 'date-fns';

interface CatalogBrowserProps {
  bakeryId: string;
  dealerId: string;
  dealershipName: string;
  discount: number;
  canManage: boolean;
  userRole: string;
  orderPrefix?: string;
}

export const CatalogBrowser: React.FC<CatalogBrowserProps> = ({ 
  bakeryId, 
  dealerId, 
  dealershipName, 
  discount, 
  canManage, 
  userRole, 
  orderPrefix 
}) => {
  const isAnyDealer = userRole === 'dealer' || userRole === 'dealer_admin' || userRole === 'dealer_staff';
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'tabs'>('list');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tomorrow = 1;
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), tomorrow), 'yyyy-MM-dd'));
  const [deliveryTime, setDeliveryTime] = useState('18:00');
  const [isBakeryRush, setIsBakeryRush] = useState(false);

  // Sync Rush State
  useEffect(() => {
    if (!bakeryId) return;
    
    let q = query(
      collection(db, 'orders'),
      where('bakeryId', '==', bakeryId)
    );

    // CRITICAL: If dealer role, MUST filter by dealerId to satisfy security rules
    if (isAnyDealer) {
      q = query(
        collection(db, 'orders'),
        where('bakeryId', '==', bakeryId),
        where('dealerId', '==', dealerId)
      );
    }

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const isFromCache = snapshot.metadata.fromCache;
      const isSyncing = snapshot.metadata.hasPendingWrites;
      console.log(`CatalogBrowser: Rush snapshot (id: ${dealerId}, cache: ${isFromCache}, docs: ${snapshot.size}, syncing: ${isSyncing})`);
      const activeCount = snapshot.docs.filter(doc => 
        ['pending', 'received', 'in_progress'].includes(doc.data().status)
      ).length;
      setIsBakeryRush(activeCount > 8); // Increased threshold slightly
    }, (err) => {
      console.error("CatalogBrowser: Rush listener failed:", err);
    });
    return () => unsubscribe();
  }, [bakeryId, isAnyDealer, dealerId]);

  // Set default delivery time to +30/45m if it's for today
  useEffect(() => {
    const now = new Date();
    const waitMinutes = isBakeryRush ? 45 : 30;
    const defaultDelivery = addMinutes(now, waitMinutes);
    
    // We only auto-set to today+wait if it's currently set to tomorrow or earlier
    // But user wants "default time for delivery of a cake to 30 minutes after the order is placed"
    // So let's default to Today + 30/45m
    setDeliveryDate(format(defaultDelivery, 'yyyy-MM-dd'));
    setDeliveryTime(format(defaultDelivery, 'HH:mm'));
  }, [isBakeryRush]);

  // Action State for Modal
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onResolve: () => void;
    showCartSummary?: boolean;
  } | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void, showCartSummary?: boolean) => {
    setPendingAction({ title, message, confirmText, onResolve, showCartSummary });
  };

  // Cart State
  const [cart, setCart] = useState<Record<string, number>>({});

  // Dealer specific Quoted Prices mapping
  const [dealerCustomPrices, setDealerCustomPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!dealerId) {
      setDealerCustomPrices({});
      return;
    }
    // Try subscribing to the dealer's snapshot to load customPrices
    const unsub = onSnapshot(doc(db, 'dealers', dealerId), (snap) => {
      if (snap.exists()) {
        const dData = snap.data() as Dealer;
        setDealerCustomPrices(dData.customPrices || {});
      } else {
        setDealerCustomPrices({});
      }
    }, (err) => {
      console.warn("Unable to load custom prices for dealer, falling back to menu default price.", err);
    });
    return () => unsub();
  }, [dealerId]);

  // Management State
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<any>('cake');
  const [gst, setGst] = useState('5');
  const [hsn, setHsn] = useState('');
  const [desc, setDesc] = useState('');
  const [weight, setWeight] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'menu_items'), where('bakeryId', '==', bakeryId)), (snap) => {
      setItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)).filter(it => !it.isDeleted));
    });
    return () => unsub();
  }, [bakeryId]);

  const categories = ['All', ...Array.from(new Set(items.map(item => item.category)))];
  const filteredItems = items.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = searchQuery === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const cartTotal = (Object.entries(cart) as [string, number][]).reduce((acc, [id, qty]) => {
    const item = items.find(i => i.id === id);
    if (!item) return acc;
    const basePrice = dealerCustomPrices[id] !== undefined ? dealerCustomPrices[id] : item.price;
    const priceWithGst = basePrice + (basePrice * item.gstPercent / 100);
    return acc + (priceWithGst * qty);
  }, 0);

  const cartCount = (Object.values(cart) as number[]).reduce((a, b) => a + b, 0);

  const startEdit = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(item.price.toString());
    setCategory(item.category as any || 'cake');
    setGst(item.gstPercent?.toString() || '5');
    setHsn(item.hsnCode || '');
    setDesc(item.description || '');
    setWeight(item.weight || '');
    setShowForm(true);
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
    } catch (err) {
      console.error(err);
      alert('Action failed. Check console.');
    }
  };

  const removeItem = (id: string, itemName: string) => {
    confirmAction(
      'Remove from Catalogue?',
      `Are you sure you want to remove "${itemName}"? This item will no longer be available for ordering.`,
      'Remove Item',
      async () => {
        try {
          await updateDoc(doc(db, 'menu_items', id), { isDeleted: true });
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showSuccessModal) {
      timer = setTimeout(() => {
        setShowSuccessModal(false);
        navigate('/dashboard');
      }, 5000); // 5 seconds to read
    }
    return () => clearTimeout(timer);
  }, [showSuccessModal, navigate]);

  const placeBulkOrder = () => {
    const cartEntries = Object.entries(cart) as [string, number][];
    if (cartEntries.length === 0) return;

    confirmAction(
      'Confirm Your Order',
      `You are about to place ${cartCount} items scheduled for ${format(new Date(deliveryDate), 'PPP')}. Please review the list below to avoid duplicates.`,
      'Place Order',
      async () => {
        setSubmitting(true);
        try {
          const dealerIdToUse = dealerId.trim() || 'anonymous';
          const dealerRef = doc(db, 'dealers', dealerIdToUse);
          
          await runTransaction(db, async (transaction) => {
            let lastSeq = 0;
            let prefix = orderPrefix || dealershipName.slice(0, 2).toUpperCase() || 'ORD';
            
            // Try to get dealer snap but handle if it doesn't exist yet
            const dealerSnap = await transaction.get(dealerRef);
            if (dealerSnap.exists()) {
              const dData = dealerSnap.data() as Dealer;
              lastSeq = dData.lastOrderSequence || 0;
              prefix = dData.orderPrefix || dData.companyName.slice(0, 2).toUpperCase() || prefix;
            } else {
              // Create dealer document if it doesn't exist to prevent transaction failure on update
              transaction.set(dealerRef, {
                bakeryId,
                companyName: dealershipName || 'New Dealer',
                lastOrderSequence: 0,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
              }, { merge: true });
            }

            let currentSeq = lastSeq;
            for (const [itemId, qty] of cartEntries) {
              const item = items.find(i => i.id === itemId);
              if (!item) continue;

              // Improved cake detection for categories like "500g cake"
              const isCake = item.category.toLowerCase().includes('cake');
              const isChocolate = item.category.toLowerCase().includes('chocolate');
              
              const appliedDiscount = isCake ? discount : 0;
              const basePrice = dealerCustomPrices[itemId] !== undefined ? dealerCustomPrices[itemId] : item.price;
              const priceWithGst = basePrice + (basePrice * item.gstPercent / 100);
              const finalAmount = Math.max(0, (priceWithGst * qty) - appliedDiscount);

              // Parse weight if it's a cake
              let weightValue = 1;
              if (isCake && item.weight) {
                const numericMatch = item.weight.match(/(\d+(\.\d+)?)/);
                if (numericMatch) {
                  weightValue = parseFloat(numericMatch[0]);
                  // Adjust for g vs kg
                  if (item.weight.toLowerCase().includes('g') && !item.weight.toLowerCase().includes('k')) {
                    weightValue = weightValue / 1000;
                  }
                }
              }

              currentSeq++;
              const displayId = `${prefix}${currentSeq.toString().padStart(3, '0')}`;
              const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;
              const orderRef = doc(db, 'orders', orderId);

              const orderData = {
                bakeryId,
                dealerId: dealerIdToUse,
                displayId,
                dealerCompanyName: dealershipName || 'Dealer Order',
                type: isCake ? 'dealer_cake' : (isChocolate ? 'chocolate' : 'custom_cake'),
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deliveryDate,
                deliveryTime,
                details: isCake ? {
                  weight: weightValue, // Weight per unit
                  flavor: item.name,
                  isPhotoCake: false,
                  quantity: qty,
                  instruction: `CATALOG ORDER: ${item.name} (${qty} units)`
                } : {
                  quantity: qty,
                  productType: item.category,
                  flavor: item.name,
                  instruction: `CATALOG ORDER: ${item.name} (${qty} units)`
                },
                totalAmount: finalAmount,
                discountApplied: appliedDiscount,
                advanceReceived: 0,
                customerDetails: {
                  name: dealershipName || 'Catalog Order',
                  phone: ''
                }
              };

              transaction.set(orderRef, orderData);
            }
            
            // Update dealer's sequence counter
            transaction.update(dealerRef, { 
              lastOrderSequence: currentSeq,
              updatedAt: serverTimestamp()
            });
          });

          setCart({});
          setShowSuccessModal(true);
        } catch (err: any) {
          console.error("Order Transaction Error:", err);
          alert(`Order placement failed: ${err.message || 'Check connection'}`);
        } finally {
          setSubmitting(false);
          setPendingAction(null);
        }
      },
      true
    );
  };

  return (
    <div className="space-y-6 pb-32">
      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-inner">
                <Check className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Order Received!</h3>
              <p className="text-sm font-medium text-slate-400 mb-10 leading-relaxed">
                Thank you for your order. We've notified the bakery and your pipeline is being updated.
              </p>
              <button 
                onClick={() => {
                  setShowSuccessModal(false);
                  navigate('/dashboard');
                }}
                className="w-full px-8 py-5 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-3"
              >
                Go to Dashboard
                <Send className="w-4 h-4" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 my-auto animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShoppingCart className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2 text-center">{pendingAction.title}</h3>
            <p className="text-sm font-medium text-slate-500 mb-6 leading-relaxed text-center">
              {pendingAction.message}
            </p>

            {pendingAction.showCartSummary && (
              <div className="bg-slate-50 rounded-2xl p-4 mb-8 max-h-48 overflow-y-auto">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Order Summary</p>
                <div className="space-y-3">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = items.find(i => i.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                        <span className="text-xs font-bold text-slate-700 truncate mr-2">{item.name}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded">x{qty}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Delivery Scheduler */}
        <div className="flex-1 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 leading-tight">Schedule Delivery</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select date for items</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                min={format(new Date(), 'yyyy-MM-dd')}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="flex-1 sm:flex-none bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs"
              />
              <input 
                type="time" 
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="flex-1 sm:flex-none bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs"
              />
            </div>
            {isBakeryRush && (
              <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1 rounded-lg border border-rose-100">
                <Zap className="w-3 h-3 animate-pulse" />
                <span className="text-[10px] font-black uppercase">Bakery Busy: +15m delay</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm self-start">
          {canManage && (
            <button 
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl">
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('tabs')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'tabs' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Integrated Catalog Search Bar */}
      <div className="relative w-full">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <Search className="w-4 h-4" />
        </span>
        <input 
          type="text"
          placeholder="Search products by name, category, or description..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-11 py-3.5 font-bold text-xs placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm outline-none"
        />
        {searchQuery && (
          <button 
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-150 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
            title="Clear Search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Tabs (Horizontal Scroll on Mobile) */}
      {viewMode === 'tabs' && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.1em] transition-all whitespace-nowrap",
                activeCategory === cat 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                  : "bg-white text-slate-400 border border-slate-100 hover:border-blue-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Product Display Section */}
      {items.length === 0 ? (
        <div className="py-24 text-center bg-white rounded-[3rem] border border-slate-100 shadow-sm">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 bg-blue-50 rounded-full animate-pulse"></div>
            <div className="relative bg-white rounded-full p-6 border border-slate-100 shadow-sm">
              <ShoppingCart className="w-full h-full text-blue-400" />
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-900">Catalogue is Empty</h3>
          <p className="text-sm text-slate-400 font-bold max-w-xs mx-auto mt-3 leading-relaxed">
            Your bakery hasn't populated their dealer catalogue yet. 
            <br />
            <span className="text-blue-600 block mt-4 font-black uppercase tracking-widest text-[10px] bg-blue-50 py-2 px-4 rounded-full inline-block">Contact Admin to Add Items</span>
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-[2.5rem] border border-slate-200/60 shadow-sm">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-4 mx-auto border border-slate-100">
            <Search className="w-5 h-5" />
          </div>
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">No matching products</h4>
          <p className="text-[11px] text-slate-450 font-medium max-w-xs mx-auto leading-relaxed">We couldn't find any products in your catalog matching "{searchQuery}". Try modifying your query or select a different category.</p>
          <button 
            onClick={() => { setSearchQuery(''); setActiveCategory('All'); }} 
            className="mt-4 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm"
          >
            Clear Search Filters
          </button>
        </div>
      ) : viewMode === 'tabs' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    {canManage && (
                      <>
                        <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => removeItem(item.id, item.name)} className="p-2 text-slate-300 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                    <span className="text-[9px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase tracking-widest ml-2">{item.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-black text-slate-900">{item.name}</h3>
                  {item.weight && <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">{item.weight}</span>}
                </div>
                <p className="text-xs text-slate-400 font-bold mb-6 line-clamp-2">{item.description || 'Professional bakery selection ready for your guests.'}</p>
                
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                      {dealerCustomPrices[item.id] !== undefined ? 'Your Special Quoted Rate' : 'Catalog Price (inc. GST)'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className={cn("text-xl font-black", dealerCustomPrices[item.id] !== undefined ? "text-indigo-650" : "text-slate-900")}>
                        {(() => {
                          const basePrice = dealerCustomPrices[item.id] !== undefined ? dealerCustomPrices[item.id] : item.price;
                          return formatCurrency(basePrice + (basePrice * item.gstPercent / 100));
                        })()}
                      </p>
                      {dealerCustomPrices[item.id] !== undefined && (
                        <p className="text-xs line-through text-slate-400 font-bold">
                          {formatCurrency(item.price + (item.price * item.gstPercent / 100))}
                        </p>
                      )}
                    </div>
                    {dealerCustomPrices[item.id] !== undefined && (
                      <p className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">
                        + {item.gstPercent}% tax
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {cart[item.id] ? (
                    <div className="flex-1 flex items-center bg-slate-100 rounded-xl overflow-hidden p-1">
                      <button onClick={() => updateCart(item.id, -1)} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-white rounded-lg transition-all font-black text-lg">−</button>
                      <span className="flex-1 text-center font-black text-xs">{cart[item.id]}</span>
                      <button onClick={() => updateCart(item.id, 1)} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-white rounded-lg transition-all font-black text-lg">+</button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => updateCart(item.id, 1)}
                      className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Add This Item
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
                  <div key={item.id} className="px-8 py-4 hover:bg-slate-50/50 transition-all flex items-center justify-between group">
                    <div className="flex-1 mr-4">
                      <div className="flex items-center gap-3">
                        <h4 className="text-sm font-black text-slate-900">{item.name}</h4>
                        {item.weight && (
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest border border-blue-100 px-2 py-0.5 rounded-full bg-blue-50">
                            {item.weight}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.description || 'No description'}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className={cn("text-xs font-black", dealerCustomPrices[item.id] !== undefined ? "text-indigo-650" : "text-slate-900")}>
                          {(() => {
                            const basePrice = dealerCustomPrices[item.id] !== undefined ? dealerCustomPrices[item.id] : item.price;
                            return formatCurrency(basePrice + (basePrice * item.gstPercent / 100));
                          })()}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-tighter text-slate-400">
                          {dealerCustomPrices[item.id] !== undefined ? 'Quoted Rate' : `inc. ${item.gstPercent}% GST`}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {canManage && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all mr-2">
                            <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Edit2 size={14} /></button>
                            <button onClick={() => removeItem(item.id, item.name)} className="p-2 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        )}
                        
                        {cart[item.id] ? (
                          <div className="flex items-center bg-slate-100 rounded-lg overflow-hidden p-0.5 w-24">
                            <button onClick={() => updateCart(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded transition-all font-black">−</button>
                            <span className="flex-1 text-center font-black text-[10px]">{cart[item.id]}</span>
                            <button onClick={() => updateCart(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded transition-all font-black">+</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => updateCart(item.id, 1)}
                            className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2"
                          >
                            <Plus size={14} />
                            <span className="text-[9px] font-black uppercase pr-1">Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Place Order Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-8 right-4 lg:right-8 z-[90] animate-in slide-in-from-bottom-10 flex flex-col items-end gap-3">
          <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-100 shadow-xl lg:hidden">
            <p className="text-[10px] font-black text-slate-900 uppercase">{cartCount} Items Selected</p>
          </div>
          
          <button 
            onClick={placeBulkOrder}
            disabled={submitting}
            className="group relative flex items-center gap-4 bg-slate-900 text-white pl-6 pr-4 py-4 rounded-[2.5rem] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 border-4 border-white lg:border-none"
          >
            <div className="hidden sm:block">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-left leading-none mb-1">Finish & Place</p>
              <p className="text-sm font-black flex items-center gap-2">
                Order Items 
                <>
                  <span className="w-1 h-1 bg-slate-700 rounded-full"></span> 
                  {formatCurrency(cartTotal)}
                </>
              </p>
            </div>
            <div className="bg-blue-600 p-4 rounded-3xl shadow-lg group-hover:bg-blue-500 transition-colors">
              <ShoppingCart className={cn("w-6 h-6", submitting && "animate-bounce")} />
            </div>
          </button>
        </div>
      )}

      {/* Form Modal for Add/Edit */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Product' : 'Catalogue Entry'}</h2>
              <button onClick={() => {
                setShowForm(false);
                setEditingItem(null);
                setName(''); setPrice(''); setDesc(''); setHsn(''); setWeight('');
              }} className="text-slate-400 hover:text-white">×</button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-6 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Product Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Base Price</label>
                  <input required type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Weight / Qty</label>
                  <input placeholder="e.g. 500g, 1kg" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">GST %</label>
                  <input required type="number" value={gst} onChange={e => setGst(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">HSN Code</label>
                  <input value={hsn} onChange={e => setHsn(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
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
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                {editingItem ? 'Update Catalog Item' : 'Save Item to Catalog'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
