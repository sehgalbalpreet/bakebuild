import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Bakery } from '../types';
import { Star, Heart, CheckCircle2, MessageSquare, ExternalLink, Sparkles, Send, AlertCircle } from 'lucide-react';

export const CustomerFeedbackRating: React.FC = () => {
  const { bakeryId = '', orderId = '' } = useParams<{ bakeryId: string; orderId: string }>();
  const [bakery, setBakery] = useState<Bakery | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [comments, setComments] = useState('');

  useEffect(() => {
    async function fetchBakery() {
      if (!bakeryId) {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'bakeries', bakeryId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setBakery({ id: snap.id, ...snap.data() } as Bakery);
        }
      } catch (err) {
        console.error("Failed to fetch bakery for rating:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchBakery();
  }, [bakeryId]);

  const ratingLabels: Record<number, { text: string; color: string }> = {
    5: { text: "Excellent! Loved it! 😍", color: "text-amber-500 bg-amber-50 border-amber-200" },
    4: { text: "Very Good! 😊", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    3: { text: "Average 😐", color: "text-blue-600 bg-blue-50 border-blue-200" },
    2: { text: "Below Expectations 😕", color: "text-orange-600 bg-orange-50 border-orange-200" },
    1: { text: "Unhappy 😞", color: "text-rose-600 bg-rose-50 border-rose-200" }
  };

  const currentRating = hoverRating || rating;
  const isHighRating = rating >= 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const status = isHighRating ? 'redirected_to_google' : 'pending';
      await addDoc(collection(db, 'customer_feedback'), {
        bakeryId,
        orderId,
        customerName: customerName.trim() || 'Valued Customer',
        customerPhone: customerPhone.trim(),
        rating,
        comments: comments.trim(),
        status,
        createdAt: serverTimestamp()
      });

      setSubmitted(true);

      if (isHighRating && bakery?.settings?.googleReviewLink) {
        setTimeout(() => {
          if (bakery.settings?.googleReviewLink) {
            window.location.href = bakery.settings.googleReviewLink;
          }
        }, 2500);
      }
    } catch (err) {
      console.error("Error submitting feedback:", err);
      alert("Something went wrong saving your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const bakeryName = bakery?.name || 'Kreative Chocolates & Cakes';
  const googleUrl = bakery?.settings?.googleReviewLink;

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 text-slate-100 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-fade-in">
          {isHighRating ? (
            <>
              <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400">
                <Sparkles className="w-10 h-10 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Thank You! 🌟</h1>
                <p className="text-slate-300 text-sm leading-relaxed">
                  We are thrilled that you enjoyed your experience with <strong className="text-amber-400">{bakeryName}</strong>!
                </p>
              </div>
              {googleUrl ? (
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 space-y-4">
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Taking you to Google Reviews...
                  </p>
                  <p className="text-xs text-slate-400">
                    Your 5-star rating helps our small business grow immensely! If you aren't redirected automatically, tap below:
                  </p>
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30"
                  >
                    <ExternalLink size={16} />
                    Post on Google Reviews ⭐
                  </a>
                </div>
              ) : (
                <div className="bg-slate-800/50 rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Your wonderful feedback has been recorded. Have a sweet day! 🎂</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-400">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-3">
                <h1 className="text-2xl font-black text-white tracking-tight">Feedback Received 🙏</h1>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Thank you for sharing your genuine experience. We noticed your rating wasn't 5 stars.
                </p>
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <AlertCircle size={14} />
                    Direct Management Review
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Your notes have been logged directly into management's internal resolution dashboard. Our team will review your order #{orderId} and reach out to make things right.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 text-slate-100 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl">
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 uppercase tracking-widest">
            <Sparkles size={12} className="text-indigo-400" /> Order #{orderId}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Rate Your Experience</h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            How was your cake & order from <strong className="text-slate-200">{bakeryName}</strong>?
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Star Selector */}
          <div className="flex flex-col items-center space-y-3 py-2">
            <div className="flex items-center gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-2 transition-transform active:scale-90 hover:scale-110 focus:outline-none"
                >
                  <Star
                    size={36}
                    className={`transition-colors ${
                      star <= currentRating
                        ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                        : 'text-slate-700 fill-slate-800/50'
                    }`}
                  />
                </button>
              ))}
            </div>

            <div className={`px-4 py-1.5 rounded-full border text-xs font-black transition-all ${ratingLabels[currentRating].color}`}>
              {ratingLabels[currentRating].text}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Your Name (Optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Aditi Sharma"
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Comments or Feedback
              </label>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={isHighRating ? "What did you love most about your cake?" : "Please tell us how we can improve..."}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-amber-500/20"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send size={16} />
                Submit Feedback
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2">
          <p className="text-[10px] text-slate-600 font-medium">Powered by Kreative Partner Suite</p>
        </div>
      </div>
    </div>
  );
};
