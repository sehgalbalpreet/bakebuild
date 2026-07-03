import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc,
  serverTimestamp, 
  getDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AttendanceRecord } from '../types';
import { savePendingPunch, getPendingPunches, deletePendingPunch, PendingPunch } from '../utils/offlineDb';
import { 
  Clock, 
  Camera, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  User, 
  AlertCircle,
  Timer,
  LogIn,
  LogOut,
  MapPin,
  ChevronRight,
  Fingerprint,
  Search,
  Filter,
  Trash2,
  Plus,
  Eye,
  RefreshCw,
  Users,
  WifiOff,
  Database
} from 'lucide-react';
import { format, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '../lib/utils';
import { loadFaceModels, getFaceDescriptorFromVideo, compareFaceDescriptors } from '../utils/biometric';
import { FaceEnrollmentModal } from '../components/FaceEnrollmentModal';


const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000; // Radius of the earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in meters
  return d;
};

const formatRecordTime = (ts: any) => {
  if (!ts) return '—';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return format(d, 'hh:mm a');
};

const AdminAttendanceView: React.FC = () => {
  const { bakery, profile } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Selected State
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  
  // Correction Form State
  const [editStaffId, setEditStaffId] = useState('');
  const [editDate, setEditDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editClockIn, setEditClockIn] = useState('09:00');
  const [editClockOut, setEditClockOut] = useState('');
  const [editStatus, setEditStatus] = useState<'present' | 'absent' | 'late' | 'half_day'>('present');
  const [editOutOfOffice, setEditOutOfOffice] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  // Listen to Staff and Attendance
  useEffect(() => {
    if (!bakery?.id) return;
    
    // Listen to staff users
    const staffQuery = query(collection(db, 'users'), where('bakeryId', '==', bakery.id));
    const unsubStaff = onSnapshot(staffQuery, (snap) => {
      const rawList = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() as any }));
      
      // Filter out admins/dealers/disabled/deleted
      const eligibleUsers = rawList.filter((u: any) => {
        const roleLower = (u.role || '').toLowerCase();
        // Exclude anyone with "dealer" in their role name (e.g. dealer, dealer_admin, dealer_staff, DEALER_ADMIN)
        const isDealerRole = roleLower.includes('dealer');
        // Exclude admins (super_admin, bakery_admin)
        const isExcludedAdmin = roleLower.includes('admin') || roleLower === 'super_admin';
        // Exclude disabled or deleted accounts
        const isDisabledOrDeleted = 
          u.role === 'disabled' || 
          u.status === 'disabled' || 
          u.disabled === true || 
          u.isDeleted === true || 
          u.deleted === true;
        
        return !isDealerRole && !isExcludedAdmin && !isDisabledOrDeleted && !u.isSessionDoc;
      });

      // Group and deduplicate by phone key (last 10 digits) or email to handle duplicate DB records
      const uniqueMap = new Map<string, any>();
      eligibleUsers.forEach(u => {
        const phoneKey = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : '';
        const emailKey = u.email ? u.email.toLowerCase().trim() : '';
        const dedupeKey = phoneKey && phoneKey.length >= 10 ? phoneKey : (emailKey || u.uid);

        if (uniqueMap.has(dedupeKey)) {
          const existing = uniqueMap.get(dedupeKey);
          if (!existing.allUids.includes(u.uid)) {
            existing.allUids.push(u.uid);
          }
          // Preserve baseSalary, overtimeRate, etc if the other record didn't have it filled
          if (!existing.baseSalary && u.baseSalary) existing.baseSalary = u.baseSalary;
          if (!existing.overtimeRate && u.overtimeRate) existing.overtimeRate = u.overtimeRate;
          if (!existing.displayName && u.displayName) existing.displayName = u.displayName;
          if (!existing.faceDescriptor && u.faceDescriptor) {
            existing.faceDescriptor = u.faceDescriptor;
            existing.faceEnrolledAt = u.faceEnrolledAt;
          }
        } else {
          uniqueMap.set(dedupeKey, {
            ...u,
            allUids: [u.uid]
          });
        }
      });

      setStaff(Array.from(uniqueMap.values()));
    }, (err) => {
      console.error("Staff lookup failed:", err);
    });

    // Listen to attendance
    const attQuery = query(collection(db, 'attendance'), where('bakeryId', '==', bakery.id));
    const unsubAtt = onSnapshot(attQuery, (snap) => {
      const recordsList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setAttendance(recordsList);
      setLoading(false);
    }, (err) => {
      console.error("Attendance lookup failed:", err);
      setLoading(false);
    });

    return () => {
      unsubStaff();
      unsubAtt();
    };
  }, [bakery?.id]);

  // Quick Action Handlers
  const handleForceClockOut = async (recordId: string) => {
    if (!confirm("Are you sure you want to force clock out this staff member for today?")) return;
    try {
      const recordRef = doc(db, 'attendance', recordId);
      await updateDoc(recordRef, {
        clockOut: serverTimestamp(),
        manuallyClockedOutByAdmin: true,
        notes: `Force clock-out by Admin (${profile?.displayName || 'Admin'})`
      });
    } catch (err: any) {
      alert("Failed to clock out: " + err.message);
    }
  };

  const handleToggleOutOfOffice = async (recordId: string, currentVal: boolean) => {
    try {
      const recordRef = doc(db, 'attendance', recordId);
      await updateDoc(recordRef, {
        outOfOfficeDuty: !currentVal
      });
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm("Are you sure you want to delete this attendance record? This action cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, 'attendance', recordId));
    } catch (err: any) {
      alert("Failed to delete record: " + err.message);
    }
  };

  // Save manual correction
  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStaffId || !editDate) {
      alert("Please select a staff member and date.");
      return;
    }
    setFormSaving(true);
    try {
      const selectedStaff = staff.find(s => s.uid === editStaffId);
      if (!selectedStaff) throw new Error("Staff member not found");

      const recordId = `${editStaffId}_${editDate}`;
      const recordRef = doc(db, 'attendance', recordId);

      // Create synthetic timestamps or strings mimicking normal clock-in
      const clockInTime = editClockIn ? new Date(`${editDate}T${editClockIn}:00`) : null;
      const clockOutTime = editClockOut ? new Date(`${editDate}T${editClockOut}:00`) : null;

      const payload: any = {
        id: recordId,
        userId: editStaffId,
        userName: selectedStaff.displayName || selectedStaff.name || 'Staff Member',
        bakeryId: bakery?.id || '',
        date: editDate,
        status: editStatus,
        outOfOfficeDuty: editStatus === 'present' ? editOutOfOffice : false,
        isManualAdjustment: true,
        adjustedBy: profile?.displayName || 'Admin',
        updatedAt: serverTimestamp()
      };

      if (editStatus === 'present') {
        if (clockInTime) payload.clockIn = clockInTime;
        if (clockOutTime) payload.clockOut = clockOutTime;
      } else {
        payload.clockIn = null;
        payload.clockOut = null;
      }

      await setDoc(recordRef, payload, { merge: true });
      setShowManualModal(false);
      resetForm();
    } catch (err: any) {
      alert("Error saving punch: " + err.message);
    } finally {
      setFormSaving(false);
    }
  };

  const resetForm = () => {
    setEditStaffId('');
    setEditDate(format(new Date(), 'yyyy-MM-dd'));
    setEditClockIn('09:00');
    setEditClockOut('');
    setEditStatus('present');
    setEditOutOfOffice(false);
  };

  const openEditModal = (rec?: AttendanceRecord) => {
    if (rec) {
      const repStaff = staff.find(s => s.uid === rec.userId || s.allUids?.includes(rec.userId));
      setEditStaffId(repStaff ? repStaff.uid : rec.userId);
      setEditDate(rec.date);
      setEditStatus(rec.status);
      setEditOutOfOffice(rec.outOfOfficeDuty || false);
      
      const formatTime = (ts: any) => {
        if (!ts) return '';
        const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
        return format(d, 'HH:mm');
      };
      
      setEditClockIn(formatTime(rec.clockIn) || '09:00');
      setEditClockOut(formatTime(rec.clockOut));
    } else {
      resetForm();
    }
    setShowManualModal(true);
  };

  // Filter lists
  const filteredStaff = staff.filter(s => 
    (s.displayName || s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.phone || '').includes(searchQuery)
  );

  // Computations for SELECTED date
  const selectedDateRecords = attendance.filter(a => a.date === selectedDate);

  // Calculate unique staff metrics to avoid duplications in floor stats
  let activeCount = 0;
  let oooCount = 0;
  let loggedOutCount = 0;
  let absentCount = 0;

  staff.forEach(member => {
    const memberRecords = selectedDateRecords.filter(r => 
      member.allUids?.includes(r.userId) || r.userId === member.uid
    );

    const activeRecs = memberRecords.filter(r => r.status && r.status !== 'absent');
    if (activeRecs.length === 0) {
      absentCount++;
      return;
    }

    // Is active if at least one record is clocked in and not clocked out
    const isActive = activeRecs.some(r => r.clockIn && !r.clockOut);
    if (isActive) {
      activeCount++;
    } else {
      const hasCompleted = activeRecs.some(r => r.clockIn && r.clockOut);
      if (hasCompleted) {
        loggedOutCount++;
      } else {
        absentCount++;
      }
    }

    if (activeRecs.some(r => r.outOfOfficeDuty)) {
      oooCount++;
    }
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Admin Roster...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 pb-32">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            Attendance Roster &amp; Shifts
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            Real-time checking, face verification logs &amp; shift correction controls
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 relative z-10 w-full md:w-auto">
          {/* Selected Date Picker */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-700 focus:outline-none"
            />
          </div>

          <button
            onClick={() => openEditModal()}
            className="flex items-center gap-1.5 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 w-full md:w-auto justify-center"
          >
            <Plus className="w-4 h-4" />
            Manual Adjust Punch
          </button>
        </div>
      </div>

      {/* Bento Grid Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-150 shadow-sm flex flex-col justify-between space-y-4">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Team</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900">{staff.length}</span>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">staff</span>
          </div>
        </div>

        <div className="bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100 shadow-sm flex flex-col justify-between space-y-4">
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Present - Active</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-700">{activeCount}</span>
            <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-100/50 px-2.5 py-0.5 rounded-full animate-pulse">on floor</span>
          </div>
        </div>

        <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100 shadow-sm flex flex-col justify-between space-y-4">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">On Field Duty</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-blue-700">{oooCount}</span>
            <span className="text-[10px] font-extrabold text-blue-600 bg-blue-100/50 px-2.5 py-0.5 rounded-full">outside</span>
          </div>
        </div>

        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Shift Completed</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-800">{loggedOutCount}</span>
            <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">punched out</span>
          </div>
        </div>

        <div className="bg-rose-50/50 p-5 rounded-3xl border border-rose-100 shadow-sm col-span-2 lg:col-span-1 flex flex-col justify-between space-y-4">
          <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block">Absent / Pending</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-rose-700">{absentCount}</span>
            <span className="text-[10px] font-extrabold text-rose-600 bg-rose-100/50 px-2.5 py-0.5 rounded-full">unregistered</span>
          </div>
        </div>
      </div>

      {/* Roster & Today checkins */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Attendance Breakdown for {format(new Date(selectedDate), 'dd MMMM yyyy')}</h3>
            <p className="text-[10px] text-slate-400 font-bold">List of all roster members and their active punch logs</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Staff Member</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Current Status</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Clock In</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Clock Out</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Verification Photo</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Field Duty</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                    No active staff matching criteria found
                  </td>
                </tr>
              ) : (
                filteredStaff.map((member) => {
                  const memberRecords = selectedDateRecords.filter(r => member.allUids?.includes(r.userId) || r.userId === member.uid);
                  // Prioritize any active clock-in, then any present clock-in, then default to first matching record
                  const record = memberRecords.find(r => r.status && r.status !== 'absent' && r.clockIn && !r.clockOut) ||
                                 memberRecords.find(r => r.status && r.status !== 'absent' && r.clockIn) ||
                                 memberRecords[0];

                  const isPresent = record && record.status !== 'absent';
                  const isClockedIn = isPresent && record?.clockIn;
                  const isClockedOut = isPresent && record?.clockOut;
                  const isOnOOO = record?.outOfOfficeDuty;

                  return (
                    <tr key={member.uid} className="hover:bg-slate-50/50 transition">
                      {/* Name Card */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center font-black text-[10px] uppercase tracking-wider shrink-0 shadow-inner">
                            {member.displayName?.charAt(0) || member.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-slate-900 leading-normal">{member.displayName || member.name || 'Anonymous Staff'}</span>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tighter leading-none mt-0.5">{member.role || 'Staff'} ({member.phone || 'No phone'})</span>
                          </div>
                        </div>
                      </td>

                      {/* Status indicator */}
                      <td className="p-4">
                        {!isPresent ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-extrabold uppercase tracking-widest border border-slate-200">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                            Absent
                          </span>
                        ) : isOnOOO ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-extrabold uppercase tracking-widest border border-amber-200">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping" />
                            Field Assignment
                          </span>
                        ) : isClockedIn && !isClockedOut ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-extrabold uppercase tracking-widest border border-emerald-200">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            Active On Floor
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[9px] font-extrabold uppercase tracking-widest border border-slate-200">
                            <span className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
                            Shift Ended
                          </span>
                        )}
                      </td>

                      {/* Clock In Timing */}
                      <td className="p-4 text-xs font-bold text-slate-700">
                        {record?.clockIn ? formatRecordTime(record.clockIn) : '—'}
                        {record?.isManualAdjustment && <span className="block text-[8px] font-bold text-indigo-500 uppercase tracking-tighter mt-0.5">🔑 adjusted</span>}
                      </td>

                      {/* Clock Out Timing */}
                      <td className="p-4 text-xs font-bold text-slate-700">
                        {record?.clockOut ? formatRecordTime(record.clockOut) : '—'}
                        {record?.manuallyClockedOutByAdmin && <span className="block text-[8px] font-bold text-rose-500 uppercase tracking-tighter mt-0.5">⚠️ force logged</span>}
                      </td>

                      {/* Verification snapshot */}
                      <td className="p-4">
                        {record?.photoUrl ? (
                          <button 
                            type="button" 
                            onClick={() => setLightboxUrl(record.photoUrl || null)}
                            className="group relative flex items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 hover:border-indigo-400 active:scale-95 transition"
                          >
                            <img 
                              src={record.photoUrl} 
                              alt="Verification Snap" 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition duration-300 group-hover:scale-110" 
                            />
                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-350 italic uppercase tracking-wider">No Photo</span>
                        )}
                      </td>

                      {/* OUT OF OFFICE CONTROL */}
                      <td className="p-4">
                        {record ? (
                          <button
                            onClick={() => handleToggleOutOfOffice(record.id, record.outOfOfficeDuty || false)}
                            className={cn(
                              "text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg border transition duration-150 active:scale-95",
                              record.outOfOfficeDuty 
                                ? "bg-amber-50 border-amber-200 text-amber-700" 
                                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500"
                            )}
                          >
                            {record.outOfOfficeDuty ? 'On Official Duty' : 'Set Official'}
                          </button>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">no active log</span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isClockedIn && !isClockedOut && (
                            <button
                              onClick={() => handleForceClockOut(record.id)}
                              className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[9px] font-extrabold uppercase tracking-wider border border-rose-100 transition active:scale-95"
                              title="Force clock out"
                            >
                              Logoff Task
                            </button>
                          )}
                          
                          <button
                            onClick={() => openEditModal(record)}
                            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[9px] font-extrabold uppercase tracking-wider border border-slate-200 transition active:scale-95"
                          >
                            Correct
                          </button>

                          {record && (
                            <button
                              onClick={() => handleDeleteRecord(record.id)}
                              className="p-1.5 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg border border-slate-200 hover:border-red-100 transition"
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Correction Form Overlay (Modal) */}
      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl p-6 md:p-8 max-w-md w-full scrollbar-none max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-indigo-650" />
                  Override Attendance
                </h3>
                <button 
                  onClick={() => setShowManualModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-150 flex items-center justify-center transition"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveCorrection} className="space-y-4">
                {/* Staff Dropdown */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Staff Member</label>
                  <select
                    required
                    value={editStaffId}
                    onChange={(e) => setEditStaffId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- Choose Personnel --</option>
                    {staff.map(s => (
                      <option key={s.uid} value={s.uid}>
                        {s.displayName || s.name} ({s.role || 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Date</label>
                  <input
                    required
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Status Options */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Shift Status</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['present', 'absent', 'late', 'half_day'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setEditStatus(st as any)}
                        className={cn(
                          "py-2 px-1 rounded-xl border font-bold text-[9px] uppercase tracking-tighter transition active:scale-95 text-center whitespace-nowrap",
                          editStatus === st 
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                            : "bg-white text-slate-400 hover:text-slate-600 border-slate-250"
                        )}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {editStatus === 'present' && (
                  <>
                    {/* Time fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clock-In Time</label>
                        <input
                          type="time"
                          value={editClockIn}
                          onChange={(e) => setEditClockIn(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-550"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clock-Out Time (Optional)</label>
                        <input
                          type="time"
                          value={editClockOut}
                          onChange={(e) => setEditClockOut(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-550"
                          placeholder="Not left yet"
                        />
                      </div>
                    </div>

                    {/* Out of office field duty check */}
                    <div className="flex items-center gap-3 pt-2">
                      <input
                        type="checkbox"
                        id="formOOO"
                        checked={editOutOfOffice}
                        onChange={(e) => setEditOutOfOffice(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      <label htmlFor="formOOO" className="text-xs font-bold text-slate-600 cursor-pointer">
                        Mark shift as official field assignment / Out-of-Office duty
                      </label>
                    </div>
                  </>
                )}

                {/* Submits */}
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualModal(false);
                      resetForm();
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-150 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition shadow-md disabled:bg-indigo-400 flex items-center justify-center gap-2"
                  >
                    {formSaving ? 'Overwriting...' : 'Save Adjustment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Verification Photo Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[300] flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-3 max-w-sm w-full border border-slate-800/10 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setLightboxUrl(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900/60 text-white flex items-center justify-center transition hover:bg-slate-900 font-extrabold z-10"
              >
                &times;
              </button>
              <img 
                src={lightboxUrl} 
                alt="Verification Detail" 
                referrerPolicy="no-referrer"
                className="w-full h-auto rounded-[1.25rem] object-contain shadow-inner" 
              />
              <div className="p-3 text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Biometric Shift Photo Receipt</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const AttendanceDashboard: React.FC = () => {
  const { profile, bakery, user } = useAuth();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'failing' | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [checkingLocation, setCheckingLocation] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [faceErrorMsg, setFaceErrorMsg] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const [resolvedUids, setResolvedUids] = useState<string[]>(() => {
    return profile?.uid ? [profile.uid] : [];
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const recordId = `${profile?.uid}_${todayStr}`;

  // Offline buffer and scanning states
  const [offlinePunchesCount, setOfflinePunchesCount] = useState(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const scanLoopRef = useRef<any>(null);

  // Find all matched duplicate uids
  useEffect(() => {
    if (!profile?.uid || !bakery?.id) return;

    const findUnifiedUids = async () => {
      try {
        const uidsSet = new Set<string>([profile.uid]);
        const phoneKey = profile.phone ? profile.phone.replace(/\D/g, '').slice(-10) : '';
        const emailKey = profile.email ? profile.email.toLowerCase().trim() : '';

        const snapshot = await getDocs(query(collection(db, 'users'), where('bakeryId', '==', bakery.id)));
        snapshot.docs.forEach(docSnap => {
          const u = docSnap.data();
          const uid = docSnap.id;
          const uPhone = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : '';
          const uEmail = u.email ? u.email.toLowerCase().trim() : '';

          if (
            (phoneKey && phoneKey.length >= 10 && uPhone === phoneKey) ||
            (emailKey && uEmail === emailKey) ||
            uid === profile.uid
          ) {
            uidsSet.add(uid);
          }
        });
        setResolvedUids(Array.from(uidsSet));
      } catch (err) {
        console.error("Failed to fetch matched UIDs:", err);
      }
    };

    findUnifiedUids();
  }, [profile?.uid, bakery?.id, profile?.phone, profile?.email]);

  // Geofence background tracking states
  const [currentTrackingDistance, setCurrentTrackingDistance] = useState<number | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Background Geofence Tracking Effect
  useEffect(() => {
    if (!profile || !bakery || !todayRecord || todayRecord.clockOut) {
      setCurrentTrackingDistance(null);
      return;
    }

    const geoConfig = bakery.attendanceSettings;
    if (!geoConfig?.enabled || !geoConfig.latitude || !geoConfig.longitude) {
      return;
    }

    const checkLocationInterval = async () => {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
          });
        });

        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const distance = getDistanceInMeters(
          userLat,
          userLng,
          geoConfig.latitude,
          geoConfig.longitude
        );

        setCurrentTrackingDistance(distance);
        setTrackingError(null);

        await processAwayStatus(distance, userLat, userLng);
      } catch (err: any) {
        console.error("Background Location Check Error:", err);
        setTrackingError("Failed to auto-update periodic GPS location check.");
      }
    };

    // Run first position check
    checkLocationInterval();

    // Check periodically (every 30 seconds)
    const intervalId = setInterval(checkLocationInterval, 30000);

    return () => clearInterval(intervalId);
  }, [profile?.uid, bakery?.id, todayRecord?.clockIn ? 1 : 0, todayRecord?.clockOut ? 1 : 0, todayRecord?.awaySince ? 1 : 0]);

  const processAwayStatus = async (distance: number, userLat: number, userLng: number) => {
    if (!profile || !bakery || !todayRecord || todayRecord.clockOut) return;

    const isAway = distance >= 1000; // 1 Km threshold
    const recordRef = doc(db, 'attendance', todayRecord.id);

    if (isAway) {
      if (todayRecord.outOfOfficeDuty) {
        // Person is on official out of office duty, so allow them to stay away
        return;
      }
      // Force immediate logoff, they walked > 1km away without notice
      await forceAutoLogoff(distance, userLat, userLng, 0);
    } else {
      // Returned inside range (< 1km)
      if (todayRecord.awaySince || todayRecord.outOfOfficeDuty) {
        await updateDoc(recordRef, {
          awaySince: null,
          outOfOfficeDuty: false, // Auto-stop out of office and resume normal shift!
          lastCheckedLocation: {
            lat: userLat,
            lng: userLng,
            distance: distance,
            timestamp: serverTimestamp()
          }
        });
      }
    }
  };

  const forceAutoLogoff = async (
    distance: number, 
    userLat: number, 
    userLng: number, 
    awayMinutes: number
  ) => {
    if (!profile || !bakery || !todayRecord || todayRecord.clockOut) return;

    setLoading(true);
    try {
      const recordRef = doc(db, 'attendance', todayRecord.id);
      const isOfficialDuty = !!todayRecord.outOfOfficeDuty;

      // 1. Mark attendance as clocked out (logoff)
      await updateDoc(recordRef, {
        clockOut: serverTimestamp(),
        autoClockedOut: true,
        notes: `Automatically clocked out by Geofence. Reason: Worker was away from premises (> 1km away) for more than 1 hour. Total away duration: ${awayMinutes} minutes. Official Office Duty: ${isOfficialDuty ? 'YES' : 'NO'}.`
      });

      // 2. Create alert notification for admin
      const notificationId = `geofence_${profile.uid}_${Date.now()}`;
      await setDoc(doc(db, 'notifications', notificationId), {
        id: notificationId,
        bakeryId: bakery.id,
        title: `🚨 Team Geofence Logoff: ${profile.displayName}`,
        message: `${profile.displayName} was automatically clocked out of duty. Reason: worker moved more than 1 km away (${Math.round(distance)} meters) for ${awayMinutes} minutes. Status was: ${isOfficialDuty ? 'On Official Out-of-Office Duty' : 'Absent without admin notice/notice missing'}.`,
        type: 'attendance_alert',
        createdAt: serverTimestamp(),
        read: false,
        metadata: {
          userId: profile.uid,
          userName: profile.displayName || 'Staff',
          reason: isOfficialDuty ? 'office_duty' : 'no_notice',
          awayDurationMinutes: awayMinutes,
          distance: Math.round(distance)
        }
      });

      alert(`Safety Check: You have been automatically clocked out because you were away from the bakery premises for more than 1 hour (${isOfficialDuty ? 'On Official Duty' : 'Absent without Admin Notice'}).`);

    } catch (err) {
      console.error("Force Auto Logoff Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleOutOfOfficeDuty = async (enabled: boolean) => {
    if (!todayRecord) return;
    try {
      const recordRef = doc(db, 'attendance', todayRecord.id);
      await updateDoc(recordRef, {
        outOfOfficeDuty: enabled
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!profile?.uid || !bakery?.id || resolvedUids.length === 0) return;

    // Listen to today's record across any of our resolved matched accounts
    const todayQuery = query(
      collection(db, 'attendance'),
      where('bakeryId', '==', bakery.id),
      where('userId', 'in', resolvedUids),
      where('date', '==', todayStr)
    );

    const unsubToday = onSnapshot(todayQuery, (snap) => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
        // Find if there's any active non-clocked-out duty; else pick the first one
        const activeToday = docs.find(r => r.clockIn && !r.clockOut) || docs[0];
        setTodayRecord(activeToday);
      } else {
        setTodayRecord(null);
      }
    }, (err) => {
      console.error("Today record subscription failed:", err);
    });

    // Listen to recent records - query across all matched UIDs
    const q = query(
      collection(db, 'attendance'),
      where('bakeryId', '==', bakery.id),
      where('userId', 'in', resolvedUids),
      limit(50)
    );

    const unsubHistory = onSnapshot(q, (snap) => {
      const parsed = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
      // Sort in-memory by date descending
      parsed.sort((a, b) => b.date.localeCompare(a.date));
      setRecords(parsed);
      setLoading(false);
    }, (err) => {
      console.error("History subscription failed:", err);
      setLoading(false);
    });

    return () => {
      unsubToday();
      unsubHistory();
    };
  }, [profile?.uid, bakery?.id, resolvedUids, todayStr]);



  const checkAndSyncPunches = async () => {
    const online = navigator.onLine;
    setIsOfflineMode(!online);
    
    try {
      const pending = await getPendingPunches();
      setOfflinePunchesCount(pending.length);
      
      if (!online || pending.length === 0) return;
      
      setIsSyncingOffline(true);
      for (const punch of pending) {
        try {
          const docRef = doc(db, 'attendance', punch.recordId);
          
          if (punch.type === 'clockIn') {
            await setDoc(docRef, {
              id: punch.recordId,
              userId: punch.userId,
              userName: punch.userName,
              bakeryId: punch.bakeryId,
              date: punch.date,
              clockIn: Timestamp.fromMillis(punch.timestamp),
              status: punch.status,
              photoUrl: punch.photoUrl || 'face_verified',
              location: punch.location || null
            });
          } else if (punch.type === 'clockOut') {
            const existingSnap = await getDoc(docRef);
            if (existingSnap.exists()) {
              await updateDoc(docRef, {
                clockOut: Timestamp.fromMillis(punch.timestamp)
              });
            } else {
              await setDoc(docRef, {
                id: punch.recordId,
                userId: punch.userId,
                userName: punch.userName,
                bakeryId: punch.bakeryId,
                date: punch.date,
                clockIn: Timestamp.fromMillis(punch.timestamp - 3600000), // estimate 1 hr before
                clockOut: Timestamp.fromMillis(punch.timestamp),
                status: punch.status,
                photoUrl: punch.photoUrl || 'face_verified',
                location: punch.location || null
              });
            }
          }
          
          await deletePendingPunch(punch.id);
        } catch (syncErr) {
          console.error("Failed to sync offline punch:", syncErr);
        }
      }
      
      const refreshed = await getPendingPunches();
      setOfflinePunchesCount(refreshed.length);
    } catch (err) {
      console.error("checkAndSyncPunches error:", err);
    } finally {
      setIsSyncingOffline(false);
    }
  };

  useEffect(() => {
    checkAndSyncPunches();
    
    const handleOnline = () => {
      setIsOfflineMode(false);
      checkAndSyncPunches();
    };
    
    const handleOffline = () => {
      setIsOfflineMode(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const syncInterval = setInterval(checkAndSyncPunches, 20000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, [profile?.uid]);

  // If dealer, dealer staff, disabled, or deleted, deny access to the attendance system
  if (
    !profile ||
    profile.role === 'dealer' ||
    profile.role === 'dealer_staff' ||
    (profile.role as string) === 'disabled' ||
    profile.isDeleted ||
    (profile as any).deleted ||
    (profile as any).status === 'disabled' ||
    (profile as any).disabled
  ) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <XCircle className="w-6 h-6 text-rose-500" />
        </div>
        <div className="text-sm font-black text-slate-800 uppercase tracking-wider text-center">
          Access Denied
        </div>
        <p className="text-xs font-bold text-slate-400 text-center max-w-sm">
          The attendance system is not enabled or available for your user account/role.
        </p>
      </div>
    );
  }

  if (profile?.role === 'bakery_admin' || profile?.role === 'super_admin') {
    return <AdminAttendanceView />;
  }

  const stopCamera = () => {
    if (scanLoopRef.current) {
      clearInterval(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScanning(false);
  };

  const startCamera = async () => {
    setScanning(true);
    setScanResult(null);
    setGpsError(null);
    setGpsDistance(null);
    setCheckingLocation(false);
    setFaceErrorMsg(null);

    if (!profile?.faceDescriptor) {
      setFaceErrorMsg("Face not enrolled yet. Ask your admin to enroll your face, or use PIN login instead.");
      setScanResult('failing');
      setScanning(false);
      return;
    }

    try {
      setModelsLoading(true);
      await loadFaceModels();
      setModelsLoading(false);

      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await new Promise(resolve => {
          if (videoRef.current) videoRef.current.onloadedmetadata = resolve;
        });
      }

      let isProcessingFrame = false;
      let scanAttempts = 0;
      const maxScanAttempts = 40;

      if (scanLoopRef.current) {
        clearInterval(scanLoopRef.current);
      }

      scanLoopRef.current = setInterval(async () => {
        if (!scanning || !videoRef.current || isProcessingFrame) return;

        isProcessingFrame = true;
        scanAttempts++;

        try {
          const { descriptor, error } = await getFaceDescriptorFromVideo(videoRef.current);

          if (!descriptor) {
            setFaceErrorMsg(error || "Scanning... position your face clearly in the frame.");
            
            if (scanAttempts >= maxScanAttempts) {
              setScanResult('failing');
              setFaceErrorMsg("Face detection timed out. Please ensure good lighting and center your face.");
              stopCamera();
            }
            return;
          }

          const { distance, isMatch } = compareFaceDescriptors(descriptor, profile.faceDescriptor!);

          if (isMatch) {
            setScanResult('success');
            setFaceErrorMsg(null);
            stopCamera();
            await handleClockIn();
          } else {
            setFaceErrorMsg(`Position face... matches profile by ${(100 * (1 - distance)).toFixed(0)}%.`);
            
            if (scanAttempts >= maxScanAttempts) {
              setScanResult('failing');
              setFaceErrorMsg("Authentication failed. No matching face detected. Use PIN or try again.");
              stopCamera();
            }
          }
        } catch (err) {
          console.error("Frame processing error:", err);
        } finally {
          isProcessingFrame = false;
        }
      }, 500);

    } catch (err: any) {
      console.error("Camera/model error:", err);
      setFaceErrorMsg(err?.message || "Could not access camera. Please check permissions.");
      setScanResult('failing');
      setModelsLoading(false);
    }
  };

  const handleClockIn = async () => {
    if (!profile || !bakery) return;
    
    setGpsError(null);
    setCheckingLocation(true);

    const geoConfig = bakery.attendanceSettings;
    const isOnline = navigator.onLine;

    if (geoConfig?.enabled) {
      if (!geoConfig.latitude || !geoConfig.longitude) {
        setGpsError("Bakery coordinates have not been pinpointed by the manager. Please ask admin to configure geofencing coords in settings.");
        setCheckingLocation(false);
        return;
      }

      try {
        let userLat = geoConfig.latitude;
        let userLng = geoConfig.longitude;
        let distance = 0;

        if (navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 8000
              });
            });
            userLat = position.coords.latitude;
            userLng = position.coords.longitude;
            distance = getDistanceInMeters(
              userLat,
              userLng,
              geoConfig.latitude,
              geoConfig.longitude
            );
            setGpsDistance(distance);

            const allowedRadius = geoConfig.radius || 20;
            if (distance > allowedRadius) {
              setGpsError(`verification_failed: You are ${Math.round(distance)} meters away. Allowed range is ${allowedRadius} meters. Please move closer to the bakery and try again.`);
              setCheckingLocation(false);
              return;
            }
          } catch (gpsErr) {
            console.warn("GPS failed, continuing in fallback mode if offline:", gpsErr);
            if (isOnline) {
              throw gpsErr;
            }
          }
        }

        setLoading(true);
        const newRecord: AttendanceRecord = {
          id: recordId,
          userId: profile.uid,
          userName: profile.displayName || 'Staff',
          bakeryId: bakery.id,
          date: todayStr,
          clockIn: Timestamp.now(),
          status: 'present',
          photoUrl: 'face_verified',
          location: {
            lat: userLat,
            lng: userLng
          }
        };

        if (isOnline) {
          try {
            await setDoc(doc(db, 'attendance', recordId), {
              ...newRecord,
              clockIn: serverTimestamp()
            });
          } catch (writeErr) {
            console.warn("Firestore write failed, falling back to offline IndexedDB:", writeErr);
            await savePendingPunch({
              id: `${profile.uid}_${todayStr}_in`,
              recordId: recordId,
              userId: profile.uid,
              userName: profile.displayName || 'Staff',
              bakeryId: bakery.id,
              date: todayStr,
              type: 'clockIn',
              timestamp: Date.now(),
              status: 'present',
              photoUrl: 'face_verified',
              location: { lat: userLat, lng: userLng }
            });
            setOfflinePunchesCount(prev => prev + 1);
            setTodayRecord(newRecord);
            setRecords(prev => {
              const filter = prev.filter(r => r.id !== newRecord.id);
              return [newRecord, ...filter];
            });
          }
        } else {
          await savePendingPunch({
            id: `${profile.uid}_${todayStr}_in`,
            recordId: recordId,
            userId: profile.uid,
            userName: profile.displayName || 'Staff',
            bakeryId: bakery.id,
            date: todayStr,
            type: 'clockIn',
            timestamp: Date.now(),
            status: 'present',
            photoUrl: 'face_verified',
            location: { lat: userLat, lng: userLng }
          });
          setOfflinePunchesCount(prev => prev + 1);
          setTodayRecord(newRecord);
          setRecords(prev => {
            const filter = prev.filter(r => r.id !== newRecord.id);
            return [newRecord, ...filter];
          });
        }

        setCheckingLocation(false);
        stopCamera();
      } catch (err: any) {
        console.error("GPS Verification Error:", err);
        let errorMsg = "Unable to acquire precise GPS coordinates. Please ensure location services are turned on & reload.";
        if (err.code === 1) {
          errorMsg = "Location access denied. Please approve browser geolocation settings to finish checking in.";
        } else if (err.code === 3) {
          errorMsg = "Location lock timed out. Check your device's GPS signal strength and try again.";
        }
        setGpsError(errorMsg);
        setCheckingLocation(false);
        return;
      }
    } else {
      setLoading(true);
      try {
        const newRecord: AttendanceRecord = {
          id: recordId,
          userId: profile.uid,
          userName: profile.displayName || 'Staff',
          bakeryId: bakery.id,
          date: todayStr,
          clockIn: Timestamp.now(),
          status: 'present',
          photoUrl: geoConfig?.enabled ? 'face_verified' : undefined
        };

        if (isOnline) {
          try {
            await setDoc(doc(db, 'attendance', recordId), {
              ...newRecord,
              clockIn: serverTimestamp()
            });
          } catch (writeErr) {
            console.warn("Firestore write failed, saving offline:", writeErr);
            await savePendingPunch({
              id: `${profile.uid}_${todayStr}_in`,
              recordId: recordId,
              userId: profile.uid,
              userName: profile.displayName || 'Staff',
              bakeryId: bakery.id,
              date: todayStr,
              type: 'clockIn',
              timestamp: Date.now(),
              status: 'present',
              photoUrl: geoConfig?.enabled ? 'face_verified' : undefined
            });
            setOfflinePunchesCount(prev => prev + 1);
            setTodayRecord(newRecord);
            setRecords(prev => {
              const filter = prev.filter(r => r.id !== newRecord.id);
              return [newRecord, ...filter];
            });
          }
        } else {
          await savePendingPunch({
            id: `${profile.uid}_${todayStr}_in`,
            recordId: recordId,
            userId: profile.uid,
            userName: profile.displayName || 'Staff',
            bakeryId: bakery.id,
            date: todayStr,
            type: 'clockIn',
            timestamp: Date.now(),
            status: 'present',
            photoUrl: geoConfig?.enabled ? 'face_verified' : undefined
          });
          setOfflinePunchesCount(prev => prev + 1);
          setTodayRecord(newRecord);
          setRecords(prev => {
            const filter = prev.filter(r => r.id !== newRecord.id);
            return [newRecord, ...filter];
          });
        }

        stopCamera();
      } catch (err) {
        console.error("Clock-In Error:", err);
      } finally {
        setLoading(false);
        setCheckingLocation(false);
      }
    }
  };

  const handleClockOut = async () => {
    if (!todayRecord) return;
    
    setLoading(true);
    const isOnline = navigator.onLine;
    const nowTime = Timestamp.now();

    const updatedRecord: AttendanceRecord = {
      ...todayRecord,
      clockOut: nowTime
    };

    try {
      if (isOnline) {
        try {
          await updateDoc(doc(db, 'attendance', todayRecord.id), {
            clockOut: serverTimestamp()
          });
        } catch (writeErr) {
          console.warn("Firestore clock-out failed, buffering offline:", writeErr);
          await savePendingPunch({
            id: `${profile?.uid}_${todayStr}_out`,
            recordId: todayRecord.id,
            userId: profile?.uid || '',
            userName: profile?.displayName || 'Staff',
            bakeryId: bakery?.id || '',
            date: todayStr,
            type: 'clockOut',
            timestamp: Date.now(),
            status: todayRecord.status || 'present',
            photoUrl: todayRecord.photoUrl,
            location: todayRecord.location
          });
          setOfflinePunchesCount(prev => prev + 1);
          setTodayRecord(updatedRecord);
          setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
        }
      } else {
        await savePendingPunch({
          id: `${profile?.uid}_${todayStr}_out`,
          recordId: todayRecord.id,
          userId: profile?.uid || '',
          userName: profile?.displayName || 'Staff',
          bakeryId: bakery?.id || '',
          date: todayStr,
          type: 'clockOut',
          timestamp: Date.now(),
          status: todayRecord.status || 'present',
          photoUrl: todayRecord.photoUrl,
          location: todayRecord.location
        });
        setOfflinePunchesCount(prev => prev + 1);
        setTodayRecord(updatedRecord);
        setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !todayRecord && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Attendance Log...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      {/* Offline Status & Synchronization Banners */}
      {(isOfflineMode || offlinePunchesCount > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex flex-col gap-3 p-5 rounded-3xl bg-slate-50 border border-slate-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                isOfflineMode ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
              )}>
                {isOfflineMode ? <WifiOff size={16} /> : <Database size={16} />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-900">
                  {isOfflineMode ? "Offline Buffer Active" : "Unsynchronized Local Buffers"}
                </p>
                <p className="text-[9px] font-bold text-slate-500 leading-none mt-0.5">
                  {isOfflineMode 
                    ? "Punches are safely stored in local browser database and will sync automatically." 
                    : `${offlinePunchesCount} attendance events recorded while offline are ready to sync.`
                  }
                </p>
              </div>
            </div>

            {offlinePunchesCount > 0 && (
              <button
                onClick={checkAndSyncPunches}
                disabled={isSyncingOffline || isOfflineMode}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  isOfflineMode 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100 cursor-pointer"
                )}
              >
                {isSyncingOffline ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    Sync Now
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Welcome & Status */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-150 rotate-12">
          <Timer size={120} />
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">
              {todayRecord?.clockIn ? "Working hard today?" : "Welcome back!"}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Production Unit • {format(new Date(), 'EEEE, dd MMMM yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className={cn(
              "px-6 py-4 rounded-3xl border flex flex-col items-center min-w-[120px]",
              todayRecord?.clockIn ? "bg-green-50 border-green-100 text-green-600" : "bg-slate-50 border-slate-100 text-slate-400"
            )}>
              <span className="text-[8px] font-black uppercase tracking-widest mb-1">Status</span>
              <span className="text-xs font-black uppercase">{todayRecord?.clockIn ? (todayRecord.clockOut ? 'Clocked Out' : 'Active Duty') : 'Off Duty'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Clock Control */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-[3rem] p-10 text-white flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10 mb-12">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
              <Clock className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-2">Shift Control</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Verify attendance via face scan</p>
          </div>

          <div className="relative z-10 space-y-4">
            {!todayRecord?.clockIn ? (
              <button 
                onClick={startCamera}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] py-8 font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-indigo-900/40"
              >
                <LogIn size={20} />
                Clock In Now
              </button>
            ) : !todayRecord.clockOut ? (
              <button 
                onClick={handleClockOut}
                className="w-full bg-slate-800 hover:bg-red-600 text-white rounded-[2rem] py-8 font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all group"
              >
                <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                End Shift
              </button>
            ) : (
              <div className="w-full bg-green-500/20 border border-green-500/30 text-green-400 rounded-[2rem] py-8 font-black uppercase tracking-widest flex items-center justify-center gap-3">
                <CheckCircle2 size={20} />
                Shift Completed
              </div>
            )}
          </div>
        </div>

        {/* Current Session Stats */}
        <div className="bg-white rounded-[3rem] border border-slate-200 p-8 flex flex-col justify-between shadow-sm">
          <div className="space-y-6">
             <div className="flex justify-between items-center pb-6 border-b border-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today's Session</p>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                  <MapPin size={14} />
                </div>
             </div>

             <div className="grid grid-cols-2 gap-8">
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Start Time</p>
                 <p className="text-2xl font-black text-slate-900">
                   {todayRecord?.clockIn ? format(todayRecord.clockIn.toDate(), 'HH:mm') : '--:--'}
                 </p>
               </div>
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">End Time</p>
                 <p className="text-2xl font-black text-slate-900 text-slate-300">
                   {todayRecord?.clockOut ? format(todayRecord.clockOut.toDate(), 'HH:mm') : '--:--'}
                 </p>
               </div>
             </div>

             <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                   <Timer className="text-indigo-600" size={18} />
                 </div>
                 <div>
                   <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Shift Progress</p>
                   <p className="text-xs font-black text-indigo-900">
                     {todayRecord?.clockIn && !todayRecord.clockOut ? "Recording Hours..." : "0 Hours 0 Mins"}
                   </p>
                 </div>
               </div>
               <div className="h-10 w-1 bg-indigo-200 rounded-full" />
             </div>

             {todayRecord?.clockIn && !todayRecord.clockOut && (
               <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Duty Location Mode</p>
                 <div className="grid grid-cols-2 gap-2">
                   <button
                     type="button"
                     onClick={() => toggleOutOfOfficeDuty(false)}
                     className={cn(
                       "py-2.5 px-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                       !todayRecord.outOfOfficeDuty 
                         ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                         : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                     )}
                   >
                     <span className="w-2 h-2 rounded-full bg-current" />
                     Office Premises
                   </button>
                   <button
                     type="button"
                     onClick={() => toggleOutOfOfficeDuty(true)}
                     className={cn(
                       "py-2.5 px-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                       todayRecord.outOfOfficeDuty 
                         ? "bg-amber-600 text-white border-amber-600 shadow-md"
                         : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                     )}
                   >
                     <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                     Official Out
                   </button>
                 </div>
                 <p className="text-[8px] text-slate-400 font-bold leading-normal text-center">
                   🚨 Going &gt; 1km away for 1+ hours without declaring "Official Out duty" auto-logs you out.
                 </p>
               </div>
             )}
          </div>

          <div className="pt-6">
            <p className="text-[9px] font-bold text-slate-400 text-center leading-relaxed">
              Facing issues? Contact bakery administrator <br/> 
              <span className="text-slate-900">Support: {bakery?.phone || 'Central Helpdesk'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Face Recognition Enrollment */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
            <Fingerprint className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-slate-900 font-black uppercase text-xs tracking-widest">Face Recognition Login</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Used to verify your identity at clock-in</p>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs font-black text-slate-900">
              {profile?.faceDescriptor ? "✅ Face Enrolled" : "🔐 Face Not Enrolled Yet"}
            </p>
            <p className="text-[10px] text-slate-500 max-w-xl leading-relaxed">
              {profile?.faceDescriptor
                ? "Your face is registered. Clock-in will verify it's really you before marking attendance."
                : "Enroll your face once so future clock-ins can be verified automatically. You can always fall back to PIN."}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowEnrollModal(true)}
              className="py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 outline-none"
            >
              <Camera size={12} />
              {profile?.faceDescriptor ? "Re-Enroll Face" : "Enroll Face"}
            </button>
          </div>
        </div>
      </div>

      {showEnrollModal && profile && (
        <FaceEnrollmentModal
          userId={profile.uid}
          userName={profile.displayName || 'Staff'}
          onClose={() => setShowEnrollModal(false)}
        />
      )}

      {/* Geofence Simulator Console */}
      {((profile?.role as any) === 'super_admin' || (bakery?.name?.toLowerCase().includes('kreative chocolate') && ((profile?.role as any) === 'bakery_admin' || (profile?.role as any) === 'super_admin'))) && todayRecord?.clockIn && !todayRecord.clockOut && (
        <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <MapPin size={16} />
            </div>
            <div>
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Geofence Simulator (Developer Testing Interface)</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Simulate moving away to verify automatic logoff & admin alert rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <button
                type="button"
                onClick={async () => {
                  const userLat = (bakery?.attendanceSettings?.latitude || 0) + 0.015; 
                  const userLng = (bakery?.attendanceSettings?.longitude || 0) + 0.015;
                  const distance = 1650;
                  setCurrentTrackingDistance(distance);
                  await processAwayStatus(distance, userLat, userLng);
                  alert(`Simulated moving 1.65 km away. "awaySince" is tracked!`);
                }}
                className="py-3 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Simulate Away (&gt;1km)
              </button>

              <button
                type="button"
                onClick={async () => {
                  const userLat = bakery?.attendanceSettings?.latitude || 0;
                  const userLng = bakery?.attendanceSettings?.longitude || 0;
                  const distance = 5;
                  setCurrentTrackingDistance(distance);
                  await processAwayStatus(distance, userLat, userLng);
                  alert(`Simulated returning inside bakery range (5 meters).`);
                }}
                className="py-3 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Simulate Under Range
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-600 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400 uppercase tracking-wider text-[8px]">Geofence Range State:</span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                  (currentTrackingDistance || 0) >= 1000 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                )}>
                  {currentTrackingDistance !== null 
                    ? (currentTrackingDistance >= 1000 ? 'OUTSIDE Premise' : 'INSIDE Premise') 
                    : 'System Normal'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 uppercase tracking-wider text-[8px]">Current Distance from Bakery:</span>
                <span className="text-slate-800">
                  {currentTrackingDistance !== null ? `${Math.round(currentTrackingDistance)} meters` : 'Acquiring...'}
                </span>
              </div>
              {todayRecord?.awaySince && (
                <div className="flex justify-between items-center bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                  <span className="text-amber-700 uppercase tracking-wider text-[8px]">Away Monitored Since:</span>
                  <span className="text-amber-800">
                    {format(todayRecord.awaySince.toDate(), 'HH:mm:ss')}
                  </span>
                </div>
              )}
            </div>

            {todayRecord?.awaySince && (
              <button
                type="button"
                onClick={async () => {
                  const sixtyFiveMinsAgo = new Date(Date.now() - 65 * 60 * 1000);
                  const recordRef = doc(db, 'attendance', recordId);
                  await updateDoc(recordRef, {
                    awaySince: sixtyFiveMinsAgo
                  });

                  const userLat = (bakery?.attendanceSettings?.latitude || 0) + 0.015;
                  const userLng = (bakery?.attendanceSettings?.longitude || 0) + 0.015;
                  const distance = 1650;
                  setCurrentTrackingDistance(distance);
                  
                  await forceAutoLogoff(distance, userLat, userLng, 65);
                }}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md shadow-red-900/10"
              >
                ⚡ Simulate &gt; 1 Hour Elapsed (Force Auto-Logoff &amp; Notify Admin)
              </button>
            )}
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Attendance History</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Last 30 Days</p>
          </div>
          <Calendar className="text-slate-300" size={20} />
        </div>

        <div className="divide-y divide-slate-100">
          {records.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-[10px] font-black uppercase tracking-widest">No previous shift records found</p>
            </div>
          ) : (
            records.slice(0, 7).map(record => (
              <div key={record.id} className="p-6 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center font-black text-xs text-slate-900 shadow-sm">
                    {format(new Date(record.date), 'dd')}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{format(new Date(record.date), 'EEEE, MMM dd')}</h4>
                    <div className="flex items-center gap-2 mt-1">
                       <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                         {record.clockIn ? format(record.clockIn.toDate(), 'HH:mm') : '--'} - {record.clockOut ? format(record.clockOut.toDate(), 'HH:mm') : '--'}
                       </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                   <div className={cn(
                     "px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border",
                     record.status === 'present' ? "bg-green-50 border-green-100 text-green-600" : "bg-amber-50 border-amber-100 text-amber-600"
                   )}>
                     {record.status}
                   </div>
                   <ChevronRight className="text-slate-200" size={16} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Face Scan Simulation Overlay */}
      <AnimatePresence>
        {scanning && createPortal(
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[300] flex flex-col items-center justify-center overflow-hidden h-[100dvh] w-full"
          >
            <div className="w-full flex flex-col items-center justify-center p-4 sm:p-8 max-h-[100dvh] overflow-y-auto">
              <div className="w-full max-w-[280px] sm:max-w-sm aspect-square bg-slate-800 rounded-[2rem] sm:rounded-[3rem] border-4 border-indigo-500/50 relative overflow-hidden flex items-center justify-center shadow-2xl">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                
                {/* Scan Overlay Lines */}
                <div className="absolute inset-0 border-[10px] sm:border-[20px] border-slate-900/50 pointer-events-none" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-44 h-44 sm:w-64 sm:h-64 border-2 border-indigo-400/30 rounded-full border-dashed animate-spin-slow" />
                  <div className="absolute w-36 h-36 sm:w-56 sm:h-56 border border-white/20 rounded-full" />
                </div>

                {/* Scanning Beam */}
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400/50 shadow-[0_0_20px_rgba(129,140,248,0.8)] animate-scan z-20" />

                {/* Status Message */}
                <div className="absolute bottom-4 sm:bottom-8 left-0 right-0 text-center z-20">
                  <div className={cn(
                    "inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-widest shadow-xl",
                    scanResult === 'success' ? "bg-green-500 text-white" : scanResult === 'failing' ? "bg-rose-500 text-white" : "bg-indigo-600 text-white"
                  )}>
                    {scanResult === 'success' ? <CheckCircle2 size={14} /> : scanResult === 'failing' ? <AlertCircle size={14} /> : <Camera size={14} className="animate-pulse" />}
                    {scanResult === 'success' ? "Face Verified" : scanResult === 'failing' ? "Verification Failed" : "Align Face in Circle"}
                  </div>
                </div>
              </div>

              <div className="mt-4 sm:mt-6 text-center">
                <p className="text-white text-base sm:text-lg font-black mb-1">Attendance Protocol</p>
                <p className="text-slate-400 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em]">
                  {scanResult === 'success' ? "Identity Confirmed" : scanResult === 'failing' ? "Could Not Verify Identity" : "Processing Biometric Data..."}
                </p>
              </div>

              {scanResult === 'success' && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mt-4 sm:mt-6 max-w-[280px] sm:max-w-sm w-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-center space-y-3 sm:space-y-4"
                >
                  {checkingLocation ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Verifying GPS Proximity...</p>
                    </div>
                  ) : gpsError ? (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
                        <AlertCircle size={24} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-rose-400 uppercase tracking-wider">GPS Verification Failed</h4>
                        <p className="text-[10px] text-slate-200 font-bold mt-1 leading-relaxed">
                          {gpsError.startsWith('verification_failed:') 
                            ? gpsError.replace('verification_failed: ', '') 
                            : gpsError}
                        </p>
                      </div>
                      <button 
                        onClick={handleClockIn}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Retry Distance Check
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {bakery?.attendanceSettings?.enabled && gpsDistance !== null ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 p-4 rounded-2xl text-center">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Location In-Range</p>
                          <p className="text-[10px] font-bold mt-1 text-slate-200">
                            Proximity: {Math.round(gpsDistance)}m (Under {bakery.attendanceSettings.radius || 20}m limit)
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Ready to record shift entry</p>
                      )}
                      <button 
                        onClick={handleClockIn}
                        className="w-full bg-green-500 hover:bg-green-400 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-green-900/20 transition-all text-xs"
                      >
                        Continue Clock In
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {scanResult === 'failing' && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mt-4 sm:mt-6 max-w-[280px] sm:max-w-sm w-full bg-slate-800/80 border border-rose-700/40 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-center space-y-3 sm:space-y-4"
                >
                  <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-rose-400 uppercase tracking-wider">Face Verification Failed</h4>
                    <p className="text-[10px] text-slate-200 font-bold mt-1 leading-relaxed">
                      {faceErrorMsg || "Could not verify your identity. Please try again."}
                    </p>
                  </div>
                  <button
                    onClick={startCamera}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}

              {modelsLoading && (
                <p className="mt-3 sm:mt-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
                  Loading face recognition model...
                </p>
              )}

              <button 
                onClick={stopCamera}
                className="mt-6 sm:mt-8 px-8 sm:px-10 py-3 sm:py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Cancel Scan
              </button>
            </div>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
        .animate-spin-slow {
          animation: spin 10s linear infinite;
        }
      `}</style>
    </div>
  );
};
