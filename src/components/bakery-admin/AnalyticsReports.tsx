import React, { useState, useEffect } from 'react';
import { StatCard } from './StatCard';
import { Order, Dealer, Expense } from '../../types';
import { cn, formatCurrency } from '../../lib/utils';
import { TrendingUp, ShoppingBag, PieChart, Store, Printer, PlusCircle, Trash2, PiggyBank, Percent, Calendar, FileText, Filter } from 'lucide-react';
import { motion } from 'motion/react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { exportOrdersToExcel } from '../../lib/exportUtils';

interface AnalyticsReportsProps {
  orders: Order[];
  dealers: Dealer[];
}

export const AnalyticsReports: React.FC<AnalyticsReportsProps> = ({ orders, dealers }) => {
  const { bakery, profile } = useAuth();
  
  // Ledger and Form States
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'rent' | 'utilities' | 'ingredients' | 'salaries' | 'maintenance' | 'other'>('ingredients');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Load expenses from Firestore
  useEffect(() => {
    if (!bakery?.id) return;
    const q = query(
      collection(db, 'expenses'),
      where('bakeryId', '==', bakery.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Expense[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Expense);
      });
      // Sort expenses by date descending
      list.sort((a, b) => b.date.localeCompare(a.date));
      setExpenses(list);
    });
    return unsubscribe;
  }, [bakery?.id]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bakery?.id) return;
    if (!title || !amount) {
      alert('Please fill in title and amount.');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        bakeryId: bakery.id,
        title,
        category,
        amount: parseFloat(amount),
        date,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        createdBy: profile?.displayName || profile?.email || 'System'
      });
      setTitle('');
      setAmount('');
      setNotes('');
      setDate(new Date().toISOString().split('T')[0]);
    } catch (err) {
      console.error('Error adding expense:', err);
      alert('Failed to add expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (err) {
      console.error('Error deleting expense:', err);
      alert('Failed to delete expense.');
    }
  };

  const staffStats = orders.filter(o => o.readyBy && !o.isDeleted).reduce((acc: any, o) => {
    const name = o.readyBy!.split('@')[0].split(' ')[0];
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const sortedStaff = Object.entries(staffStats).sort((a: any, b: any) => b[1] - a[1]);

  // Dynamic Performance Insights Monthly Calculations
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();

  // Financial Calculations per month
  const monthlyData = monthNames.map((monthName, index) => {
    const monthOrders = orders.filter(o => {
      const d = o.createdAt?.toDate?.();
      return d && d.getFullYear() === currentYear && d.getMonth() === index && o.status !== 'cancelled' && !o.isDeleted;
    });
    const rev = monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const monthExpenses = expenses.filter(e => {
      if (!e.date) return false;
      const [y, m] = e.date.split('-');
      return parseInt(y) === currentYear && parseInt(m) === (index + 1);
    });
    const exp = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const profit = rev - exp;

    return {
      monthLabel: monthName,
      shortLabel: monthShorts[index],
      revenue: rev,
      expenses: exp,
      profit: profit
    };
  });

  const totalRevenue = orders.reduce((a, b) => a + (b.status === 'cancelled' || b.isDeleted ? 0 : (b.totalAmount || 0)), 0);
  const totalExpenses = expenses.reduce((a, b) => a + (b.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Dynamic AI Business Audit Data
  const dealerOrders = orders.filter(o => o.dealerId && !o.isDeleted);
  const directOrders = orders.filter(o => !o.dealerId && !o.isDeleted);
  const cancelledDealers = dealerOrders.filter(o => o.status === 'cancelled').length;
  const cancelledDirect = directOrders.filter(o => o.status === 'cancelled').length;
  const dealerCancelRate = dealerOrders.length ? Math.round((cancelledDealers / dealerOrders.length) * 100) : 0;
  const directCancelRate = directOrders.length ? Math.round((cancelledDirect / directOrders.length) * 100) : 0;

  const hasHighDealerCancel = dealerCancelRate > directCancelRate && dealerCancelRate > 5;
  const unconfirmedOrdersCount = orders.filter(o => o.status === 'pending' && !o.isDeleted).length;
  const unconfirmedRisk = unconfirmedOrdersCount >= 4;

  const filteredExpenses = expenses.filter(e => categoryFilter === 'all' || e.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Upper Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon={TrendingUp} color="blue" />
        <StatCard label="Total Expenses" value={formatCurrency(totalExpenses)} icon={PiggyBank} color="red" />
        <StatCard label="Net Profit" value={formatCurrency(netProfit)} icon={ShoppingBag} color={netProfit >= 0 ? "green" : "red"} />
        <StatCard label="Profit Margin" value={`${profitMargin.toFixed(1)}%`} icon={Percent} color="amber" />
      </div>

      {/* Main comparative ledger analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense input form */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 lg:col-span-1 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Log Expense</h3>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Expense Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop Rent, Salary..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full p-3.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="rent">Rent</option>
                  <option value="salaries">Salaries</option>
                  <option value="ingredients">Ingredients</option>
                  <option value="utilities">Utilities</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Notes (Optional)</label>
                <textarea
                  placeholder="Additional details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-20 p-3.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Add Expense Record'}
              </button>
            </form>
          </div>
        </div>

        {/* Ledger table */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 lg:col-span-2 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Expense Ledger</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Durable records registered in database</p>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="p-2 bg-slate-50 border-none rounded-lg text-[10px] font-bold text-slate-600 uppercase tracking-wider"
                >
                  <option value="all">All Categories</option>
                  <option value="rent">Rent</option>
                  <option value="salaries">Salaries</option>
                  <option value="ingredients">Ingredients</option>
                  <option value="utilities">Utilities</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 pr-2">
              {filteredExpenses.length === 0 ? (
                <div className="p-12 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">No expenses logged in this filter.</div>
              ) : (
                filteredExpenses.map((exp) => (
                  <div key={exp.id} className="py-3.5 flex items-center justify-between gap-4 group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center font-black text-[9px] uppercase tracking-wider">
                        {exp.category?.slice(0, 3)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{exp.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{exp.date}</span>
                          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider">{exp.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-900">{formatCurrency(exp.amount)}</span>
                      <button
                        onClick={() => exp.id && handleDeleteExpense(exp.id)}
                        className="p-2 text-slate-300 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Operational Efficiency</h3>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-widest">Staff Performance</span>
           </div>
           <div className="space-y-4">
              {sortedStaff.length === 0 ? (
                <div className="p-12 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">No production data yet.</div>
              ) : (
                sortedStaff.map(([name, count]: any) => (
                  <div key={name} className="flex items-center gap-4">
                    <div className="w-20 text-[10px] font-black text-slate-500 uppercase truncate">{name}</div>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / (sortedStaff[0][1] as number)) * 100}%` }}
                        className="h-full bg-indigo-600" 
                       />
                    </div>
                    <div className="w-12 text-right text-xs font-black text-slate-900">{count}</div>
                  </div>
                ))
              )}
           </div>
           <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Cancellations</p>
                 <p className="text-lg font-black text-slate-900">{orders.filter(o => o.status === 'cancelled' && !o.isDeleted).length}</p>
                 <p className="text-[9px] text-red-500 font-bold uppercase mt-1 leading-none">Loss Impact: {formatCurrency(orders.filter(o => o.status === 'cancelled' && !o.isDeleted).reduce((acc, o) => acc + (o.totalAmount || 0), 0))}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Confirmation Rate</p>
                 <p className="text-lg font-black text-slate-900">
                    {Math.round((orders.filter(o => o.confirmationReminderSentAt && !o.isDeleted).length / (orders.filter(o => o.status === 'pending' && !o.isDeleted).length || 1)) * 100)}%
                 </p>
                 <p className="text-[9px] text-blue-500 font-bold uppercase mt-1 leading-none">Reminder Pipeline Active</p>
              </div>
           </div>
        </div>

        <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] relative overflow-hidden flex flex-col justify-between">
           <div>
             <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 relative z-10 text-blue-400">AI Business Audit</h3>
             <p className="text-xs text-white/70 leading-relaxed mb-6 relative z-10 font-bold italic">
              "Your production throughput is stable. Your partner dealer cancellation rate is currently {dealerCancelRate}%, compared to direct retail orders at {directCancelRate}%. {hasHighDealerCancel ? 'Consider enforcing a 25% non-refundable advance for dealer partners to protect margins.' : 'Good job maintaining healthy partner relations.'}"
             </p>
           </div>
           <div className="grid grid-cols-1 gap-3 relative z-10 text-white">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-white">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Primary Risk</p>
                 <p className="text-xs font-bold text-white">
                    {unconfirmedRisk 
                      ? `${unconfirmedOrdersCount} unconfirmed pending orders. Process these quickly to secure inventory.`
                      : 'No critical pending bottlenecks detected. Keep pipeline updated.'}
                 </p>
              </div>
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-white">
                 <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2 text-emerald-400">Opportunity</p>
                 <p className="text-xs font-bold text-white">
                    {dealerOrders.length > 0 
                      ? `Dealers drive ${Math.round((dealerOrders.length / (orders.length || 1)) * 100)}% of orders. Launch a unified catalog push.`
                      : 'Collaborate with partner car dealerships to expand cake distribution volume.'}
                 </p>
              </div>
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20"></div>
        </div>
      </div>

      {/* Monthly comparative chart */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Performance Insights</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Comparing monthly Revenue (Blue) vs Expenses (Rose)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportOrdersToExcel(orders, "Bakery_Business_Report")} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 transition-colors text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer">
              <Printer className="w-4 h-4" /> Export Report
            </button>
          </div>
        </div>
        
        {/* Dynamic Dual bar chart */}
        <div className="h-64 flex items-end gap-2 border-b border-slate-100 pb-2">
          {monthlyData.map((item, i) => {
            const maxVal = Math.max(...monthlyData.map(d => Math.max(d.revenue, d.expenses)), 1);
            const revPct = Math.round((item.revenue / maxVal) * 100);
            const expPct = Math.round((item.expenses / maxVal) * 100);

            return (
              <div key={i} className="flex-1 flex items-end gap-1 h-full relative group">
                {/* Revenue Bar */}
                <div 
                  className="w-1/2 bg-blue-500 hover:bg-blue-600 transition-all rounded-t-sm" 
                  style={{ height: `${Math.max(4, revPct)}%` }} 
                />
                {/* Expense Bar */}
                <div 
                  className="w-1/2 bg-rose-400 hover:bg-rose-500 transition-all rounded-t-sm" 
                  style={{ height: `${Math.max(4, expPct)}%` }} 
                />
                
                {/* Tooltip */}
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold p-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-xl pointer-events-none space-y-1">
                  <p className="font-black uppercase tracking-wider text-slate-300 text-center mb-1">{item.monthLabel}</p>
                  <p className="text-blue-300 flex justify-between gap-4"><span>Rev:</span> <span>₹{item.revenue.toLocaleString()}</span></p>
                  <p className="text-rose-300 flex justify-between gap-4"><span>Exp:</span> <span>₹{item.expenses.toLocaleString()}</span></p>
                  <div className="h-[1px] bg-slate-800 my-1"></div>
                  <p className={item.profit >= 0 ? "text-emerald-400 flex justify-between gap-4 font-black" : "text-rose-400 flex justify-between gap-4 font-black"}>
                    <span>Net:</span> <span>₹{item.profit.toLocaleString()}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Labels */}
        <div className="flex justify-between mt-4 text-[10px] text-slate-400 font-black uppercase tracking-widest">
          {monthShorts.map((short, i) => (
            <span key={i} className="flex-1 text-center">{short}</span>
          ))}
        </div>

        {/* Month-by-month financial summary table */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="p-4">Month</th>
                <th className="p-4 text-right">Revenue</th>
                <th className="p-4 text-right">Expenses</th>
                <th className="p-4 text-right">Net Profit / Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {monthlyData.map((item, i) => {
                const hasData = item.revenue > 0 || item.expenses > 0;
                return (
                  <tr key={i} className={cn("text-xs font-bold transition-colors", hasData ? "text-slate-700 hover:bg-slate-50/50" : "text-slate-300")}>
                    <td className="p-4 font-black">{item.monthLabel}</td>
                    <td className="p-4 text-right">{formatCurrency(item.revenue)}</td>
                    <td className="p-4 text-right">{formatCurrency(item.expenses)}</td>
                    <td className={cn("p-4 text-right font-black", item.profit > 0 ? "text-emerald-600" : item.profit < 0 ? "text-rose-600" : "text-slate-400")}>
                      {item.profit === 0 ? '--' : formatCurrency(item.profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
