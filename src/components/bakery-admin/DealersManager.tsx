import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, serverTimestamp, doc, setDoc, getDoc, writeBatch, getDocs, runTransaction, updateDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { createLog } from '../../services/logService';
import { createArchive } from '../../services/archiveService';
import { Dealer, Order, MenuItem, OperationType, PaymentSettings } from '../../types';
import { getActiveFeatures } from '../../utils/subscriptionUtils';
import { DEALER_COMPANIES, CAKE_FLAVORS, DEALER_COLORS } from '../../constants';
import { cn, formatCurrency } from '../../lib/utils';
import { 
  Search, Wrench, UserPlus, Users, ShoppingCart, Edit2, Trash2, Store, AlertCircle, ShoppingBag, Check, IndianRupee, Calendar, Clock, Tag, ShieldAlert
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface DealersManagerProps {
  dealers: Dealer[];
  orders: Order[];
  bakeryId: string;
  onRepairCheck?: (phone?: string) => void;
}

export const DealersManager: React.FC<DealersManagerProps> = ({
  dealers,
  orders,
  bakeryId,
  onRepairCheck
}) => {
  const { profile: authUser, bakery, isSuperAdmin } = useAuth();
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'payment_settings', 'phonepe'), (snap) => {
      if (snap.exists()) {
        setPaymentSettings(snap.data() as PaymentSettings);
      }
    });
    return () => unsub();
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [compName, setCompName] = useState(DEALER_COMPANIES[0]);
  const [orderPrefix, setOrderPrefix] = useState('');
  const [dealerSearch, setDealerSearch] = useState('');
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [ph, setPh] = useState('');
  const [sPin, setSPin] = useState('1234');
  const [cakeDisc, setCakeDisc] = useState('0');
  const [prefFlavor, setPrefFlavor] = useState(CAKE_FLAVORS[0]);
  const [prefWeight, setPrefWeight] = useState('0.5');
  const [customPrice, setCustomPrice] = useState('500');
  const [expiryDate, setExpiryDate] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEALER_COLORS[0].value);
  const [availableFlavors, setAvailableFlavors] = useState<string[]>([]);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [orderingDealer, setOrderingDealer] = useState<Dealer | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [localCustomPrices, setLocalCustomPrices] = useState<Record<string, number>>({});
  const [quoteItemSearch, setQuoteItemSearch] = useState('');
  
  // Filter dealers based on search
  const filteredDealers = useMemo(() => {
    return dealers.filter(d => 
      d.companyName.toLowerCase().includes(dealerSearch.toLowerCase()) ||
      d.staffName.toLowerCase().includes(dealerSearch.toLowerCase()) ||
      d.phone.includes(dealerSearch) ||
      (d.email && d.email.toLowerCase().includes(dealerSearch.toLowerCase()))
    );
  }, [dealers, dealerSearch]);

  const companies = useMemo(() => {
    return Array.from(new Set(filteredDealers.map(d => d.companyName))).sort();
  }, [filteredDealers]);
  
  const topPartner = useMemo(() => {
    const allCompanies = Array.from(new Set(dealers.map(d => d.companyName)));
    if (allCompanies.length === 0) return 'None';
    const totals = allCompanies.map(c => {
      const cDealers = dealers.filter(d => d.companyName === c).map(d => d.id);
      const cOrders = orders.filter(o => o.dealerId && cDealers.includes(o.dealerId));
      return { name: c, total: cOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0) };
    });
    return totals.sort((a, b) => b.total - a.total)[0]?.name || 'None';
  }, [dealers, orders]);

  // Quick Order Local State
  const [oWeight, setOWeight] = useState(0.5);
  const [oFlavor, setOFlavor] = useState(CAKE_FLAVORS[0]);
  const [oQty, setOQty] = useState(1);
  const [oDate, setODate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [oTime, setOTime] = useState('18:00');
  const [oPhoto, setOPhoto] = useState(false);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !ph && !editingDealer) {
          setPh(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showForm && !ph && !editingDealer) fetchISD();
  }, [showForm, editingDealer]);

  useEffect(() => {
    if (!bakeryId) return;
    const q = query(
      collection(db, 'menu_items'),
      where('bakeryId', '==', bakeryId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenuItems(items);
      const uniqueFlavors = Array.from(new Set(
        items
          .filter(i => i.category === 'cake' || i.category === 'dealer_cake_base')
          .map(i => i.name)
      ));
      setAvailableFlavors(uniqueFlavors.length > 0 ? uniqueFlavors : CAKE_FLAVORS);
    });
    return () => unsubscribe();
  }, [bakeryId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!bakeryId) {
      alert('Error: Identity Verification Failed (Missing Bakery ID). Please reload the page.');
      setLoading(false);
      return;
    }
    const cleanPh = ph.trim().replace(/\s/g, '');
    const cleanPin = sPin.trim().substring(0, 4);

    // Check for subscription limits
    if (!editingDealer) {
      const activeFeatures = getActiveFeatures(bakery, paymentSettings);
      const activeDealersCount = dealers.filter(d => !d.isDeleted).length;
      if (activeFeatures.maxDealers !== -1 && activeDealersCount >= activeFeatures.maxDealers) {
        alert(`Limit Reached: Under your current plan, you can only register a maximum of ${activeFeatures.maxDealers} dealerships. Please upgrade to a Paid Subscription for unlimited dealers.`);
        setLoading(false);
        return;
      }
    }

    // Check for duplicates on new addition
    if (!editingDealer && dealers.some(d => d.phone === cleanPh && !d.isDeleted)) {
      alert(`A dealer with phone ${cleanPh} already exists.`);
      setLoading(false);
      return;
    }

    const dealerId = editingDealer ? editingDealer.id : `dealer_${Math.random().toString(36).substring(2, 9)}`;
    console.log('Initiating dealer save for:', dealerId);
    
    try {
      if (editingDealer) {
        // Archive before update
        const oldDoc = await getDoc(doc(db, 'dealers', dealerId));
        if (oldDoc.exists()) await createArchive('dealers', dealerId, oldDoc.data(), 'update');

        // Update dealer record
        await updateDoc(doc(db, 'dealers', dealerId), {
          companyName: compName,
          orderPrefix: orderPrefix.toUpperCase(),
          staffName: sName,
          email: sEmail,
          phone: cleanPh,
          pin: cleanPin,
          customCakeDiscount: Number(cakeDisc),
          preferredFlavor: prefFlavor,
          preferredWeight: Number(prefWeight),
          customPricePerKg: Number(customPrice),
          customPrices: localCustomPrices,
          priceListExpiryDate: expiryDate || null,
          color: selectedColor,
          updatedAt: serverTimestamp(),
        });
        // Use setDoc with merge: true to avoid "No document to update" if users doc is missing
        await setDoc(doc(db, 'users', dealerId), {
          uid: dealerId,
          phone: cleanPh,
          email: sEmail,
          displayName: `${compName} (${sName})`,
          role: 'dealer',
          bakeryId: bakeryId,
          dealerId: dealerId,
          pin: cleanPin
        }, { merge: true });
        
        await createLog('dealer', `Dealer updated: ${compName} - ${sName}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
        alert('Partner information updated.');
      } else {
        // Save new dealer record
        await setDoc(doc(db, 'dealers', dealerId), {
          id: dealerId,
          bakeryId,
          companyName: compName,
          orderPrefix: orderPrefix.toUpperCase(),
          lastOrderSequence: 0,
          staffName: sName,
          email: sEmail,
          phone: cleanPh,
          pin: cleanPin,
          customCakeDiscount: Number(cakeDisc),
          preferredFlavor: prefFlavor,
          preferredWeight: Number(prefWeight),
          customPricePerKg: Number(customPrice),
          customPrices: localCustomPrices,
          priceListExpiryDate: expiryDate || null,
          color: selectedColor,
          createdAt: serverTimestamp(),
        });
        // Create user login record
        await setDoc(doc(db, 'users', dealerId), {
          uid: dealerId,
          phone: cleanPh,
          email: sEmail,
          displayName: `${compName} (${sName})`,
          role: 'dealer',
          bakeryId: bakeryId,
          dealerId: dealerId,
          pin: cleanPin
        });
        await createLog('dealer', `New dealer registered: ${compName} - ${sName}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
      }
      
      console.log('Dealer save successful, closing form');
      setShowForm(false);
      setEditingDealer(null);
      setCompName(DEALER_COMPANIES[0]);
      setOrderPrefix('');
      setSName('');
      setSEmail('');
      setPh('');
      setCakeDisc('0');
      setPrefFlavor(CAKE_FLAVORS[0]);
      setPrefWeight('0.5');
      setCustomPrice('500');
      setExpiryDate('');
      setSelectedColor(DEALER_COLORS[0].value);
      setLocalCustomPrices({});
      setQuoteItemSearch('');
    } catch (err) {
      console.error('Save failed:', err);
      handleFirestoreError(err, editingDealer ? OperationType.UPDATE : OperationType.WRITE, `dealers/users/${dealerId}`);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (dealer: Dealer) => {
    setEditingDealer(dealer);
    setCompName(dealer.companyName);
    setOrderPrefix(dealer.orderPrefix || '');
    setSName(dealer.staffName);
    setSEmail(dealer.email || '');
    setPh(dealer.phone);
    setSPin((dealer as any).pin || '1234');
    setCakeDisc(dealer.customCakeDiscount?.toString() || '0');
    setPrefFlavor(dealer.preferredFlavor || CAKE_FLAVORS[0]);
    setPrefWeight(dealer.preferredWeight?.toString() || '0.5');
    setCustomPrice(dealer.customPricePerKg?.toString() || '500');
    setExpiryDate(dealer.priceListExpiryDate || '');
    setSelectedColor(dealer.color || DEALER_COLORS[0].value);
    setLocalCustomPrices(dealer.customPrices || {});
    setQuoteItemSearch('');
    setShowForm(true);
  };

  const openNewPartnerForm = () => {
    setEditingDealer(null);
    setCompName(DEALER_COMPANIES[0]);
    setOrderPrefix('');
    setSName('');
    setSEmail('');
    setPh('');
    setSPin('1234');
    setCakeDisc('0');
    setPrefFlavor(CAKE_FLAVORS[0]);
    setPrefWeight('0.5');
    setCustomPrice('500');
    setExpiryDate('');
    setSelectedColor(DEALER_COLORS[0].value);
    setLocalCustomPrices({});
    setQuoteItemSearch('');
    setShowForm(true);
  };

  const startOrder = (dealer: Dealer) => {
    setOrderingDealer(dealer);
    setOFlavor(dealer.preferredFlavor || CAKE_FLAVORS[0]);
    setOWeight(dealer.preferredWeight || 0.5);
    setOQty(1);
    setODate(format(new Date(), 'yyyy-MM-dd'));
    setShowOrderModal(true);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderingDealer || !bakeryId) return;
    setLoading(true);
    try {
      const discount = orderingDealer.customCakeDiscount || 0;
      const pricePerKg = orderingDealer.customPricePerKg || 500;
      const photoCharge = oPhoto ? (oWeight < 1 ? 150 : 300) : 0;
      const basePrice = (oWeight * pricePerKg) * oQty;
      const totalAmount = Math.max(0, (basePrice + (photoCharge * oQty)) - discount);

      const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;
      const orderRef = doc(db, 'orders', orderId);
      const dealerRef = doc(db, 'dealers', orderingDealer.id);

      await runTransaction(db, async (transaction) => {
        const dealerSnap = await transaction.get(dealerRef);
        let sequence = 1;
        let prefix = orderingDealer.orderPrefix || orderingDealer.companyName.slice(0, 2).toUpperCase();
        
        if (dealerSnap.exists()) {
          const dData = dealerSnap.data() as Dealer;
          sequence = (dData.lastOrderSequence || 0) + 1;
          prefix = dData.orderPrefix || dData.companyName.slice(0, 2).toUpperCase();
          transaction.update(dealerRef, { lastOrderSequence: sequence });
        }

        const displayId = `${prefix}${sequence.toString().padStart(3, '0')}`;

        const orderData = {
          bakeryId,
          dealerId: orderingDealer.id,
          displayId,
          dealerCompanyName: orderingDealer.companyName,
          type: 'dealer_cake',
          status: 'received', // Auto-received since staff is placing it
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          receivedAt: serverTimestamp(),
          receivedBy: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
          deliveryDate: oDate,
          deliveryTime: oTime,
          details: {
            weight: oWeight,
            flavor: oFlavor,
            isPhotoCake: oPhoto,
            quantity: oQty,
          },
          totalAmount,
          discountApplied: discount,
          advanceReceived: 0,
        };

        transaction.set(orderRef, orderData);
      });

      await createLog('order', `Order placed for ${orderingDealer.companyName} (${orderingDealer.staffName})`, authUser?.uid, authUser?.email, bakeryId);
      setShowOrderModal(false);
      alert('Order placed successfully.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setLoading(false);
    }
  };

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

  const removeDealer = (id: string, name: string) => {
    if (!id) {
      alert('Error: Missing Dealer ID');
      return;
    }

    const dealerObj = dealers.find(d => d.id === id);
    const dealerPhone = dealerObj?.phone;

    confirmAction(
      'Revoke Access?',
      `Are you sure you want to suspend all access for "${name}"? They will no longer be able to log in or place orders.`,
      'Revoke Access',
      async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          const dDoc = await getDoc(doc(db, 'dealers', id));
          const uDoc = await getDoc(doc(db, 'users', id));

          if (dDoc.exists()) {
            batch.update(doc(db, 'dealers', id), { 
              isDeleted: true, 
              deletedAt: serverTimestamp(),
              active: false 
            });
          }

          if (uDoc.exists()) {
            batch.update(doc(db, 'users', id), { 
              isDeleted: true, 
              deletedAt: serverTimestamp(),
              role: 'disabled' 
            });
          }

          // Robust cleanup: find and revoke active session/logged-in user documents
          const usersQueryById = query(collection(db, 'users'), where('dealerId', '==', id));
          const usersSnapById = await getDocs(usersQueryById);
          usersSnapById.forEach((docSnap) => {
            if (docSnap.id !== id) {
              batch.update(doc(db, 'users', docSnap.id), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                role: 'disabled'
              });
            }
          });

          // Query matching users by phone as well
          if (dealerPhone) {
            const usersQueryByPhone = query(collection(db, 'users'), where('phone', '==', dealerPhone));
            const usersSnapByPhone = await getDocs(usersQueryByPhone);
            usersSnapByPhone.forEach((docSnap) => {
              if (docSnap.id !== id) {
                batch.update(doc(db, 'users', docSnap.id), {
                  isDeleted: true,
                  deletedAt: serverTimestamp(),
                  role: 'disabled'
                });
              }
            });

            // Also find and clean up any other legacy/duplicate dealer records with the same phone
            const dealersQueryByPhone = query(collection(db, 'dealers'), where('phone', '==', dealerPhone));
            const dealersSnapByPhone = await getDocs(dealersQueryByPhone);
            dealersSnapByPhone.forEach((docSnap) => {
              if (docSnap.id !== id) {
                batch.update(doc(db, 'dealers', docSnap.id), {
                  isDeleted: true,
                  deletedAt: serverTimestamp(),
                  active: false
                });
              }
            });
          }

          await batch.commit();
          await createLog('dealer', `Dealer access removed: ${name}`, authUser?.uid, authUser?.email, bakeryId);
          alert(`Access for "${name}" has been revoked.`);
        } catch (err: any) {
          console.error('DELETION ERROR:', err);
          handleFirestoreError(err, OperationType.DELETE, `dealers/${id}`);
        } finally {
          setLoading(false);
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
        <div className="flex-1">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Dealer Network</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs font-bold text-slate-900">{companies.length} Active Partners</p>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Unlimited Partner Slots Included</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Dealer or Staff..." 
              value={dealerSearch}
              onChange={(e) => setDealerSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
            />
          </div>
          {onRepairCheck && (
            <button 
              type="button"
              onClick={() => onRepairCheck('+917696450433')} 
              className="w-full sm:w-auto bg-white border border-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
            >
              <Wrench size={14} className="text-blue-500 animate-pulse" />
              Repair Access
            </button>
          )}
          <button 
            onClick={openNewPartnerForm} 
            className="w-full sm:w-auto bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
          >
            <UserPlus size={16} />
            Add New Partner
          </button>
        </div>
      </div>

      {/* Network Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 leading-none">Total Network</p>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{dealers.length}</p>
            <span className="text-[8px] font-black text-slate-400 uppercase">Partners</span>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-sm p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 leading-none">Live Orders</p>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-black text-indigo-600 tracking-tighter">
              {orders.filter(o => o.dealerId && o.status !== 'sent').length}
            </p>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-[0.2em] mb-1 leading-none">Total Volume</p>
          <p className="text-2xl font-black text-slate-900 tracking-tighter truncate">₹{orders.filter(o => o.dealerId).reduce((acc, o) => acc + (o.totalAmount || 0), 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl shadow-slate-200 flex flex-col justify-center overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/20 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-400/30 transition-all text-white"></div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 leading-none relative z-10">Top Partner</p>
          <p className="text-base font-black text-blue-400 tracking-tighter truncate relative z-10">{topPartner}</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Partner Directory</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Managed Entities & Corporate Links</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Outlet / Staff</th>
                <th className="px-8 py-4">Contact Info</th>
                <th className="px-8 py-4">Activity</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {companies.map(company => {
                const companyDealers = filteredDealers.filter(d => d.companyName === company);
                if (companyDealers.length === 0) return null;
                
                const dealerIds = companyDealers.map(d => d.id);
                const companyOrders = orders.filter(o => o.dealerId && dealerIds.includes(o.dealerId));
                const totalVolume = companyOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);

                return (
                  <React.Fragment key={company}>
                    <tr className="bg-slate-50/50 group border-t border-slate-100">
                      <td colSpan={3} className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-6 bg-indigo-505 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                          <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{company}</span>
                          <span className="text-[9px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{companyDealers.length} LOCATIONS</span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <span className="text-[10px] font-black text-slate-400">TOTAL VOLUME: <span className="text-blue-600 font-black">₹{totalVolume.toLocaleString()}</span></span>
                      </td>
                    </tr>
                    {companyDealers.map(dealer => (
                      <tr key={dealer.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div 
                              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-xs shadow-lg shadow-current/20"
                              style={{ backgroundColor: dealer.color || '#6366f1' }}
                            >
                              {dealer.staffName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{dealer.companyName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Staff: {dealer.staffName}</p>
                                {dealer.priceListExpiryDate && differenceInDays(new Date(dealer.priceListExpiryDate), new Date()) < 7 && (
                                  <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                    <AlertCircle size={8} className="text-amber-600" />
                                    <span className="text-[7px] font-black text-amber-600 uppercase tracking-tighter">Expiry Soon</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-600">{dealer.phone}</p>
                            <p className="text-[9px] text-slate-400 font-black uppercase italic truncate max-w-[150px]">{dealer.city || 'Location Pending'}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                             <div className="flex-1 h-1.5 bg-slate-100 rounded-full max-w-[80px] overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (orders.filter(o => o.dealerId === dealer.id).length / 10) * 100)}%` }} />
                             </div>
                             <span className="text-[10px] font-black text-slate-900 whitespace-nowrap">{orders.filter(o => o.dealerId === dealer.id).length} Orders</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => startOrder(dealer)}
                              className="p-2 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm border border-indigo-50 cursor-pointer"
                              title="Quick Order"
                            >
                              <ShoppingCart size={14} />
                            </button>

                            <button 
                              onClick={() => startEdit(dealer)}
                              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200 cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => removeDealer(dealer.id, dealer.staffName)}
                              className="p-2 text-red-300 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm border border-red-50"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {filteredDealers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <Store className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No dealers matching your search.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-sm sm:text-xl font-bold uppercase tracking-widest leading-tight text-white">
                {editingDealer ? 'Edit Partner Info' : 'New Dealer / Partner Access'}
              </h2>
              <button 
                onClick={() => { setShowForm(false); setEditingDealer(null); setSName(''); setSEmail(''); setPh(''); }} 
                className="text-slate-400 hover:text-white text-2xl px-2 focus:outline-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 sm:p-8 space-y-4 sm:space-y-6 overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Brand Identifier Color</label>
                <div className="flex flex-wrap gap-2">
                  {DEALER_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setSelectedColor(c.value)}
                      className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all flex items-center justify-center",
                        selectedColor === c.value ? "ring-2 ring-slate-900 ring-offset-2 scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    >
                      {selectedColor === c.value && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Dealership Partner</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <select 
                      value={DEALER_COMPANIES.includes(compName) ? compName : 'Other'} 
                      onChange={e => {
                        if (e.target.value === 'Other') {
                          setCompName('');
                        } else {
                          setCompName(e.target.value);
                        }
                      }} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold appearance-none text-xs"
                    >
                      {DEALER_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="Other">Custom Brand...</option>
                    </select>
                    {!DEALER_COMPANIES.includes(compName) && (
                      <input 
                        placeholder="Enter Brand Name" 
                        value={compName} 
                        onChange={e => setCompName(e.target.value)} 
                        className="mt-2 w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 font-bold text-xs" 
                        required
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <input 
                      placeholder="Order Prefix (e.g. TA)" 
                      value={orderPrefix} 
                      onChange={e => setOrderPrefix(e.target.value.toUpperCase())} 
                      className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 font-black placeholder:font-bold text-xs text-blue-900" 
                    />
                    <p className="text-[8px] text-blue-400 font-bold ml-2 uppercase">Used for order numbering</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Partner Contact Name</label>
                  <input required value={sName} onChange={e => setSName(e.target.value)} placeholder="Full Name" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Partner Mobile Login</label>
                  <input required value={ph} onChange={e => setPh(e.target.value)} placeholder="Login ID" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Login PIN</label>
                  <input required maxLength={4} value={sPin} onChange={e => setSPin(e.target.value.replace(/\D/g, ''))} placeholder="4 Digit PIN" className="w-full bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 font-black text-indigo-700 text-xs" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Google Email (Recommended for Google Login)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-100 rounded flex items-center justify-center">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="" className="w-3 h-3" />
                  </div>
                  <input type="email" value={sEmail} onChange={e => setSEmail(e.target.value)} placeholder="Enter Gmail to enable Google Login" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 font-bold text-xs" />
                </div>
                <p className="text-[9px] text-slate-400 font-bold mt-1.5 leading-relaxed">If email is provided, staff can login with Google for better security. Otherwise, they use Phone & PIN.</p>
              </div>
              {/* Compact Pricing, Contracts & Partner Discounts */}
              <div className="pt-6 mt-6 border-t border-slate-100 text-left space-y-4">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest text-center mb-1">Pricing, Contracts & Partner Discounts</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Catalog Discount (₹)</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input 
                        type="number"
                        value={cakeDisc}
                        onChange={e => setCakeDisc(e.target.value)}
                        placeholder="e.g. 100"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 font-bold text-xs"
                      />
                    </div>
                    <p className="text-[8px] text-slate-400 font-bold ml-1 mt-1 uppercase">Subtracted per order</p>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Default Cake Price (₹/Kg)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input 
                        type="number"
                        value={customPrice}
                        onChange={e => setCustomPrice(e.target.value)}
                        placeholder="Standard price/Kg"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 font-bold text-xs text-slate-800"
                      />
                    </div>
                    <p className="text-[8px] text-slate-400 font-bold ml-1 mt-1 uppercase">For quick local booking</p>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Default Flavor</label>
                    <select 
                      value={prefFlavor}
                      onChange={e => setPrefFlavor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs appearance-none"
                    >
                      {availableFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Default Weight (KG)</label>
                    <select 
                      value={prefWeight}
                      onChange={e => setPrefWeight(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs appearance-none"
                    >
                      {[0.5, 1, 1.5, 2, 3].map(w => <option key={w} value={w}>{w} KG</option>)}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Price List Expiry Date</label>
                    <input 
                      type="date"
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Integrated Special Price Quotes Per Product */}
              <div className="pt-6 mt-6 border-t border-slate-100 text-left">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest text-center mb-2.5">Specific Catalog Price Quotes</p>
                <div className="bg-amber-50/60 border border-amber-200/50 rounded-2xl p-4 text-[11px] font-bold text-amber-800 leading-relaxed mb-4">
                  💡 Customize specific catalog prices for this partner. For example, if pineapple cake is finalized at ₹300 plus tax, type <code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-900 font-mono">300</code> in that item's box. Calculation totals automatically apply this special rate when they order! Leave blank to keep default pricing.
                </div>

                <div className="relative mb-3">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                  <input 
                    type="text"
                    placeholder="Search products to quote special rate..."
                    value={quoteItemSearch}
                    onChange={e => setQuoteItemSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 font-bold text-xs placeholder:text-slate-400 outline-none focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                  />
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {menuItems
                    .filter(item => quoteItemSearch === '' || item.name.toLowerCase().includes(quoteItemSearch.toLowerCase()) || item.category.toLowerCase().includes(quoteItemSearch.toLowerCase()))
                    .map(item => {
                      const customVal = localCustomPrices[item.id];
                      return (
                        <div key={item.id} className="bg-slate-50/50 rounded-2xl border border-slate-100 p-3.5 flex items-center justify-between gap-3 hover:border-slate-200 transition-all text-left">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-black text-slate-900 break-words" title={item.name}>{item.name}</p>
                              {item.weight && (
                                <span className="text-[8px] font-black text-blue-500 bg-blue-50/60 px-1.5 py-0.5 rounded leading-none">
                                  {item.weight}
                                </span>
                              )}
                              <span className="text-[8px] font-bold text-slate-400 bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded leading-none uppercase">
                                {item.category}
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-450 font-bold mt-1.5 leading-none">
                              Default: ₹{item.price} + {item.gstPercent}% GST (₹{(item.price * (1 + item.gstPercent / 100)).toFixed(0)} inc.)
                            </p>
                          </div>
                          <div className="w-24 sm:w-28 shrink-0 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                            <input 
                              type="number"
                              placeholder="Locked"
                              value={customVal !== undefined ? customVal : ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLocalCustomPrices(prev => {
                                  const next = { ...prev };
                                  if (val === '') {
                                    delete next[item.id];
                                  } else {
                                    next[item.id] = parseFloat(val);
                                  }
                                  return next;
                                });
                              }}
                              className="w-full bg-white border border-slate-250 rounded-xl pl-6 pr-3 py-2 font-black text-xs text-slate-800 placeholder:text-slate-350 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                            />
                          </div>
                        </div>
                      );
                    })}
                  {menuItems.filter(item => quoteItemSearch === '' || item.name.toLowerCase().includes(quoteItemSearch.toLowerCase()) || item.category.toLowerCase().includes(quoteItemSearch.toLowerCase())).length === 0 && (
                    <p className="text-center py-8 text-slate-400 font-bold text-[10px] uppercase tracking-wider">No matching products in catalog</p>
                  )}
                </div>
              </div>
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50 text-xs">
                {loading ? 'Processing...' : (editingDealer ? 'Save Changes' : 'Enable Access')}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showOrderModal && orderingDealer && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 text-center sm:text-left">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 bg-blue-600 text-white shrink-0">
              <h2 className="text-xl font-black text-white">{orderingDealer.companyName}</h2>
              <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-1">Ordering for: {orderingDealer.staffName}</p>
            </div>
            <form onSubmit={handlePlaceOrder} className="p-8 space-y-6 overflow-y-auto">
              {/* Default contract cake styling display */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-left">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-1">Contract Default Cake Style</p>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-black text-slate-900">{orderingDealer.preferredFlavor || 'Not configured'}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">Default Size: {orderingDealer.preferredWeight || 0.5} KG</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-indigo-700">₹{((orderingDealer.preferredWeight || 0.5) * (orderingDealer.customPricePerKg || 500)).toFixed(0)}</p>
                    <p className="text-[9px] text-slate-400 font-bold">@ ₹{orderingDealer.customPricePerKg || 500}/KG</p>
                  </div>
                </div>
                {orderingDealer.customCakeDiscount ? (
                  <p className="text-[9px] text-emerald-600 font-bold mt-2 pt-2 border-t border-indigo-100/50">
                    ✨ Flat Catalog Discount: ₹{orderingDealer.customCakeDiscount} off applied
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Flavor</p>
                  <select value={oFlavor} onChange={e => setOFlavor(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs appearance-none">
                    {availableFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Weight</p>
                  <select value={oWeight} onChange={e => setOWeight(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs appearance-none">
                    {[0.5, 1, 1.5, 2, 3].map(w => <option key={w} value={w}>{w} KG</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-3 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="col-span-2 text-[9px] font-black text-slate-400 uppercase">Quantity</p>
                <div className="col-span-3 flex items-center justify-between">
                  <button type="button" onClick={() => setOQty(Math.max(1, oQty - 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-black">-</button>
                  <span className="font-black text-slate-900">{oQty}</span>
                  <button type="button" onClick={() => setOQty(oQty + 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-black">+</button>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Calendar className="w-4 h-4 text-blue-500" />
                     <p className="text-[9px] font-bold text-slate-400 uppercase">Delivery Date</p>
                   </div>
                   <input type="date" value={oDate} onChange={e => setODate(e.target.value)} className="bg-transparent font-black text-xs text-right outline-none" />
                </div>
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Clock className="w-4 h-4 text-blue-500" />
                     <p className="text-[9px] font-bold text-slate-400 uppercase">Delivery Time</p>
                   </div>
                   <input type="time" value={oTime} onChange={e => setOTime(e.target.value)} className="bg-transparent font-black text-xs text-right outline-none" />
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-4 flex justify-between items-center text-white font-black text-xs">
                <div>
                  <p className="text-[8px] text-slate-400 font-bold uppercase">Estimated Total</p>
                  <p className="text-lg font-black text-blue-400">
                    {formatCurrency(Math.max(0, ((oWeight * (orderingDealer.customPricePerKg || 500) + (oPhoto ? (oWeight < 1 ? 150 : 300) : 0)) * oQty) - (orderingDealer.customCakeDiscount || 0)))}
                  </p>
                </div>
                <button type="submit" disabled={loading} className="bg-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
                  {loading ? 'Ordering...' : 'Confirm'}
                </button>
              </div>
              <button 
                type="button" 
                onClick={() => setShowOrderModal(false)}
                className="w-full text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Cancel Order
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 text-center">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShieldAlert className="w-8 h-8 text-rose-500" />
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
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all text-xs"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
