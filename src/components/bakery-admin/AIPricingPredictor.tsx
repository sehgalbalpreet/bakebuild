import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Sparkles, 
  HelpCircle, 
  ArrowRight, 
  ShieldAlert, 
  ShoppingBag, 
  Loader2,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';

interface PricePrediction {
  ingredientName: string;
  currentEstimatedPriceRange: string;
  trendDirection: 'Up' | 'Down' | 'Stable';
  oneMonthForecastPercentChange: number;
  threeMonthForecastPercentChange: number;
  sixMonthForecastPercentChange: number;
  explanation: string;
  procurementStrategy: string;
  simulatedPriceHistory: { month: string; indexValue: number }[];
}

export const AIPricingPredictor: React.FC = () => {
  const [ingredientName, setIngredientName] = useState('Cocoa Butter');
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const popularIngredients = [
    'Cocoa Butter',
    'Almonds',
    'Hazelnuts',
    'Sugar',
    'Dark Chocolate Couverture',
    'Milk Chocolate Compound',
    'Butter (Unsalted)',
    'Heavy Cream'
  ];

  useEffect(() => {
    handlePredict('Cocoa Butter');
  }, []);

  const handlePredict = async (nameToPredict = ingredientName) => {
    if (!nameToPredict.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ingredients/predict-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientName: nameToPredict })
      });
      if (!response.ok) {
        throw new Error('Prediction API failed to respond.');
      }
      const data = await response.json();
      setPrediction(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Unable to load pricing trends. Please check your network and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getTrendBadge = (trend: 'Up' | 'Down' | 'Stable') => {
    switch (trend) {
      case 'Up':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
            <TrendingUp size={12} /> Price Surging
          </span>
        );
      case 'Down':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
            <TrendingDown size={12} /> Price Cooling
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100">
            <Minus size={12} /> Stable
          </span>
        );
    }
  };

  const getForecastBadgeClass = (val: number) => {
    if (val > 5) return 'text-rose-600 bg-rose-50 border-rose-100';
    if (val > 0) return 'text-amber-600 bg-amber-50 border-amber-100';
    if (val < 0) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    return 'text-slate-500 bg-slate-50 border-slate-100';
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          AI Commodity Price Predictor
        </h2>
        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
          Gemini 3.5 Engine
        </span>
      </div>

      <div className="p-8 space-y-6">
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">Quick Predict Ingredients</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {popularIngredients.map((ing) => (
              <button
                key={ing}
                type="button"
                onClick={() => {
                  setIngredientName(ing);
                  handlePredict(ing);
                }}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                  ingredientName === ing && prediction?.ingredientName === ing
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 border border-slate-100 text-slate-500 hover:border-blue-200'
                }`}
              >
                {ing}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={ingredientName}
              onChange={(e) => setIngredientName(e.target.value)}
              placeholder="Or enter custom ingredient (e.g. Pecan nuts, Madagascar Vanilla)..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
            <button
              type="button"
              disabled={loading || !ingredientName.trim()}
              onClick={() => handlePredict()}
              className="px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Forecast'}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-12 border border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-3"
            >
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Consulting Commodity Indexes...</p>
                <p className="text-[9px] text-slate-400 font-medium mt-1">Analyzing cocoa crop reports, global nuts harvests & energy index trends</p>
              </div>
            </motion.div>
          )}

          {error && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex items-start gap-4 text-rose-700"
            >
              <ShieldAlert className="shrink-0 w-5 h-5 mt-0.5" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest">Pricing Analysis Blocked</p>
                <p className="text-[10px] text-rose-600 mt-1 leading-relaxed">{error}</p>
              </div>
            </motion.div>
          )}

          {prediction && !loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              {/* Header card */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    {prediction.ingredientName}
                    {getTrendBadge(prediction.trendDirection)}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    Market Price Est: <span className="text-slate-700 font-black">{prediction.currentEstimatedPriceRange}</span>
                  </p>
                </div>
                <button
                  onClick={() => handlePredict(prediction.ingredientName)}
                  className="p-2 hover:bg-slate-200/50 rounded-xl transition-colors text-slate-400"
                  title="Recalculate Predictor"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* Grid 1, 3, 6 Months */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: '1-Mo Forecast', val: prediction.oneMonthForecastPercentChange },
                  { label: '3-Mo Forecast', val: prediction.threeMonthForecastPercentChange },
                  { label: '6-Mo Forecast', val: prediction.sixMonthForecastPercentChange }
                ].map((item, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl border text-center ${getForecastBadgeClass(item.val)}`}>
                    <p className="text-[8px] font-black uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="text-lg font-black font-mono">
                      {item.val > 0 ? `+${item.val}%` : `${item.val}%`}
                    </p>
                    <p className="text-[7px] font-bold uppercase mt-0.5">
                      {item.val > 5 ? 'High Surge' : item.val > 0 ? 'Slight Rise' : item.val < 0 ? 'Cooling Down' : 'Steady'}
                    </p>
                  </div>
                ))}
              </div>

              {/* Chart of Simulated Prices */}
              <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                  <span>6-Month Commodity Index History & Trend</span>
                  <span className="font-mono text-[8px] font-bold">Base = 100</span>
                </p>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={prediction.simulatedPriceHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="month" 
                        stroke="#94a3b8" 
                        fontSize={8} 
                        fontWeight="bold" 
                        tickLine={false} 
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={8} 
                        fontWeight="bold" 
                        tickLine={false} 
                        axisLine={false}
                        domain={['dataMin - 5', 'dataMax + 5']}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: 'none', 
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          padding: '8px 12px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="indexValue" 
                        stroke={prediction.trendDirection === 'Up' ? '#f43f5e' : prediction.trendDirection === 'Down' ? '#10b981' : '#3b82f6'} 
                        strokeWidth={3} 
                        dot={{ r: 4, strokeWidth: 2 }} 
                        activeDot={{ r: 6 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detail insights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="p-5 bg-blue-50/30 border border-blue-100/50 rounded-3xl space-y-2">
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                    <HelpCircle size={14} /> Market Drivers
                  </h4>
                  <p className="text-[10px] text-slate-600 font-bold leading-relaxed">{prediction.explanation}</p>
                </div>

                <div className="p-5 bg-emerald-50/30 border border-emerald-100/50 rounded-3xl space-y-2">
                  <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                    <ShoppingBag size={14} /> Procurement Strategy
                  </h4>
                  <p className="text-[10px] text-slate-600 font-bold leading-relaxed">{prediction.procurementStrategy}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
