import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, UserRole, PaymentSettings } from '../types';
import { getActiveFeatures } from '../utils/subscriptionUtils';
import { 
  Users, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  UserPlus, 
  Mail, 
  Phone,
  Search,
  MoreVertical,
  X,
  AlertCircle,
  MessageCircle,
  CheckCircle2
} from 'lucide-react';
import { cn, generateWhatsAppInviteLink } from '../lib/utils';

export const DealerStaffManager: React.FC = () => {
  const { profile, bakery } = useAuth();
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'payment_settings', 'phonepe'), (snap) => {
      if (snap.exists()) {
        setPaymentSettings(snap.data() as PaymentSettings);
      }
    });
    return () => unsub();
  }, []);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('dealer_staff');
  const [lastAddedStaff, setLastAddedStaff] = useState<{ name: string, phone: string } | null>(null);

  useEffect(() => {
    if (!profile?.dealerId) return;

    const q = query(
      collection(db, 'users'),
      where('dealerId', '==', profile.dealerId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const uniqueStaff = new Map<string, UserProfile>();
      snap.docs.forEach(doc => {
        const u = { uid: doc.id, ...doc.data() } as UserProfile;
        if (!u.isDeleted) {
          // Aggressive deduplication: prefer phone/email over UID (normalize phone to last 10 digits)
          const phoneKey = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : null;
          const emailKey = u.email ? u.email.toLowerCase().trim() : null;
          
          let identifier = u.uid || doc.id;
          
          // Check if we already have this person by phone or email
          const existing = Array.from(uniqueStaff.values()).find(ex => {
            const exPhone = ex.phone ? ex.phone.replace(/\D/g, '').slice(-10) : null;
            const exEmail = ex.email ? ex.email.toLowerCase().trim() : null;
            return (phoneKey && phoneKey.length >= 10 && exPhone === phoneKey) || (emailKey && exEmail === emailKey);
          });

          if (!existing && !uniqueStaff.has(identifier)) {
            uniqueStaff.set(identifier, u);
          }
        }
      });
      setStaff(Array.from(uniqueStaff.values()));
      setLoading(false);
    });

    return () => unsub();
  }, [profile?.dealerId]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.dealerId || !bakery?.id) return;

    // Check for subscription limits
    const activeFeatures = getActiveFeatures(bakery, paymentSettings);
    const activeMembersCount = staff.filter(s => s.role === 'dealer_staff' && !s.isDeleted).length;
    if (activeFeatures.maxMembersPerDealer !== -1 && activeMembersCount >= activeFeatures.maxMembersPerDealer) {
      alert(`Limit Reached: Under your bakery's plan, each car dealer can only register a maximum of ${activeFeatures.maxMembersPerDealer} team members. Please contact the bakery administrator to upgrade their plan.`);
      return;
    }

    const cleanPh = phone.replace(/\D/g, '').slice(-10);
    const cleanEmail = email.toLowerCase().trim();

    // Check for duplicates before adding
    if (staff.some(s => (s.phone ? s.phone.replace(/\D/g, '').slice(-10) : '') === cleanPh)) {
      alert(`A team member with phone ending in ${cleanPh} already exists.`);
      return;
    }
    if (email && staff.some(s => s.email?.toLowerCase().trim() === cleanEmail)) {
      alert(`A team member with email ${cleanEmail} already exists.`);
      return;
    }

    // In a real app, this would use an invitation system or Firebase Admin.
    // For this prototype, we'll create a user record that they can "claim" 
    // or just assume they will sign up with this email.
    // We'll use the email as the temporary UID or a random string.
    const tempUid = `staff_${Math.random().toString(36).substring(2, 9)}`;
    
    const newStaff: UserProfile = {
      uid: tempUid,
      displayName: name,
      email: email,
      phone: phone,
      role: role,
      bakeryId: bakery.id,
      dealerId: profile.dealerId,
      isDeleted: false
    };

    try {
      await setDoc(doc(db, 'users', tempUid), newStaff);
      
      if (phone) {
        setLastAddedStaff({ name, phone });
      } else {
        setShowAddModal(false);
      }
      resetForm();
    } catch (err) {
      console.error("Error adding staff:", err);
      alert("Failed to add staff member.");
    }
  };

  const removeStaff = async (staffUid: string) => {
    if (staffUid === profile?.uid) {
      alert("You cannot remove yourself!");
      return;
    }

    if (confirm("Are you sure you want to remove this staff member? They will lose all access to the dealership dashboard.")) {
      try {
        await updateDoc(doc(db, 'users', staffUid), { isDeleted: true });
      } catch (err) {
        console.error("Error removing staff:", err);
      }
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setRole('dealer_staff');
  };

  const filteredStaff = staff.filter(s => 
    s.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Dealership Team</h2>
          <p className="text-xs font-bold text-slate-900 mt-1">Manage staff access and roles</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" /> Add Team Member
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search team members..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {filteredStaff.map(member => (
            <div key={member.uid} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-inner",
                  member.role === 'dealer' ? "bg-slate-900" : "bg-blue-500"
                )}>
                  {member.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-slate-900">{member.displayName}</h4>
                    {member.uid === profile?.uid && (
                      <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter">You</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    {member.email && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        <Mail className="w-3 h-3" /> {member.email}
                      </div>
                    )}
                    {member.phone && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        <Phone className="w-3 h-3" /> {member.phone}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right mr-4">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                    member.role === 'dealer' 
                      ? "bg-slate-100 text-slate-900 border-slate-200" 
                      : "bg-blue-50 text-blue-600 border-blue-100"
                  )}>
                    {member.role.replace('_', ' ')}
                  </span>
                </div>
                {member.uid !== profile?.uid && (
                  <button 
                    onClick={() => removeStaff(member.uid)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredStaff.length === 0 && !loading && (
            <div className="py-20 text-center">
              <Users className="w-12 h-12 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No team members found.</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black">{lastAddedStaff ? 'Invite Team Member' : 'Add Team Member'}</h3>
              <button onClick={() => { setShowAddModal(false); setLastAddedStaff(null); }}><X className="w-6 h-6" /></button>
            </div>
            
            {lastAddedStaff ? (
              <div className="p-8 space-y-6 text-center">
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">Success!</h4>
                  <p className="text-xs text-slate-500 font-medium mt-2">
                    {lastAddedStaff.name} has been added to the system. Now send them their portal access link.
                  </p>
                </div>
                
                <button 
                  onClick={() => {
                    const link = generateWhatsAppInviteLink(lastAddedStaff.phone, lastAddedStaff.name, window.location.origin);
                    window.open(link, '_blank');
                    setShowAddModal(false);
                    setLastAddedStaff(null);
                  }}
                  className="w-full bg-[#25D366] text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  Invite via WhatsApp
                </button>
                
                <button 
                  onClick={() => { setShowAddModal(false); setLastAddedStaff(null); }}
                  className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                >
                  Skip for now
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddStaff} className="p-8 space-y-6">
              <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 mb-2">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-[10px] font-bold text-blue-800 leading-relaxed">
                  The new member will use these details to join your dealership. Ensure email is correct.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Phone Number</label>
                <input required value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button" 
                    onClick={() => setRole('dealer_staff')}
                    className={cn(
                      "px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      role === 'dealer_staff' ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"
                    )}
                  >
                    Staff
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setRole('dealer')}
                    className={cn(
                      "px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      role === 'dealer' ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"
                    )}
                  >
                    Admin
                  </button>
                </div>
              </div>
              <button 
                type="submit" 
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all"
              >
                Create Staff Account
              </button>
            </form>
          )}
          </div>
        </div>
      )}
    </div>
  );
};
