import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  serverTimestamp, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AttendanceRecord, PayrollRecord, UserProfile } from '../types';
import { 
  DollarSign, 
  Users, 
  Calendar, 
  Download, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Receipt,
  AlertCircle,
  FileText,
  Search,
  Filter,
  Check,
  Edit2,
  Printer,
  X,
  CreditCard,
  ChevronRight,
  Calculator,
  MapPin,
  Camera,
  Grid
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';

export const PayrollManagement: React.FC = () => {
  const { bakery } = useAuth();
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // States for Adjustment and View Modal
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [showSlip, setShowSlip] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  // New Tabbed States for Attendance views
  const [activeTab, setActiveTab] = useState<'ledger' | 'daily' | 'monthly_grid'>('ledger');
  const [selectedStaffForAttendance, setSelectedStaffForAttendance] = useState<UserProfile | null>(null);
  const [selectedDayStr, setSelectedDayStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [fullPhotoUrl, setFullPhotoUrl] = useState<string | null>(null);

  // Adjustment Inputs
  const [bonusInput, setBonusInput] = useState<number>(0);
  const [deductionsInput, setDeductionsInput] = useState<number>(0);
  const [overtimeHoursInput, setOvertimeHoursInput] = useState<number>(0);
  const [overtimeRateInput, setOvertimeRateInput] = useState<number>(150);
  const [baseSalaryInput, setBaseSalaryInput] = useState<number>(12000);

  // Time and duration helpers
  const formatTimeHelper = (firestoreTime: any) => {
    if (!firestoreTime) return '';
    try {
      const date = firestoreTime.toDate ? firestoreTime.toDate() : new Date(firestoreTime);
      return format(date, 'hh:mm a');
    } catch (e) {
      return '';
    }
  };

  const getShiftDurationHelper = (clockIn: any, clockOut: any) => {
    if (!clockIn || !clockOut) return '';
    try {
      const start = clockIn.toDate ? clockIn.toDate() : new Date(clockIn);
      const end = clockOut.toDate ? clockOut.toDate() : new Date(clockOut);
      const diffMs = end.getTime() - start.getTime();
      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hrs}h ${mins}m`;
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    if (!bakery?.id) return;

    // Load staff with aggressive deduplication to avoid multiple rows for the same employee
    const unsubStaff = onSnapshot(query(collection(db, 'users'), where('bakeryId', '==', bakery.id)), (snap) => {
      const eligibleUsers = snap.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile))
        .filter(u => {
          const roleLower = (u.role || '').toLowerCase();
          const isEligibleRole = ['bakery_admin', 'production', 'chocolate_production', 'sales'].includes(roleLower);
          return !u.isDeleted && isEligibleRole && !u.isSessionDoc;
        });

      const uniqueMap = new Map<string, UserProfile>();
      eligibleUsers.forEach(u => {
        const phoneKey = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : '';
        const emailKey = u.email ? u.email.toLowerCase().trim() : '';
        const nameKey = u.displayName ? u.displayName.toLowerCase().trim() : '';
        
        let existing = Array.from(uniqueMap.values()).find(ex => {
          const exPhone = ex.phone ? ex.phone.replace(/\D/g, '').slice(-10) : '';
          const exEmail = ex.email ? ex.email.toLowerCase().trim() : '';
          const exName = ex.displayName ? ex.displayName.toLowerCase().trim() : '';
          return (phoneKey && phoneKey.length >= 10 && exPhone === phoneKey) ||
                 (emailKey && exEmail === emailKey) ||
                 (nameKey && exName === nameKey);
        });

        if (existing) {
          if (!existing.allUids) {
            existing.allUids = [existing.uid];
          }
          if (!existing.allUids.includes(u.uid)) {
            existing.allUids.push(u.uid);
          }
        } else {
          uniqueMap.set(u.uid, {
            ...u,
            allUids: [u.uid]
          });
        }
      });
      setStaff(Array.from(uniqueMap.values()));
    });

    // Load payroll for selected month
    const unsubPayroll = onSnapshot(query(collection(db, 'payroll'), where('bakeryId', '==', bakery.id), where('period', '==', selectedMonth)), (snap) => {
      setPayroll(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord)));
    });

    return () => {
      unsubStaff();
      unsubPayroll();
    };
  }, [bakery?.id, selectedMonth]);

  useEffect(() => {
    if (!bakery?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const start = startOfMonth(new Date(selectedMonth));
    const end = endOfMonth(new Date(selectedMonth));

    const loadAttendance = async () => {
      const q = query(
        collection(db, 'attendance'),
        where('bakeryId', '==', bakery.id),
        where('date', '>=', format(start, 'yyyy-MM-dd')),
        where('date', '<=', format(end, 'yyyy-MM-dd'))
      );
      const snap = await getDocs(q);
      setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord)));
      setLoading(false);
    };

    loadAttendance();
  }, [bakery?.id, selectedMonth]);

  const generatePayroll = async () => {
    if (!bakery?.id) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const start = startOfMonth(new Date(selectedMonth));
      const end = endOfMonth(new Date(selectedMonth));
      const workingDays = eachDayOfInterval({ start, end }).filter(d => !isWeekend(d)).length;

      staff.forEach(member => {
        const memberAttendance = attendance.filter(a => member.allUids?.includes(a.userId) || a.userId === member.uid);
        const presentDays = memberAttendance.length;
        
        // Load custom rates if set
        const baseSalary = member.baseSalary || (member.role === 'chocolate_production' || member.role === 'bakery_admin' ? 15000 : 12000);
        const dynamicDefaultOTRate = Math.round(((baseSalary / workingDays) / 8) * 1.5);
        const overtimeRate = member.overtimeRate || dynamicDefaultOTRate;

        // Calculate actual overtime hours from clocks
        let totalOvertimeHours = 0;
        memberAttendance.forEach(record => {
          if (record.clockIn && record.clockOut) {
            try {
              const inTime = record.clockIn.toDate ? record.clockIn.toDate() : new Date(record.clockIn);
              const outTime = record.clockOut.toDate ? record.clockOut.toDate() : new Date(record.clockOut);
              const durationHrs = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
              if (durationHrs > 8) {
                totalOvertimeHours += (durationHrs - 8);
              }
            } catch (pErr) {
              console.error("Failed to parse clocked times:", pErr);
            }
          }
        });

        // Round to nearest 0.5 hour
        const overtimeHours = Math.round(totalOvertimeHours * 2) / 2;
        const dailyRate = baseSalary / workingDays;
        const basicEarned = dailyRate * presentDays;
        const overtimeEarned = overtimeHours * overtimeRate;
        const netPay = Math.round(basicEarned + overtimeEarned);

        const payrollId = `${member.uid}_${selectedMonth}`;
        const record: PayrollRecord = {
          id: payrollId,
          userId: member.uid,
          userName: member.displayName || 'Staff',
          bakeryId: bakery.id,
          period: selectedMonth,
          workingDays,
          presentDays,
          baseSalary,
          overtimeHours,
          overtimeRate,
          bonus: 0,
          deductions: 0,
          netPay,
          status: 'draft',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        batch.set(doc(db, 'payroll', payrollId), record);
      });

      await batch.commit();
      alert(`Payroll ledger generated for ${selectedMonth}!`);
    } catch (err) {
      console.error(err);
      alert("Failed to initialize payroll collection.");
    } finally {
      setProcessing(false);
    }
  };

  const calculateTotalPayroll = () => {
    return payroll.reduce((acc, p) => acc + p.netPay, 0);
  };

  const openAdjustment = (p: PayrollRecord) => {
    setSelectedRecord(p);
    setBonusInput(p.bonus || 0);
    setDeductionsInput(p.deductions || 0);
    setOvertimeHoursInput(p.overtimeHours || 0);
    const fallbackOT = Math.round(((p.baseSalary / p.workingDays) / 8) * 1.5);
    setOvertimeRateInput(p.overtimeRate || fallbackOT);
    setBaseSalaryInput(p.baseSalary || 12000);
    setShowAdjust(true);
  };

  const saveAdjustment = async () => {
    if (!selectedRecord) return;
    try {
      const dailyRate = baseSalaryInput / selectedRecord.workingDays;
      const basicEarned = dailyRate * selectedRecord.presentDays;
      const overtimeEarned = overtimeHoursInput * overtimeRateInput;
      const calculatedNet = Math.round(basicEarned + overtimeEarned + bonusInput - deductionsInput);

      await updateDoc(doc(db, 'payroll', selectedRecord.id), {
        baseSalary: baseSalaryInput,
        overtimeHours: overtimeHoursInput,
        overtimeRate: overtimeRateInput,
        bonus: bonusInput,
        deductions: deductionsInput,
        netPay: calculatedNet,
        updatedAt: serverTimestamp()
      });

      setShowAdjust(false);
      setSelectedRecord(null);
      alert('Payroll details updated successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to save adjustment values.');
    }
  };

  const changeStatus = async (recordId: string, status: 'draft' | 'approved' | 'paid') => {
    try {
      await updateDoc(doc(db, 'payroll', recordId), {
        status,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (confirm("Are you sure you want to delete this specific draft? You can regenerate it anytime.")) {
      try {
        await deleteDoc(doc(db, 'payroll', recordId));
        setShowAdjust(false);
        setSelectedRecord(null);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const exportReportCSV = () => {
    if (payroll.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = [
      "Employee ID",
      "Employee Name",
      "Period",
      "Present Days",
      "Working Days",
      "Base Salary",
      "Overtime Hours",
      "Overtime Rate",
      "Bonus Added",
      "Deductions",
      "Net Payout",
      "Status"
    ];

    const rows = payroll.map(p => {
      const basicEarned = (p.baseSalary / p.workingDays) * p.presentDays;
      return [
        p.userId.slice(-6),
        p.userName,
        p.period,
        p.presentDays,
        p.workingDays,
        p.baseSalary,
        p.overtimeHours,
        p.overtimeRate || Math.round(((p.baseSalary / p.workingDays) / 8) * 1.5),
        p.bonus,
        p.deductions,
        p.netPay,
        p.status
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `BakeSync_Payroll_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-100 flex flex-col justify-between h-56 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <DollarSign size={100} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 opacity-60">Total Month Payout</p>
            <h2 className="text-4xl font-black">{formatCurrency(calculateTotalPayroll())}</h2>
          </div>
          <div className="flex justify-between items-end">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60">
              <p>Period: {selectedMonth}</p>
            </div>
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col justify-between h-56">
          <div className="flex justify-between items-start">
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Staff</p>
               <h3 className="text-2xl font-black text-slate-900">{staff.length} Members</h3>
             </div>
             <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
               <Users size={22} />
             </div>
          </div>
          <div className="space-y-4">
             <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[70%]" />
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attendance Managed via GPS</p>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col justify-between h-56">
          <div className="flex justify-between items-start">
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Select Period</p>
               <input 
                 type="month" 
                 value={selectedMonth}
                 onChange={(e) => setSelectedMonth(e.target.value)}
                 className="mt-2 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-black text-xs text-slate-900 uppercase"
               />
             </div>
             <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
               <Calendar size={22} />
             </div>
          </div>
          <button 
            onClick={generatePayroll}
            disabled={processing || staff.length === 0}
            className="w-full bg-slate-900 text-white rounded-2xl py-4 text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            {processing ? (
               <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : <Receipt size={16} />}
            Generate Ledger
          </button>
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1.5 max-w-lg shadow-sm border border-slate-200">
        <button
          onClick={() => setActiveTab('ledger')}
          className={cn(
            "flex-1 py-3 text-[10.5px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
            activeTab === 'ledger' ? "bg-white text-indigo-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Receipt size={14} />
          Payroll Ledger
        </button>
        <button
          onClick={() => setActiveTab('daily')}
          className={cn(
            "flex-1 py-3 text-[10.5px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
            activeTab === 'daily' ? "bg-white text-indigo-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Clock size={14} />
          Daily Board
        </button>
        <button
          onClick={() => setActiveTab('monthly_grid')}
          className={cn(
            "flex-1 py-3 text-[10.5px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
            activeTab === 'monthly_grid' ? "bg-white text-indigo-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Grid size={14} />
          Monthly Matrix
        </button>
      </div>

      {activeTab === 'ledger' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
             <div className="flex items-center gap-3">
                <FileText className="text-indigo-600" size={20} />
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Payroll Register</h3>
             </div>
             <button 
               onClick={exportReportCSV}
               className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest flex items-center gap-2 transition-all border border-slate-200 px-4 py-2 rounded-xl bg-white shadow-sm"
             >
               <Download size={14} /> Export CSV Ledger
             </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">
                  <th className="px-8 py-4">Employee</th>
                  <th className="px-8 py-4 text-center">Days Worked</th>
                  <th className="px-8 py-4 text-center">Overtime info</th>
                  <th className="px-8 py-4 text-center">Adjustments</th>
                  <th className="px-8 py-4 text-center">Total Net Pay</th>
                  <th className="px-8 py-4 text-center">Payroll Status</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {payroll.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="w-8 h-8 text-slate-100 animate-bounce" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No payroll records for this period</p>
                        <button 
                          onClick={generatePayroll}
                          className="text-[10px] font-black text-indigo-500 hover:underline cursor-pointer"
                        >
                          Generate draft ledger now
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  payroll.map(p => {
                    const basicEarned = (p.baseSalary / p.workingDays) * p.presentDays;
                    const overtimeEarned = p.overtimeHours * (p.overtimeRate || Math.round(((p.baseSalary / p.workingDays) / 8) * 1.5));
                    const adjustmentsTotal = (p.bonus || 0) - (p.deductions || 0);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-6">
                          <div 
                            onClick={() => {
                              const match = staff.find(s => s.uid === p.userId);
                              if (match) setSelectedStaffForAttendance(match);
                            }}
                            className="flex items-center gap-4 cursor-pointer group hover:bg-slate-100/30 p-1.5 rounded-2xl transition-all"
                            title="Click to view full attendance diary"
                          >
                            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white rounded-xl flex items-center justify-center font-black text-xs text-indigo-600 uppercase transition-colors shrink-0">
                              {p.userName.slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                                {p.userName}
                                <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-all text-indigo-500" />
                              </p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ID: {p.userId.slice(-6)} • View Attendance</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="inline-flex flex-col items-center">
                            <p className="text-xs font-black text-slate-900">{p.presentDays} / {p.workingDays} Days</p>
                            <div className="h-0.5 w-10 bg-slate-100 rounded-full mt-1">
                              <div className="h-full bg-blue-500" style={{ width: `${(p.presentDays/p.workingDays)*100}%` }} />
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 mt-1">₹{Math.round(basicEarned).toLocaleString()}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="inline-flex flex-col items-center">
                            <p className="text-xs font-black text-slate-900">{p.overtimeHours} hrs</p>
                            <p className="text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md mt-1">₹{Math.round(overtimeEarned).toLocaleString()}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="inline-flex flex-col items-center">
                            <p className="text-xs font-black text-slate-900">
                              {adjustmentsTotal >= 0 ? `+₹${adjustmentsTotal}` : `-₹${Math.abs(adjustmentsTotal)}`}
                            </p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                              Bonus: ₹{p.bonus || 0} | Ded: ₹{p.deductions || 0}
                            </p>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <p className="text-sm font-black text-indigo-600">{formatCurrency(p.netPay)}</p>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className={cn(
                              "px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border",
                              p.status === 'paid' ? "bg-green-50 border-green-100 text-green-600" :
                              p.status === 'approved' ? "bg-blue-50 border-blue-100 text-blue-600" :
                              "bg-amber-50 border-amber-100 text-amber-600"
                            )}>
                              {p.status}
                            </span>

                            <div className="flex gap-1.5 shrink-0">
                              {p.status === 'draft' && (
                                <button 
                                  onClick={() => changeStatus(p.id, 'approved')}
                                  className="text-[8px] font-black text-blue-600 hover:underline uppercase tracking-wider"
                                >
                                  Approve
                                </button>
                              )}
                              {p.status === 'approved' && (
                                <>
                                  <button 
                                    onClick={() => changeStatus(p.id, 'paid')}
                                    className="text-[8px] font-black text-green-600 lg:px-2 py-0.5 hover:underline uppercase tracking-wider"
                                  >
                                    Mark Paid
                                  </button>
                                  <span className="text-slate-300">|</span>
                                  <button 
                                    onClick={() => changeStatus(p.id, 'draft')}
                                    className="text-[8px] font-black text-slate-400 hover:underline uppercase tracking-wider"
                                  >
                                    Revert
                                  </button>
                                </>
                              )}
                              {p.status === 'paid' && (
                                <button 
                                  onClick={() => changeStatus(p.id, 'approved')}
                                  className="text-[8px] font-black text-slate-400 hover:underline uppercase tracking-wider"
                                >
                                  Revert
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => openAdjustment(p)}
                              className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-all flex items-center gap-1 text-[10px] font-black uppercase tracking-wider shrink-0"
                              title="Adjust Overtime and Bonus/Deductions"
                            >
                              <Edit2 size={12} />
                              Adjust
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedRecord(p);
                                setShowSlip(true);
                              }}
                              className="bg-indigo-50 border border-indigo-100 text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1 text-[10px] font-black uppercase tracking-wider shrink-0"
                              title="View Staff Salary Slip"
                            >
                              <Printer size={12} />
                              Payslip
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Attendance Board View */}
      {activeTab === 'daily' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="text-indigo-600" size={20} />
              <div>
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Daily Attendance Board</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Chronological record summary for chosen day</p>
              </div>
            </div>

            {/* Date Swiper */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const curr = new Date(selectedDayStr);
                  curr.setDate(curr.getDate() - 1);
                  setSelectedDayStr(format(curr, 'yyyy-MM-dd'));
                }}
                className="p-2 border border-slate-200 hover:bg-slate-100 bg-white rounded-xl text-slate-600 transition-colors"
                title="Previous Day"
              >
                <ChevronRight size={14} className="rotate-180" />
              </button>
              <input
                type="date"
                value={selectedDayStr}
                onChange={e => e.target.value && setSelectedDayStr(e.target.value)}
                className="bg-white border border-slate-200 outline-none rounded-xl px-4 py-2 font-black text-xs text-slate-800 uppercase text-center"
              />
              <button
                onClick={() => {
                  const curr = new Date(selectedDayStr);
                  curr.setDate(curr.getDate() + 1);
                  setSelectedDayStr(format(curr, 'yyyy-MM-dd'));
                }}
                className="p-2 border border-slate-200 hover:bg-slate-100 bg-white rounded-xl text-slate-600 transition-colors"
                title="Next Day"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-bold">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-8 py-4">Employee</th>
                  <th className="px-8 py-4 text-center">Duty Status</th>
                  <th className="px-8 py-4 text-center">Clock In</th>
                  <th className="px-8 py-4 text-center">Clock Out</th>
                  <th className="px-8 py-4 text-center">Hours Worked</th>
                  <th className="px-8 py-4 text-center">Self Photo Verify</th>
                  <th className="px-8 py-4">Verification Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {staff.map((member, idx) => {
                  const rec = attendance.find(a => (member.allUids?.includes(a.userId) || a.userId === member.uid) && a.date === selectedDayStr);
                  
                  return (
                    <tr key={`${member.uid || 'stub'}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5">
                        <div 
                          onClick={() => setSelectedStaffForAttendance(member)}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <div className="w-9 h-9 bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all text-slate-600 font-black text-[11px] rounded-lg flex items-center justify-center uppercase shrink-0">
                            {member.displayName?.slice(0, 2) || 'S'}
                          </div>
                          <div>
                            <p className="text-slate-900 group-hover:text-indigo-600 font-black transition-all">{member.displayName}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{member.role?.replace('_', ' ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        {rec ? (
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wider border",
                            rec.status === 'present' ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                            rec.status === 'late' ? "bg-amber-50 border-amber-100 text-amber-700" :
                            "bg-purple-50 border-purple-100 text-purple-700"
                          )}>
                            {rec.status}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-rose-50 border border-rose-100 text-rose-600">
                            ABSENT
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-center font-mono text-slate-700 font-bold">
                        {rec ? formatTimeHelper(rec.clockIn) : '--:--'}
                      </td>
                      <td className="px-8 py-5 text-center font-mono text-slate-700 font-bold">
                        {rec ? (rec.clockOut ? formatTimeHelper(rec.clockOut) : (
                          <span className="text-[8px] bg-sky-50 text-sky-600 border border-sky-100 px-1.5 py-0.5 rounded font-black tracking-widest animate-pulse">
                            ACTIVE
                          </span>
                        )) : '--:--'}
                      </td>
                      <td className="px-8 py-5 text-center font-mono font-black text-indigo-600">
                        {rec ? (rec.clockOut ? getShiftDurationHelper(rec.clockIn, rec.clockOut) : 'In Progress') : '--'}
                      </td>
                      <td className="px-8 py-5 text-center">
                        {rec?.photoUrl ? (
                          <button
                            onClick={() => setFullPhotoUrl(rec.photoUrl!)}
                            className="inline-block relative group"
                          >
                            <img
                              referrerPolicy="no-referrer"
                              src={rec.photoUrl}
                              alt="Scan"
                              className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-sm cursor-zoom-in hover:brightness-90 transition-all shrink-0"
                            />
                            <div className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-lg text-[8px] font-black transition-opacity uppercase">
                              Zoom
                            </div>
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-300 font-bold uppercase tracking-wider select-none">No Photo</span>
                        )}
                      </td>
                      <td className="px-8 py-5 max-w-xs text-slate-500 text-[10.5px]">
                        {rec?.location ? (
                          <div className="flex items-center gap-1.5 font-bold">
                            <MapPin size={11} className="text-indigo-500 shrink-0" />
                            <span>GPS: {rec.location.lat.toFixed(4)}, {rec.location.lng.toFixed(4)}</span>
                            {rec.outOfOfficeDuty && (
                              <span className="bg-sky-50 text-sky-600 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-sky-100 ml-1.5 shrink-0">
                                Official Out-Duty
                              </span>
                            )}
                          </div>
                        ) : (
                          rec ? <span className="text-slate-400 font-bold">Manual override log</span> : <span className="text-slate-300 font-bold">--</span>
                        )}
                        {rec?.notes && (
                          <p className="text-[9.5px] italic text-slate-400 truncate mt-1">"{rec.notes}"</p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly grid matrix spreadsheet */}
      {activeTab === 'monthly_grid' && (() => {
        const activeDateObj = new Date(selectedMonth + '-01');
        const periodStart = startOfMonth(activeDateObj);
        const periodEnd = endOfMonth(activeDateObj);
        const daysInPeriod = eachDayOfInterval({ start: periodStart, end: periodEnd });

        return (
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Grid className="text-indigo-600" size={20} />
                <div>
                  <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Monthly Attendance Matrix</h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">Spreadsheet registry grid for {format(activeDateObj, 'MMMM yyyy')}</p>
                </div>
              </div>
              <div className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Present</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Late</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Absent</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-100" /> Weekend</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 select-none">
                    <th className="px-8 py-5 min-w-[200px] sticky left-0 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-100">Staff Employee</th>
                    {daysInPeriod.map(day => {
                      const isEndWe = isWeekend(day);
                      return (
                        <th 
                          key={format(day, 'yyyy-MM-dd')}
                          className={cn(
                            "p-3 text-center min-w-[38px] border-r border-slate-100 text-[9px] font-black",
                            isEndWe ? "bg-slate-100/50 text-slate-400" : "text-slate-650"
                          )}
                        >
                          <span className="block text-[8px] opacity-60 font-black">{format(day, 'E').slice(0, 1)}</span>
                          <span className="block mt-0.5">{format(day, 'dd')}</span>
                        </th>
                      )
                    })}
                    <th className="px-6 py-5 text-center text-slate-900 border-l border-slate-100">Stats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-xs">
                  {staff.map((member, idx) => {
                    const memberAttendance = attendance.filter(a => member.allUids?.includes(a.userId) || a.userId === member.uid);
                    const presentCount = memberAttendance.filter(a => a.status === 'present').length;
                    const lateCount = memberAttendance.filter(a => a.status === 'late' || a.status === 'half_day').length;

                    return (
                      <tr key={`${member.uid || 'stub'}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5 sticky left-0 bg-white hover:bg-slate-50/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-slate-100 shrink-0">
                          <div 
                            onClick={() => setSelectedStaffForAttendance(member)}
                            className="flex items-center gap-3 cursor-pointer group"
                          >
                            <div className="w-8 h-8 bg-indigo-50 border border-indigo-100 group-hover:bg-indigo-600 transition-colors rounded-lg flex items-center justify-center font-black text-[10px] text-indigo-600 group-hover:text-white uppercase shrink-0">
                              {member.displayName?.slice(0, 2) || 'S'}
                            </div>
                            <div>
                              <p className="text-slate-900 group-hover:text-indigo-600 transition-all font-black leading-tight">{member.displayName}</p>
                              <p className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">{member.role?.replace('_', ' ')}</p>
                            </div>
                          </div>
                        </td>
                        
                        {daysInPeriod.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const rec = attendance.find(a => (member.allUids?.includes(a.userId) || a.userId === member.uid) && a.date === dateStr);
                          const isEndWe = isWeekend(day);

                          return (
                            <td 
                              key={dateStr}
                              className={cn(
                                "p-3 text-center border-r border-slate-100",
                                isEndWe && "bg-slate-50/40"
                              )}
                              title={`${member.displayName} on ${format(day, 'dd MMMM')} ${rec ? `[Status: ${rec.status.toUpperCase()}]` : '[Status: Unmarked]'}`}
                            >
                              <div className="flex items-center justify-center">
                                {rec ? (
                                  rec.status === 'present' ? (
                                    <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full border border-emerald-600 hover:scale-125 transition-transform flex items-center justify-center text-[7px] text-white">✓</div>
                                  ) : (
                                    <div className="w-3.5 h-3.5 bg-amber-500 rounded-full border border-amber-600 hover:scale-125 transition-transform flex items-center justify-center text-[7px] text-white">!</div>
                                  )
                                ) : (
                                  isEndWe ? (
                                    <div className="w-1.5 h-1.5 bg-slate-250 rounded" />
                                  ) : (
                                    <div className="w-2.5 h-2.5 bg-rose-50 border border-rose-250 text-rose-600 text-[6px] font-black rounded-full flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all select-none">×</div>
                                  )
                                )}
                              </div>
                            </td>
                          )
                        })}

                        <td className="px-6 py-5 text-center border-l border-slate-100 bg-slate-50/20 whitespace-nowrap">
                          <div className="flex flex-col items-center gap-0.5 text-[9px] font-bold">
                            <span className="text-emerald-600 uppercase">Pres: {presentCount}d</span>
                            {lateCount > 0 && <span className="text-amber-600 uppercase">Late: {lateCount}d</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Adjust Draft Modal */}
      {showAdjust && selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-950 text-white flex justify-between items-center shrink-0">
              <div>
                <h2 className="font-black sm:text-base text-white uppercase tracking-wider">Salary Adjustments</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">Draft Ledger for {selectedRecord.userName}</p>
              </div>
              <button 
                onClick={() => { setShowAdjust(false); setSelectedRecord(null); }} 
                className="text-white/60 hover:text-white text-2xl px-2 focus:outline-none font-black"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 text-left">
              {/* Dynamic summary preview */}
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interim Payable</p>
                  <p className="text-2xl font-black text-slate-950 mt-1">
                    {formatCurrency(
                      Math.max(0, Math.round(((baseSalaryInput / selectedRecord.workingDays) * selectedRecord.presentDays) + (overtimeHoursInput * overtimeRateInput) + bonusInput - deductionsInput))
                    )}
                  </p>
                </div>
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Calculator size={18} />
                </div>
              </div>

              {/* Base Salary Rate configuration overrides */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Configure Base Salary (₹)</label>
                <input 
                  type="number" 
                  value={baseSalaryInput} 
                  onChange={e => setBaseSalaryInput(Number(e.target.value))} 
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-xs" 
                />
              </div>

              {/* Overtime fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Overtime Hours</label>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={overtimeHoursInput} 
                    onChange={e => setOvertimeHoursInput(Number(e.target.value))} 
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-xs" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">OT Rate (₹/hour)</label>
                  <input 
                    type="number" 
                    value={overtimeRateInput} 
                    onChange={e => setOvertimeRateInput(Number(e.target.value))} 
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-xs" 
                  />
                </div>
              </div>

              {/* Bonus and Deductions overrides */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-green-600 uppercase tracking-widest px-1">Added Bonus (₹)</label>
                  <input 
                    type="number" 
                    value={bonusInput} 
                    onChange={e => setBonusInput(Number(e.target.value))} 
                    className="w-full bg-green-50/50 border border-green-200 p-3 rounded-xl font-bold text-xs focus:ring-1 focus:ring-green-500" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-rose-600 uppercase tracking-widest px-1">Deductions (₹)</label>
                  <input 
                    type="number" 
                    value={deductionsInput} 
                    onChange={e => setDeductionsInput(Number(e.target.value))} 
                    className="w-rose-50/50 border border-rose-200 p-3 rounded-xl font-bold text-xs focus:ring-1 focus:ring-rose-500 w-full" 
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => deleteRecord(selectedRecord.id)}
                  className="px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all transition-colors"
                >
                  Discard Draft
                </button>
                <button 
                  type="button" 
                  onClick={saveAdjustment}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all"
                >
                  Apply & Save Ledger
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Salary Slip Print Modal */}
      {showSlip && selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <h2 className="font-black text-sm uppercase tracking-widest text-white">Employee Payslip Summary</h2>
              <button 
                onClick={() => { setShowSlip(false); setSelectedRecord(null); }} 
                className="text-white/60 hover:text-white text-2xl px-2 focus:outline-none"
              >
                ×
              </button>
            </div>

            {/* Printable Frame */}
            <div id="print-content" className="p-8 overflow-y-auto space-y-6 text-left bg-white text-slate-900">
              <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-950 mb-0.5">{bakery?.name || "BakeSync Enterprise"}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Monthly Salary Settlement Statement</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period</p>
                  <p className="text-[11px] font-black text-slate-800 bg-slate-50 py-1 px-3 rounded-lg border mt-1 select-none inline-block">{selectedRecord.period}</p>
                </div>
              </div>

              {/* Employee Bio */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-100 rounded-xl text-xs font-bold text-slate-600">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee Name</p>
                  <p className="text-slate-900 font-black">{selectedRecord.userName}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee ID</p>
                  <p className="text-slate-900">ID-{selectedRecord.userId.slice(-6).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Days Worked</p>
                  <p className="text-slate-900 font-black">{selectedRecord.presentDays} / {selectedRecord.workingDays} working days</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Base Monthly Salary</p>
                  <p className="text-slate-900">₹{(selectedRecord.baseSalary || 12000).toLocaleString()}</p>
                </div>
              </div>

              {/* Settlement Matrix */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ledger Balance Sheet</p>
                
                <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                  {/* Basic Salary Earned */}
                  <div className="flex justify-between p-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="font-bold text-slate-600">
                      Basic Salary Earned
                      <span className="block text-[9.5px] font-medium text-slate-400 mt-0.5">
                        (₹{(selectedRecord.baseSalary).toLocaleString()} / {selectedRecord.workingDays} days) × {selectedRecord.presentDays} days
                      </span>
                    </div>
                    <div className="font-black text-slate-900">
                      ₹{Math.round((selectedRecord.baseSalary / selectedRecord.workingDays) * selectedRecord.presentDays).toLocaleString()}
                    </div>
                  </div>

                  {/* Overtime Pay */}
                  <div className="flex justify-between p-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="font-bold text-slate-600">
                      Overtime Allowance
                      <span className="block text-[9.5px] font-medium text-slate-400 mt-0.5">
                        {selectedRecord.overtimeHours} hours worked × ₹{selectedRecord.overtimeRate || Math.round(((selectedRecord.baseSalary / selectedRecord.workingDays) / 8) * 1.5)}/hr
                      </span>
                    </div>
                    <div className="font-black text-emerald-600">
                      +₹{Math.round(selectedRecord.overtimeHours * (selectedRecord.overtimeRate || Math.round(((selectedRecord.baseSalary / selectedRecord.workingDays) / 8) * 1.5))).toLocaleString()}
                    </div>
                  </div>

                  {/* Bonus */}
                  <div className="flex justify-between p-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="font-bold text-slate-600">
                      Performance Bonus / Incentive
                      <span className="block text-[9.5px] font-medium text-slate-400 mt-0.5">Discretionary adjustments</span>
                    </div>
                    <div className="font-black text-emerald-600">+₹{(selectedRecord.bonus || 0).toLocaleString()}</div>
                  </div>

                  {/* Deductions */}
                  <div className="flex justify-between p-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="font-bold text-slate-600">
                      Salary Deductions
                      <span className="block text-[9.5px] font-medium text-slate-400 mt-0.5">Unpaid leave, cash advances, loss-cut</span>
                    </div>
                    <div className="font-black text-rose-600">-₹{(selectedRecord.deductions || 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {/* Total Payout Footer */}
              <div className="bg-indigo-600 text-white rounded-xl p-4 flex justify-between items-center mt-4 shadow-md">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#E0E7FF]">Net Consolidated Payout</p>
                  <p className="text-[9px] font-bold text-[#C7D2FE] uppercase tracking-wide">Status: {selectedRecord.status.toUpperCase()}</p>
                </div>
                <div className="text-right text-xl font-black">
                  {formatCurrency(selectedRecord.netPay)}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => { setShowSlip(false); setSelectedRecord(null); }}
                className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all border border-slate-200"
              >
                Close Slip
              </button>
              <button 
                onClick={() => {
                  const printContents = document.getElementById('print-content')?.innerHTML;
                  const originalContents = document.body.innerHTML;
                  if (printContents) {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Salary_Slip_${selectedRecord.userName}</title>
                            <style>
                              body { font-family: system-ui, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
                              .text-indigo-600 { color: #4f46e5; }
                              .text-slate-400 { color: #94a3b8; }
                              .bg-slate-50 { background-color: #f8fafc; }
                              .border { border: 1px solid #e2e8f0; }
                              .border-b { border-bottom: 1px solid #e2e8f0; }
                              .border-t { border-top: 1px solid #e2e8f0; }
                              .pb-5 { padding-bottom: 20px; }
                              .pt-4 { padding-top: 16px; }
                              .p-4 { padding: 16px; }
                              .p-3 { padding: 12px; }
                              .mt-4 { margin-top: 16px; }
                              .mb-0.5 { margin-bottom: 2px; }
                              .mb-1 { margin-bottom: 4px; }
                              .rounded-xl { border-radius: 12px; }
                              .flex { display: flex; }
                              .justify-between { justify-content: space-between; }
                              .items-start { align-items: flex-start; }
                              .items-center { align-items: center; }
                              .grid { display: grid; }
                              .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                              .gap-4 { gap: 16px; }
                              .text-right { text-align: right; }
                              .text-xl { font-size: 20px; }
                              .text-2xl { font-size: 24px; }
                              .font-black { font-weight: 900; }
                              .font-bold { font-weight: 700; }
                              .text-xs { font-size: 12px; }
                              .text-sm { font-size: 14px; }
                              .uppercase { text-transform: uppercase; }
                              .tracking-wider { letter-spacing: 0.05em; }
                              .tracking-widest { letter-spacing: 0.1em; }
                              .tracking-tight { letter-spacing: -0.025em; }
                              .bg-indigo-600 { background-color: #4f46e5; color: white !important; }
                              .bg-indigo-600 * { color: white !important; }
                              .text-emerald-600 { color: #059669; }
                              .text-rose-600 { color: #e11d48; }
                              .inline-block { display: inline-block; }
                              .divide-y > * + * { border-top: 1px solid #f1f5f9; }
                            </style>
                          </head>
                          <body>
                            ${printContents}
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                      printWindow.focus();
                      setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                      }, 400);
                    }
                  }
                }}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-1"
              >
                <Printer size={12} />
                Print Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Employee Attendance Diary Modal */}
      {selectedStaffForAttendance && (() => {
        const selectedMemberRecords = attendance.filter(a => selectedStaffForAttendance.allUids?.includes(a.userId) || a.userId === selectedStaffForAttendance.uid);
        const presentDaysCount = selectedMemberRecords.length;
        const activeDateObj = new Date(selectedMonth + '-01');
        const monthStart = startOfMonth(activeDateObj);
        const monthEnd = endOfMonth(activeDateObj);
        const daysOfThisMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white max-w-2xl w-full rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
              {/* Header Box */}
              <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black sm:text-base text-xs uppercase shadow-lg shadow-indigo-600/20 shrink-0">
                    {selectedStaffForAttendance.displayName?.slice(0, 2) || 'ST'}
                  </div>
                  <div>
                    <h2 className="font-black text-sm uppercase tracking-wide text-white">{selectedStaffForAttendance.displayName}</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Role: {selectedStaffForAttendance.role?.replace('_', ' ')} • ID: {selectedStaffForAttendance.uid.slice(-6)}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStaffForAttendance(null)} 
                  className="text-white/60 hover:text-white text-3xl px-2 focus:outline-none font-black"
                >
                  ×
                </button>
              </div>

              {/* Stats Strip */}
              <div className="grid grid-cols-3 gap-3 px-8 py-5 bg-slate-50 border-b border-slate-100 shrink-0 select-none">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-center text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Days Present</p>
                  <p className="text-xl font-black text-indigo-600 mt-1">{presentDaysCount} Days</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-center text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Late Arrivals</p>
                  <p className="text-xl font-black text-amber-500 mt-1">
                    {selectedMemberRecords.filter(r => r.status === 'late' || r.status === 'half_day').length} Days
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-center text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Period Scope</p>
                  <p className="text-xs font-black text-slate-800 mt-1 uppercase truncate">{format(activeDateObj, 'MMMM yyyy')}</p>
                </div>
              </div>

              {/* Attendance Diary Chronological logs */}
              <div className="p-8 overflow-y-auto space-y-4 custom-scrollbar flex-1 text-left bg-white">
                <p className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest mb-2">Chronological Month Tracker</p>
                
                <div className="space-y-3">
                  {[...daysOfThisMonth].reverse().map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const r = selectedMemberRecords.find(rec => rec.date === dateStr);
                    const isWeState = isWeekend(day);

                    return (
                      <div 
                        key={dateStr}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl border transition-all text-xs",
                          r ? (r.status === 'present' ? "bg-emerald-50/25 border-emerald-100/50 hover:bg-emerald-50/50" : "bg-amber-50/25 border-amber-100/50 hover:bg-amber-50/50") :
                          isWeState ? "bg-slate-50/50 border-slate-150 text-slate-400 select-none" : "bg-rose-50/10 border-rose-100 hover:bg-rose-50/20"
                        )}
                      >
                        {/* Day and date labels */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className={cn(
                            "w-10 py-1.5 rounded-xl flex flex-col items-center justify-center text-center font-black select-none",
                            r ? "bg-white border" : "bg-slate-100"
                          )}>
                            <p className="text-[7.5px] uppercase opacity-60 tracking-wider font-bold">{format(day, 'E')}</p>
                            <p className="text-sm mt-0.5 leading-none">{format(day, 'dd')}</p>
                          </div>
                          <div>
                            <p className="font-black text-slate-800">{format(day, 'MMMM dd, yyyy')}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[9.5px] text-slate-400 font-bold uppercase">
                              {r ? (
                                <>
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[8px] font-black",
                                    r.status === 'present' ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  )}>
                                    {r.status}
                                  </span>
                                  <span>•</span>
                                  <span>In: {formatTimeHelper(r.clockIn)}</span>
                                  {r.clockOut && <span>• Out: {formatTimeHelper(r.clockOut)}</span>}
                                </>
                              ) : (
                                isWeState ? <span className="text-slate-400 font-black">Weekend</span> : <span className="text-rose-500 font-black">Absent / Unmarked</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Record metrics & images */}
                        {r && (
                          <div className="flex items-center gap-4 mt-3 sm:mt-0 justify-between sm:justify-end">
                            <div className="text-right sm:max-w-[180px]">
                              {r.clockOut ? (
                                <p className="font-mono font-black text-[11px] text-slate-700 bg-white border px-2 py-1 rounded-lg shadow-sm">
                                  Duration: {getShiftDurationHelper(r.clockIn, r.clockOut)}
                                </p>
                              ) : (
                                <span className="text-[8px] bg-sky-50 text-sky-600 border border-sky-100 px-2 py-1 rounded-lg font-black tracking-widest animate-pulse">
                                  ON DUTY
                                </span>
                              )}
                              {r.location && (
                                <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-slate-400 font-bold">
                                  <MapPin size={9} className="text-indigo-500 shrink-0" />
                                  <span className="truncate">Validated Location</span>
                                </div>
                              )}
                            </div>

                            {/* Verification pic */}
                            {r.photoUrl && (
                              <button
                                onClick={() => setFullPhotoUrl(r.photoUrl!)}
                                className="relative group shrink-0"
                              >
                                <img
                                  referrerPolicy="no-referrer"
                                  src={r.photoUrl}
                                  alt="Verified Selfie Face"
                                  className="w-10 h-10 object-cover rounded-xl border border-slate-200"
                                />
                                <div className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-xl text-[7px] font-black tracking-tighter uppercase transition-opacity">
                                  Zoom
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Close Box */}
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                <button 
                  onClick={() => setSelectedStaffForAttendance(null)}
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all"
                >
                  Close History Ledger
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Screen Photo Zoom Overlay */}
      {fullPhotoUrl && (
        <div 
          onClick={() => setFullPhotoUrl(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
        >
          <div className="relative max-w-md w-full rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl p-1.5" onClick={e => e.stopPropagation()}>
            <img 
              referrerPolicy="no-referrer"
              src={fullPhotoUrl} 
              alt="High Resolution Face Log Verification Scan" 
              className="w-full h-auto max-h-[75vh] object-contain rounded-2xl"
            />
            <button
              onClick={() => setFullPhotoUrl(null)}
              className="absolute top-4 right-4 w-9 h-9 bg-black/60 hover:bg-black/90 text-white rounded-full flex items-center justify-center text-xl font-black shadow-lg transition-colors border border-white/10"
              title="Close Scan Image"
            >
              ×
            </button>
            <p className="text-center text-[9px] font-black text-slate-400 uppercase tracking-widest py-3 mt-1.5">GPS Facial scan Log Check-In Stamp Verified Record</p>
          </div>
        </div>
      )}
    </div>
  );
};

