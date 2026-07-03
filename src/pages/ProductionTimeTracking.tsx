import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { DrageesBatch, ProductionTracking } from '../types';
import { getActiveCost } from '../services/costService';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Play, 
  Pause, 
  Square, 
  Clock, 
  AlertCircle, 
  Info, 
  ChevronLeft,
  ChevronRight,
  Zap,
  HardHat,
  Monitor,
  Flame,
  CheckCircle2,
  Timer
} from 'lucide-react';
import { format, differenceInMinutes, differenceInSeconds } from 'date-fns';

const PAUSE_REASONS = [
  'Lunch / Break',
  'Power Cut',
  'Humidity Issues',
  'Machine Maintenance',
  'Raw Material Shortage',
  'Staff Shift Change'
];

export const ProductionTimeTracking: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const { bakery, user } = useAuth();
  const navigate = useNavigate();
  
  const [batch, setBatch] = useState<DrageesBatch | null>(null);
  const [tracking, setTracking] = useState<ProductionTracking | null>(null);
  const [labourRate, setLabourRate] = useState<number>(0);
  
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [showPauseModal, setShowPauseModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState(PAUSE_REASONS[0]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    if (!batchId) return;
    
    const unsubBatch = onSnapshot(doc(db, 'dragees_batches', batchId), (snap) => {
      if (snap.exists()) {
        setBatch({ id: snap.id, ...snap.data() } as DrageesBatch);
      }
    });

    const unsubTracking = onSnapshot(doc(db, 'production_tracking', batchId), async (snap) => {
      if (snap.exists()) {
        setTracking(snap.data() as ProductionTracking);
      } else {
        // Initialize tracking if it doesn't exist
        const initialTracking: ProductionTracking = {
          id: batchId,
          bakeryId: bakery?.id || '',
          assignedStaff: user?.displayName || user?.email || 'Unknown',
          startTime: null,
          status: 'NOT_STARTED',
          actualProductionTime: 0,
          totalPauseTime: 0,
          labourCostActual: 0,
          labourCostEstimated: 0,
          pauses: []
        };
        await setDoc(doc(db, 'production_tracking', batchId), initialTracking);
      }
    });

    if (bakery?.id) {
      getActiveCost(bakery.id).then(cost => setLabourRate(cost?.labourCostPerHour || 40));
    }

    return () => {
      unsubBatch();
      unsubTracking();
    };
  }, [batchId, bakery]);

  // Main Timer Effect
  useEffect(() => {
    if (tracking?.status === 'RUNNING') {
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
      timerRef.current = setInterval(() => {
        if (tracking?.startTime) {
          const start = tracking.startTime.toDate();
          const now = new Date();
          const totalFromStart = differenceInSeconds(now, start);
          setElapsedSeconds(totalFromStart - tracking.totalPauseTime * 60);
        }
      }, 1000);
    } else if (tracking?.status === 'PAUSED') {
      if (timerRef.current) clearInterval(timerRef.current);
      pauseTimerRef.current = setInterval(() => {
        const lastPause = tracking.pauses[tracking.pauses.length - 1];
        if (lastPause?.pauseStart) {
          const start = lastPause.pauseStart.toDate();
          const now = new Date();
          setPauseSeconds(tracking.totalPauseTime * 60 + differenceInSeconds(now, start));
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pauseTimerRef.current) clearInterval(pauseTimerRef.current);
    };
  }, [tracking?.status, tracking?.startTime, tracking?.totalPauseTime]);

  const handleStart = async () => {
    if (!batchId) return;
    await updateDoc(doc(db, 'production_tracking', batchId), {
      status: 'RUNNING',
      startTime: serverTimestamp()
    });
  };

  const handlePause = async () => {
    if (!batchId || !tracking) return;
    const newPauses = [...tracking.pauses, { reason: selectedReason, pauseStart: new Date() }];
    await updateDoc(doc(db, 'production_tracking', batchId), {
      status: 'PAUSED',
      pauses: newPauses
    });
    setShowPauseModal(false);
  };

  const handleResume = async () => {
    if (!batchId || !tracking) return;
    const updatedPauses = [...tracking.pauses];
    const lastPause = updatedPauses[updatedPauses.length - 1];
    if (lastPause) {
      lastPause.pauseEnd = new Date();
      lastPause.duration = differenceInMinutes(lastPause.pauseEnd, (lastPause.pauseStart as any).toDate ? (lastPause.pauseStart as any).toDate() : lastPause.pauseStart);
    }
    
    const totalPause = updatedPauses.reduce((acc, p) => acc + (p.duration || 0), 0);

    await updateDoc(doc(db, 'production_tracking', batchId), {
      status: 'RUNNING',
      pauses: updatedPauses,
      totalPauseTime: totalPause
    });
  };

  const handleComplete = async () => {
    if (!batchId || !tracking || !batch) return;
    
    const end = new Date();
    const start = tracking.startTime.toDate();
    const totalWorkTime = differenceInMinutes(end, start) - tracking.totalPauseTime;
    
    const labActual = (totalWorkTime / 60) * labourRate;
    const labEst = batch.costBreakdown?.labour ?? 0;

    const efficiency = totalWorkTime <= 240 ? 'On Time' : (totalWorkTime <= 300 ? 'Slightly Over' : 'Significantly Over');

    await updateDoc(doc(db, 'production_tracking', batchId), {
      status: 'COMPLETED',
      endTime: end,
      actualProductionTime: totalWorkTime,
      labourCostActual: labActual,
      labourCostEstimated: labEst,
      efficiencyStatus: efficiency
    });

    await updateDoc(doc(db, 'dragees_batches', batchId), {
      status: 'completed'
    });
  };

  const handleSaveName = async () => {
    if (!batchId || !tempName.trim()) return;
    try {
      await updateDoc(doc(db, 'dragees_batches', batchId), {
        productName: tempName.trim()
      });
      setIsEditingName(false);
    } catch (err) {
      console.error(err);
      alert('Error updating product name');
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!batch || !tracking) return <div className="p-20 text-center font-black animate-pulse uppercase tracking-widest text-slate-400">Loading Batch Pipeline...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-all">
          <ChevronLeft />
        </button>
        <div className="text-center">
          <h1 className="font-black text-slate-900">Dragees Production</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking Batch #{batch?.batchNo || batchId?.slice(-6).toUpperCase()}</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Product Variant Naming Section */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1 w-full sm:w-auto">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dragee Product Variant</p>
          {isEditingName ? (
            <div className="flex flex-col sm:flex-row gap-2 mt-1 w-full max-w-lg">
              <input 
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all flex-grow min-w-[200px]"
                placeholder="Product name, e.g. Almond Dark Chocolate Dragee"
              />
              <select 
                onChange={e => { if (e.target.value) setTempName(e.target.value); }}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold text-slate-500 cursor-pointer appearance-none outline-none"
              >
                <option value="">-- Or Choose Preset --</option>
                {[
                  'Almond Dark Chocolate Dragee',
                  'Almond Milk Chocolate Dragee',
                  'Hazelnut Dark Chocolate Dragee',
                  'Blueberry Dark Chocolate Dragee',
                  'Cranberry Dark Chocolate Dragee',
                  'Butterscotch White Chocolate Dragee',
                  'Coffee Bean Milk Chocolate Dragee',
                  'Pistachio Couverture Dragee',
                  'Macadamia Gold Dragee',
                  'Salted Caramel Dragee'
                ].map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          ) : (
            <h3 className="text-sm font-black text-blue-600 uppercase font-mono tracking-wide">
              {batch.productName || 'Unnamed Dragee Product'}
            </h3>
          )}
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto justify-end">
          {isEditingName ? (
            <>
              <button
                onClick={() => setIsEditingName(false)}
                className="px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 hover:bg-slate-250 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                className="px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm font-mono"
              >
                Save Name
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setTempName(batch.productName || 'Almond Dark Chocolate Dragee');
                setIsEditingName(true);
              }}
              className="px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-100 font-mono"
            >
              Name This Product
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Batch Size</p>
          <p className="text-xl font-black text-slate-900">{batch.batchSize} KG</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pan Machine</p>
          <p className="text-xl font-black text-slate-900">{batch.machine}</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Time</p>
          <p className="text-xl font-black text-blue-600">4.0 h</p>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Staff</p>
          <p className="text-[10px] font-black text-slate-900 truncate uppercase mt-1.5">{tracking.assignedStaff}</p>
        </div>
      </div>

      {/* Main Timer Display */}
      <div className="bg-slate-900 rounded-[3rem] p-12 text-center text-white relative overflow-hidden shadow-2xl">
        {/* Animated Zap Overlay when running */}
        {tracking.status === 'RUNNING' && (
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <Zap className="w-full h-full text-blue-400 animate-pulse" />
          </div>
        )}

        <div className="relative z-10">
          <Timer className={cn(
             "w-12 h-12 mx-auto mb-6",
             tracking.status === 'RUNNING' ? "text-blue-400 animate-spin-slow" : "text-slate-600"
          )} />
          <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Actual Production Time</p>
          <h2 className="text-7xl font-black font-mono tracking-tighter mb-8 tabular-nums">
            {formatTime(tracking.status === 'COMPLETED' ? tracking.actualProductionTime * 60 : elapsedSeconds)}
          </h2>
          
          <div className="flex justify-center items-center gap-12 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <div>
              <p className="opacity-60 mb-1">Start Time</p>
              <p className="text-white">{tracking.startTime ? format(tracking.startTime.toDate(), 'HH:mm') : '--:--'}</p>
            </div>
            <div>
              <p className="opacity-60 mb-1">Pause Time</p>
              <p className="text-amber-400">{formatTime(tracking.status === 'COMPLETED' ? tracking.totalPauseTime * 60 : pauseSeconds)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-6 py-4">
        {tracking.status === 'NOT_STARTED' && (
          <button 
            onClick={handleStart}
            className="w-full max-w-xs bg-blue-600 text-white rounded-full py-6 font-black uppercase tracking-widest shadow-xl shadow-blue-100 flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all"
          >
            <Play className="w-6 h-6 fill-current" /> Start Production
          </button>
        )}

        {tracking.status === 'RUNNING' && (
          <>
            <button 
              onClick={() => setShowPauseModal(true)}
              className="flex-1 bg-amber-500 text-white rounded-[2rem] py-8 font-black uppercase tracking-widest shadow-xl shadow-amber-100 flex flex-col items-center gap-2 hover:bg-amber-600 transition-all"
            >
              <Pause className="w-8 h-8 fill-current" />
              <span>Pause</span>
            </button>
            <button 
              onClick={handleComplete}
              className="flex-1 bg-green-500 text-white rounded-[2rem] py-8 font-black uppercase tracking-widest shadow-xl shadow-green-100 flex flex-col items-center gap-2 hover:bg-green-600 transition-all"
            >
              <CheckCircle2 className="w-8 h-8" />
              <span>Finish</span>
            </button>
          </>
        )}

        {tracking.status === 'PAUSED' && (
          <button 
            onClick={handleResume}
            className="w-full max-w-xs bg-indigo-600 text-white rounded-full py-10 font-black uppercase tracking-widest shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 animate-pulse"
          >
            <Play className="w-8 h-8 fill-current" /> Resume Now
          </button>
        )}

        {tracking.status === 'COMPLETED' && (
          <div className="w-full text-center p-8 bg-green-50 border border-green-200 rounded-3xl">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="font-black text-slate-900 uppercase">Batch Completed Successfully</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-2">Efficiency Rating: {tracking.efficiencyStatus}</p>
          </div>
        )}
      </div>

      {/* Pause Log */}
      {tracking.pauses.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batch Interruption Log</h3>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {tracking.pauses.map((p, i) => (
              <div key={i} className="p-4 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 font-black text-xs">{i+1}</div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{p.reason}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                       {p.pauseStart ? format(p.pauseStart.toDate ? p.pauseStart.toDate() : p.pauseStart as Date, 'HH:mm') : ''}
                       {p.pauseEnd ? ` → ${format(p.pauseEnd.toDate ? p.pauseEnd.toDate() : p.pauseEnd as Date, 'HH:mm')}` : ' (Ongoing)'}
                    </p>
                  </div>
                </div>
                {p.duration && <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-full">{p.duration} MIN</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pause Reason Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-6 text-center">Reason for Pause?</h3>
            <div className="grid grid-cols-1 gap-2 mb-8">
              {PAUSE_REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedReason(r)}
                  className={cn(
                    "px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-left",
                    selectedReason === r ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowPauseModal(false)}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400"
              >
                Cancel
              </button>
              <button 
                onClick={handlePause}
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-amber-500 shadow-lg shadow-amber-100"
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
