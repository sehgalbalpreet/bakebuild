import React, { useState, useEffect } from 'react';
import { collection, query, where, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { createLog } from '../../services/logService';
import { createArchive } from '../../services/archiveService';
import { Wrench, Phone, RefreshCw, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

interface AccountRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeryId: string;
  initialPhone?: string;
}

export const AccountRepairModal: React.FC<AccountRepairModalProps> = ({
  isOpen,
  onClose,
  bakeryId,
  initialPhone = ''
}) => {
  const [searchQuery, setSearchQuery] = useState(initialPhone || '+917696450433');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setLogs([]);
    setResults([]);
    addLog(`Initiating scan for query: "${searchQuery}"`);

    try {
      const cleanQuery = searchQuery.replace(/\D/g, '').slice(-10);
      const isPhoneSearch = /\d{5,}/.test(searchQuery);

      addLog(`Query type: ${isPhoneSearch ? 'Phone (last 10 digits match: ' + cleanQuery + ')' : 'Keyword'}`);
      addLog('Fetching users and dealers collections...');
      
      const usersDocs: { id: string; data: any }[] = [];

      // 1. If it is a phone-based search, search GLOBALLY across the 'users' collection to catch duplicates 
      // with no bakeryId or from mismatched signup attempts (allowed by firestore.rules retrieve).
      if (isPhoneSearch && cleanQuery.length === 10) {
        const possiblePhones = [searchQuery.trim().replace(/\s/g, '')];
        if (!possiblePhones.includes(cleanQuery)) possiblePhones.push(cleanQuery);
        if (!possiblePhones.includes(`+91${cleanQuery}`)) possiblePhones.push(`+91${cleanQuery}`);
        if (!possiblePhones.includes(`91${cleanQuery}`)) possiblePhones.push(`91${cleanQuery}`);
        
        addLog(`Querying users globally matching phones: ${possiblePhones.join(', ')}`);
        const phoneUsersSnap = await getDocs(query(collection(db, 'users'), where('phone', 'in', possiblePhones)));
        phoneUsersSnap.forEach(d => {
          usersDocs.push({ id: d.id, data: d.data() });
        });
      }

      // 2. Query all users specifically assigned to this bakeryId to cover any remaining keyword/role searches
      const bakeryUsersSnap = await getDocs(query(collection(db, 'users'), where('bakeryId', '==', bakeryId)));
      bakeryUsersSnap.forEach(d => {
        if (!usersDocs.some(u => u.id === d.id)) {
          usersDocs.push({ id: d.id, data: d.data() });
        }
      });

      // 3. Query dealers specifically assigned to this bakeryId (dealers query must have bakeryId filters per security rules)
      const dealersSnap = await getDocs(query(collection(db, 'dealers'), where('bakeryId', '==', bakeryId)));

      addLog(`Scanned unique users: ${usersDocs.length}, scanned dealers: ${dealersSnap.size}`);

      const matched: any[] = [];

      usersDocs.forEach(uDoc => {
        const u = uDoc.data;
        let isMatch = false;

        if (isPhoneSearch) {
          const docPh = u.phone ? String(u.phone).replace(/\D/g, '').slice(-10) : '';
          if (docPh && (docPh === cleanQuery || cleanQuery.includes(docPh) || docPh.includes(cleanQuery))) {
            isMatch = true;
          }
        } else {
          const name = (u.displayName || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          const role = (u.role || '').toLowerCase();
          const qLower = searchQuery.toLowerCase().trim();
          if (name.includes(qLower) || email.includes(qLower) || role.includes(qLower)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matched.push({
            id: uDoc.id,
            collection: 'users',
            data: u,
            type: 'User/Staff Access'
          });
        }
      });

      dealersSnap.forEach(docSnap => {
        const d = docSnap.data();
        let isMatch = false;

        if (isPhoneSearch) {
          const docPh = d.phone ? String(d.phone).replace(/\D/g, '').slice(-10) : '';
          if (docPh && (docPh === cleanQuery || cleanQuery.includes(docPh) || docPh.includes(cleanQuery))) {
            isMatch = true;
          }
        } else {
          const cName = (d.companyName || '').toLowerCase();
          const sName = (d.staffName || '').toLowerCase();
          const qLower = searchQuery.toLowerCase().trim();
          if (cName.includes(qLower) || sName.includes(qLower)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matched.push({
            id: docSnap.id,
            collection: 'dealers',
            data: d,
            type: 'Dealer Partner Profile'
          });
        }
      });

      setResults(matched);
      addLog(`Scan complete. Found ${matched.length} matching record(s).`);
    } catch (err: any) {
      console.error(err);
      addLog(`Error during scan: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleSearch();
    }
  }, [isOpen, initialPhone]);

  const handleRestore = async (rec: any) => {
    try {
      setLoading(true);
      addLog(`Attempting to repair & restore: ${rec.collection}/${rec.id}`);
      
      const docRef = doc(db, rec.collection, rec.id);
      
      if (rec.collection === 'users') {
        const defaultRole = rec.data.role === 'disabled' ? 'dealer' : rec.data.role;
        await updateDoc(docRef, {
          isDeleted: false,
          deletedAt: null,
          role: defaultRole
        });
        addLog(`Successfully enabled user doc [${rec.id}] with role "${defaultRole}".`);
      } else if (rec.collection === 'dealers') {
        await updateDoc(docRef, {
          isDeleted: false,
          deletedAt: null,
          active: true
        });
        addLog(`Successfully enabled dealer document [${rec.id}].`);
      }

      await createLog('staff', `Repaired & restored database record: ${rec.collection}/${rec.id}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
      alert('Record repaired and restored successfully!');
      handleSearch();
    } catch (err: any) {
      console.error(err);
      addLog(`Restore failed: ${err.message || String(err)}`);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (rec: any) => {
    if (!window.confirm(`Are you absolutely sure you want to PERMANENTLY DELETE this duplicate document (${rec.collection}/${rec.id})? This will permanently purge it from Firestore and cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      addLog(`Permanently deleting: ${rec.collection}/${rec.id}...`);
      
      await createArchive(rec.collection, rec.id, rec.data, 'delete');
      await deleteDoc(doc(db, rec.collection, rec.id));
      
      addLog(`Successfully deleted document [${rec.id}] from collection "${rec.collection}".`);
      await createLog('staff', `Permanently deleted duplicate record: ${rec.collection}/${rec.id}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
      
      alert('Duplicate record permanently deleted.');
      handleSearch();
    } catch (err: any) {
      console.error(err);
      addLog(`Deletion failed: ${err.message || String(err)}`);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOverwritePin = async (rec: any, newPin: string) => {
    if (!newPin || newPin.length !== 4) {
      alert('Please enter a 4-digit PIN.');
      return;
    }
    try {
      setLoading(true);
      addLog(`Updating PIN for ${rec.collection}/${rec.id} to ${newPin}...`);
      await updateDoc(doc(db, rec.collection, rec.id), { pin: newPin });
      addLog('PIN updated successfully.');
      alert('PIN updated and synchronized successfully!');
      handleSearch();
    } catch (err: any) {
      console.error(err);
      addLog(`Error setting PIN: ${err.message || String(err)}`);
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl animate-pulse">
              <Wrench className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold sm:text-lg text-white">Access & Duplication Real-Time Repair</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Scan, restore, or delete duplicated profiles</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-white/60 hover:text-white text-2xl px-2 font-bold focus:outline-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 flex gap-3 text-sky-800">
            <AlertCircle className="w-5 h-5 shrink-0 grow-0 text-sky-600 mt-0.5" />
            <div className="text-xs font-medium space-y-1">
              <p className="font-bold">Duplicate Entry Conflict Resolver</p>
              <p>When multiple records exist for the same number, login attempts may redirect to a legacy disabled account. Search, verify attributes, and delete the legacy, duplicate, or stale record to heal access immediately!</p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Enter Mobile (+91...) or Keyword..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button 
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Scan DB
            </button>
          </div>

          {logs.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 font-mono text-[9px] text-slate-600 max-h-24 overflow-y-auto">
              <p className="font-bold border-b border-slate-200/60 pb-1 mb-1">REAL-TIME DIAGNOSTIC LOGS:</p>
              {logs.map((log, i) => <p key={i}>{log}</p>)}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Matched Database Documents</h3>
            {loading && results.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                Scanning live collections...
              </div>
            ) : results.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center text-xs text-slate-400">
                No matching records found. Type a different mobile number or keyword above to scan.
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((rec) => {
                  const isDel = rec.data.isDeleted || (rec.collection === 'users' && rec.data.role === 'disabled');
                  return (
                    <div key={`${rec.collection}_${rec.id}`} className={`p-4 rounded-2xl border ${isDel ? 'border-amber-100 bg-amber-50/20' : 'border-green-100 bg-green-50/10'} flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-sm`}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${rec.collection === 'users' ? 'bg-indigo-100 text-indigo-700' : 'bg-pink-100 text-pink-700'}`}>
                            {rec.type}
                          </span>
                          <span className={`text-[8.5px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-full ${isDel ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {isDel ? '❌ Suspended / Deleted' : '✅ Active'}
                          </span>
                        </div>
                        
                        <div className="space-y-0.5">
                          <p className="text-sm font-extrabold text-slate-900">
                            {rec.collection === 'users' 
                              ? rec.data.displayName 
                              : `${rec.data.companyName} (${rec.data.staffName})`}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">
                            Path: <span className="text-slate-600 font-bold">{rec.collection}/{rec.id}</span>
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-medium text-slate-600 bg-white/60 p-2 rounded-xl">
                          <p>Phone: <span className="font-extrabold text-slate-800">{rec.data.phone || 'N/A'}</span></p>
                          <p>Role: <span className="font-extrabold text-slate-800">{rec.data.role || 'N/A'}</span></p>
                          <p>PIN: <span className="font-extrabold text-slate-800">{rec.data.pin || '1234'}</span></p>
                          {rec.data.email && <p>Email: <span className="font-extrabold text-slate-800">{rec.data.email}</span></p>}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 sm:w-44">
                        {isDel ? (
                          <button 
                            type="button"
                            onClick={() => handleRestore(rec)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 px-3 text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-50 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 size={13} />
                            Re-Enable Profile
                          </button>
                        ) : (
                          <div className="flex gap-1.5">
                            <input 
                              type="text"
                              maxLength={4}
                              placeholder="New"
                              className="w-16 bg-white border border-slate-200 text-center text-xs font-bold rounded-lg px-1 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleOverwritePin(rec, (e.target as any).value);
                                  (e.target as any).value = '';
                                }
                              }}
                            />
                            <button 
                              type="button"
                              onClick={(e) => {
                                const inputNode = (e.currentTarget.previousSibling as HTMLInputElement);
                                handleOverwritePin(rec, inputNode.value);
                                inputNode.value = '';
                              }}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-1 px-2 text-[8px] font-bold uppercase transition-all"
                            >
                              Sync PIN
                            </button>
                          </div>
                        )}
                        
                        <button 
                          type="button"
                          onClick={() => handleDelete(rec)}
                          className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl py-2 px-3 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                        >
                          <Trash2 size={13} />
                          Force Purge Document
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all focus:outline-none"
          >
            Close Resolver
          </button>
        </div>
      </div>
    </div>
  );
};
