
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth'; // We'll use email/pass for initial signup or just capture info
import { Store, User, Phone, Mail, ChevronRight, CheckCircle2, ShieldCheck } from 'lucide-react';

export const BakerySignup: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    bakeryName: '',
    ownerName: '',
    email: '',
    phone: '',
    address: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Create the bakery record with pending status
      const bakeryRef = await addDoc(collection(db, 'bakeries'), {
        name: formData.bakeryName,
        adminEmail: formData.email.toLowerCase().trim(),
        phone: formData.phone.trim(),
        address: formData.address,
        subscriptionStatus: 'pending_approval',
        createdAt: serverTimestamp(),
        settings: {
          whatsappNumber: formData.phone.trim()
        }
      });

      // Also create a "lead" or "request" in users so it's easier to find
      // Note: We don't create a real FIREBASE AUTH user here yet to keep it simple,
      // Or we can let them use Google later. For now we just record the intent.
      // But we need a way for them to see their status. 
      // Actually, standard SaaS flow: They register, then redirect to login where they get "Pending Approval" message.
      
      await addDoc(collection(db, 'signup_requests'), {
        ...formData,
        bakeryId: bakeryRef.id,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-10 text-center border border-slate-100">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight">Request Received!</h1>
          <p className="text-slate-500 font-bold mb-8 leading-relaxed">
            Your bakery registration for <span className="text-blue-600">"{formData.bakeryName}"</span> is now being reviewed by our team.
          </p>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 text-left">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Next Steps:</span>
            </div>
            <ul className="space-y-3">
              <li className="flex gap-3 text-xs font-bold text-slate-600">
                <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-black shrink-0">1</span>
                Approval within 24-48 hours
              </li>
              <li className="flex gap-3 text-xs font-bold text-slate-600">
                <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-black shrink-0">2</span>
                Activation of 3-Month FREE Trial
              </li>
              <li className="flex gap-3 text-xs font-bold text-slate-600">
                <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-black shrink-0">3</span>
                Welcome email with login instructions
              </li>
            </ul>
          </div>
          <button 
            onClick={() => navigate('/login')}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            Back to Login <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">
        <div className="w-full md:w-5/12 bg-blue-600 p-10 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <Store className="w-12 h-12 mb-6 text-blue-200" />
            <h2 className="text-3xl font-black uppercase tracking-tight leading-none mb-4">Join the BakeSync Network</h2>
            <p className="text-blue-100 font-bold text-sm leading-relaxed mb-8">Scale your operations with automated order tracking, dealer management, and production analytics.</p>
            
            <div className="space-y-4">
              <div className="bg-blue-700/30 p-4 rounded-2xl border border-blue-500/20 backdrop-blur-sm">
                <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Introductory Offer</p>
                <p className="text-lg font-black">3 MONTHS FREE TRIAL</p>
              </div>
              <div className="bg-blue-700/30 p-4 rounded-2xl border border-blue-500/20 backdrop-blur-sm">
                <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Standard Billing</p>
                <p className="text-lg font-black">₹999 / month</p>
                <p className="text-xs text-blue-100 font-bold mt-1 opacity-80">Or ₹699/mo (Billed Annually)</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl opacity-30"></div>
        </div>

        <div className="w-full md:w-7/12 p-8 md:p-12">
          <div className="mb-8">
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Bakery Registration</h1>
            <p className="text-slate-400 font-bold text-xs mt-1">Please provide your details for verification.</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest mb-6 border border-red-100 italic">
              Error: {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Bakery Name</label>
              <div className="relative">
                <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Royal Patisserie"
                  value={formData.bakeryName}
                  onChange={(e) => setFormData({...formData, bakeryName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Owner / Manager Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input 
                  type="text" 
                  required
                  placeholder="Full Name"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({...formData, ownerName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="email" 
                    required
                    placeholder="admin@bakery.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Contact Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="tel" 
                    required
                    placeholder="+91..."
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Bakery Location / Address</label>
              <textarea 
                required
                rows={2}
                placeholder="Complete address of your main branch"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm resize-none"
              ></textarea>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
            >
              {loading ? 'SUBMITTING...' : 'Submit Signup Request'} <ChevronRight className="w-4 h-4" />
            </button>

            <button 
              type="button"
              onClick={() => navigate('/login')}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
            >
              Already registered? Login here
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
