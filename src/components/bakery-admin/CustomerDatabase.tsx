import React, { useState, useMemo } from 'react';
import { Customer, Order } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Heart, 
  TrendingUp, 
  MessageCircle, 
  Search, 
  Cake, 
  Calendar, 
  DollarSign, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  X, 
  Award,
  Filter,
  CheckCircle,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { WahAiCampaigns } from './WahAiCampaigns';

interface CustomerDatabaseProps {
  orders: Order[];
}

export const CustomerDatabase: React.FC<CustomerDatabaseProps> = ({ orders }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const { bakery } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSegment, setFilterSegment] = useState<'all' | 'top_spenders' | 'regulars' | 'dormant' | 'first_timers'>('all');
  const [activeTab, setActiveTab] = useState<'database' | 'occasions' | 'wah_ai'>('database');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Subscribe to real-time updates for customers
  React.useEffect(() => {
    if (!bakery?.id) return;
    const unsub = onSnapshot(query(collection(db, 'customers'), where('bakeryId', '==', bakery.id)), (snap: any) => {
      setCustomers(snap.docs
        .map((doc: any) => ({ ...doc.data(), id: doc.id } as Customer))
        .filter((c: Customer) => !c.isDeleted)
      );
    });
    return unsub;
  }, [bakery]);

  // Phone Normalizer helper for robust CRM matching
  const normalizePhone = (num: string) => {
    if (!num) return '';
    return num.replace(/\D/g, '').slice(-10);
  };

  // Build the complete orders map for fast O(1) lookups
  const customerStatsMap = useMemo(() => {
    // 1. Pre-group orders by normalized phone number in O(O) linear time
    const ordersByPhone: Record<string, Order[]> = {};
    orders.forEach(o => {
      const orderPhone = normalizePhone(o.customerDetails?.phone || '');
      if (orderPhone) {
        if (!ordersByPhone[orderPhone]) {
          ordersByPhone[orderPhone] = [];
        }
        ordersByPhone[orderPhone].push(o);
      }
    });

    const stats: Record<string, {
      orders: Order[];
      totalSpent: number;
      favoriteFlavor: string;
      avgOrderValue: number;
      lastOrderDate: Date | null;
      daysSinceLastOrder: number | null;
      segment: 'New' | 'Top Spender' | 'Regular' | 'Dormant' | 'Active Store Regular';
    }> = {};

    customers.forEach(c => {
      const normCust = normalizePhone(c.phone);
      if (!normCust) return;

      // 2. Fetch the matching orders in O(1) lookup
      const matchingOrders = ordersByPhone[normCust] || [];

      // Sort matching orders (usually a very small subset per customer)
      const custOrders = [...matchingOrders].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });

      // Calculate Spent
      const totalSpent = custOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      // Determine Favorite Flavor
      const flavorCounts: Record<string, number> = {};
      custOrders.forEach(o => {
        const fl = ('flavor' in o.details) ? o.details.flavor : '';
        if (fl) flavorCounts[fl] = (flavorCounts[fl] || 0) + 1;
      });
      let fav = 'None';
      let maxCount = 0;
      Object.entries(flavorCounts).forEach(([flavor, count]) => {
        if (count > maxCount) {
          maxCount = count;
          fav = flavor;
        }
      });

      // Calculate Last Order Info
      let lastOrderDate: Date | null = null;
      let daysSince: number | null = null;
      if (custOrders.length > 0) {
        const o0 = custOrders[0];
        lastOrderDate = o0.createdAt?.toDate ? o0.createdAt.toDate() : new Date(o0.createdAt);
        daysSince = differenceInDays(new Date(), lastOrderDate);
      } else if (c.lastOrderAt) {
        lastOrderDate = c.lastOrderAt.toDate ? c.lastOrderAt.toDate() : new Date(c.lastOrderAt);
        daysSince = differenceInDays(new Date(), lastOrderDate);
      }

      // Segment Classification
      let segment: 'New' | 'Top Spender' | 'Regular' | 'Dormant' | 'Active Store Regular' = 'New';
      if (daysSince !== null && daysSince > 90) {
        segment = 'Dormant';
      } else if (totalSpent >= 2500) {
        segment = 'Top Spender';
      } else if (custOrders.length >= 3) {
        segment = 'Active Store Regular';
      } else if (custOrders.length >= 2) {
        segment = 'Regular';
      }

      stats[c.id] = {
        orders: custOrders,
        totalSpent,
        favoriteFlavor: fav,
        avgOrderValue: custOrders.length > 0 ? Math.round(totalSpent / custOrders.length) : 0,
        lastOrderDate,
        daysSinceLastOrder: daysSince,
        segment
      };
    });

    return stats;
  }, [customers, orders]);

  // Parse events (Birthdays, Anniversaries, Engagement dates) happening today or in next 7 days
  const eventsList = useMemo(() => {
    const list: Array<{
      customerId: string;
      customerName: string;
      phone: string;
      type: 'birthday' | 'anniversary' | 'engagement';
      eventName: string;
      dateStr: string;
      daysRemaining: number;
    }> = [];

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    customers.forEach(c => {
      const datesToCheck = [
        { field: c.birthday, type: 'birthday' as const, label: 'Birthday 🎂' },
        { field: c.anniversary, type: 'anniversary' as const, label: 'Anniversary 💖' },
        { field: c.engagementDate, type: 'engagement' as const, label: 'Engagement Day ✨' }
      ];

      datesToCheck.forEach(({ field, type, label }) => {
        if (!field) return;
        try {
          // Parse date
          const dateObj = new Date(field);
          if (isNaN(dateObj.getTime())) return;

          // Determine current year's date corresponding to this date
          const eventThisYear = new Date(today.getFullYear(), dateObj.getMonth(), dateObj.getDate());
          
          // Calculate difference in days
          let diffDays = differenceInDays(eventThisYear, today);
          if (diffDays < 0 && (eventThisYear.getMonth() < currentMonth || (eventThisYear.getMonth() === currentMonth && eventThisYear.getDate() < currentDate))) {
            // Happened already this year, check next year
            const eventNextYear = new Date(today.getFullYear() + 1, dateObj.getMonth(), dateObj.getDate());
            diffDays = differenceInDays(eventNextYear, today);
          }

          // Target events within next 7 days (including today = 0)
          if (diffDays >= 0 && diffDays <= 7) {
            list.push({
              customerId: c.id,
              customerName: c.name,
              phone: c.phone,
              type,
              eventName: label,
              dateStr: field,
              daysRemaining: diffDays
            });
          }
        } catch (e) {
          // Gracefully suppress parsing errors
        }
      });
    });

    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [customers]);

  // Filter customers based on search query and chosen segments
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // 1. Search filter
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = c.name.toLowerCase().includes(q);
      const phoneMatch = c.phone.includes(q);
      if (q && !nameMatch && !phoneMatch) return false;

      // 2. Segment filter
      const stats = customerStatsMap[c.id];
      if (!stats) return true;

      if (filterSegment === 'top_spenders') {
        return stats.segment === 'Top Spender';
      }
      if (filterSegment === 'regulars') {
        return stats.segment === 'Active Store Regular' || stats.segment === 'Regular';
      }
      if (filterSegment === 'dormant') {
        return stats.segment === 'Dormant';
      }
      if (filterSegment === 'first_timers') {
        return stats.segment === 'New';
      }

      return true;
    });
  }, [customers, searchQuery, filterSegment, customerStatsMap]);

  // Selected customer statistics
  const selectedCustStats = selectedCustomerId ? customerStatsMap[selectedCustomerId] : null;
  const selectedCustomer = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) : null;

  return (
    <div className="space-y-6">
      {/* Search Header / Stats Overview Combo */}
      <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-blue-500/30">
              📊 Intelligent CRM Engine
            </span>
            <h1 className="text-3xl font-black tracking-tight mt-3 text-white">Bakesync Customer Database</h1>
            <p className="text-slate-400 font-medium text-xs mt-1 leading-relaxed">
              Identify key spenders, manage customer relationships, auto-detect preferences, and trigger WhatsApp campaign wish offers.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => setActiveTab('database')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${
                activeTab === 'database' 
                  ? 'bg-white text-slate-900 border-white shadow-lg' 
                  : 'bg-slate-800 text-slate-300 border-transparent hover:bg-slate-700'
              }`}
            >
              📂 Customer Index ({customers.length})
            </button>
            <button 
              onClick={() => setActiveTab('occasions')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border relative ${
                activeTab === 'occasions' 
                  ? 'bg-pink-600 text-white border-pink-500 shadow-lg' 
                  : 'bg-pink-900/40 text-pink-200 border-pink-900/30 hover:bg-pink-900/60'
              }`}
            >
              🎉 Occasions Alert
              {eventsList.length > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-pink-600 text-[10px] font-black rounded-full flex items-center justify-center border border-pink-600 animate-pulse">
                  {eventsList.length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('wah_ai')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${
                activeTab === 'wah_ai' 
                  ? 'bg-purple-600 text-white border-purple-500 shadow-lg' 
                  : 'bg-purple-950/40 text-purple-200 border-purple-950/30 hover:bg-purple-950/60'
              }`}
            >
              📣 Wah AI Campaigns
            </button>
          </div>
        </div>

        {/* Dynamic Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Database Size</span>
            <div className="text-xl font-black mt-1 text-white">{customers.length} Accounts</div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest font-mono">Today's & Upcoming Alerts</span>
            <div className="text-xl font-black mt-1 text-pink-400">{eventsList.filter(e => e.daysRemaining === 0).length} Today • {eventsList.filter(e => e.daysRemaining > 0).length} Soon</div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Regular Clients</span>
            <div className="text-xl font-black mt-1 text-emerald-400">
              {Object.values(customerStatsMap).filter(s => s.segment === 'Active Store Regular' || s.segment === 'Regular').length} ({(customers.length > 0 ? (Object.values(customerStatsMap).filter(s => s.segment === 'Active Store Regular' || s.segment === 'Regular').length / customers.length * 100).toFixed(0) : 0)}%)
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Top Tier LTV Spenders</span>
            <div className="text-xl font-black mt-1 text-blue-400">
              {Object.values(customerStatsMap).filter(s => s.segment === 'Top Spender').length} VIP Clients
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'wah_ai' ? (
        <WahAiCampaigns orders={orders} customers={customers} />
      ) : activeTab === 'occasions' ? (
        /* Event Reminders Dashboard section */
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-950 uppercase tracking-wide flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-600 animate-bounce" /> Occasion Intelligence Radar
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Capture upcoming birthdays, anniversaries, and milestones proactive planning</p>
            </div>
          </div>

          {eventsList.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl">
              <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">No customer birthdays or anniversaries in the next 7 days.</p>
              <p className="text-[10px] text-slate-300 font-bold uppercase mt-1">Keep registering customer details on checkout to lock in automated reminders!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {eventsList.map((e, index) => {
                const stats = customerStatsMap[e.customerId];
                const favFlavor = stats?.favoriteFlavor || 'any delicious cake';
                
                // Formulate message templates
                let templateText = '';
                if (e.type === 'birthday') {
                  templateText = `Hi ${e.customerName}! 🎂 Bakesync wishes you a fabulous advance happy birthday! Celebrate your special day with our signature freshly baked cake. Would you like us to prepare your favorite ${favFlavor} cake for your celebration? We can deliver. Let us know!`;
                } else if (e.type === 'anniversary') {
                  templateText = `Hi ${e.customerName}! 💖 Happy upcoming wedding anniversary! Commemorate this special milestone together. Let Bakesync bake your favorite ${favFlavor} cake. Shall we lock in a delivery slot for your special day?`;
                } else {
                  templateText = `Hi ${e.customerName}! ✨ Happy engagement anniversary! Celebrate your wonderful journey. Bakesync is ready to customize your favorite ${favFlavor} cake for the occasion. Contact Bakesync or reply here to book!`;
                }

                const waLink = `https://wa.me/91${e.phone.replace(/\D/g, '')}?text=${encodeURIComponent(templateText)}`;

                return (
                  <div key={`${e.customerId}_${e.type}_${index}`} className={`p-6 rounded-3xl border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                    e.daysRemaining === 0 
                      ? 'bg-pink-50 border-pink-200 shadow-md shadow-pink-50/' 
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${
                        e.daysRemaining === 0 ? 'bg-pink-600 text-white animate-pulse' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {e.daysRemaining === 0 ? '🎂' : '⏳'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-900 text-sm">{e.customerName}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                            e.daysRemaining === 0 ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {e.daysRemaining === 0 ? 'Happening Today!' : `in ${e.daysRemaining} days`}
                          </span>
                        </div>
                        <p className="text-[10px] text-pink-600 font-bold uppercase tracking-wider mt-0.5">{e.eventName} • Original date: {format(new Date(e.dateStr), 'dd MMM yyyy')}</p>
                        {stats && stats.favoriteFlavor !== 'None' && (
                          <span className="inline-block mt-2 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-[8px] font-black uppercase">
                            ⭐ Prefers: {stats.favoriteFlavor}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                      <div className="hidden sm:block text-right pr-4 border-r border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Mobile Contact</p>
                        <p className="text-[10px] font-mono text-slate-700 font-bold">{e.phone}</p>
                      </div>
                      <a 
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full md:w-auto bg-pink-600 hover:bg-pink-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-sm shadow-pink-100"
                      >
                        <MessageCircle size={14} /> Send WhatsApp Offer Card
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Original Customer Database list view with search, segments and histories */
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8 pb-6 border-b border-slate-100">
            {/* Search inputs */}
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search clients by name or mobile address..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 pl-11 pr-4 py-3.5 rounded-2xl font-bold text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              />
            </div>

            {/* Segment categories tab selection controls */}
            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              {(['all', 'top_spenders', 'regulars', 'dormant', 'first_timers'] as const).map(seg => (
                <button
                  key={seg}
                  onClick={() => setFilterSegment(seg)}
                  className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                    filterSegment === seg 
                      ? 'bg-slate-900 text-white border-slate-900' 
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {seg === 'all' && 'All Accounts'}
                  {seg === 'top_spenders' && '⭐ Spenders (LTV)'}
                  {seg === 'regulars' && '🔄 Frequent'}
                  {seg === 'dormant' && '💤 Dormant (>90d)'}
                  {seg === 'first_timers' && '🌱 First orders'}
                </button>
              ))}
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-150 rounded-3xl bg-slate-50/30">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No matching accounts found.</p>
              <p className="text-[10px] text-slate-300 font-bold uppercase mt-1">Try resetting your filter segment or typing a different query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCustomers.map((c, index) => {
                const stats = customerStatsMap[c.id];
                const cleanPhone = c.phone.replace(/\D/g, '');
                
                return (
                  <div 
                    key={`${c.id || ''}_${index}`} 
                    onClick={() => setSelectedCustomerId(c.id)}
                    className="p-6 border border-slate-150 rounded-3xl flex flex-col justify-between group hover:bg-slate-50 cursor-pointer hover:border-slate-300 transition-all shadow-sm"
                  >
                    <div>
                      {/* Card Header information */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-150 group-hover:bg-slate-900 group-hover:text-white transition-colors rounded-xl flex items-center justify-center font-black text-slate-500 text-sm uppercase">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-extrabold text-slate-900 text-sm leading-tight group-hover:text-amber-700 transition-colors">{c.name}</h3>
                            <p className="text-[9px] text-slate-400 font-bold tracking-wider mt-0.5 font-mono">{c.phone}</p>
                          </div>
                        </div>

                        {/* Segment Identifier Tag */}
                        {stats && (
                          <div className="text-right">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                              stats.segment === 'Top Spender' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                              stats.segment === 'Active Store Regular' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                              stats.segment === 'Dormant' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                              'bg-slate-50 text-slate-400'
                            }`}>
                              {stats.segment}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Micro LTV/AOV Metrics block */}
                      {stats && (
                        <div className="grid grid-cols-3 gap-2 bg-slate-50 group-hover:bg-white rounded-2xl p-3 border border-slate-100 mb-4 transition-colors">
                          <div className="text-center border-r border-slate-200/50">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Total Spent</p>
                            <p className="text-[11px] font-black text-slate-900 mt-0.5">₹{stats.totalSpent}</p>
                          </div>
                          <div className="text-center border-r border-slate-200/50">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Total Orders</p>
                            <p className="text-[11px] font-black text-slate-600 mt-0.5">{c.totalOrders === 1 ? '1 order' : `${c.totalOrders} orders`}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Fav-Flavor</p>
                            <p className="text-[10px] font-black text-blue-600 truncate mt-0.5 uppercase tracking-wide">{stats.favoriteFlavor !== 'None' ? stats.favoriteFlavor : 'n/a'}</p>
                          </div>
                        </div>
                      )}

                      {/* Birthdays/Occasion grid */}
                      <div className="grid grid-cols-3 gap-2 py-4 border-t border-slate-100">
                        <div className="text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Birthday</p>
                          <p className="text-[9px] font-bold text-slate-700 mt-0.5">{c.birthday ? format(new Date(c.birthday), 'dd MMM') : '-'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Anniversary</p>
                          <p className="text-[9px] font-bold text-slate-700 mt-0.5">{c.anniversary ? format(new Date(c.anniversary), 'dd MMM') : '-'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Engagement</p>
                          <p className="text-[9px] font-bold text-slate-700 mt-0.5">{c.engagementDate ? format(new Date(c.engagementDate), 'dd MMM') : '-'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Action Footer controls */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 w-full justify-between items-center bg-slate-50/50 rounded-2xl p-2 group-hover:bg-slate-100/50 transition-all">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">
                        {stats?.lastOrderDate ? `Ordered ${format(stats.lastOrderDate, 'dd MMM yy')}` : 'No history yet'}
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const msg = `Hi ${c.name}, greeting from ${bakery?.name || 'Bakesync'}! We miss baking your favorite recipes. We have exciting special cake designs ready this season, let us know if we can prepare your next treat!`;
                          window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white p-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1 shadow-sm"
                      >
                        <MessageCircle size={12} /> WhatsApp message
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RE-ENGAGEMENT SEGMENT ENGINE BANNER (Retained as top card suggestions dashboard highlights per mandate but visually superiorized) */}
      {customers.filter(c => c.totalOrders >= 2).length > 0 && activeTab === 'database' && (
        <div className="bg-slate-100 rounded-[2.5rem] p-8 border border-slate-200 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">CRM Smart Re-Engagement Engine</h3>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Automated prompt generator for repeat high-value accounts trigger</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {customers.filter(c => c.totalOrders >= 2).slice(0, 4).map((c, index) => {
              const cleanPhone = c.phone.replace(/\D/g, '');
              const stats = customerStatsMap[c.id];
              return (
                <div key={`${c.id || ''}_${index}`} className="bg-white p-5 rounded-3xl border border-slate-150 flex flex-col justify-between group hover:border-slate-350 transition-colors shadow-sm">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                       <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase">Top loyalty member</span>
                       <span className="text-[10px] font-black text-slate-900">{c.totalOrders}x orders</span>
                    </div>
                    <h4 className="font-extrabold text-slate-900 text-xs">{c.name}</h4>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      LTV: ₹{stats?.totalSpent || 0} • Pref: {stats?.favoriteFlavor || 'n/a'}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      const msg = `Hi ${c.name}, it's been a while since your last treat from ${bakery?.name || 'Bakesync'}! We have some new special items you might like. Want to check them out?`;
                      window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                    className="mt-4 w-full bg-slate-900 text-white py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle size={12} />
                    Auto pitch re-engage
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* USER ORDER HISTORY MODAL VIEW / DRAWER - Wires all specific items details requested */}
      {selectedCustomerId && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Exit Button */}
            <button 
              onClick={() => setSelectedCustomerId(null)}
              className="absolute top-6 right-6 w-9 h-9 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors rounded-full flex items-center justify-center shadow-sm"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            {/* Profile Overview segment */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="w-14 h-14 bg-slate-900 text-white font-black text-lg rounded-2xl flex items-center justify-center uppercase">
                {selectedCustomer.name.charAt(0)}
              </div>
              <div>
                <span className="text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Customer Workspace Profile
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-1 leading-none">{selectedCustomer.name}</h2>
                <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1 uppercase font-mono">{selectedCustomer.phone}</p>
              </div>
            </div>

            {/* Loyalty KPI Grid stats */}
            {selectedCustStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lifetime Value</p>
                  <p className="text-lg font-black text-slate-950 mt-1">₹{selectedCustStats.totalSpent}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Orders Counts</p>
                  <p className="text-lg font-black text-slate-950 mt-1">{selectedCustomer.totalOrders} purchases</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest font-mono">Average ticket size</p>
                  <p className="text-lg font-black text-slate-950 mt-1">₹{selectedCustStats.avgOrderValue}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Favorite Choice</p>
                  <p className="text-xs font-black text-blue-600 mt-2 truncate uppercase tracking-wider">
                    {selectedCustStats.favoriteFlavor !== 'None' ? selectedCustStats.favoriteFlavor : 'Not ordered'}
                  </p>
                </div>
              </div>
            )}

            {/* Profile Occasions Info */}
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 mb-8">
              <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Registered Milestone Dates</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[7px] font-black text-slate-400 uppercase font-mono">Birthday Date</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {selectedCustomer.birthday ? format(new Date(selectedCustomer.birthday), 'dd MMM yyyy') : 'Unregistered'}
                  </p>
                </div>
                <div>
                  <p className="text-[7px] font-black text-slate-400 uppercase font-mono">Anniversary Date</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {selectedCustomer.anniversary ? format(new Date(selectedCustomer.anniversary), 'dd MMM yyyy') : 'Unregistered'}
                  </p>
                </div>
                <div>
                  <p className="text-[7px] font-black text-slate-400 uppercase font-mono">Engagement Anniversary</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {selectedCustomer.engagementDate ? format(new Date(selectedCustomer.engagementDate), 'dd MMM yyyy') : 'Unregistered'}
                  </p>
                </div>
              </div>
            </div>

            {/* Specific Cake / Chocolate Item Order History Log - Wires up everything beautifully */}
            <div>
              <h3 className="text-[10px] font-black text-slate-950 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" /> Historic Checkout Purchases ({selectedCustStats?.orders.length})
              </h3>
              
              {selectedCustStats && selectedCustStats.orders.length === 0 ? (
                <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No order snapshots recorded dynamically in Bakesync yet.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {selectedCustStats?.orders.map((o, index) => {
                    const isCake = o.type !== 'chocolate';
                    const oDate = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
                    
                    return (
                      <div key={`${o.id || ''}_${index}`} className="p-4 rounded-2xl bg-white border border-slate-150 flex justify-between items-center hover:border-slate-250 transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[7px] font-black uppercase ${
                              o.type === 'chocolate' ? 'bg-amber-100 text-amber-800' :
                              o.details && 'isPhotoCake' in o.details && (o.details as any).isPhotoCake ? 'bg-purple-100 text-purple-800' :
                              'bg-indigo-100 text-indigo-800'
                            }`}>
                              {o.type === 'chocolate' ? 'Choc Bites' :
                               (o.details && 'isPhotoCake' in o.details && (o.details as any).isPhotoCake) ? 'Photo Cake 📸' : 'Design Cake 🎂'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">{format(oDate, 'dd MMM yyyy')}</span>
                          </div>
                          
                          {/* Item parameters: What was ordered */}
                          <p className="text-xs font-black text-slate-800">
                            Flavor: <span className="text-blue-600 uppercase font-bold pr-2">{('flavor' in o.details) ? o.details.flavor : 'Not specified'}</span>
                            {isCake && 'weight' in o.details && (
                              <span className="text-slate-400">({(o.details as any).weight} kg)</span>
                            )}
                          </p>

                          {o.details && 'instruction' in o.details && (o.details as any).instruction && (
                            <p className="text-[9px] text-slate-400 italic">Instruction: "{(o.details as any).instruction}"</p>
                          )}
                        </div>

                        {/* Status + Amount */}
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900">₹{o.totalAmount || 0}</p>
                          <span className={`inline-block mt-1 text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                            o.status === 'sent' || o.status === 'ready' ? 'bg-emerald-50 text-emerald-600' :
                            o.status === 'cancelled' ? 'bg-rose-50 text-rose-600' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick close button bar */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedCustomerId(null)}
                className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-sm"
              >
                Close Profile Info
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
