import React from 'react';
import { Order, MenuItem, Dealer, OrderStatus } from '../types';
import { 
  Package, 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  ChefHat,
  IndianRupee,
  ShoppingBag
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';

interface SummaryDashboardProps {
  orders: Order[];
  items: MenuItem[];
  dealers: Dealer[];
  onClose?: () => void;
}

export const DailySummaryDashboard: React.FC<SummaryDashboardProps> = ({ orders, items, dealers, onClose }) => {
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.deliveryDate === today && !o.isDeleted);
  
  const stats = {
    totalValue: todayOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0),
    kgTotal: todayOrders.reduce((acc, o) => acc + (('weight' in o.details) ? (o.details as any).weight || 0 : 0), 0),
    orderCount: todayOrders.length,
    dealerOrders: todayOrders.filter(o => o.dealerId).length,
    retailOrders: todayOrders.filter(o => !o.dealerId).length,
    statusCounts: {
      pending: todayOrders.filter(o => o.status === 'pending').length,
      confirmed: todayOrders.filter(o => o.status === 'received').length,
      production: todayOrders.filter(o => o.status === 'in_progress').length,
      ready: todayOrders.filter(o => o.status === 'ready').length,
      sent: todayOrders.filter(o => o.status === 'sent').length,
    }
  };

  const topItems = todayOrders.reduce((acc, o) => {
    const itemName = 'flavor' in o.details ? (o.details as any).flavor : 'Product';
    acc[itemName] = (acc[itemName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedTopItems = Object.entries(topItems).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5);

  return (
    <div className="space-y-8 p-1 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
              <Calendar size={20} />
            </span>
            Daily Pulse
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 ml-1">Today's Snapshot • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-all">
            <CheckCircle2 size={24} className="text-slate-300" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryStatCard 
          label="Estimated Revenue" 
          value={`₹${stats.totalValue.toLocaleString()}`} 
          icon={IndianRupee} 
          color="blue"
          subLabel={`${stats.orderCount} Total Orders`}
        />
        <SummaryStatCard 
          label="Production Volume" 
          value={`${stats.kgTotal} KG`} 
          icon={ScalingIcon} 
          color="amber"
          subLabel="Cakes & Specialties"
        />
        <SummaryStatCard 
          label="Pending Clearance" 
          value={stats.statusCounts.pending.toString()} 
          icon={Clock} 
          color="red"
          subLabel="Action Required"
        />
        <SummaryStatCard 
          label="Delivery Progress" 
          value={`${Math.round((stats.statusCounts.sent / (stats.orderCount || 1)) * 100)}%`} 
          icon={ShoppingBag} 
          color="green"
          subLabel={`${stats.statusCounts.sent} Delivered`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Status Pipeline */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
            <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
            Live Pipeline
          </h3>
          <div className="space-y-4">
            <StatusBar label="Pending Approval" count={stats.statusCounts.pending} total={stats.orderCount} color="bg-red-500" />
            <StatusBar label="Confirmed & Prep" count={stats.statusCounts.confirmed} total={stats.orderCount} color="bg-amber-500" />
            <StatusBar label="In Production" count={stats.statusCounts.production} total={stats.orderCount} color="bg-blue-500" />
            <StatusBar label="Ready for Pickup" count={stats.statusCounts.ready} total={stats.orderCount} color="bg-indigo-500" />
            <StatusBar label="Out for Delivery" count={stats.statusCounts.sent} total={stats.orderCount} color="bg-green-500" />
          </div>
        </div>

        {/* Top Products Today */}
        <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-slate-200">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 text-white">
            <div className="w-1.5 h-6 bg-blue-400 rounded-full" />
            Trending Today
          </h3>
          <div className="space-y-4">
            {sortedTopItems.map(([name, count], i) => (
              <div key={name} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-blue-400 w-4">0{i+1}</span>
                  <p className="text-xs font-black truncate max-w-[150px] md:max-w-xs">{name}</p>
                </div>
                <div className="text-[10px] font-black px-3 py-1 bg-blue-500 rounded-full">{count} Orders</div>
              </div>
            ))}
            {sortedTopItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 space-y-4">
                <ChefHat size={40} className="opacity-20" />
                <p className="text-[10px] font-black uppercase tracking-widest italic">Kitchen is warming up...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ScalingIcon: React.FC<any> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"/><path d="M3 16.2V21m0 0h4.8M3 21l6-6"/><path d="M21 7.8V3m0 0h-4.8M21 3l-6 6"/><path d="m3 3 6 6M3 3v4.8M3 3h4.8"/></svg>
);

const SummaryStatCard: React.FC<{ 
  label: string, 
  value: string, 
  icon: any, 
  color: 'blue' | 'amber' | 'red' | 'green',
  subLabel?: string
}> = ({ label, value, icon: Icon, color, subLabel }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    green: 'bg-green-50 text-green-600 border-green-100',
  };

  return (
    <div className={cn("p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between min-h-[160px] bg-white transition-all hover:scale-[1.02]", colors[color])}>
      <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center mb-4 shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
        <p className="text-2xl font-black tracking-tighter">{value}</p>
        {subLabel && <p className="text-[8px] font-bold opacity-40 mt-1">{subLabel}</p>}
      </div>
    </div>
  );
};

const StatusBar: React.FC<{ label: string, count: number, total: number, color: string }> = ({ label, count, total, color }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-900">{count}</span>
      </div>
      <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
    </div>
  );
};
