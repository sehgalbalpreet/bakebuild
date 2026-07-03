import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, orderBy, limit, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getActiveCost, MonthlyCost, getNextBatchNumber } from '../services/costService';
import { cn, formatCurrency } from '../lib/utils';
import { DrageesBatch } from '../types';
import { 
  Calculator, 
  Settings, 
  Package, 
  TrendingUp, 
  AlertCircle, 
  ChevronRight, 
  Save, 
  History,
  Info,
  Clock,
  Zap,
  HardHat,
  Tag
} from 'lucide-react';
import { format } from 'date-fns';
import { AIPricingPredictor } from '../components/bakery-admin/AIPricingPredictor';

export const DrageesCostSetup: React.FC = () => {
  const { bakery, user, profile, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryBatchId = searchParams.get('batchId') || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCost, setActiveCost] = useState<MonthlyCost | null>(null);
  
  // Existing batches state for selection
  const [batches, setBatches] = useState<DrageesBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  // --- State Variables ---
  // Batch Settings
  const [centerWeight, setCenterWeight] = useState<number>(10); // kg center (e.g. almonds)
  const [coatingRatio, setCoatingRatio] = useState<number>(2); // Ratio of chocolate to center (e.g. 2 means 2:1)
  const [roastingCostPerKg, setRoastingCostPerKg] = useState<number>(20); // Rs/KG of center for roasting
  const [roastingMoistureLoss, setRoastingMoistureLoss] = useState<number>(10); // % moisture loss during roasting, e.g. 10%
  const [yieldLoss, setYieldLoss] = useState<number>(2); // %
  const [outputKg, setOutputKg] = useState<number>(26.46); // (10 * 0.9 * 3) * 0.98 = 26.46
  const [chocolateType, setChocolateType] = useState<'Compound' | 'Couverture' | 'Both'>('Compound');
  const [machine, setMachine] = useState<string>('Coating Pan 1');

  // Profit & Pricing
  const [profitPercent, setProfitPercent] = useState<number>(30); // % profit on cost
  const [wholesaleProfitPercent, setWholesaleProfitPercent] = useState<number>(15); // profit for wholesale after standard margin

  // Raw Material Costs (per kg / batch)
  const [chocolateCostOverride, setChocolateCostOverride] = useState<string>('');
  const [centerCostOverride, setCenterCostOverride] = useState<string>('');
  const [centerType, setCenterType] = useState<string>('Almond');
  const [centerRatio, setCenterRatio] = useState<number>(40); // % center
  const [colorCost, setColorCost] = useState<number>(25); // fixed per batch
  const [otherCost, setOtherCost] = useState<number>(15); // fixed per batch

  // Production Costs
  const [estimatedHours, setEstimatedHours] = useState<number>(4);
  const [electricityPerHourOverride, setElectricityPerHourOverride] = useState<string>('');
  const [labourPerHourOverride, setLabourPerHourOverride] = useState<string>('');

  // Packaging Costs
  const [packagingMode, setPackagingMode] = useState<'Wholesale' | 'Retail' | 'Split'>('Wholesale');
  const [wholesaleSplit, setWholesaleSplit] = useState<number>(50); // %
  // Packaging unit costs
  const [pouchCost, setPouchCost] = useState<number>(8);
  const [jarCost, setJarCost] = useState<number>(18);
  const [labelCost, setLabelCost] = useState<number>(4);

  // Final Price Selection
  const [wholesalePriceFinal, setWholesalePriceFinal] = useState<number>(0);
  const [retailPriceFinal, setRetailPriceFinal] = useState<number>(0);
  const [manuallyAdjusted, setManuallyAdjusted] = useState<{ws: boolean, rt: boolean}>({ ws: false, rt: false });

  // --- Effects ---
  useEffect(() => {
    const init = async () => {
      if (!bakery?.id) {
        setLoading(false);
        return;
      }
      const cost = await getActiveCost(bakery.id);
      setActiveCost(cost);
      if (cost?.wholesaleMargin) setProfitPercent(cost.wholesaleMargin);
      setLoading(false);
    }
    init();
  }, [bakery]);

  // Fetch recent batches for selection
  useEffect(() => {
    if (!bakery?.id) return;
    const q = query(
      collection(db, 'dragees_batches'),
      where('bakeryId', '==', bakery.id),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(q, (snap) => {
      const loadedBatches = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DrageesBatch));
      setBatches(loadedBatches);
      
      // Auto-select queryBatchId if provided in query search params
      if (queryBatchId && loadedBatches.some(b => b.id === queryBatchId)) {
        setSelectedBatchId(queryBatchId);
      }
    });
    return () => unsub();
  }, [bakery, queryBatchId]);

  // Effect to synchronize fields when selectedBatchId changes!
  useEffect(() => {
    if (!selectedBatchId) return;
    const b = batches.find(x => x.id === selectedBatchId);
    if (b) {
      // Calculate center weight that matches the batchSize
      // batchSize = centerWeight * (1 - moistureLoss/100) * (1 + ratio)
      const moistureFactor = 1 - (roastingMoistureLoss / 100);
      const ratioFactor = 1 + coatingRatio;
      const targetCenter = b.batchSize / (moistureFactor * ratioFactor);
      setCenterWeight(Math.round(targetCenter * 10) / 10);
      
      if (b.machine) setMachine(b.machine);
      if (b.chocolateType) setChocolateType(b.chocolateType as any);
    }
  }, [selectedBatchId, batches]);

  // Sync output when center weight, ratio, roasting moisture loss or yield loss changes
  useEffect(() => {
    const roastedWt = centerWeight * (1 - roastingMoistureLoss / 100);
    const totalInput = roastedWt + (roastedWt * coatingRatio);
    setOutputKg(totalInput * (1 - yieldLoss / 100));
  }, [centerWeight, coatingRatio, yieldLoss, roastingMoistureLoss]);

  // --- Calculations ---
  const calcs = useMemo(() => {
    const choCost = parseFloat(chocolateCostOverride) || (chocolateType === 'Compound' ? activeCost?.chocolateCostCompound : activeCost?.chocolateCostCouverture) || (chocolateType === 'Both' ? ((activeCost?.chocolateCostCompound || 0) + (activeCost?.chocolateCostCouverture || 0)) / 2 : 0) || 450; // Fallback to 450 if all else fails
    
    const cenCost = parseFloat(centerCostOverride) || activeCost?.centerCost || 350; // Fallback to 350
    const eleCostHr = parseFloat(electricityPerHourOverride) || activeCost?.electricityCostPerHour || 15;
    const labCostHr = parseFloat(labourPerHourOverride) || activeCost?.labourCostPerHour || 40;

    const roastedCenterWeight = centerWeight * (1 - roastingMoistureLoss / 100);
    const totalRoastingCost = centerWeight * roastingCostPerKg;
    const rawCenterCost = centerWeight * cenCost;
    const finalCenterCostAfterRoastingAndLoss = roastedCenterWeight > 0 ? (rawCenterCost + totalRoastingCost) / roastedCenterWeight : 0;

    const chocolateWeight = roastedCenterWeight * coatingRatio;
    const batchSize = roastedCenterWeight + chocolateWeight;

    const totalRawCost = rawCenterCost + totalRoastingCost + (chocolateWeight * choCost) + colorCost + otherCost;
    const totalEleCost = eleCostHr * estimatedHours;
    const totalLabCost = labCostHr * estimatedHours;

    const productionCost = totalRawCost + totalEleCost + totalLabCost;

    // Packaging Details
    let pouchCount = 0;
    let jarCount = 0;
    let totalPkgCost = 0;

    if (packagingMode === 'Wholesale') {
      pouchCount = Math.floor(outputKg); 
      totalPkgCost = pouchCount * (pouchCost + labelCost);
    } else if (packagingMode === 'Retail') {
      jarCount = Math.floor(outputKg / 0.150);
      totalPkgCost = jarCount * (jarCost + labelCost);
    } else {
      const wholesaleOutput = outputKg * (wholesaleSplit / 100);
      const retailOutput = outputKg * (1 - wholesaleSplit / 100);
      pouchCount = Math.floor(wholesaleOutput);
      jarCount = Math.floor(retailOutput / 0.150);
      totalPkgCost = (pouchCount * (pouchCost + labelCost)) + (jarCount * (jarCost + labelCost));
    }

    const totalBatchCost = productionCost + totalPkgCost;
    const wholesaleCostPerKg = outputKg > 0 ? (productionCost / outputKg) + pouchCost + labelCost : 0;
    const retailCostPer150g = outputKg > 0 ? (productionCost / outputKg * 0.150) + jarCost + labelCost : 0;

    // Price Suggestions based on Profit %
    const wsSuggested = Math.ceil((wholesaleCostPerKg * (1 + profitPercent / 100)) / 5) * 5;
    const rtSuggested = Math.ceil((retailCostPer150g * (1 + (profitPercent + 20) / 100)) / 5) * 5; // Retail usually higher margin

    return {
      productionCost,
      totalPkgCost,
      totalBatchCost,
      costPerKg: wholesaleCostPerKg,
      costPer150g: retailCostPer150g,
      wsSuggested,
      rtSuggested,
      wsMarginActual: wholesalePriceFinal > 0 ? ((wholesalePriceFinal / wholesaleCostPerKg) - 1) * 100 : 0,
      rtMarginActual: retailPriceFinal > 0 ? ((retailPriceFinal / retailCostPer150g) - 1) * 100 : 0,
      pouchCount,
      jarCount,
      targetWsMargin: profitPercent,
      targetRtMargin: profitPercent + 20,
      chocolateWeight,
      roastedCenterWeight,
      finalCenterCostAfterRoastingAndLoss,
      totalRoastingCost,
      rawCenterCost,
      totalBatchSize: batchSize,
      totalRawCost,
      totalEleCost,
      totalLabCost
    };
  }, [
    activeCost, 
    centerWeight,
    coatingRatio,
    roastingCostPerKg,
    roastingMoistureLoss,
    yieldLoss, 
    chocolateType, 
    chocolateCostOverride, 
    centerCostOverride, 
    colorCost, 
    otherCost,
    estimatedHours,
    electricityPerHourOverride,
    labourPerHourOverride,
    packagingMode,
    wholesaleSplit,
    pouchCost,
    jarCost,
    labelCost,
    wholesalePriceFinal,
    retailPriceFinal,
    outputKg,
    profitPercent
  ]);

  // Set suggested prices if none chosen or not manually adjusted
  useEffect(() => {
    if (!manuallyAdjusted.ws && calcs.wsSuggested > 0) {
      setWholesalePriceFinal(calcs.wsSuggested);
    }
    if (!manuallyAdjusted.rt && calcs.rtSuggested > 0) {
      setRetailPriceFinal(calcs.rtSuggested);
    }
  }, [calcs.wsSuggested, calcs.rtSuggested, manuallyAdjusted]);

  const handleSave = async () => {
    if (!user) {
      alert("No authenticated user found. Please sign in.");
      return;
    }
    if (!bakery?.id) {
      alert("No active bakery associated with your profile. If you are a Super Admin, please impersonate or select a bakery first from the admin dashboard.");
      return;
    }
    setSaving(true);
    try {
      // Save/Update the global monthly cost setup doc for this month so it has real values and dismisses the warning band
      const monthStr = format(new Date(), 'yyyy-MM');
      const docId = `${bakery.id}_${monthStr}`;

      const choCompound = chocolateType === 'Compound' ? (parseFloat(chocolateCostOverride) || activeCost?.chocolateCostCompound || 450) : (activeCost?.chocolateCostCompound || 450);
      const choCouverture = chocolateType === 'Couverture' ? (parseFloat(chocolateCostOverride) || activeCost?.chocolateCostCouverture || 550) : (activeCost?.chocolateCostCouverture || 550);
      const centerPrice = parseFloat(centerCostOverride) || activeCost?.centerCost || 350;
      const eleCostRate = parseFloat(electricityPerHourOverride) || activeCost?.electricityCostPerHour || 15;
      const labCostRate = parseFloat(labourPerHourOverride) || activeCost?.labourCostPerHour || 40;

      await setDoc(doc(db, 'monthly_costs', docId), {
        bakeryId: bakery.id,
        month: monthStr,
        chocolateCostCompound: choCompound,
        chocolateCostCouverture: choCouverture,
        centerCost: centerPrice,
        electricityCostPerHour: eleCostRate,
        labourCostPerHour: labCostRate,
        wholesaleMargin: profitPercent,
        retailMargin: profitPercent + 20,
        updatedAt: serverTimestamp()
      }, { merge: true });

      let batchRefId = selectedBatchId;

      if (selectedBatchId) {
        // Update existing batch in-place!
        await setDoc(doc(db, 'dragees_batches', selectedBatchId), {
          centerWeight,
          coatingRatio,
          roastingCostPerKg,
          roastingMoistureLoss,
          roastedCenterWeight: calcs.roastedCenterWeight,
          finalCenterCostAfterRoastingAndLoss: calcs.finalCenterCostAfterRoastingAndLoss,
          batchSize: calcs.totalBatchSize,
          actualOutputKg: outputKg,
          perKgCost: calcs.costPerKg || 0,
          chocolateType,
          costBreakdown: {
            rawMaterials: calcs.totalRawCost,
            electricity: calcs.totalEleCost,
            labour: calcs.totalLabCost,
            packaging: calcs.totalPkgCost
          },
          suggestedPrices: {
            wholesale: calcs.wsSuggested,
            retail: calcs.rtSuggested
          },
          finalPrices: {
            wholesale: wholesalePriceFinal,
            retail: retailPriceFinal
          },
          savedToPriceList: true,
          updatedAt: serverTimestamp(),
          updatedBy: user.displayName || user.email
        }, { merge: true });
      } else {
        // Create a new batch document
        const nextBatchNo = await getNextBatchNumber(bakery.id, calcs.totalBatchSize);

        const batchRef = await addDoc(collection(db, 'dragees_batches'), {
          bakeryId: bakery.id,
          batchNo: nextBatchNo,
          centerWeight,
          coatingRatio,
          roastingCostPerKg,
          roastingMoistureLoss,
          roastedCenterWeight: calcs.roastedCenterWeight,
          finalCenterCostAfterRoastingAndLoss: calcs.finalCenterCostAfterRoastingAndLoss,
          batchSize: calcs.totalBatchSize,
          actualOutputKg: outputKg,
          perKgCost: calcs.costPerKg || 0,
          machine,
          chocolateType,
          costBreakdown: {
            rawMaterials: calcs.totalRawCost,
            electricity: calcs.totalEleCost,
            labour: calcs.totalLabCost,
            packaging: calcs.totalPkgCost
          },
          suggestedPrices: {
            wholesale: calcs.wsSuggested,
            retail: calcs.rtSuggested
          },
          finalPrices: {
            wholesale: wholesalePriceFinal,
            retail: retailPriceFinal
          },
          savedToPriceList: true,
          status: 'draft',
          createdAt: serverTimestamp(),
          createdBy: user.displayName || user.email
        });
        batchRefId = batchRef.id;
      }

      // Also save to price list
      await addDoc(collection(db, 'dragees_price_list'), {
        bakeryId: bakery.id,
        wholesalePricePerKg: wholesalePriceFinal,
        retailPricePerJar: retailPriceFinal,
        marginWholesale: calcs.wsMarginActual,
        marginRetail: calcs.rtMarginActual,
        batchRef: batchRefId,
        date: format(new Date(), 'yyyy-MM-dd'),
        savedBy: user.displayName || user.email,
        savedAt: serverTimestamp()
      });

      alert(selectedBatchId ? 'Costing parameters configured/updated and prices published to price list for the selected batch!' : 'Cost setup saved, current monthly cost rates initialized/updated, and prices published to price list!');
      navigate('/dashboard/dragees-production');
    } catch (err: any) {
      console.error(err);
      alert('Error saving cost setup: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20 animate-pulse font-black text-slate-400 uppercase tracking-widest">Warming Pan...</div>;

  if (profile && profile.role !== 'bakery_admin' && !isSuperAdmin) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white border border-slate-200 shadow-xl rounded-[2.5rem] text-center my-12 space-y-6">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
          <HardHat className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Access Restricted</h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            The Dragee Cost Calculator and pricing configuration panel is restricted to Bakery Administrators only. Please coordinate with your administrator for setup modification.
          </p>
        </div>
        <button 
          onClick={() => navigate('/dashboard/dragees-production')} 
          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3 text-[10px] uppercase font-black tracking-widest transition-all font-mono"
        >
          Go to Dragees Production
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-100">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">Dragees Cost Calculator</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Precise unit costing & pricing engine</p>
          </div>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button 
            onClick={() => navigate(-1)}
            className="flex-1 md:flex-none px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
          >
            Back
          </button>
          <button 
            disabled={saving || !bakery?.id}
            onClick={handleSave}
            className="flex-1 md:flex-none px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-2"
          >
            {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save & Publish</>}
          </button>
        </div>
      </div>

      {!activeCost && (
        <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex items-center gap-4 text-amber-700">
          <AlertCircle className="shrink-0 w-6 h-6" />
          <p className="text-xs font-bold uppercase tracking-wide">
            Monthly Cost Setup missing for this month. Please configure global costs first for accurate estimation.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input Form */}
        <div className="lg:col-span-8 space-y-8">

          {/* Section: Link to Started Batch */}
          <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 border border-slate-800 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-amber-500">
                  <Zap className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Link to Production Batch</h3>
                  <p className="text-[10px] text-slate-300 font-semibold mt-1">Select an active or completed production batch to configure pricing</p>
                </div>
              </div>
              {selectedBatchId && (
                <button 
                  type="button" 
                  onClick={() => setSelectedBatchId('')}
                  className="bg-red-500/15 hover:bg-red-500/30 text-red-400 text-[8px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors font-mono cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="relative">
                <select
                  value={selectedBatchId}
                  onChange={e => setSelectedBatchId(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-amber-500/20 transition-all text-white appearance-none cursor-pointer"
                >
                  <option value="">-- Create New Standalone Batch --</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                      Batch #{b.batchNo || b.id.slice(-6).toUpperCase()} {b.productName ? `[${b.productName}]` : ''} ({b.batchSize} KG) — {b.machine} [{b.status.replace('_', ' ').toUpperCase()}]
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none text-slate-400">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
              </div>

              {selectedBatchId && (
                <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl flex flex-col gap-2 text-[10px] text-slate-300 font-bold leading-relaxed">
                  <p className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                    {(() => {
                      const activeB = batches.find(x => x.id === selectedBatchId);
                      return (
                        <span>Costing will be applied and published directly to <strong>Batch #{activeB?.batchNo} {activeB?.productName ? `(${activeB.productName})` : ''}</strong>.</span>
                      );
                    })()}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium">
                    The calculator automatically estimates starting center weights based on your input batch size ({batches.find(x => x.id === selectedBatchId)?.batchSize} KG) and target coating ratio.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Section 1: Batch & Center */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                Batch & Center Settings
              </h2>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Center Details</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1">Type (e.g. Almond)</p>
                      <input value={centerType} onChange={e => setCenterType(e.target.value)} placeholder="Almond" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1">Weight (KG)</p>
                      <input 
                        type="number" 
                        value={centerWeight} 
                        onChange={e => setCenterWeight(parseFloat(e.target.value) || 0)} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 font-black text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all" 
                      />
                    </div>
                  </div>
                  <input type="range" min="1" max="100" step="0.5" value={centerWeight || 10} onChange={e => setCenterWeight(parseFloat(e.target.value) || 10)} className="w-full accent-blue-600 mt-4" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Coating Ratio (Chocolate : Center)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 1.5, 2, 2.5].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCoatingRatio(r)}
                        className={cn(
                          "py-3 rounded-xl border text-[10px] font-black transition-all",
                          coatingRatio === r ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" : "bg-white border-slate-100 text-slate-400 hover:border-blue-200"
                        )}
                      >
                        {r}:1
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold mt-2 font-mono ml-1">Current: {coatingRatio}:1 ratio ({coatingRatio}kg chocolate for every 1kg center)</p>
                </div>

                {/* Roasting & Moisture Loss Block */}
                <div className="p-5 rounded-3xl border border-slate-200 bg-slate-50/40 space-y-4">
                  <span className="block text-[9px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500 animate-pulse" />
                    Roasting & moisture loss controls
                  </span>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1">Roasting Cost/KG (₹)</p>
                      <input 
                        type="number" 
                        value={roastingCostPerKg} 
                        onChange={e => setRoastingCostPerKg(Math.max(0, parseFloat(e.target.value) || 0))} 
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono text-slate-850" 
                      />
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1">Moist. Loss (%)</p>
                      <input 
                        type="number" 
                        value={roastingMoistureLoss} 
                        onChange={e => setRoastingMoistureLoss(Math.max(0, Math.min(90, parseFloat(e.target.value) || 0)))} 
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono text-slate-850" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 text-[9px] font-bold text-slate-600 leading-tight">
                    <div className="p-3 bg-white rounded-xl border border-slate-100">
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Roasted Weight</span>
                      <span className="text-xs font-black text-slate-800">{calcs.roastedCenterWeight.toFixed(2)} KG</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-100">
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Roasted Center Cost</span>
                      <span className="text-xs font-black text-amber-600">{formatCurrency(calcs.finalCenterCostAfterRoastingAndLoss)} / KG</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[8px] font-black uppercase tracking-widest text-blue-400">Calculated Chocolate</p>
                    <p className="text-lg font-black text-blue-900">{calcs.chocolateWeight.toFixed(2)} KG</p>
                  </div>
                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700 flex flex-col justify-center items-center text-white">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Gross Roasted Batch Weight</p>
                    <p className="text-lg font-black text-blue-400">{calcs.totalBatchSize.toFixed(2)} KG</p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Machine Selection</label>
                  <select value={machine} onChange={e => setMachine(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all">
                    <option>Coating Pan 1</option>
                    <option>Coating Pan 2 (High Vol)</option>
                    <option>Mini Pan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Yield Loss (%)</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="0" max="10" step="0.5" value={yieldLoss || 0} onChange={e => setYieldLoss(parseFloat(e.target.value) || 0)} className="flex-1 accent-amber-500" />
                    <span className="w-16 text-center font-black text-slate-900 bg-slate-100 py-2 rounded-xl border border-slate-200">{yieldLoss || 0}%</span>
                  </div>
                </div>
                <div className="p-6 bg-amber-50 rounded-[2rem] border border-amber-100/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Final Net Output</p>
                      <p className="text-xl font-black text-slate-900">{outputKg.toFixed(2)} KG</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Material Costs */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                Material Cost Integration
              </h2>
            </div>
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Chocolate Type</label>
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                      {['Compound', 'Couverture', 'Both'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setChocolateType(t as any)}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            chocolateType === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Chocolate Base Cost (per KG)</label>
                    <input 
                      type="number"
                      placeholder={chocolateType === 'Compound' ? activeCost?.chocolateCostCompound?.toString() : activeCost?.chocolateCostCouverture?.toString()}
                      value={chocolateCostOverride}
                      onChange={e => setChocolateCostOverride(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all border-dashed"
                    />
                    <p className="text-[9px] text-slate-400 font-bold mt-2 ml-1">Leave empty to use Monthly Setup cost</p>
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Center Base Cost (per KG)</label>
                    <input 
                      type="number"
                      placeholder={activeCost?.centerCost?.toString()}
                      value={centerCostOverride}
                      onChange={e => setCenterCostOverride(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all border-dashed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Color/Flavor</label>
                      <input type="number" value={colorCost || 0} onChange={e => setColorCost(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                    <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Misc. Addons</label>
                      <input type="number" value={otherCost || 0} onChange={e => setOtherCost(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Utility & Labour */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Operational Overheads
              </h2>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Estimated Production Time (Hours)</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="1" max="12" step="0.5" value={estimatedHours || 1} onChange={e => setEstimatedHours(parseFloat(e.target.value) || 1)} className="flex-1 accent-blue-600" />
                    <span className="w-16 text-center font-black text-slate-900 bg-slate-100 py-2 rounded-xl border border-slate-200">{estimatedHours || 1}h</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Profit Margin (%)</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="5" max="100" step="5" value={profitPercent} onChange={e => setProfitPercent(parseFloat(e.target.value))} className="flex-1 accent-emerald-500" />
                    <span className="w-16 text-center font-black text-emerald-600 bg-emerald-50 py-2 rounded-xl border border-emerald-100">{profitPercent}%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Elec. Rate/hr</label>
                  <input type="number" placeholder={activeCost?.electricityCostPerHour?.toString()} value={electricityPerHourOverride} onChange={e => setElectricityPerHourOverride(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Labour Rate/hr</label>
                  <input type="number" placeholder={activeCost?.labourCostPerHour?.toString()} value={labourPerHourOverride} onChange={e => setLabourPerHourOverride(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Packaging Efficiency */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Package className="w-4 h-4 text-purple-600" />
                Packaging Logic
              </h2>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Packaging Mode</label>
                   <div className="grid grid-cols-3 gap-2">
                     {['Wholesale', 'Retail', 'Split'].map(m => (
                       <button
                         key={m}
                         onClick={() => setPackagingMode(m as any)}
                         className={cn(
                           "py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                           packagingMode === m ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-100" : "bg-white border-slate-100 text-slate-400 hover:border-purple-200"
                         )}
                       >
                         {m}
                       </button>
                     ))}
                   </div>
                </div>
                {packagingMode === 'Split' && (
                  <div className="animate-in slide-in-from-left-4 duration-300">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Wholesale Pouch Share (%)</label>
                    <div className="flex items-center gap-4">
                      <input type="range" min="0" max="100" step="5" value={wholesaleSplit || 0} onChange={e => setWholesaleSplit(parseFloat(e.target.value) || 0)} className="flex-1 accent-purple-600" />
                      <span className="w-16 text-center font-black text-slate-900 bg-slate-100 py-2 rounded-xl border border-slate-200">{wholesaleSplit || 0}%</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Pouch (1kg)</label>
                  <input type="number" value={pouchCost || 0} onChange={e => setPouchCost(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Jar (150g)</label>
                  <input type="number" value={jarCost || 0} onChange={e => setJarCost(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">Labels</label>
                  <input type="number" value={labelCost || 0} onChange={e => setLabelCost(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 font-bold text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Calculations & Results */}
        <div className="lg:col-span-4 space-y-8">
          
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
            {/* Glossy overlay */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
            
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-white/10 pb-4 flex justify-between items-center">
              Batch Cost Analysis
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </h2>
            
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-white/5 pb-4">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Production Cost</p>
                  <p className="text-xl font-black">{formatCurrency(calcs.productionCost)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Packaging</p>
                  <p className="text-sm font-black text-blue-400">+{formatCurrency(calcs.totalPkgCost)}</p>
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Total Project Cost</p>
                <p className="text-4xl font-black tracking-tighter">{formatCurrency(calcs.totalBatchCost)}</p>
                <div className="flex items-center gap-2 mt-4 text-slate-400">
                  <Info className="w-3 h-3" />
                  <p className="text-[8px] font-bold uppercase tracking-widest">Base cost for {outputKg.toFixed(2)} KG output</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Cost / KG</p>
                  <p className="text-xl font-black text-white leading-none">{formatCurrency(calcs.costPerKg)}</p>
                  <p className="text-[7px] text-slate-400 font-bold uppercase mt-1">Cost Price / KG</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Cost / 150g Jar</p>
                  <p className="text-xl font-black text-white leading-none">{formatCurrency(calcs.costPer150g)}</p>
                  <p className="text-[7px] text-slate-400 font-bold uppercase mt-1">Cost Price / Jar</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm space-y-8">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Smart Pricing Strategy</h2>
            
            {/* Wholesale Pricing */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Wholesale (1kg)</p>
                <div className="flex items-center gap-2">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Target: {calcs.targetWsMargin}%</p>
                   {calcs.wsMarginActual >= calcs.targetWsMargin ? (
                     <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                   ) : (
                     <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                   )}
                </div>
              </div>
              <div className="relative">
                <input 
                  type="number"
                  value={wholesalePriceFinal || 0}
                  onChange={e => {
                    setWholesalePriceFinal(parseFloat(e.target.value) || 0);
                    setManuallyAdjusted(prev => ({ ...prev, ws: true }));
                  }}
                  className={cn(
                    "w-full bg-slate-50 border rounded-2xl px-5 py-6 text-2xl font-black outline-none transition-all pr-16",
                    calcs.wsMarginActual >= calcs.targetWsMargin ? "border-green-100 focus:ring-green-100 text-green-700" : "border-red-100 focus:ring-red-100 text-red-700"
                  )}
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">INR</span>
              </div>
              <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                <div>
                  <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Suggested Selling Price</p>
                  <p className="text-xs font-black text-blue-600">{formatCurrency(calcs.wsSuggested)} / KG</p>
                </div>
                <button 
                  onClick={() => setWholesalePriceFinal(calcs.wsSuggested)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                >
                  Apply
                </button>
              </div>
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest px-1">
                <p className="text-slate-400">Actual Margin: <span className={calcs.wsMarginActual >= calcs.targetWsMargin ? "text-green-600" : "text-red-600"}>{calcs.wsMarginActual.toFixed(1)}%</span></p>
                <button onClick={() => setWholesalePriceFinal(calcs.wsSuggested)} className="text-blue-600 hover:underline">Reset</button>
              </div>
            </div>

            {/* Retail Pricing */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Retail (150g Jar)</p>
                <div className="flex items-center gap-2">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Target: {calcs.targetRtMargin}%</p>
                   {calcs.rtMarginActual >= calcs.targetRtMargin ? (
                     <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                   ) : (
                     <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                   )}
                </div>
              </div>
              <div className="relative">
                <input 
                  type="number"
                  value={retailPriceFinal || 0}
                  onChange={e => {
                    setRetailPriceFinal(parseFloat(e.target.value) || 0);
                    setManuallyAdjusted(prev => ({ ...prev, rt: true }));
                  }}
                  className={cn(
                    "w-full bg-slate-50 border rounded-2xl px-5 py-6 text-2xl font-black outline-none transition-all pr-16",
                    calcs.rtMarginActual >= calcs.targetRtMargin ? "border-green-100 focus:ring-green-100 text-green-700" : "border-red-100 focus:ring-red-100 text-red-700"
                  )}
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">INR</span>
              </div>
              <div className="flex justify-between items-center bg-green-50/50 p-3 rounded-xl border border-green-100/50">
                <div>
                  <p className="text-[8px] font-black text-green-400 uppercase tracking-widest">Suggested Jar Price</p>
                  <p className="text-xs font-black text-green-600">{formatCurrency(calcs.rtSuggested)} / 150g</p>
                </div>
                <button 
                  onClick={() => setRetailPriceFinal(calcs.rtSuggested)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-green-700 transition-all"
                >
                  Apply
                </button>
              </div>
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest px-1">
                <p className="text-slate-400">Actual Margin: <span className={calcs.rtMarginActual >= calcs.targetRtMargin ? "text-green-600" : "text-red-600"}>{calcs.rtMarginActual.toFixed(1)}%</span></p>
                <button 
                  onClick={() => {
                    setRetailPriceFinal(calcs.rtSuggested);
                    setManuallyAdjusted(prev => ({ ...prev, rt: false }));
                  }} 
                  className="text-blue-600 hover:underline"
                >
                  Reset to Smart Price
                </button>
              </div>
            </div>

            {/* Flags & Alerts */}
            <div className="space-y-3 pt-4 border-t border-slate-50">
              {calcs.totalBatchSize > 5 && (
                <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl text-red-700 border border-red-100 animate-in slide-in-from-right-4">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <p className="text-[10px] font-bold uppercase leading-tight">Batch exceeds Coating Pan 1 safety capacity. Monitor temperature closely.</p>
                </div>
              )}
              {chocolateType === 'Couverture' && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl text-blue-700 border border-blue-100">
                  <Info className="w-4 h-4 mt-0.5" />
                  <p className="text-[10px] font-bold uppercase leading-tight">Couverture requires temperature controlled pan environment (18-20°C).</p>
                </div>
              )}
              {(wholesalePriceFinal < calcs.costPerKg || retailPriceFinal < calcs.costPer150g) && (
                <div className="flex items-start gap-3 p-3 bg-red-600 text-white rounded-xl shadow-lg animate-bounce">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <p className="text-[10px] font-black uppercase leading-tight">CRITICAL: Selling below production cost! System publication restricted.</p>
                </div>
              )}
            </div>
          </div>

          <AIPricingPredictor />
        </div>
      </div>
    </div>
  );
};
