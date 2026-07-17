import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, doc, setDoc, getDoc, writeBatch, getDocs, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { createLog } from '../../services/logService';
import { UserProfile, OperationType, PaymentSettings } from '../../types';
import { getActiveFeatures } from '../../utils/subscriptionUtils';
import { generateWhatsAppInviteLink, cn } from '../../lib/utils';
import { ShieldAlert, Wrench, Edit2, Trash2, CheckCircle2, MessageCircle, Camera, Lock, Upload } from 'lucide-react';
import { FaceEnrollmentModal } from '../FaceEnrollmentModal';

interface StaffManagerProps {
  staff: UserProfile[];
  bakeryId: string;
  onRepairCheck?: (phone?: string) => void;
}

export const StaffManager: React.FC<StaffManagerProps> = ({
  staff,
  bakeryId,
  onRepairCheck
}) => {
  const { profile: authUser, bakery } = useAuth();
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
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ph, setPh] = useState('');
  const [pin, setPin] = useState('');
  const [baseSalaryState, setBaseSalaryState] = useState<string>('');
  const [overtimeRateState, setOvertimeRateState] = useState<string>('');
  const [role, setRole] = useState<'production' | 'bakery_admin' | 'sales' | 'chocolate_production'>('production');
  const [lastAddedStaff, setLastAddedStaff] = useState<{ name: string; phone: string; pin: string } | null>(null);

  // Photo Capture States
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startCamera = async () => {
    try {
      setCameraError('');
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => console.warn("Video play interrupted:", err));
      }
    } catch (err: any) {
      console.warn("Camera open status/warning:", err?.message || err);
      setCameraError(err?.message || "Could not access camera. Please check permissions or use device upload.");
      setIsCapturing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 300, 300);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhotoUrl(dataUrl);
      }
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCameraError('');
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrollingStaff, setEnrollingStaff] = useState<UserProfile | null>(null);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !ph && !editingStaffId) {
          setPh(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showForm && !ph && !editingStaffId) fetchISD();
  }, [showForm, editingStaffId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!bakeryId) {
      alert('Error: Identity Verification Failed (Missing Bakery ID). Please reload the page.');
      setLoading(false);
      return;
    }
    const cleanPh = ph.replace(/\D/g, '').slice(-10);
    const cleanEmail = email.toLowerCase().trim();
    
    // Check for subscription limits
    if (!editingStaffId) {
      const activeFeatures = getActiveFeatures(bakery, paymentSettings);
      const activeStaffCount = staff.filter(s => !s.isDeleted && s.role !== 'dealer' && s.role !== 'dealer_staff').length;
      if (activeFeatures.maxStaff !== -1 && activeStaffCount >= activeFeatures.maxStaff) {
        alert(`Limit Reached: Under your current plan, you can only add a maximum of ${activeFeatures.maxStaff} staff members. Please upgrade to a Paid Subscription for unlimited staff.`);
        setLoading(false);
        return;
      }
    }

    // Check for duplicates on new addition
    if (!editingStaffId) {
      if (ph && staff.some(s => (s.phone ? s.phone.replace(/\D/g, '').slice(-10) : '') === cleanPh && !s.isDeleted)) {
        alert(`A staff member with phone ending in ${cleanPh} already exists.`);
        setLoading(false);
        return;
      }
      if (email && staff.some(s => s.email?.toLowerCase().trim() === cleanEmail && !s.isDeleted)) {
        alert(`A staff member with email ${cleanEmail} already exists.`);
        setLoading(false);
        return;
      }
    }

    const uid = editingStaffId || `staff_${Math.random().toString(36).substring(2, 9)}`;
    console.log('Initiating staff save for:', uid);
    
    try {
      const baseSalary = baseSalaryState ? Number(baseSalaryState) : 12000;
      const hourlyRate = baseSalary / 26 / 8;
      const defaultOTRate = Math.round(hourlyRate * 1.5);

      const staffData: any = {
        displayName: name,
        email,
        phone: cleanPh,
        role,
        bakeryId,
        baseSalary: baseSalaryState ? Number(baseSalaryState) : null,
        overtimeRate: overtimeRateState ? Number(overtimeRateState) : defaultOTRate,
        photoUrl: photoUrl || null,
      };
      
      // Only include PIN if it's set (optional on edit)
      if (pin) staffData.pin = pin;
      
      if (editingStaffId) {
        await setDoc(doc(db, 'users', uid), {
          uid,
          ...staffData
        }, { merge: true });
        await createLog('staff', `Staff updated: ${name} (${role})`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
        alert('Staff information updated.');
        setShowForm(false);
      } else {
        const finalPin = pin || '1234';
        await setDoc(doc(db, 'users', uid), {
          uid,
          ...staffData,
          pin: finalPin
        });
        await createLog('staff', `New staff member added: ${name} (${role})`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
        
        if (cleanPh) {
          setLastAddedStaff({ name, phone: cleanPh, pin: finalPin });
        } else {
          setShowForm(false);
        }
      }
      
      setEditingStaffId(null);
      resetForm();
    } catch (err) {
      console.error('Save failed:', err);
      handleFirestoreError(err, editingStaffId ? OperationType.UPDATE : OperationType.WRITE, `users/${uid}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName(''); setEmail(''); setPh(''); setPin('');
    setBaseSalaryState(''); setOvertimeRateState('');
    setPhotoUrl('');
    stopCamera();
  };

  const startEdit = (member: UserProfile) => {
    setEditingStaffId(member.uid);
    setName(member.displayName);
    setEmail(member.email || '');
    setPh(member.phone || '');
    setPin(''); // Don't show pin for security
    setRole(member.role as any);
    setBaseSalaryState(member.baseSalary?.toString() || '');
    setOvertimeRateState(member.overtimeRate?.toString() || '');
    setPhotoUrl((member as any).photoUrl || '');
    setShowForm(true);
  };

  const removeStaff = (uid: string, name: string) => {
    if (!uid) {
      alert('Error: Missing identifier');
      return;
    }

    confirmAction(
      'Remove Staff Member?',
      `Are you sure you want to revoke system access for ${name}? This action will disable their login immediately.`,
      'Remove Access',
      async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          const oldDoc = await getDoc(doc(db, 'users', uid));
          
          if (oldDoc.exists()) {
            batch.update(doc(db, 'users', uid), { 
              isDeleted: true, 
              deletedAt: serverTimestamp(),
              role: 'disabled'
            });
            await batch.commit();
          }
          
          await createLog('staff', `Staff access revoked: ${name}`, authUser?.uid, authUser?.email, bakeryId);
          alert(`Staff member "${name}" has been removed.`);
        } catch (err: any) {
          console.error('STAFF DELETE ERROR:', err);
          handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
        } finally {
          setLoading(false);
          setPendingAction(null);
        }
      }
    );
  };

  const handleKeyPress = (num: string) => {
    setPinError(false);
    if (enteredPin.length < 4) {
      const newPin = enteredPin + num;
      setEnteredPin(newPin);
      if (newPin.length === 4) {
        const correctPin = String(authUser?.pin || '1234').trim();
        if (newPin === correctPin) {
          setIsPinVerified(true);
        } else {
          // Incorrect PIN - delay slightly for haptic feel
          setTimeout(() => {
            setPinError(true);
            setEnteredPin('');
          }, 150);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPinError(false);
    setEnteredPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPinError(false);
    setEnteredPin('');
  };

  if (!isPinVerified) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] p-4">
        <div className="bg-white max-w-md w-full rounded-[2.5rem] border border-slate-200 shadow-xl p-8 md:p-10 text-center space-y-8 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center space-y-3">
            <div className={cn(
              "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-300",
              pinError ? "bg-red-50 text-red-500 animate-bounce" : "bg-purple-50 text-purple-600"
            )}>
              <Lock className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              Staff Suite Locked
            </h3>
            <p className="text-[11px] font-bold text-slate-400 max-w-xs leading-relaxed">
              Access to internal salaries, mobile login credentials, and records requires admin authentication.
            </p>
          </div>

          {/* Pin Dots */}
          <div className="flex justify-center items-center gap-4 py-2">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={cn(
                  "w-4 h-4 rounded-full border-2 transition-all duration-150",
                  enteredPin.length > index
                    ? "bg-purple-600 border-purple-600 scale-110 shadow-md shadow-purple-100"
                    : pinError
                    ? "border-red-300 bg-red-50 animate-pulse"
                    : "border-slate-200 bg-slate-50"
                )}
              />
            ))}
          </div>

          {pinError && (
            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse">
              Incorrect PIN. Access Denied.
            </p>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="w-16 h-16 rounded-full bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-black text-xl flex items-center justify-center transition-all active:scale-90 border border-slate-100 shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="w-16 h-16 rounded-full text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 hover:bg-slate-50 active:scale-90 transition-all flex items-center justify-center"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="w-16 h-16 rounded-full bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-black text-xl flex items-center justify-center transition-all active:scale-90 border border-slate-100 shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="w-16 h-16 rounded-full text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 hover:bg-slate-50 active:scale-90 transition-all flex items-center justify-center"
              aria-label="Backspace"
            >
              Delete
            </button>
          </div>
          
          <div className="text-[10px] font-bold text-slate-400">
            Current Admin: <span className="text-slate-600 font-black">{authUser?.displayName || 'Manager'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center">
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
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-red-100 transition-all text-xs"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center px-2">
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Internal Staff</h2>
        <div className="flex gap-2">
          {onRepairCheck && (
            <button 
              type="button"
              onClick={() => onRepairCheck('+917696450433')} 
              className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-1.5"
            >
              <Wrench size={12} className="text-blue-500 animate-pulse" />
              Repair Access
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all text-xs">+ Add Member</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[200px]">Staff Name</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[150px]">Access Role</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[150px]">Mobile Login</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[120px]">Face Login</th>
                <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.filter(s => s.role !== 'dealer' && s.role !== 'super_admin').map((member) => (
                <tr key={member.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4 text-slate-900">
                    <div 
                      onClick={() => startEdit(member)}
                      className="flex items-center gap-3 cursor-pointer group/name select-none"
                    >
                      {(member as any).photoUrl ? (
                        <img 
                          src={(member as any).photoUrl} 
                          alt={member.displayName} 
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 transition-transform group-hover/name:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 transition-colors group-hover/name:bg-purple-100 group-hover/name:text-purple-700">
                          {member.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-900 group-hover/name:text-purple-600 group-hover/name:underline flex items-center gap-1.5">
                          {member.displayName}
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded group-hover/name:bg-purple-50 group-hover/name:text-purple-600 transition-colors">
                            Edit Profile
                          </span>
                        </div>
                        {member.email ? (
                          <div className="text-[10px] text-slate-400 font-semibold">{member.email}</div>
                        ) : (
                          <div className="text-[9px] text-slate-350 font-semibold italic">Click to setup email</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <span className="text-[9px] font-black px-2 py-1 bg-purple-50 text-purple-600 rounded uppercase tracking-widest">{member.role.replace('_', ' ')}</span>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-bold text-slate-900">{member.phone}</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PIN: {member.pin || '1234'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-2">
                      {member.faceDescriptor ? (
                        <>
                          <span className="text-[9px] font-black px-2 py-1 bg-green-50 text-green-600 rounded uppercase tracking-widest">Enrolled</span>
                          <button
                            onClick={() => setEnrollingStaff(member)}
                            className="text-[9px] font-black px-2 py-1 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded uppercase tracking-widest transition-colors"
                            title="Re-enroll face"
                          >
                            Update
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEnrollingStaff(member)}
                          className="text-[9px] font-black px-2 py-1 bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded uppercase tracking-widest transition-colors"
                        >
                          Enroll Face
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex justify-end gap-2 text-right">
                      <button onClick={() => startEdit(member)} className="text-slate-300 hover:text-blue-500 transition-colors p-2">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        disabled={loading}
                        onClick={() => removeStaff(member.uid, member.displayName)} 
                        className="text-slate-300 hover:text-red-500 transition-colors p-2 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-purple-600 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold sm:text-lg text-white">
                {lastAddedStaff ? 'Invite Staff Member' : (editingStaffId ? 'Edit Staff Member' : 'Add Staff Member')}
              </h2>
              <button 
                onClick={() => { setShowForm(false); setEditingStaffId(null); setLastAddedStaff(null); resetForm(); }} 
                className="text-white/60 hover:text-white text-2xl px-2 focus:outline-none"
              >
                ×
              </button>
            </div>
            
            {lastAddedStaff ? (
              <div className="p-8 space-y-6 text-center">
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">Staff Created!</h4>
                  <p className="text-xs text-slate-500 font-medium mt-2">
                    {lastAddedStaff.name} has been added. Send them their login details & portal link now.
                  </p>
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Login Credentials</p>
                    <p className="text-[10px] font-bold text-slate-700">Phone: {lastAddedStaff.phone}</p>
                    <p className="text-[10px] font-bold text-slate-700">PIN: {lastAddedStaff.pin}</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    const link = generateWhatsAppInviteLink(lastAddedStaff.phone, lastAddedStaff.name, window.location.origin);
                    window.open(link, '_blank');
                    setShowForm(false);
                    setLastAddedStaff(null);
                  }}
                  className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-green-100 flex items-center justify-center gap-2 text-xs"
                >
                  <MessageCircle size={18} />
                  Send WhatsApp Link
                </button>
                
                <button 
                  onClick={() => { setShowForm(false); setLastAddedStaff(null); }}
                  className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
                {/* Photo Capture Section */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <div className="relative w-28 h-28 rounded-full overflow-hidden bg-slate-200 border-2 border-slate-100 shadow-inner flex items-center justify-center group">
                    {isCapturing ? (
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                    ) : photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt="Captured signature preview" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-400" />
                    )}
                  </div>

                  {cameraError && (
                    <div className="text-[9px] text-red-500 font-bold bg-red-50 border border-red-100 rounded-xl px-3 py-1.5 text-center max-w-xs leading-normal">
                      ⚠️ Camera access blocked. Use "Upload Photo" fallback below or open app in a new tab.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 justify-center">
                    {isCapturing ? (
                      <>
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition"
                        >
                          Snap Photo
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] uppercase tracking-widest rounded-xl transition"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-1 transition"
                        >
                          <Camera size={12} />
                          {photoUrl ? "Re-take Photo" : "Capture Photo"}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] uppercase tracking-widest rounded-xl flex items-center gap-1 transition"
                        >
                          <Upload size={12} />
                          Upload Photo
                        </button>
                        
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileUpload} 
                          accept="image/*" 
                          className="hidden" 
                        />

                        {photoUrl && (
                          <button
                            type="button"
                            onClick={() => setPhotoUrl('')}
                            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-[10px] uppercase tracking-widest rounded-xl transition"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <input required placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-xs" />
                <div className="grid grid-cols-2 gap-4">
                  <input required placeholder="Mobile Login" value={ph} onChange={e => setPh(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-xs" />
                  <input required={!editingStaffId} placeholder={editingStaffId ? "PIN (Keep Same)" : "4-Digit PIN"} maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-center text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Google Email (Optional)</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-100 rounded flex items-center justify-center pointer-events-none">
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="" className="w-3 h-3" />
                    </div>
                    <input type="email" placeholder="Gmail for Google Login" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold pl-9 text-xs" />
                  </div>
                </div>
                <select value={role} onChange={e => setRole(e.target.value as any)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-xs">
                  <option value="production">Bakery Section (Production)</option>
                  <option value="chocolate_production">Chocolate Section</option>
                  <option value="bakery_admin">Bakery Admin / Manager</option>
                  <option value="sales">Sales / Front Desk</option>
                </select>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Monthly Base Salary (₹)</label>
                    <input 
                      type="number" 
                      placeholder="e.g. 12000" 
                      value={baseSalaryState} 
                      onChange={e => setBaseSalaryState(e.target.value)} 
                      className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Overtime Rate (₹/hr)</label>
                    <input 
                      type="number" 
                      placeholder={`Default: ₹${Math.round(((baseSalaryState ? Number(baseSalaryState) : 12000) / 26 / 8) * 1.5)}/hr (1.5x hourly)`} 
                      value={overtimeRateState} 
                      onChange={e => setOvertimeRateState(e.target.value)} 
                      className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-xs" 
                    />
                  </div>
                </div>
                <button disabled={loading} type="submit" className="w-full bg-purple-600 text-white py-3 rounded-xl font-black uppercase tracking-widest disabled:opacity-50 text-xs">
                  {loading ? 'Processing...' : (editingStaffId ? 'Update Access' : 'Create Access')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {enrollingStaff && (
        <FaceEnrollmentModal
          userId={enrollingStaff.uid}
          userName={enrollingStaff.displayName}
          onClose={() => setEnrollingStaff(null)}
        />
      )}
    </div>
  );
};
