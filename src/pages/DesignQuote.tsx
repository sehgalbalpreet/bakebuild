
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Order, MenuItem, DesignQuote as DesignQuoteType, OperationType } from '../types';
import { 
  ChevronLeft, Palette, Info, Check, AlertCircle, 
  MessageCircle, IndianRupee, Zap, User, Calculator, 
  Plus, Minus, Sparkles, Filter, Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format, differenceInHours } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

const TIER_RATES = {
  1: 700,
  2: 875,
  3: 1100,
  4: 1400,
  5: 1700
};

const TIER_LABELS = {
  1: "Cream, No Figures, No Print",
  2: "Cream + Printed Design",
  3: "Half Fondant, Any Decoration",
  4: "Full Fondant, Flat Decorations",
  5: "Full Fondant + 3D Sculpted Character"
};

const COMPLEXITY_ITEMS = [
  "More than 5 fondant elements",
  "3D or sculpted topper",
  "3 or more tiers",
  "Full texture / lace / ruffles",
  "Custom portrait or figurine"
];

export const DesignQuote: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { bakery, profile } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [catalog, setCatalog] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Quote State
  const [fondantType, setFondantType] = useState<'none' | 'half' | 'full'>('none');
  const [tierSource, setTierSource] = useState<'ai' | 'admin'>('ai');
  const [selectedTier, setSelectedTier] = useState<number>(1);
  const [charSmall, setCharSmall] = useState(0);
  const [charLarge, setCharLarge] = useState(0);
  const [fondantFlowers, setFondantFlowers] = useState(0);
  const [realFlowers, setRealFlowers] = useState(0);
  const [complexity, setComplexity] = useState<string[]>([]);
  const [overridePrice, setOverridePrice] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!orderId || !bakery?.id) return;
      try {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          const data = orderSnap.data() as Order;
          setOrder({ ...data, id: orderSnap.id });
          
          // Initializing from existing quote if available
          if (data.designQuote) {
            setFondantType(data.designQuote.fondantType);
            setTierSource(data.designQuote.tierSource);
            setSelectedTier(data.designQuote.tierSelected);
            setCharSmall(data.designQuote.characters.small);
            setCharLarge(data.designQuote.characters.large);
            setFondantFlowers(data.designQuote.flowers.fondant);
            setRealFlowers(data.designQuote.flowers.real);
            setComplexity(data.designQuote.complexityItems);
            if (data.designQuote.adminOverridePrice) {
              setOverridePrice(data.designQuote.adminOverridePrice.toString());
              setOverrideReason(data.designQuote.adminOverrideReason || '');
            }
          }
        }

        const catSnap = await getDocs(query(collection(db, 'menu_items'), where('bakeryId', '==', bakery.id)));
        setCatalog(catSnap.docs.map(d => ({ ...d.data(), id: d.id }) as MenuItem).filter(it => !it.isDeleted));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orderId, bakery?.id]);

  if (loading || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Loading Design Engine...</p>
      </div>
    );
  }

  const cakeDetails = order.details as any; // Usually CakeDetails
  const weight = cakeDetails.weight || 1;
  const flavorName = cakeDetails.flavor || 'Standard';

  // SECTION B — BASE PRICE
  const menuItem = catalog.find(i => i.name === flavorName);
  const menuPricePerKg = menuItem?.price || 500;
  const rawBasePrice = Math.max(weight, 1.0) * menuPricePerKg;

  // SECTION C — FONDANT
  let fondantMultiplier = 1.0;
  if (fondantType === 'half') fondantMultiplier = 1.5;
  else if (fondantType === 'full') {
    fondantMultiplier = weight <= 2 ? 2.0 : 2.2;
  }
  const fondantCost = rawBasePrice * (fondantMultiplier - 1);

  // SECTION D — AI TIER SUGGESTION
  const aiTierLogic = () => {
    const instr = (cakeDetails.instruction || '').toLowerCase();
    if (fondantType === 'none') {
      if (instr.includes('print') || instr.includes('photo')) return { tier: 2, confidence: 'high' as const, reason: "Detected print/photo requirement in instructions" };
      return { tier: 1, confidence: 'high' as const, reason: "Simple cream design with no fondant requested" };
    }
    if (fondantType === 'half') return { tier: 3, confidence: 'medium' as const, reason: "Semi-fondant designs usually fall into Tier 3" };
    
    // Full fondant
    if (instr.includes('sculpt') || instr.includes('3d') || instr.includes('character') || instr.includes('figure')) {
      return { tier: 5, confidence: 'high' as const, reason: "3D sculpted elements detected for full fondant cake" };
    }
    return { tier: 4, confidence: 'medium' as const, reason: "Standard full fondant design" };
  };

  const aiSuggestion = aiTierLogic();
  const effectiveTier = tierSource === 'ai' ? aiSuggestion.tier : selectedTier;
  const tierRate = (TIER_RATES as any)[effectiveTier];
  const marketPrice = tierRate * Math.max(weight, 1.0);
  const basePriceValue = Math.max(rawBasePrice + fondantCost, marketPrice);

  // SECTION E — CHARACTERS
  const charCost = (charSmall * 300) + (charLarge * 600);

  // SECTION F — FLOWERS
  const flowerCost = (fondantFlowers * 80) + (realFlowers * 40);
  const procurementCharge = realFlowers > 0 ? 80 : 0;

  // SECTION G — COMPLEXITY
  const complexitySurchargePercent = complexity.length <= 1 ? 0 : (complexity.length <= 3 ? 20 : 30);
  const preComplexitySubtotal = basePriceValue + charCost + flowerCost + procurementCharge;
  const complexitySurchargeAmount = preComplexitySubtotal * (complexitySurchargePercent / 100);

  // SECTION H — RUSH CHARGE
  const getRushCharge = () => {
    if (!order.deliveryDate) return 0;
    const delDate = new Date(`${order.deliveryDate}T${order.deliveryTime || '23:59'}`);
    const now = new Date();
    const hoursRemaining = differenceInHours(delDate, now);
    if (hoursRemaining <= 24 && hoursRemaining >= 0) return 700;
    if (hoursRemaining <= 48 && hoursRemaining >= 0) return 400;
    return 0;
  };
  const rushCharge = getRushCharge();

  // SECTION I — BREAKDOWN
  const rawTotal = preComplexitySubtotal + complexitySurchargeAmount + rushCharge;
  const finalRecommended = Math.max(650, Math.ceil(rawTotal / 50) * 50);
  const parsedOverride = parseInt(overridePrice);
  const finalPrice = !isNaN(parsedOverride) ? parsedOverride : finalRecommended;

  const negotiationFloor = Math.ceil((finalPrice * 0.92) / 10) * 10;
  const profitRatio = finalPrice / (rawBasePrice || 1);
  const profitIndicator: 'high' | 'safe' | 'risky' = profitRatio >= 1.3 ? 'high' : (profitRatio >= 1.1 ? 'safe' : 'risky');

  // FLAGS
  const trueProductionCostEstimate = (rawBasePrice * 0.4) + (fondantCost * 0.4) + (charCost * 0.3) + (flowerCost * 0.3);
  const isBelowCost = finalPrice < Math.max(trueProductionCostEstimate, 400);
  const isBelowMarket = finalPrice < marketPrice;
  const isRushOrder = rushCharge > 0;
  const isLowConfidence = tierSource === 'ai' && aiSuggestion.confidence !== 'high';

  const toggleComplexity = (item: string) => {
    setComplexity(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  const handleSave = async (isConfirm: boolean = false) => {
    if (saving) return;
    if (overridePrice && !overrideReason && parseInt(overridePrice) < negotiationFloor) {
      alert('Override reason is required when selling below negotiation floor.');
      return;
    }

    setSaving(true);
    try {
      const designQuote: DesignQuoteType = {
        fondantType,
        fondantCost,
        tierSelected: effectiveTier,
        tierSource,
        tierConfidence: aiSuggestion.confidence,
        tierReason: aiSuggestion.reason,
        characters: { small: charSmall, large: charLarge, cost: charCost },
        flowers: { fondant: fondantFlowers, real: realFlowers, procurementIncluded: realFlowers > 0, cost: flowerCost + procurementCharge },
        complexityItems: complexity,
        surchargePercent: complexitySurchargePercent,
        surchargeAmount: complexitySurchargeAmount,
        rushCharge,
        basePrice: rawBasePrice,
        marketPrice,
        internalPrice: basePriceValue,
        finalQuote: finalPrice,
        negotiationFloor,
        profitIndicator,
        ...(overridePrice ? { adminOverridePrice: parseInt(overridePrice) } : {}),
        ...(overrideReason ? { adminOverrideReason: overrideReason } : {}),
        quoteSentVia: 'whatsapp',
        adminWhoQuoted: profile?.displayName || profile?.email || 'Admin'
      };

      const updateData: any = {
        designQuote,
        totalAmount: finalPrice,
        quoteTag: isConfirm ? 'CONFIRMED' : 'QUOTE SENT — AWAITING CONFIRM',
        updatedAt: serverTimestamp(),
      };

      if (isConfirm) {
        updateData.isQuoteLocked = true;
        updateData.status = 'in_progress'; // Move directly to production
      }

      await updateDoc(doc(db, 'orders', order.id), updateData);
      
      const logMsg = isConfirm ? `Quote confirmed, moved to production: ₹${finalPrice}` : `Quote generated & saved: ₹${finalPrice}`;
      await setDoc(doc(db, 'logs', `log_${Date.now()}`), {
         type: 'order',
         message: logMsg,
         bakeryId: bakery.id,
         userId: profile?.uid,
         userEmail: profile?.email
      }).catch(() => {}); // Optional logging

      if (!isConfirm) {
        // WhatsApp Generator
        const whatsappMsg = `Hello ${order.customerDetails?.name || 'Customer'} 👋\n\nThank you for your order at Kreative Chocolates!\n\nHere is your cake quote:\n\n🎂 *Custom Cake Quote*\n───────────────\nFlavor     : ${flavorName}\nWeight     : ${weight} kg\nDelivery   : ${order.deliveryDate} | ${order.deliveryTime}\n\n*Price Breakdown:*\nBase Cake       : ₹${rawBasePrice}\nFondant         : ₹${fondantCost.toFixed(0)}\nDesign Add-ons  : ₹${(charCost + flowerCost + procurementCharge + complexitySurchargeAmount).toFixed(0)}\n${rushCharge > 0 ? `Rush Charge    : ₹${rushCharge}\n` : ''}───────────────\n*Total Quote    : ₹${finalPrice}*\n\nAdvance Paid    : ₹${order.advanceReceived || 0}\nBalance Due     : ₹${finalPrice - (order.advanceReceived || 0)}\n\nTo confirm your order please reply YES\nor call us to discuss further. 🙏`;
        
        const phone = order.customerDetails?.phone || '';
        const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`;
        setWhatsappUrl(url);
        setShowSuccessScreen(true);
      } else {
        navigate('/dashboard/orders');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (showSuccessScreen) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto animate-in fade-in duration-200">
        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center border border-emerald-100 shadow-xl shadow-emerald-50 mb-8 animate-bounce">
          <Check className="w-10 h-10" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-widest mb-3">Quote Saved!</h1>
        <p className="text-slate-500 font-semibold text-xs leading-relaxed max-w-sm mb-10">
          The custom cake design pricing has been calculated and updated. Click below to share the details with your customer on WhatsApp.
        </p>

        <div className="w-full space-y-4">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              // Automatically redirect to the dashboard after a short delay once they click the link
              setTimeout(() => {
                navigate('/dashboard/orders');
              }, 1500);
            }}
            className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-100 hover:scale-[1.02] active:scale-98"
          >
            <MessageCircle className="w-5 h-5" />
            Send WhatsApp Quote Now
          </a>

          <button
            onClick={() => navigate('/dashboard/orders')}
            className="w-full py-5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-[2rem] text-xs font-black uppercase tracking-widest transition-all"
          >
            Go to Orders Dashboard
          </button>
        </div>

        <div className="mt-8 p-5 bg-slate-50 border border-slate-100 rounded-[2rem] text-left w-full">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Message Preview:</h4>
          <pre className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap leading-relaxed bg-white p-4 rounded-2xl border border-slate-100 max-h-40 overflow-y-auto">
            {decodeURIComponent(whatsappUrl.split('?text=')[1] || '')}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard/orders')}
            className="w-10 h-10 bg-white shadow-sm border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-widest">Design Costing Engine</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
              BakeSync Quote System v2.0 • Order {order.displayId || `#${order.id.slice(-6)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
             Quote Pending
           </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Steps */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* SECTION A — ORDER SUMMARY */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-4 h-4" /> Order Summary
              </h3>
            </div>
            <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Client</label>
                <div className="text-sm font-black text-slate-900 truncate">{order.customerDetails?.name || 'N/A'}</div>
                <div className="text-[10px] font-bold text-slate-500">{order.customerDetails?.phone}</div>
              </div>
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Specs</label>
                <div className="text-sm font-black text-slate-900">{weight}kg {flavorName}</div>
                <div className="text-[10px] font-bold text-slate-500 capitalize">{order.type.replace('_', ' ')}</div>
              </div>
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Delivery</label>
                <div className="text-sm font-black text-slate-900">{order.deliveryDate}</div>
                <div className="text-[10px] font-bold text-slate-500">{order.deliveryTime}</div>
              </div>
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Reference</label>
                {cakeDetails.photoUrl ? (
                  <div className="relative group">
                    <img 
                       src={cakeDetails.photoUrl} 
                       alt="Ref" 
                       className="w-10 h-10 rounded-lg object-cover border border-slate-200 cursor-pointer hover:scale-150 transition-all z-10" 
                       onClick={() => window.open(cakeDetails.photoUrl, '_blank')}
                    />
                  </div>
                ) : (
                  <div className="text-xs font-bold text-slate-400 italic">No image</div>
                )}
              </div>
              <div className="col-span-full pt-4 border-t border-slate-50">
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Staff Instructions</label>
                <p className="text-xs font-bold text-slate-600 leading-normal italic">
                  "{cakeDetails.instruction || 'No special instructions provided'}"
                </p>
              </div>
            </div>
          </section>

          {/* SECTION B & C — FONDANT */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Palette className="w-4 h-4" /> Base & Fondant Costing
              </h3>
              <div className="text-[10px] font-black text-slate-900">
                Base Price: <span className="text-blue-600">₹{rawBasePrice.toFixed(0)}</span>
              </div>
            </div>
            <div className="p-8">
               <div className="grid grid-cols-3 gap-4">
                  {(['none', 'half', 'full'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFondantType(f)}
                      className={cn(
                        "p-6 rounded-3xl border-2 transition-all text-center group",
                        fondantType === f ? "bg-slate-900 border-slate-900 text-white" : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      <div className="text-[8px] font-black uppercase tracking-widest mb-1 opacity-60">Selection</div>
                      <div className="text-sm font-black capitalize mb-2">{f === 'none' ? 'Cream only' : f + ' Fondant'}</div>
                      <div className={cn(
                        "text-[10px] font-black",
                        fondantType === f ? "text-blue-400" : "text-slate-400"
                      )}>
                        {f === 'none' ? 'x1.0 Multiplier' : f === 'half' ? 'x1.5 Multiplier' : (weight <= 2 ? 'x2.0 Multiplier' : 'x2.2 Multiplier')}
                      </div>
                    </button>
                  ))}
               </div>
               {fondantCost > 0 && (
                 <div className="mt-6 p-4 bg-blue-50/50 rounded-2xl flex items-center justify-between border border-blue-100/30">
                    <span className="text-[10px] font-black text-blue-900 uppercase">Fondant Addition Cost</span>
                    <span className="text-sm font-black text-blue-600">+ ₹{fondantCost.toFixed(0)}</span>
                 </div>
               )}
            </div>
          </section>

          {/* SECTION D — AI TIER SUGGESTION */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" /> AI Pricing Tier
              </h3>
              <div className="flex gap-2">
                 <button 
                  onClick={() => setTierSource('ai')}
                  className={cn("px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all", tierSource === 'ai' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400")}
                 >
                   AI Recc
                 </button>
                 <button 
                  onClick={() => setTierSource('admin')}
                  className={cn("px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all", tierSource === 'admin' ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")}
                 >
                   Manual Override
                 </button>
              </div>
            </div>
            <div className="p-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                     <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center text-sm font-black">
                              {effectiveTier}
                           </div>
                           <div className="font-black text-slate-900 uppercase tracking-widest text-[10px]">Tier {effectiveTier} SELECTED</div>
                        </div>
                        <p className="text-xs font-bold text-slate-600 leading-relaxed">
                          {(TIER_LABELS as any)[effectiveTier]}
                        </p>
                        {tierSource === 'ai' && (
                          <div className={cn(
                            "mt-4 px-3 py-1 text-[8px] font-black rounded-full w-fit uppercase",
                            aiSuggestion.confidence === 'high' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          )}>
                             {aiSuggestion.confidence} Confidence • AI reasoning: {aiSuggestion.reason}
                          </div>
                        )}
                     </div>
                  </div>
                  <div className="space-y-4">
                     {tierSource === 'admin' ? (
                        <div className="space-y-2">
                           <label className="block text-[8px] font-black text-slate-400 uppercase">Select Market Tier</label>
                           <div className="grid grid-cols-5 gap-2">
                             {[1,2,3,4,5].map(t => (
                               <button 
                                key={t}
                                onClick={() => setSelectedTier(t)}
                                className={cn(
                                  "py-4 rounded-xl border-2 font-black transition-all",
                                  selectedTier === t ? "bg-slate-900 border-slate-900 text-white shadow-lg" : "bg-white border-slate-100 text-slate-400"
                                )}
                               >
                                 {t}
                               </button>
                             ))}
                           </div>
                           <p className="text-[10px] text-slate-400 font-bold italic mt-2">Adjusting tier based on design complexity override.</p>
                        </div>
                     ) : (
                       <div className="space-y-4">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase">
                             <span className="text-slate-400">Market Rate (Tier {effectiveTier})</span>
                             <span className="text-slate-900">₹{(TIER_RATES as any)[effectiveTier]}/kg</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-black uppercase">
                             <span className="text-slate-400">Total Market Value</span>
                             <span className="text-slate-900">₹{marketPrice.toFixed(0)}</span>
                          </div>
                          <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
                            BakeSync tracks real-time market prices in Chandigarh/Mohali to ensure you are never selling too low.
                          </p>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          </section>

          {/* SECTION E & F — ADD-ONS */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-4 h-4" /> Elements & Add-ons
              </h3>
            </div>
            <div className="p-8 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Characters */}
                  <div className="space-y-4">
                     <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest border-l-4 border-slate-900 pl-3">Characters / Toys</h4>
                     <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <div>
                              <div className="text-[10px] font-black text-slate-900">Flat / Small Character</div>
                              <div className="text-[8px] font-bold text-slate-400">₹300 Per Unit</div>
                           </div>
                           <div className="flex items-center gap-3">
                              <button onClick={() => setCharSmall(Math.max(0, charSmall - 1))} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Minus className="w-3 h-3" /></button>
                              <span className="w-6 text-center font-black text-sm">{charSmall}</span>
                              <button onClick={() => setCharSmall(charSmall + 1)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Plus className="w-3 h-3" /></button>
                           </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <div>
                              <div className="text-[10px] font-black text-slate-900">3D / Figurine / Large</div>
                              <div className="text-[8px] font-bold text-slate-400">₹600 Per Unit</div>
                           </div>
                           <div className="flex items-center gap-3">
                              <button onClick={() => setCharLarge(Math.max(0, charLarge - 1))} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Minus className="w-3 h-3" /></button>
                              <span className="w-6 text-center font-black text-sm">{charLarge}</span>
                              <button onClick={() => setCharLarge(charLarge + 1)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Plus className="w-3 h-3" /></button>
                           </div>
                        </div>
                     </div>
                  </div>

                   {/* Flowers */}
                   <div className="space-y-4">
                     <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest border-l-4 border-slate-900 pl-3">Flower Elements</h4>
                     <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <div>
                              <div className="text-[10px] font-black text-slate-900">Fondant Flowers</div>
                              <div className="text-[8px] font-bold text-slate-400">₹80 Per Stem</div>
                           </div>
                           <div className="flex items-center gap-3">
                              <button onClick={() => setFondantFlowers(Math.max(0, fondantFlowers - 1))} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Minus className="w-3 h-3" /></button>
                              <span className="w-6 text-center font-black text-sm">{fondantFlowers}</span>
                              <button onClick={() => setFondantFlowers(fondantFlowers + 1)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Plus className="w-3 h-3" /></button>
                           </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <div>
                              <div className="text-[10px] font-black text-slate-900">Real / Fresh Flowers</div>
                              <div className="text-[8px] font-bold text-slate-400">₹40 Per Stem</div>
                           </div>
                           <div className="flex items-center gap-3">
                              <button onClick={() => setRealFlowers(Math.max(0, realFlowers - 1))} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Minus className="w-3 h-3" /></button>
                              <span className="w-6 text-center font-black text-sm">{realFlowers}</span>
                              <button onClick={() => setRealFlowers(realFlowers + 1)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900"><Plus className="w-3 h-3" /></button>
                           </div>
                        </div>
                        {realFlowers > 0 && (
                          <div className="text-[8px] font-black text-amber-600 bg-amber-50 p-2 rounded-lg flex items-center gap-2">
                             <AlertCircle className="w-3 h-3" /> + ₹80 PROCUREMENT CHARGE INCLUDED
                          </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          </section>

          {/* SECTION G — COMPLEXITY */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Filter className="w-4 h-4" /> Complexity Checklist
              </h3>
            </div>
            <div className="p-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {COMPLEXITY_ITEMS.map((item, idx) => {
                    const isChecked = complexity.includes(item);
                    return (
                      <button 
                        key={idx}
                        onClick={() => toggleComplexity(item)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-2xl border transition-all text-left",
                          isChecked ? "bg-slate-900 border-slate-900 text-white shadow-lg" : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300"
                        )}
                      >
                         <div className={cn(
                           "w-5 h-5 rounded-md border-2 flex items-center justify-center",
                           isChecked ? "bg-blue-600 border-blue-600" : "bg-white border-slate-200"
                         )}>
                           {isChecked && <Check className="w-3 h-3 text-white" />}
                         </div>
                         <span className="text-[10px] font-black uppercase tracking-tight">{item}</span>
                      </button>
                    );
                  })}
               </div>
               
               <div className="mt-8 flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div>
                    <div className="text-[10px] font-black text-slate-900 uppercase mb-1">Calculated Surcharge</div>
                    <div className="text-[8px] font-bold text-slate-400 uppercase">Based on checklist ticks</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black text-slate-900">+{complexitySurchargePercent}%</div>
                    <div className="text-[10px] font-bold text-indigo-500 tracking-tighter">₹{complexitySurchargeAmount.toFixed(0)}</div>
                  </div>
               </div>
            </div>
          </section>

          {/* SECTION H — RUSH CHARGE */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
             <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4" /> Rush Charge Detection
              </h3>
              {rushCharge > 0 && <span className="text-[8px] font-black bg-red-600 text-white px-2 py-1 rounded-full animate-pulse">CRITICAL RUSH</span>}
            </div>
            <div className="p-8">
               <div className={cn(
                 "p-6 rounded-3xl border flex items-center justify-between",
                 rushCharge > 0 ? "bg-red-50 border-red-100 text-red-900" : "bg-slate-50 border-slate-100 text-slate-400"
               )}>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest mb-1">Auto-detected Logistics Fee</div>
                    <p className="text-xs font-bold leading-relaxed italic pr-12">
                      {rushCharge === 700 ? "Delivery within 24 hours detected. High-priority production slot required." :
                       rushCharge === 400 ? "Delivery within 48 hours detected. Optimized production priority required." :
                       "Standard production timeline available (>48 hours)."}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black">₹{rushCharge}</div>
                    <div className="text-[8px] font-black uppercase opacity-60">System Fixed</div>
                  </div>
               </div>
            </div>
          </section>

        </div>

        {/* Right Column - Live Breakdown & Save */}
        <div className="lg:col-span-4">
          <div className="sticky top-8 space-y-6">
            
            {/* BREAKDOWN CARD */}
            <div className="bg-slate-900 text-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8 border border-white/10">
               <div className="flex items-center gap-3 mb-8 border-b border-white/10 pb-6">
                  <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Pricing Engine</h3>
                    <div className="text-[8px] font-bold text-white/40 uppercase tracking-tighter">Live Real-time Valuation</div>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-white/60">
                    <span>Base Cake</span>
                    <span className="text-white">₹{rawBasePrice.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-white/60">
                    <span>Fondant Addition</span>
                    <span className="text-white">₹{fondantCost.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-white/60">
                    <span>Manual Add-ons</span>
                    <span className="text-white">₹{(charCost + flowerCost + procurementCharge).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-white/60">
                    <span>Rush Charge</span>
                    <span className="text-white">₹{rushCharge}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-white/60">
                    <span>Subtotal</span>
                    <span className="text-white">₹{(rawBasePrice + fondantCost + charCost + flowerCost + procurementCharge + rushCharge).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-blue-400">
                    <span>Complexity (+{complexitySurchargePercent}%)</span>
                    <span className="text-blue-400">₹{complexitySurchargeAmount.toFixed(0)}</span>
                  </div>

                  <div className="h-px bg-white/10 my-4"></div>

                  <div className="flex justify-between items-end mb-4">
                      <div>
                        <div className="text-[8px] font-black text-white/40 uppercase">Recommended Quote</div>
                        <div className="text-3xl font-black text-blue-400">₹{finalRecommended.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] font-black text-white/40 uppercase">Profit Level</div>
                        <div className={cn(
                          "text-[10px] font-black px-3 py-1 rounded-full uppercase",
                          profitIndicator === 'high' ? "bg-green-500 text-white" : profitIndicator === 'safe' ? "bg-blue-500 text-white" : "bg-red-500 text-white"
                        )}>
                          {profitIndicator === 'high' ? 'High Margin' : profitIndicator === 'safe' ? 'Safe' : 'Risky'}
                        </div>
                      </div>
                  </div>

                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                     <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                        <span className="text-white/40">Negotiation Floor</span>
                        <span className="text-white/80">₹{negotiationFloor.toLocaleString()}</span>
                     </div>
                     <p className="text-[8px] text-white/30 font-bold leading-relaxed italic">
                       Internal only. Never reveal floor price on WhatsApp.
                     </p>
                  </div>
               </div>

               <div className="mt-8 space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[8px] font-black text-white/40 uppercase">Override Quoted Price</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-black text-sm">₹</span>
                       <input 
                        type="number" 
                        value={overridePrice}
                        onChange={e => setOverridePrice(e.target.value)}
                        placeholder={finalRecommended.toString()}
                        className="w-full bg-white/10 border border-white/10 p-5 pl-8 rounded-2xl font-black text-xl outline-none focus:ring-4 focus:ring-blue-500/50" 
                       />
                    </div>
                  </div>

                  {overridePrice && parseInt(overridePrice) < negotiationFloor && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-900/40 border border-red-500/30 rounded-2xl space-y-3"
                    >
                       <div className="text-[10px] font-black text-red-300 uppercase flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> Below Negotiation Floor
                       </div>
                       <textarea 
                        required
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="Log reason for override..."
                        className="w-full bg-black/20 border border-white/5 p-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-500"
                        rows={2}
                       />
                    </motion.div>
                  )}
               </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="grid grid-cols-1 gap-3">
               {/* FLAGS */}
               {isBelowCost && (
                 <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                   <div className="w-6 h-6 bg-red-600 text-white rounded-lg flex items-center justify-center shrink-0">
                     <Lock className="w-3 h-3" />
                   </div>
                   <p className="text-[9px] font-black text-red-600 uppercase">Selling below cost price — cannot proceed</p>
                 </div>
               )}
               {isBelowMarket && !isBelowCost && (
                 <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3">
                   <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                   <p className="text-[9px] font-black text-amber-600 uppercase">Below market rate — manager approval logged</p>
                 </div>
               )}

               <button 
                  onClick={() => handleSave(false)}
                  disabled={saving || isBelowCost}
                  className={cn(
                    "w-full py-6 rounded-[2rem] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all",
                    isBelowCost ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-200"
                  )}
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <MessageCircle className="w-5 h-5" />
                      Save & WhatsApp Quote →
                    </>
                  )}
               </button>

               <button 
                  onClick={() => handleSave(true)}
                  disabled={saving || isBelowCost}
                  className={cn(
                    "w-full py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all",
                    isBelowCost ? "bg-slate-100 text-slate-300 cursor-not-allowed" : "bg-slate-900 text-white hover:bg-black"
                  )}
                >
                  <Check className="w-4 h-4" />
                  Finalize & Send to Production
               </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
