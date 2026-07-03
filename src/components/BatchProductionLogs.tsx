import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn, formatCurrency } from '../lib/utils';
import { DrageesBatch } from '../types';
import { 
  Plus, 
  Search, 
  Calendar, 
  TrendingUp, 
  Layers, 
  Package, 
  Clock, 
  User, 
  CheckCircle2, 
  ListFilter,
  Candy,
  Sparkles,
  ClipboardList,
  Cpu
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface BatchLog {
  id?: string;
  bakeryId: string;
  batchNumber: string;
  productType: 'chocolate' | 'dragees';
  productName: string;
  quantity: number;
  unit: string;
  date: string;
  loggedBy: string;
  createdAt: any;
  isAutoDragee?: boolean;
  isSourced?: boolean;
  supplierName?: string;
}

export const BatchProductionLogs: React.FC = () => {
  const { bakery, user } = useAuth();
  const [manualLogs, setManualLogs] = useState<BatchLog[]>([]);
  const [drageesBatches, setDrageesBatches] = useState<DrageesBatch[]>([]);
  const [loadingManual, setLoadingManual] = useState(true);
  const [loadingDragees, setLoadingDragees] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);

  // Form State
  const [batchNumber, setBatchNumber] = useState('');
  const [productType, setProductType] = useState<'chocolate' | 'dragees'>('chocolate');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('KG');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isSourced, setIsSourced] = useState(false);
  const [supplierName, setSupplierName] = useState('');

  // Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'chocolate' | 'dragees' | 'sourced'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Auto-generate helper
  const generateNewBatchNumber = () => {
    const prefix = isSourced ? 'SRC' : (productType === 'chocolate' ? 'CHOC' : 'DRAG');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const dateStr = format(new Date(), 'ddMMyy');
    return `${prefix}-${dateStr}-${rand}`;
  };

  // Sync auto-generated batch number when modal opens or category/source toggles
  useEffect(() => {
    if (showLogForm) {
      setBatchNumber(generateNewBatchNumber());
    }
  }, [showLogForm, productType, isSourced]);

  // Subscribe to manual batch logs
  useEffect(() => {
    if (!bakery?.id) {
      setLoadingManual(false);
      return;
    }

    const q = query(
      collection(db, 'batch_production_logs'),
      where('bakeryId', '==', bakery.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const parsedLogs: BatchLog[] = [];
      snap.forEach((doc) => {
        parsedLogs.push({ id: doc.id, ...doc.data() } as BatchLog);
      });
      setManualLogs(parsedLogs);
      setLoadingManual(false);
    }, (err) => {
      console.error("Error loaded batch logs:", err);
      setLoadingManual(false);
    });

    return () => unsubscribe();
  }, [bakery]);

  // Subscribe to completed dragees batches to list them automatically
  useEffect(() => {
    if (!bakery?.id) {
      setLoadingDragees(false);
      return;
    }

    const q = query(
      collection(db, 'dragees_batches'),
      where('bakeryId', '==', bakery.id),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const parsedBatches: DrageesBatch[] = [];
      snap.forEach((doc) => {
        parsedBatches.push({ id: doc.id, ...doc.data() } as DrageesBatch);
      });
      setDrageesBatches(parsedBatches);
      setLoadingDragees(false);
    }, (err) => {
      console.error("Error loading completed dragee batches for log:", err);
      setLoadingDragees(false);
    });

    return () => unsubscribe();
  }, [bakery]);

  // Merge manual logs and automated ones on the fly
  const logs = useMemo(() => {
    const parsedManual: BatchLog[] = manualLogs.map(l => ({
      ...l,
      isAutoDragee: false
    }));

    const parsedDragees: BatchLog[] = drageesBatches.map(b => {
      const dateStr = b.createdAt 
        ? format(b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd');

      return {
        id: b.id,
        bakeryId: b.bakeryId,
        batchNumber: b.batchNo || b.id.slice(-6).toUpperCase(),
        productType: 'dragees' as const,
        productName: b.productName
          ? `${b.productName} (${b.machine})`
          : b.chocolateType 
            ? `${b.chocolateType} Coated Center (${b.machine})`
            : `Coated Dragees Center (${b.machine})`,
        quantity: b.actualOutputKg || b.batchSize,
        unit: 'KG',
        date: dateStr,
        loggedBy: (b as any).createdBy || 'Active Production',
        createdAt: b.createdAt,
        isAutoDragee: true
      };
    });

    return [...parsedManual, ...parsedDragees].sort((a, b) => {
      const timeA = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
      const timeB = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
      if (timeB && timeA) {
        return timeB - timeA;
      }
      return b.date.localeCompare(a.date);
    });
  }, [manualLogs, drageesBatches]);

  const loading = loadingManual || loadingDragees;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bakery?.id || !user) return;
    if (!productName.trim() || !batchNumber.trim() || !quantity) {
      alert('Please fill out all required fields.');
      return;
    }
    if (isSourced && !supplierName.trim()) {
      alert('Please state the supplier or company sourced from.');
      return;
    }

    try {
      const newLog: BatchLog = {
        bakeryId: bakery.id,
        batchNumber: batchNumber.trim(),
        productType,
        productName: productName.trim(),
        quantity: parseFloat(quantity),
        unit,
        date,
        loggedBy: user.displayName || user.email || 'Team Member',
        createdAt: serverTimestamp() as any,
        isSourced,
        supplierName: isSourced ? supplierName.trim() : ''
      };

      await addDoc(collection(db, 'batch_production_logs'), newLog);
      
      // Reset
      setProductName('');
      setQuantity('');
      setBatchNumber('');
      setIsSourced(false);
      setSupplierName('');
      setShowLogForm(false);
    } catch (err) {
      console.error(err);
      alert('Error logging batch. Please try again.');
    }
  };

  // KPI calculations
  const stats = useMemo(() => {
    const totalBatches = logs.length;
    
    const chocolateQty = logs
      .filter(l => l.productType === 'chocolate' && l.unit === 'KG' && !l.isSourced)
      .reduce((sum, l) => sum + l.quantity, 0);

    const drageesQty = logs
      .filter(l => l.productType === 'dragees' && l.unit === 'KG' && !l.isSourced)
      .reduce((sum, l) => sum + l.quantity, 0);

    const totalQtyKg = logs
      .filter(l => l.unit === 'KG' && !l.isSourced)
      .reduce((sum, l) => sum + l.quantity, 0);

    const sourcedCount = logs.filter(l => l.isSourced).length;
    const sourcedQtyKg = logs
      .filter(l => l.isSourced && l.unit === 'KG')
      .reduce((sum, l) => sum + l.quantity, 0);

    return {
      totalBatches,
      totalQtyKg,
      chocolateQty,
      drageesQty,
      sourcedCount,
      sourcedQtyKg
    };
  }, [logs]);

  // Filter logs logic
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = log.productName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            log.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            log.loggedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (log.supplierName && log.supplierName.toLowerCase().includes(searchQuery.toLowerCase()));
      
      let matchesType = true;
      if (filterType === 'sourced') {
        matchesType = !!log.isSourced;
      } else if (filterType !== 'all') {
        matchesType = !log.isSourced && log.productType === filterType;
      }
      
      let matchesDates = true;
      if (startDate) {
        matchesDates = matchesDates && log.date >= startDate;
      }
      if (endDate) {
        matchesDates = matchesDates && log.date <= endDate;
      }

      return matchesSearch && matchesType && matchesDates;
    });
  }, [logs, searchQuery, filterType, startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Upper row header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Team Batch Logger</h2>
          <p className="text-xs font-bold text-slate-900 mt-1">Record and monitor all production batches</p>
        </div>
        <button 
          onClick={() => {
            setBatchNumber('');
            setShowLogForm(true);
          }}
          className="bg-blue-600 text-white px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 font-mono"
        >
          <Plus className="w-4 h-4" /> Log Produced Batch
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total Batches</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.totalBatches} Logs</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total Produced (KG)</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.totalQtyKg.toFixed(1)} KG</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Chocolates (KG)</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.chocolateQty.toFixed(1)} KG</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
            <Candy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Dragees (KG)</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.drageesQty.toFixed(1)} KG</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            <Package className="w-6 h-6 font-semibold" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Sourced Products</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.sourcedCount} Logs</p>
          </div>
        </div>
      </div>

      {/* Main Listing & Filters Board */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        {/* Filters Header Section */}
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
            <div className="relative w-full lg:max-w-xs">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search batch # or product name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                {(['all', 'chocolate', 'dragees', 'sourced'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                      filterType === type ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                  className="outline-none bg-transparent"
                />
                <span className="text-slate-300">to</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                  className="outline-none bg-transparent"
                />
                {(startDate || endDate) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="ml-1 text-red-500 hover:font-bold border-l pl-2 border-slate-100"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Batch Logs Table List */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-24 text-center animate-pulse text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              Loading batch logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-24 text-center">
              <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No production logs match your filter selection.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-5 px-8">Batch Number</th>
                  <th className="py-5 px-6">Product Details</th>
                  <th className="py-5 px-6">Quantity Made</th>
                  <th className="py-5 px-6">Date Produced</th>
                  <th className="py-5 px-6">Recorded By</th>
                  <th className="py-5 px-8">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                     <td className="py-5 px-8">
                      <div className="font-mono text-xs font-black text-slate-900 flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          log.isSourced ? "bg-amber-500 animate-pulse" : (log.productType === 'chocolate' ? "bg-indigo-500" : "bg-purple-500")
                        )}></div>
                        {log.batchNumber}
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div>
                        <div className="text-xs font-black text-slate-900">{log.productName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{log.productType}</span>
                          {log.isSourced && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[8px] font-black uppercase tracking-wider">
                              Sourced from: {log.supplierName || 'Third Party'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="text-xs font-black text-slate-900">
                        {log.quantity} <span className="text-[9px] text-slate-400 font-bold uppercase">{log.unit}</span>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="text-xs text-slate-600 font-bold flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {log.date}
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {log.loggedBy}
                      </div>
                    </td>
                    <td className="py-5 px-8">
                      {log.isAutoDragee ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 text-violet-700 border border-violet-100 rounded-full text-[9px] font-black uppercase tracking-wider">
                          <Cpu className="w-3 h-3 text-violet-500 animate-pulse" /> Auto-Logged
                        </span>
                      ) : log.isSourced ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[9px] font-black uppercase tracking-wider">
                          <Package className="w-3" /> Sourced Product
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-[9px] font-black uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3 text-green-500" /> Manual Log
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Logging Popup/Form modal */}
      {showLogForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
              <div className="relative z-10">
                <h3 className="text-xl font-black flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
                  Log Produced Batch
                </h3>
                <p className="text-[9px] font-black text-blue-100 uppercase tracking-widest mt-1">Register new team batch results</p>
              </div>
              <button 
                onClick={() => setShowLogForm(false)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 hover:scale-105 rounded-full flex items-center justify-center text-xl font-black border border-white/10 transition-all cursor-pointer select-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">Product Category</label>
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl">
                  {(['chocolate', 'dragees'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setProductType(cat)}
                      className={cn(
                        "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        productType === cat ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Batch Number</label>
                  <input 
                    required 
                    type="text" 
                    value={batchNumber} 
                    onChange={e => setBatchNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono font-black text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Production Date</label>
                  <input 
                    required 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Product Name</label>
                <input 
                  required 
                  type="text" 
                  placeholder="e.g. Couverture Milk Chocolate Bars"
                  value={productName} 
                  onChange={e => setProductName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Qty Manufactured</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 25.5"
                    value={quantity} 
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Unit of Measure</label>
                  <select 
                    value={unit} 
                    onChange={e => setUnit(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none"
                  >
                    <option value="KG">Kilograms (KG)</option>
                    <option value="Pieces">Pieces</option>
                    <option value="Boxes">Boxes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1 font-mono">Product Source</label>
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
                    In-House Manufactured
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSourced(true)}
                    className={cn(
                      "py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                      isSourced ? "bg-white text-amber-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Sourced from Vendor
                  </button>
                </div>
              </div>

              {isSourced && (
                <div className="space-y-1.5 animate-[fadeIn_0.2s_ease-out]">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier / Sourced Company *</label>
                  <input 
                    required={isSourced}
                    type="text" 
                    placeholder="e.g. Barry Callebaut, Rich Products"
                    value={supplierName} 
                    onChange={e => setSupplierName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-amber-500/10 transition-all" 
                  />
                </div>
              )}

              <div className="pt-2">
                <button 
                  type="submit" 
                  className={cn(
                    "w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all",
                    isSourced
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  {isSourced ? "Confirm and Log Sourced Product" : "Confirm and Log Batch"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
