import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Campaign, Order } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { 
  MessageCircle, 
  Mail, 
  Send, 
  Users, 
  MapPin, 
  Target, 
  TrendingUp, 
  Sliders, 
  Sparkles, 
  Plus, 
  CheckCircle2, 
  Eye, 
  MousePointerClick, 
  Smartphone, 
  ArrowRight, 
  BarChart3, 
  Play, 
  Clock, 
  Settings, 
  Zap, 
  UserCheck, 
  HelpCircle,
  ChevronRight,
  Info,
  Check,
  AlertCircle,
  PhoneCall,
  Map,
  X,
  Bot,
  GitBranch,
  Layers,
  Cpu,
  ShoppingBag,
  Database,
  RefreshCw,
  Globe,
  DollarSign
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { createLog } from '../../services/logService';

interface WahAiCampaignsProps {
  orders: Order[];
  customers: Customer[];
}

// Sample pre-approved templates
const MESSAGING_TEMPLATES = {
  whatsapp: [
    {
      id: 'wa_offer_1',
      name: '🥐 Fresh Weekend Treats Offer',
      text: 'Hey {{name}}! 🌟 Plan your weekend treats with Kreative Chocolates. Get 15% off on all premium pastries & designer cakes this Saturday & Sunday. Just show this message at checkout! \n\nReply "ORDER" to view our weekend menu or click below to order online.',
      ctaText: 'Order Fresh Pastries',
      ctaUrl: 'https://kreativechocolates.com/menu',
      imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=400'
    },
    {
      id: 'wa_birthday',
      name: '🎂 Birthday Month Sweet Surprise',
      text: 'Happy pre-birthday month {{name}}! 🎉 Wishing you a sweet year ahead. Since your birthday is coming up, we have unlocked a special ₹500 voucher for your birthday cake! \n\nReply "CAKE" to consult our AI designer or book your slot.',
      ctaText: 'Claim Birthday Offer',
      ctaUrl: 'https://kreativechocolates.com/birthday',
      imageUrl: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=400'
    },
    {
      id: 'wa_reengagement',
      name: '🍫 We Miss Your Sweet Tooth!',
      text: 'Hey {{name}}, it has been a while since your last chocolate indulgence. 🥺 We have missed baking for you! We have added an exclusive 20% loyalty discount to your account for your next order. \n\nReply with your favorite flavor to check stock!',
      ctaText: 'View New Arrivals',
      ctaUrl: 'https://kreativechocolates.com/loyalty',
      imageUrl: 'https://images.unsplash.com/photo-1548907040-4d42b5211511?auto=format&fit=crop&q=80&w=400'
    }
  ],
  sms: [
    {
      id: 'sms_geo',
      name: '📍 Geo-Proximity Flash Sale',
      text: 'KR_CHOC: Hey {{name}}! We are baking fresh cookies right now at Koramangala! Stop by in the next 1 hour & get 1-on-1 free. Show SMS. Map: https://g.co/kc'
    },
    {
      id: 'sms_loyalty',
      name: '✨ Premium Loyalty Points Update',
      text: 'Hi {{name}}, you have 450 unused points at Kreative Chocolates! Redeem them today for a free box of Premium Dark Chocolate Dragees. Code: INDULGE'
    }
  ],
  email: [
    {
      id: 'email_newsletter',
      name: '📧 Monthly Baking Secrets & Menu',
      text: 'Dear {{name}},\n\nSummer is here and our ovens are heating up with incredible new flavors! 🍓 From our brand-new Mango-Chili Dragees to Belgian Chocolate Truffle Cakes, we have everything you need to celebrate life.\n\nAs a valued member, here is your 15% VIP discount code: SUMMERSWEET.\n\nWarmly,\nKreative Chocolates Team',
      ctaText: 'Shop Summer Menu',
      ctaUrl: 'https://kreativechocolates.com/shop',
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=600'
    }
  ]
};

export const WahAiCampaigns: React.FC<WahAiCampaignsProps> = ({ orders, customers }) => {
  const { bakery, user: authUser } = useAuth();
  
  // Real-time states
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  // Campaign Creator States
  const [campaignName, setCampaignName] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [targetSegment, setTargetSegment] = useState<string>('all');
  
  // Geo-targeting States
  const [isGeoEnabled, setIsGeoEnabled] = useState(false);
  const [geoRadius, setGeoRadius] = useState<number>(3); // Default 3 km radius
  
  // Active states
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  
  // Automation workflows
  const [workflows, setWorkflows] = useState([
    { id: 'wf1', name: 'Dormant Retargeting Autopilot (WhatsApp)', trigger: 'No order in 45 Days', action: 'Send 20% Discount Code', active: true, channel: 'whatsapp' },
    { id: 'wf2', name: 'Milestone Anniversary Greeting (SMS)', trigger: 'Wedding anniversary tomorrow', action: 'Send Complimentary Macarons offer', active: false, channel: 'sms' },
    { id: 'wf3', name: 'Top Spender Exclusive Invite (Email)', trigger: 'LTV exceeds ₹10,000', action: 'Invite to Chocolate-Tasting Workshop', active: true, channel: 'email' },
    { id: 'wf4', name: 'Geo-Triggered Proximity Alert', trigger: 'Enters 1.5km Koramangala Store', action: 'Send Live Cookie Alert', active: false, channel: 'whatsapp' }
  ]);

  // Active subtab
  const [campaignSubTab, setCampaignSubTab] = useState<'broadcast' | 'ai_agents' | 'workflows' | 'integrations'>('broadcast');

  // Agentic AI States
  const [aiAgentName, setAiAgentName] = useState('Kreative Chocolates AI Assistant');
  const [aiPersona, setAiPersona] = useState<'sales' | 'support' | 'custom'>('sales');
  const [aiTemp, setAiTemp] = useState<number>(0.7);
  const [aiInstructions, setAiInstructions] = useState(
    'You are a friendly AI Assistant for Kreative Chocolates bakery in Bangalore. You help clients view menus, place pastry orders, recommend customized birthday cakes, and answer delivery details. Be sweet and professional.'
  );
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatMessages, setAiChatMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string; time: string }>>([
    { sender: 'agent', text: 'Hello! 🥐 I am your Wah AI-powered AI Assistant for Kreative Chocolates. How can I sweeten your day?', time: '9:41 AM' }
  ]);
  const [isAgentSaving, setIsAgentSaving] = useState(false);
  const [isAgentLive, setIsAgentLive] = useState(true);

  // Workflow Editor States
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('wf1');
  const [wfPrompt, setWfPrompt] = useState('');
  const [isGeneratingWf, setIsGeneratingWf] = useState(false);
  const [lifecycleTab, setLifecycleTab] = useState<'acquire' | 'engage' | 'convert' | 'support' | 'retain'>('engage');

  // Integrations States
  const [connectedApps, setConnectedApps] = useState<Record<string, boolean>>({
    shopify: false,
    woocommerce: false,
    google_sheets: false,
    salesforce: false,
    hubspot: false,
    razorpay: false,
    twilio: false,
    zapier: false
  });
  const [syncLogs, setSyncLogs] = useState<Array<{ source: string; message: string; time: string; type: 'success' | 'info' }>>([]);

  const handleSendAiChatMessage = () => {
    if (!aiChatInput.trim()) return;
    const userMsg = aiChatInput.trim();
    const newMsgs = [...aiChatMessages, { sender: 'user' as const, text: userMsg, time: 'Now' }];
    setAiChatMessages(newMsgs);
    setAiChatInput('');

    // Generate smart response based on input & persona
    setTimeout(() => {
      let response = "I'd love to help you with that! At Kreative Chocolates, we have fresh Belgian Chocolate Truffles, customized wedding cakes, and premium eggless pastries. Would you like to view our weekend menu?";
      const lower = userMsg.toLowerCase();
      if (lower.includes('eggless')) {
        response = "Yes! All our premium chocolate cakes and dragees can be prepared 100% eggless upon request. Just mention it at checkout!";
      } else if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
        response = "Our custom premium cakes start at ₹1,200/kg, and a box of our signature Belgian Chocolate Dragees is ₹550. Let me know if you would like me to draft an order link!";
      } else if (lower.includes('delivery') || lower.includes('where') || lower.includes('location')) {
        response = "We deliver across Bangalore (up to 15km from Koramangala 4th Block!). Free delivery is unlocked on all orders above ₹1,500.";
      } else if (lower.includes('birthday') || lower.includes('party') || lower.includes('anniversary')) {
        response = "Happy celebrations! 🎉 We can craft stunning customized designer cakes. You can redeem your ₹500 discount directly through this thread.";
      }
      setAiChatMessages(prev => [...prev, { sender: 'agent' as const, text: response, time: 'Now' }]);
    }, 800);
  };

  const handleGenerateWorkflowFromPrompt = () => {
    if (!wfPrompt.trim()) return;
    setIsGeneratingWf(true);
    setTimeout(() => {
      const newWfId = `wf_custom_${Date.now()}`;
      const newWf = {
        id: newWfId,
        name: `AI-Generated: ${wfPrompt.length > 35 ? wfPrompt.slice(0, 35) + '...' : wfPrompt}`,
        trigger: 'User Event Action',
        action: 'Omnichannel Response Flow',
        active: true,
        channel: 'whatsapp' as const
      };
      setWorkflows(prev => [newWf, ...prev]);
      setSelectedWorkflowId(newWfId);
      setIsGeneratingWf(false);
      setWfPrompt('');
      alert('Success! Wah AI interpreted your intent and constructed a real-time, prompt-driven multi-step automation workflow!');
    }, 1500);
  };

  const handleToggleApp = (appId: string) => {
    setConnectedApps(prev => {
      const updated = { ...prev, [appId]: !prev[appId] };
      const appName = appId.toUpperCase().replace('_', ' ');
      const newStatus = updated[appId] ? 'Connected' : 'Disconnected';
      
      // Add log
      setSyncLogs(logs => [
        { 
          source: appName, 
          message: `${appName} integration state successfully set to ${newStatus}.`, 
          time: 'Just now', 
          type: updated[appId] ? 'success' : 'info' 
        },
        ...logs
      ]);
      return updated;
    });
  };

  // Haversine formula to calculate distance in km
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  };

  // Subscribe to Campaigns in real-time
  useEffect(() => {
    if (!bakery?.id) return;
    const qCam = query(collection(db, 'campaigns'), where('bakeryId', '==', bakery.id));
    const unsub = onSnapshot(qCam, (snap: any) => {
      const list = snap.docs.map((doc: any) => ({
        ...doc.data(),
        id: doc.id
      } as Campaign));
      
      // Sort with newest sent/created first
      list.sort((a, b) => {
        const dateA = a.sentAt?.toDate ? a.sentAt.toDate() : (a.sentAt ? new Date(a.sentAt) : new Date(0));
        const dateB = b.sentAt?.toDate ? b.sentAt.toDate() : (b.sentAt ? new Date(b.sentAt) : new Date(0));
        return dateB.getTime() - dateA.getTime();
      });
      
      setCampaigns(list);
    });
    return unsub;
  }, [bakery]);

  // Customers mapped/filtered for our list state (using real customer coordinates, no fake ones assigned)
  const geocodedCustomers = useMemo(() => {
    return customers;
  }, [customers]);

  // Center coordinate of selected store
  const storeCenter = {
    lat: bakery?.attendanceSettings?.latitude ?? 0,
    lng: bakery?.attendanceSettings?.longitude ?? 0,
    name: bakery?.address || bakery?.name || 'Your Bakery',
  };

  // Helper to determine customer segments
  const customerSegmentsMap = useMemo(() => {
    const map: Record<string, 'top_spenders' | 'regulars' | 'dormant' | 'first_timers' | 'all'> = {};
    
    // Group orders
    const ordersByPhone: Record<string, Order[]> = {};
    orders.forEach(o => {
      const phoneClean = (o.customerDetails?.phone || '').replace(/\D/g, '').slice(-10);
      if (phoneClean) {
        if (!ordersByPhone[phoneClean]) ordersByPhone[phoneClean] = [];
        ordersByPhone[phoneClean].push(o);
      }
    });

    customers.forEach(c => {
      const phoneClean = (c.phone || '').replace(/\D/g, '').slice(-10);
      const matchingOrders = ordersByPhone[phoneClean] || [];
      const totalSpent = matchingOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      
      let segment: 'top_spenders' | 'regulars' | 'dormant' | 'first_timers' = 'first_timers';
      if (matchingOrders.length >= 3 || totalSpent >= 3000) {
        segment = 'top_spenders';
      } else if (matchingOrders.length >= 1) {
        segment = 'regulars';
      } else {
        segment = 'first_timers';
      }
      map[c.id] = segment;
    });

    return map;
  }, [customers, orders]);

  // Filtered audience calculation
  const targetAudience = useMemo(() => {
    return geocodedCustomers.filter(c => {
      // 1. Segment filter
      if (targetSegment !== 'all') {
        const seg = customerSegmentsMap[c.id];
        if (seg !== targetSegment) return false;
      }
      
      // 2. Geo-targeting proximity filter
      if (isGeoEnabled && !(storeCenter.lat === 0 && storeCenter.lng === 0)) {
        if (!c.latitude || !c.longitude) return false;
        const dist = getDistance(storeCenter.lat, storeCenter.lng, c.latitude, c.longitude);
        if (dist > geoRadius) return false;
      }
      
      return true;
    });
  }, [geocodedCustomers, targetSegment, isGeoEnabled, storeCenter, geoRadius, customerSegmentsMap]);

  // Calculate live counts
  const segmentStats = useMemo(() => {
    const stats = {
      all: geocodedCustomers.length,
      top_spenders: 0,
      regulars: 0,
      dormant: 0,
      first_timers: 0
    };
    geocodedCustomers.forEach(c => {
      const seg = customerSegmentsMap[c.id] || 'first_timers';
      if (seg === 'top_spenders') stats.top_spenders++;
      else if (seg === 'regulars') stats.regulars++;
      else stats.first_timers++;
    });
    return stats;
  }, [geocodedCustomers, customerSegmentsMap]);

  // Load selected template
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = e.target.value;
    setSelectedTemplateId(tid);
    if (!tid) {
      setMessageContent('');
      setMediaUrl('');
      setCtaText('');
      setCtaUrl('');
      return;
    }

    const t = MESSAGING_TEMPLATES[channel].find(item => item.id === tid);
    if (t) {
      setMessageContent(t.text);
      setMediaUrl((t as any).imageUrl || '');
      setCtaText((t as any).ctaText || '');
      setCtaUrl((t as any).ctaUrl || '');
    }
  };

  // Reset template selection on channel toggle
  useEffect(() => {
    setSelectedTemplateId('');
    setMessageContent('');
    setMediaUrl('');
    setCtaText('');
    setCtaUrl('');
  }, [channel]);

  // Launch campaign broadcast simulation
  const handleLaunchCampaign = async () => {
    if (!bakery?.id) return;
    if (!campaignName.trim()) {
      alert('Please specify a name for your campaign.');
      return;
    }
    if (!messageContent.trim()) {
      alert('Campaign message content cannot be empty.');
      return;
    }
    if (targetAudience.length === 0) {
      alert('The current audience selection has 0 matching customer. Please adjust filters.');
      return;
    }

    setIsSending(true);
    setSendProgress(5);

    // Simulate real-time dispatch sequence progress
    const steps = Math.min(10, targetAudience.length);
    const intervalTime = Math.max(150, 2000 / steps);
    
    let currentStep = 0;
    const progressTimer = setInterval(() => {
      currentStep++;
      const percent = Math.round((currentStep / steps) * 90) + 5;
      setSendProgress(percent);
      if (currentStep >= steps) {
        clearInterval(progressTimer);
        finalizeCampaign();
      }
    }, intervalTime);

    const finalizeCampaign = async () => {
      try {
        const count = targetAudience.length;

        const campaignPayload: Omit<Campaign, 'id'> = {
          bakeryId: bakery.id,
          name: campaignName.trim(),
          channel,
          messageType: selectedTemplateId ? 'template' : (mediaUrl || ctaText ? 'rich' : 'text'),
          templateName: selectedTemplateId ? MESSAGING_TEMPLATES[channel].find(t => t.id === selectedTemplateId)?.name : undefined,
          messageContent: messageContent.trim(),
          mediaUrl: mediaUrl.trim() || undefined,
          ctaText: ctaText.trim() || undefined,
          ctaUrl: ctaUrl.trim() || undefined,
          targetSegment,
          recipientCount: count,
          status: 'completed',
          sentAt: new Date().toISOString(), // REST-safe string or handled as is
          geoTargeting: isGeoEnabled && !(storeCenter.lat === 0 && storeCenter.lng === 0) ? {
            enabled: true,
            centerAddress: storeCenter.name,
            latitude: storeCenter.lat,
            longitude: storeCenter.lng,
            radiusKm: geoRadius
          } : undefined,
          stats: {
            sent: count,
            delivered: 0,
            opened: 0,
            clicked: 0
          }
        };

        // Add to Firestore database
        const docRef = await addDoc(collection(db, 'campaigns'), campaignPayload);
        
        // Log the action
        await createLog(
          'system',
          `Launched Wah AI Campaign "${campaignName}" via ${channel.toUpperCase()} targeting ${count} customers.`,
          authUser?.uid,
          authUser?.email || undefined,
          bakery.id
        );

        setCampaignName('');
        setMessageContent('');
        setMediaUrl('');
        setCtaText('');
        setCtaUrl('');
        setSelectedTemplateId('');
        setIsGeoEnabled(false);
        setSendProgress(100);
        
        setTimeout(() => {
          setIsSending(false);
          setSelectedCampaignId(docRef.id);
        }, 500);

      } catch (err: any) {
        console.error(err);
        alert('Error saving campaign: ' + err.message);
        setIsSending(false);
      }
    };
  };

  // Toggle workflow automation
  const toggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(wf => wf.id === id ? { ...wf, active: !wf.active } : wf));
  };

  // Simulated direct-replies on WhatsApp for marketing conversations
  const sampleRepliesMap: Record<string, Array<{ sender: string, text: string, time: string, status: 'unresolved' | 'resolved' }>> = {
    'fresh_weekend': [
      { sender: 'Rahul Sharma', text: 'Hey, is the 15% discount applicable on customized chocolate gift boxes as well?', time: 'Today, 10:15 AM', status: 'unresolved' },
      { sender: 'Priya Nair', text: 'Please book a slot for 1kg Red Velvet Cake for tomorrow evening!', time: 'Today, 11:24 AM', status: 'unresolved' },
      { sender: 'Anjali Gupta', text: 'Can I get the weekend pastries menu card PDF?', time: 'Yesterday, 4:50 PM', status: 'resolved' }
    ],
    'birthday_surprise': [
      { sender: 'Amit Verma', text: 'Awesome! Can I redeem the ₹500 discount for an eggless photo cake?', time: '2 days ago', status: 'unresolved' },
      { sender: 'Siddharth Sen', text: 'Thank you so much! Just ordered online.', time: '3 days ago', status: 'resolved' }
    ],
    'generic': [
      { sender: 'Geetha R.', text: 'Are you open till 10 PM today?', time: 'Just now', status: 'unresolved' },
      { sender: 'Vikram Patel', text: 'Sent payment slip via WhatsApp. Please check.', time: '1 hour ago', status: 'resolved' }
    ]
  };

  const activeCampaign = selectedCampaignId ? campaigns.find(c => c.id === selectedCampaignId) : null;

  return (
    <div className="space-y-6">
      
      {/* Search Header / Stats Overview Combo */}
      <div className="bg-slate-950 text-white rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-purple-500/30 flex items-center gap-1 w-max">
              <Sparkles className="w-3 h-3 animate-pulse" /> conversational commerce engine
            </span>
            <h1 className="text-3xl font-black tracking-tight mt-3 text-white flex items-center gap-2">
              Bakesync Wah AI Marketing
            </h1>
            <p className="text-slate-400 font-medium text-xs mt-1 leading-relaxed">
              Omnichannel WhatsApp, SMS & Email automation dashboard. Broadcast proximity-based flash sales & customer retention workflows.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => setShowChannelSettings(!showChannelSettings)}
              className="px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 flex items-center gap-2"
            >
              <Settings className="w-4 h-4" /> Gateway API Config
            </button>
          </div>
        </div>

        {/* Channels API Integration Status widget */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-8 border-t border-slate-900">
          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">WhatsApp Business API</p>
                <p className="text-xs font-bold text-white mt-0.5">Meta Cloud Gateway</p>
              </div>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">SMS Gateway</p>
                <p className="text-xs font-bold text-white mt-0.5">Twilio SMS Router</p>
              </div>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          </div>

          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Email Delivery SMTP</p>
                <p className="text-xs font-bold text-white mt-0.5">Amazon SES Router</p>
              </div>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          </div>
        </div>
      </div>

      {/* Wah AI Sub-Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setCampaignSubTab('broadcast')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs font-black uppercase tracking-wider transition-all border-t border-x ${
            campaignSubTab === 'broadcast'
              ? 'bg-white border-slate-200 text-purple-700 -mb-[1px] shadow-sm z-10'
              : 'bg-slate-50/50 border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <MessageCircle className="w-4 h-4 text-purple-600" />
          📣 Broadcast & Geo-Fencing
        </button>

        <button
          onClick={() => setCampaignSubTab('ai_agents')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs font-black uppercase tracking-wider transition-all border-t border-x ${
            campaignSubTab === 'ai_agents'
              ? 'bg-white border-slate-200 text-purple-700 -mb-[1px] shadow-sm z-10'
              : 'bg-slate-50/50 border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <Bot className="w-4 h-4 text-purple-600" />
          🤖 Agentic AI Playground
          <span className="bg-purple-100 text-purple-800 text-[8px] font-black uppercase tracking-normal px-2 py-0.5 rounded-full">New</span>
        </button>

        <button
          onClick={() => setCampaignSubTab('workflows')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs font-black uppercase tracking-wider transition-all border-t border-x ${
            campaignSubTab === 'workflows'
              ? 'bg-white border-slate-200 text-purple-700 -mb-[1px] shadow-sm z-10'
              : 'bg-slate-50/50 border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <GitBranch className="w-4 h-4 text-purple-600" />
          ⚡ No-Code Workflows
        </button>

        <button
          onClick={() => setCampaignSubTab('integrations')}
          className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-xs font-black uppercase tracking-wider transition-all border-t border-x ${
            campaignSubTab === 'integrations'
              ? 'bg-white border-slate-200 text-purple-700 -mb-[1px] shadow-sm z-10'
              : 'bg-slate-50/50 border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <Layers className="w-4 h-4 text-purple-600" />
          🔌 App Integrations Hub
        </button>
      </div>

      {/* Gateway settings overlay */}
      {showChannelSettings && (
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-md space-y-4 animate-in slide-in-from-top-4 duration-200">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-600" /> Gateway Integration Keys (Credentials Secured)
            </h3>
            <button onClick={() => setShowChannelSettings(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">Meta Phone ID</label>
              <input type="text" readOnly value="109283748293847" className="w-full bg-slate-50 text-slate-600 font-mono text-xs p-2.5 rounded-xl border border-slate-200" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">Twilio Account SID</label>
              <input type="text" readOnly value="AC840b8aefca887162d04baef89" className="w-full bg-slate-50 text-slate-600 font-mono text-xs p-2.5 rounded-xl border border-slate-200" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400">SMTP Host Connection</label>
              <input type="text" readOnly value="email-smtp.ap-south-1.amazonaws.com" className="w-full bg-slate-50 text-slate-600 font-mono text-xs p-2.5 rounded-xl border border-slate-200" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 italic font-medium">
            * These credentials are securely linked to Kreative Chocolates accounts. Outgoing messages use pre-approved templates in compliance with local guidelines.
          </p>
        </div>
      )}

      {campaignSubTab === 'broadcast' ? (
        <>
          {/* Main Broadcast Setup & Preview Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Campaign Builder Controls Form (Col 7) */}
        <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">Create New Campaign Broadcast</h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Setup channel, message templates & geofencing radius</p>
          </div>

          <div className="space-y-4">
            
            {/* Campaign Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Campaign Name</label>
              <input 
                type="text" 
                placeholder="e.g. Koramangala Weekend Pastry Fiesta" 
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-800 bg-slate-50/50 hover:bg-slate-50 transition-all"
              />
            </div>

            {/* Choose Channel */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Communication Channel</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setChannel('whatsapp')}
                  className={`p-3 rounded-2xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    channel === 'whatsapp' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500/10' 
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('sms')}
                  className={`p-3 rounded-2xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    channel === 'sms' 
                      ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-500/10' 
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Send className="w-4 h-4" /> SMS
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('email')}
                  className={`p-3 rounded-2xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    channel === 'email' 
                      ? 'bg-amber-50 text-amber-700 border-amber-300 ring-2 ring-amber-500/10' 
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
              </div>
            </div>

            {/* Select Pre-approved template or custom */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Select Pre-Approved Template</label>
                <span className="text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">Meta Verified</span>
              </div>
              <select
                value={selectedTemplateId}
                onChange={handleTemplateChange}
                className="w-full border border-slate-200 rounded-2xl p-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-700 bg-white"
              >
                <option value="">-- Or Write Raw Broadcast (Requires Manual Approval) --</option>
                {MESSAGING_TEMPLATES[channel]?.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Message Content */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Message Copywriting ({messageContent.length} characters)</label>
              <textarea 
                rows={4}
                placeholder="Type your broadcast message... Use {{name}} to dynamically populate customer name."
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl p-3.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-800 bg-slate-50/50 hover:bg-slate-50 transition-all"
              />
            </div>

            {/* Media Attachment & CTA config if rich type */}
            {channel !== 'sms' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Image / Media Attachment URL</label>
                  <input 
                    type="text" 
                    placeholder="https://images.unsplash.com/photo-..."
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 text-xs font-medium bg-slate-50 focus:outline-none text-slate-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Call-to-Action Link</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Button Text"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      className="w-1/2 border border-slate-200 rounded-xl p-2 text-xs font-semibold bg-slate-50 focus:outline-none text-slate-700"
                    />
                    <input 
                      type="text" 
                      placeholder="Button URL"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      className="w-1/2 border border-slate-200 rounded-xl p-2 text-xs font-medium bg-slate-50 focus:outline-none text-slate-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Target Segmentation Select */}
            <div className="space-y-1.5 border-t border-slate-100 pt-4">
              <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Target Audience Segment</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'all', label: 'All Clients', count: segmentStats.all },
                  { id: 'top_spenders', label: 'Top Spenders', count: segmentStats.top_spenders },
                  { id: 'regulars', label: 'Regulars', count: segmentStats.regulars },
                  { id: 'first_timers', label: 'First Timers', count: segmentStats.first_timers }
                ].map(seg => (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => setTargetSegment(seg.id)}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      targetSegment === seg.id 
                        ? 'bg-purple-50 text-purple-700 border-purple-200 ring-2 ring-purple-500/5' 
                        : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <p className="text-[9px] font-black uppercase tracking-wider truncate">{seg.label}</p>
                    <p className="text-xs font-black mt-0.5">{seg.count} clients</p>
                  </button>
                ))}
              </div>
            </div>

             {/* Advanced Geofencing & Geo-targeting Controls */}
             <div className="bg-slate-50 border border-slate-150 rounded-3xl p-5 space-y-4">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Target className="w-5 h-5 text-purple-600" />
                   <div>
                     <h3 className="text-xs font-black text-slate-950 uppercase tracking-tight">Proximity Geofencing Targeting</h3>
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Filter customers based on real-time distance</p>
                   </div>
                 </div>
                 {!(storeCenter.lat === 0 && storeCenter.lng === 0) && (
                   <label className="relative inline-flex items-center cursor-pointer">
                     <input 
                       type="checkbox" 
                       checked={isGeoEnabled} 
                       onChange={(e) => setIsGeoEnabled(e.target.checked)} 
                       className="sr-only peer" 
                     />
                     <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                   </label>
                 )}
               </div>
 
               {storeCenter.lat === 0 && storeCenter.lng === 0 ? (
                 <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-start gap-3">
                   <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                   <div>
                     <p className="text-xs font-bold">Location Set Required</p>
                     <p className="text-[11px] font-medium mt-1 leading-relaxed">
                       Set your bakery location in Settings → Bakery Settings → Attendance & Location to enable geo-targeting.
                     </p>
                   </div>
                 </div>
               ) : (
                 isGeoEnabled && (
                   <div className="space-y-4 animate-in fade-in zoom-in-95 duration-150">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {/* Store Center Location Info */}
                       <div className="space-y-1.5 md:col-span-2">
                         <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Bakery Reference Location</label>
                         <div className="border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 bg-white">
                           {storeCenter.name}
                         </div>
                       </div>
 
                       {/* Radius Slider */}
                       <div className="space-y-1.5 md:col-span-2">
                         <div className="flex justify-between items-center">
                           <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Geofence Radius Limit</label>
                           <span className="text-xs font-black text-purple-600">{geoRadius} km radius</span>
                         </div>
                         <input 
                           type="range" 
                           min="0.5" 
                           max="15" 
                           step="0.5"
                           value={geoRadius}
                           onChange={(e) => setGeoRadius(Number(e.target.value))}
                           className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                         />
                       </div>
                     </div>
 
                     {/* Distance calculation metrics */}
                     <div className="bg-white border border-slate-200 rounded-2xl p-3 flex justify-between items-center">
                       <div className="flex items-center gap-2">
                         <MapPin className="w-4 h-4 text-rose-500" />
                         <div>
                           <p className="text-[9px] font-black text-slate-400 uppercase">Center coordinate</p>
                           <p className="text-[10px] font-bold text-slate-700 truncate max-w-[200px]">{storeCenter.name}</p>
                         </div>
                       </div>
                       <div className="text-right">
                         <p className="text-[9px] font-black text-slate-400 uppercase">Total in Target Area</p>
                         <p className="text-sm font-black text-slate-900">{targetAudience.length} Clients</p>
                       </div>
                     </div>
 
                     {/* Live matching customer distances list */}
                     <div className="space-y-2">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Matching Clients Nearby ({targetAudience.length})</p>
                       {targetAudience.length === 0 ? (
                         <p className="text-[11px] italic text-slate-400">No clients with coordinates inside the {geoRadius}km radius.</p>
                       ) : (
                         <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 bg-white pr-2">
                           {targetAudience.map(c => {
                             const dist = getDistance(storeCenter.lat, storeCenter.lng, c.latitude!, c.longitude!);
                             return (
                               <div key={c.id} className="p-2 flex justify-between items-center text-xs">
                                 <div className="flex items-center gap-2">
                                   <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                   <span className="font-bold text-slate-800">{c.name}</span>
                                   <span className="text-[10px] font-mono text-slate-400 font-medium">({c.phone})</span>
                                 </div>
                                 <span className="font-bold text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                   {dist.toFixed(1)} km away
                                 </span>
                               </div>
                             );
                           })}
                         </div>
                       )}
                     </div>
                   </div>
                 )
               )}
             </div>
          </div>

          {/* Progress bar overlay during sending */}
          {isSending ? (
            <div className="bg-slate-900 text-white rounded-3xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center">
                <p className="text-xs font-black uppercase tracking-widest text-purple-400 flex items-center gap-2 animate-pulse">
                  <Play className="w-4 h-4 text-purple-400" /> Dispatching Broadcast Campaigns...
                </p>
                <span className="text-sm font-black font-mono">{sendProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full transition-all duration-150" style={{ width: `${sendProgress}%` }} />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <p>Establishing encrypted API gateways...</p>
                <p>{Math.round(targetAudience.length * (sendProgress / 100))} / {targetAudience.length} Sent</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLaunchCampaign}
              className="w-full py-4 bg-slate-950 hover:bg-slate-900 active:scale-[0.99] transition-all text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl flex items-center justify-center gap-2 border border-slate-900"
            >
              <Send className="w-4 h-4" /> Launch Campaign to {targetAudience.length} Clients 🚀
            </button>
          )}
        </div>

        {/* Live Smartphone Mockup Preview (Col 5) */}
        <div className="lg:col-span-5 flex flex-col justify-start">
          <div className="bg-slate-900 rounded-[2.5rem] border-[8px] border-slate-800 shadow-2xl relative overflow-hidden aspect-[9/18] flex flex-col max-w-[320px] mx-auto w-full">
            
            {/* Phone Notch/Status Bar */}
            <div className="bg-slate-950 text-white p-2.5 text-[9px] font-black font-mono flex justify-between items-center px-4 relative z-20">
              <span>9:41 AM</span>
              <div className="w-20 h-4 bg-slate-950 absolute left-1/2 -translate-x-1/2 top-0 rounded-b-xl border-x border-b border-slate-800/50" />
              <div className="flex items-center gap-1">
                <span>5G</span>
                <span className="border border-white/60 rounded px-0.5 text-[7px]">100%</span>
              </div>
            </div>

            {/* Smart Mockup Dynamic Interface based on Channel */}
            {channel === 'whatsapp' ? (
              // WhatsApp Chat Preview
              <div className="flex-1 bg-[#efeae2] flex flex-col relative">
                {/* Header */}
                <div className="bg-[#075e54] text-white p-3 flex items-center gap-2.5 shadow-sm relative z-10">
                  <div className="w-8 h-8 rounded-full bg-teal-800 flex items-center justify-center font-black text-xs">
                    KC
                  </div>
                  <div>
                    <h4 className="text-xs font-black leading-none text-white">Kreative Chocolates</h4>
                    <span className="text-[8px] text-teal-200 mt-0.5 block font-bold">Official Business Account</span>
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 p-3 overflow-y-auto space-y-4">
                  {/* System Date */}
                  <div className="text-center">
                    <span className="bg-white/80 border border-slate-100 shadow-sm text-slate-500 text-[8px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-md">
                      Today
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div className="max-w-[85%] bg-white rounded-r-2xl rounded-bl-2xl shadow-md border border-slate-200/50 overflow-hidden ml-1 animate-in slide-in-from-left-4 duration-200">
                    {/* Media Attachment if configured */}
                    {mediaUrl && (
                      <div className="aspect-[16/10] bg-slate-100 relative overflow-hidden">
                        <img src={mediaUrl} alt="Campaign visual" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    
                    {/* Bubble Content */}
                    <div className="p-3 space-y-2">
                      <p className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                        {messageContent ? messageContent.replace('{{name}}', 'Rahul') : 'Hi Rahul! Enter your premium broadcast message details...'}
                      </p>
                      <p className="text-right text-[8px] text-slate-400 font-mono">09:41 AM ✓✓</p>
                    </div>

                    {/* Interactive CTA Link Button */}
                    {ctaText && (
                      <a 
                        href={ctaUrl || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="block border-t border-slate-100 p-2.5 text-center text-[10px] font-black text-teal-600 bg-teal-50/20 hover:bg-teal-50 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                      >
                        <MousePointerClick className="w-3.5 h-3.5" /> {ctaText}
                      </a>
                    )}
                  </div>
                </div>

                {/* Footer Input */}
                <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 border-t border-slate-200">
                  <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[10px] text-slate-400">
                    Type a reply...
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#128c7e] text-white flex items-center justify-center">
                    <Send className="w-3 h-3" />
                  </div>
                </div>
              </div>
            ) : channel === 'sms' ? (
              // SMS Preview
              <div className="flex-1 bg-slate-50 flex flex-col relative">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 p-3 text-center shadow-sm relative z-10">
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-black text-xs mx-auto mb-1">
                    KC
                  </div>
                  <h4 className="text-[10px] font-black text-slate-900 leading-none">KR-CHOC</h4>
                </div>

                {/* Chat Area */}
                <div className="flex-1 p-3 overflow-y-auto space-y-4">
                  {/* SMS Bubble */}
                  <div className="max-w-[85%] bg-slate-200 text-slate-800 rounded-2xl p-3 shadow-sm text-[11px] leading-relaxed font-semibold ml-1 animate-in slide-in-from-left-4 duration-200">
                    {messageContent ? messageContent.replace('{{name}}', 'Rahul') : 'KR_CHOC: Hi Rahul! Type your short SMS message here...'}
                  </div>
                </div>

                {/* Footer Input */}
                <div className="bg-white p-2.5 border-t border-slate-200 flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full px-3 py-1.5 text-[10px] text-slate-400">
                    iMessage
                  </div>
                </div>
              </div>
            ) : (
              // Email Preview
              <div className="flex-1 bg-slate-100 flex flex-col relative text-slate-800">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 p-3 shadow-sm relative z-10 space-y-1">
                  <div className="flex justify-between items-center text-[9px] text-slate-400">
                    <span>From: info@kreativechocolates.com</span>
                    <span>To: rahul@gmail.com</span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900 truncate">
                    {campaignName || 'Monthly Secrets from the Baker'}
                  </h4>
                </div>

                {/* Email Body Card */}
                <div className="flex-1 p-3 overflow-y-auto">
                  <div className="bg-white rounded-xl shadow border border-slate-200/60 p-4 space-y-4 animate-in slide-in-from-bottom-4 duration-200">
                    {/* Logo Area */}
                    <div className="border-b border-slate-100 pb-3 text-center">
                      <span className="text-sm font-black tracking-tight text-purple-600">Kreative Chocolates</span>
                    </div>

                    {/* Email banner if media attachment provided */}
                    {mediaUrl && (
                      <div className="aspect-[16/9] bg-slate-100 rounded-lg overflow-hidden relative">
                        <img src={mediaUrl} alt="Newsletter graphic" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}

                    {/* Email Copy */}
                    <p className="text-[10px] text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                      {messageContent ? messageContent.replace('{{name}}', 'Rahul') : 'Dear Rahul, \n\nIndulge in our monthly curated premium chocolates newsletter...'}
                    </p>

                    {/* CTA Button */}
                    {ctaText && (
                      <div className="text-center pt-2">
                        <a 
                          href={ctaUrl || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-md"
                        >
                          {ctaText}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campaigns list & detailed Conversational Replies Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Campaign History Log (Col 7) */}
        <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">Campaign Dispatch History</h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Track live deliveries, open rates, and conversion funnels</p>
            </div>
            <span className="text-[10px] font-black text-slate-400 font-mono">{campaigns.length} total broadcasts</span>
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-black text-slate-900 uppercase">No Campaign Logs Recorded</h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase max-w-xs mx-auto">Create and launch your very first campaign broadcast above to view performance analytics.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map(cam => {
                const isSelected = selectedCampaignId === cam.id;
                const camDate = cam.sentAt ? new Date(cam.sentAt) : new Date();
                
                return (
                  <div 
                    key={cam.id}
                    onClick={() => setSelectedCampaignId(isSelected ? null : cam.id)}
                    className={`p-5 rounded-[1.8rem] border transition-all cursor-pointer hover:border-slate-300 ${
                      isSelected 
                        ? 'border-purple-300 bg-purple-50/20 ring-2 ring-purple-500/5 shadow-md' 
                        : 'border-slate-150 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 ${
                            cam.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' :
                            cam.channel === 'sms' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {cam.channel === 'whatsapp' ? <MessageCircle className="w-3 h-3" /> :
                             cam.channel === 'sms' ? <Send className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                            {cam.channel}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{camDate.toLocaleDateString()} at {camDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <h4 className="font-black text-slate-900 text-sm mt-1">{cam.name}</h4>
                        <p className="text-xs text-slate-500 line-clamp-1 italic">"{cam.messageContent}"</p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">{cam.recipientCount} clients</p>
                        <span className="inline-block text-[8px] font-black uppercase bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 mt-1">
                          Completed
                        </span>
                      </div>
                    </div>

                    {/* Expanded detailed analytics and conversions */}
                    {isSelected && (
                      <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 animate-in slide-in-from-top-4 duration-200">
                        <div className="bg-white border border-slate-200 p-3 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Delivered Success</p>
                          <p className="text-base font-black text-slate-900 mt-1">{cam.stats.delivered}</p>
                          <p className="text-[9px] font-bold text-emerald-500 mt-0.5">({cam.recipientCount ? Math.round((cam.stats.delivered / cam.recipientCount) * 100) : 0}% delivery)</p>
                        </div>
                        <div className="bg-white border border-slate-200 p-3 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Open Rate</p>
                          <p className="text-base font-black text-slate-900 mt-1">{cam.stats.opened}</p>
                          <p className="text-[9px] font-bold text-purple-600 mt-0.5">({cam.stats.delivered ? Math.round((cam.stats.opened / cam.stats.delivered) * 100) : 0}% read)</p>
                        </div>
                        <div className="bg-white border border-slate-200 p-3 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase font-mono">CTA conversion</p>
                          <p className="text-base font-black text-slate-900 mt-1">{cam.stats.clicked}</p>
                          <p className="text-[9px] font-bold text-blue-600 mt-0.5">({cam.stats.opened ? Math.round((cam.stats.clicked / cam.stats.opened) * 100) : 0}% click)</p>
                        </div>
                        <div className="bg-white border border-slate-200 p-3 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Estimated Return</p>
                          <p className="text-base font-black text-emerald-600 mt-1">₹{cam.stats.clicked * 750}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">(AOV: ₹750)</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* WhatsApp Conversational Chat Replies (Col 5) */}
        <div className="lg:col-span-5 bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 flex flex-col justify-between min-h-[400px]">
          <div className="space-y-4">
            <div>
              <span className="text-[8px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full font-black uppercase tracking-wider flex items-center gap-1 w-max">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Live Conversational Inbox
              </span>
              <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight mt-3">Direct Campaign Replies</h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Follow-up with customers instantly inside WhatsApp</p>
            </div>

            {/* Simulated direct client replies */}
            <div className="space-y-3 divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-2">
              {(activeCampaign?.name?.toLowerCase().includes('weekend') || !activeCampaign
                ? sampleRepliesMap.fresh_weekend 
                : sampleRepliesMap.birthday_surprise
              ).map((reply, i) => (
                <div key={i} className="pt-3 first:pt-0 flex justify-between items-start gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-slate-900">{reply.sender}</p>
                      <span className="text-[9px] text-slate-400 font-bold">{reply.time}</span>
                    </div>
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 p-2.5 rounded-2xl rounded-tl-none italic leading-relaxed">
                      "{reply.text}"
                    </p>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                    reply.status === 'unresolved' ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {reply.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 mt-6">
            <button
              type="button"
              onClick={() => alert('Launching full Meta Inbox Console for customer replies!')}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-700 flex items-center justify-center gap-2"
            >
              <PhoneCall className="w-3.5 h-3.5" /> Launch WhatsApp Customer Console
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Pilot Trigger Automations section */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8">
        <div>
          <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
            <Zap className="text-amber-500 fill-amber-500 w-5 h-5" /> Autopilot Customer Journey Triggers
          </h2>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Automated events triggered dynamically based on customer behavior</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {workflows.map(wf => (
            <div 
              key={wf.id}
              className={`p-5 rounded-[2rem] border transition-all ${
                wf.active 
                  ? 'border-amber-200 bg-amber-50/10 shadow-sm' 
                  : 'border-slate-150 bg-slate-50 opacity-75'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 ${
                  wf.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' :
                  wf.channel === 'sms' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {wf.channel}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={wf.active} 
                    onChange={() => toggleWorkflow(wf.id)}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <h4 className="font-black text-slate-900 text-xs mt-3 leading-snug">{wf.name}</h4>
              
              <div className="mt-4 pt-4 border-t border-slate-150/60 space-y-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Trigger:</span>
                  <span className="text-slate-700 font-black">{wf.trigger}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase">Action:</span>
                  <span className="text-slate-800 font-black text-right">{wf.action}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      ) : campaignSubTab === 'ai_agents' ? (
        /* Agentic AI Playground View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          
          {/* AI Settings Form (Col 7) */}
          <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] bg-purple-100 text-purple-800 font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-purple-200">
                  Wah AI Agentic Engine (300+ LLMs)
                </span>
                <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight mt-3">
                  Deploy Conversational AI Agent
                </h2>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Train a personalized LLM to close orders and support clients on autopilot
                </p>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1.5 rounded-full uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Active on Meta Webhook
              </span>
            </div>

            <div className="space-y-4">
              {/* Agent Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">AI Assistant Public Name</label>
                <input 
                  type="text"
                  value={aiAgentName}
                  onChange={(e) => setAiAgentName(e.target.value)}
                  className="w-full border border-slate-200 rounded-2xl p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-800 bg-slate-50/50"
                  placeholder="e.g. Bakesync Sales Bot"
                />
              </div>

              {/* Persona Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Core Agent Persona / Goal</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => {
                      setAiPersona('sales');
                      setAiInstructions('You are a friendly sales representative for Kreative Chocolates. You help clients explore the menu, check pricing of truffles, customize cake orders, and push sweet checkout coupon codes. Be warm and consultative.');
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      aiPersona === 'sales'
                        ? 'bg-purple-50 border-purple-200 ring-2 ring-purple-600/5'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-black text-slate-900 uppercase tracking-wide">🛍️ Sales & Orders</p>
                    <p className="text-[9px] text-slate-400 mt-1 leading-snug font-bold uppercase text-wrap">Closes reservations, drafts checkout payment links, recommends toppings.</p>
                  </button>

                  <button
                    onClick={() => {
                      setAiPersona('support');
                      setAiInstructions('You are a helpful customer support agent for Kreative Chocolates. You handle inquiries about delivery timings (usually up to 15km from Koramangala), check ingredient details like eggless/vegan requests, and smoothly route high-priority disputes to managers. Be professional and patient.');
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      aiPersona === 'support'
                        ? 'bg-purple-50 border-purple-200 ring-2 ring-purple-600/5'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-black text-slate-900 uppercase tracking-wide">🛠️ Support Specialist</p>
                    <p className="text-[9px] text-slate-400 mt-1 leading-snug font-bold uppercase text-wrap">Handles delivery updates, checks ingredients (eggless/dairy), resolves complaints.</p>
                  </button>

                  <button
                    onClick={() => {
                      setAiPersona('custom');
                      setAiInstructions('Provide custom system instructions to mold your AI Assistant into a unique brand ambassador...');
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      aiPersona === 'custom'
                        ? 'bg-purple-50 border-purple-200 ring-2 ring-purple-600/5'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-black text-slate-900 uppercase tracking-wide">🧠 Custom Ambassador</p>
                    <p className="text-[9px] text-slate-400 mt-1 leading-snug font-bold uppercase text-wrap">Define any specific behavior, tone guidelines, language constraints, or sales targets.</p>
                  </button>
                </div>
              </div>

              {/* Temperature Selector */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Agent Creativity (Temperature)</label>
                  <span className="text-xs font-black text-purple-600 font-mono">{aiTemp} ({aiTemp > 0.8 ? 'Highly Creative' : aiTemp > 0.5 ? 'Balanced' : 'Strict / Precise'})</span>
                </div>
                <input 
                  type="range"
                  min="0.1"
                  max="1.2"
                  step="0.1"
                  value={aiTemp}
                  onChange={(e) => setAiTemp(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>

              {/* System Instructions Prompt */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-900 uppercase tracking-wider">AI System Prompt Instructions (Training Set)</label>
                <textarea
                  rows={4}
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  className="w-full border border-slate-200 rounded-2xl p-3.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-800 bg-slate-50/50"
                  placeholder="Tell the AI how to behave..."
                />
              </div>
            </div>

            {/* Deploy controls */}
            <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-900 uppercase">Deployed Model</p>
                  <p className="text-xs font-bold text-slate-500 font-mono">Gemini 2.5 Flash / Meta Cloud Host</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAgentSaving(true);
                  setTimeout(() => {
                    setIsAgentSaving(false);
                    alert(`Success! Successfully synchronized "${aiAgentName}" instructions with the live Meta WhatsApp Gateway.`);
                  }, 1200);
                }}
                disabled={isAgentSaving}
                className="px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all bg-purple-600 border border-purple-500 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isAgentSaving ? 'Synchronizing LLM...' : '🔄 Update & Deploy Agent'}
              </button>
            </div>
          </div>

          {/* AI Simulator Preview (Col 5) */}
          <div className="lg:col-span-5 flex flex-col justify-start">
            <div className="bg-slate-900 rounded-[2.5rem] border-[8px] border-slate-800 shadow-2xl relative overflow-hidden aspect-[9/18] flex flex-col max-w-[320px] mx-auto w-full">
              {/* Phone Notch/Status Bar */}
              <div className="bg-slate-950 text-white p-2.5 text-[9px] font-black font-mono flex justify-between items-center px-4 relative z-20">
                <span>9:41 AM</span>
                <div className="w-20 h-4 bg-slate-950 absolute left-1/2 -translate-x-1/2 top-0 rounded-b-xl border-x border-b border-slate-800/50" />
                <div className="flex items-center gap-1">
                  <span>5G</span>
                  <span className="border border-white/60 rounded px-0.5 text-[7px]">100%</span>
                </div>
              </div>

              {/* Chat Window */}
              <div className="flex-1 bg-[#efeae2] flex flex-col relative">
                {/* Header */}
                <div className="bg-[#075e54] text-white p-3 flex items-center gap-2.5 shadow-sm relative z-10">
                  <div className="w-8 h-8 rounded-full bg-teal-800 flex items-center justify-center font-black text-xs">
                    🤖
                  </div>
                  <div>
                    <h4 className="text-xs font-black leading-none text-white">{aiAgentName}</h4>
                    <span className="text-[8px] text-teal-200 mt-0.5 block font-bold">Wah AI Autopilot Agent</span>
                  </div>
                </div>

                {/* Chat Log */}
                <div className="flex-1 p-3 overflow-y-auto space-y-3 flex flex-col">
                  {aiChatMessages.map((msg, i) => (
                    <div 
                      key={i}
                      className={`max-w-[85%] rounded-2xl p-2.5 shadow-sm text-xs leading-relaxed animate-in slide-in-from-bottom-2 duration-200 ${
                        msg.sender === 'agent'
                          ? 'bg-white text-slate-800 rounded-tl-none self-start mr-auto'
                          : 'bg-[#dcf8c6] text-slate-800 rounded-tr-none self-end ml-auto'
                      }`}
                    >
                      <p className="font-semibold">{msg.text}</p>
                      <p className="text-right text-[7px] text-slate-400 mt-1 font-mono">{msg.time}</p>
                    </div>
                  ))}
                </div>

                {/* Quick replies recommendations */}
                <div className="p-2 bg-transparent flex flex-wrap gap-1.5 border-t border-slate-200/40">
                  {[
                    'Any eggless cakes?',
                    'Price of 1kg chocolate cake?',
                    'Delivery to Indiranagar?'
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setAiChatInput(chip);
                      }}
                      className="text-[9px] font-black text-teal-800 bg-white hover:bg-teal-50 border border-teal-100 rounded-full px-2.5 py-1 transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Chat Footer Input */}
                <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 border-t border-slate-200">
                  <input
                    type="text"
                    value={aiChatInput}
                    onChange={(e) => setAiChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendAiChatMessage();
                    }}
                    placeholder="Ask the trained AI Agent..."
                    className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-slate-800 border border-slate-200 focus:outline-none"
                  />
                  <button 
                    onClick={handleSendAiChatMessage}
                    className="w-8 h-8 rounded-full bg-[#128c7e] hover:bg-[#075e54] text-white flex items-center justify-center transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : campaignSubTab === 'workflows' ? (
        /* Prompt-to-Workflow Node Builder View */
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Prompt Generator Banner */}
          <div className="bg-slate-900 rounded-[2rem] p-6 text-white border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-[80px]" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <p className="text-[10px] bg-amber-500/20 text-amber-300 font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1 w-max">
                  <Sparkles className="w-3 h-3 animate-pulse text-amber-400" /> prompt-driven workflow engine
                </p>
                <h3 className="text-lg font-black tracking-tight text-white uppercase mt-2">Generate Workflow with a Prompt</h3>
                <p className="text-slate-400 text-xs">Type what you want your automated customer flow to do, and Bakesync AI will structure the rules instantly.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto max-w-md">
                <input 
                  type="text"
                  value={wfPrompt}
                  onChange={(e) => setWfPrompt(e.target.value)}
                  placeholder="e.g. When client spends over ₹3,000, send thank you WhatsApp and add VIP tag"
                  className="bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-purple-600 flex-1 min-w-[240px]"
                />
                <button
                  onClick={handleGenerateWorkflowFromPrompt}
                  disabled={isGeneratingWf}
                  className="px-4 py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-600 disabled:opacity-50 transition-all rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                >
                  {isGeneratingWf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Build Flow
                </button>
              </div>
            </div>
            
            {/* Quick Presets */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap gap-2 items-center">
              <span className="text-[9px] text-slate-500 font-black uppercase">Sample prompts:</span>
              {[
                'When delivery delayed by 30m, send apology SMS with free pastry coupon link',
                'If regular client birthday tomorrow, trigger WhatsApp custom wishing message with cake discounts',
                'When order marked unpaid, auto ping customer at 8 PM with Razorpay invoice'
              ].map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setWfPrompt(p)}
                  className="text-[9px] text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg px-2.5 py-1.5 transition-all text-left truncate max-w-xs"
                >
                  "{p}"
                </button>
              ))}
            </div>
          </div>

          {/* Customer Lifecycle Filters */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Full-Funnel Lifecycle Automator</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Deploy triggers and automated messaging at every stage</p>
              </div>

              {/* Lifecycle stages filter tabs matching screenshot 5 */}
              <div className="flex flex-wrap gap-1.5 bg-slate-50 border border-slate-100 p-1 rounded-2xl">
                {[
                  { id: 'acquire', label: '🤝 Acquire', count: 48 },
                  { id: 'engage', label: '🧬 Engage', count: 124 },
                  { id: 'convert', label: '✅ Convert', count: 96 },
                  { id: 'support', label: '🛍️ Support', count: 4 },
                  { id: 'retain', label: '🏆 Retain', count: 72 }
                ].map(stage => (
                  <button
                    key={stage.id}
                    onClick={() => setLifecycleTab(stage.id as any)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      lifecycleTab === stage.id
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {stage.label} <span className={`text-[9px] ml-1 opacity-70 ${lifecycleTab === stage.id ? 'text-purple-100' : 'text-slate-400'}`}>({stage.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Simulated Interactive Workflow node-flow graph editor */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none" />
              
              <div className="relative z-10 space-y-8">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                    <p className="text-xs font-black text-slate-900 uppercase">Live Node Editor Canvas: {workflows.find(w => w.id === selectedWorkflowId)?.name || 'Custom Lifecycle Flow'}</p>
                  </div>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded font-black uppercase">
                    Status: ACTIVE
                  </span>
                </div>

                {/* Horizontal Node-Flow Layout matching Screenshot 6 exactly! */}
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-2 py-4">
                  
                  {/* Node 1: Facebook / Inbound Trigger */}
                  <div className="bg-white border-2 border-blue-500 rounded-2xl p-4 shadow-md w-full lg:max-w-[220px] relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                      <span className="text-[8px] bg-blue-100 text-blue-800 font-black px-2 py-0.5 rounded-full uppercase">Trigger Source</span>
                      <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <h5 className="text-xs font-black text-slate-900 uppercase">Facebook / Web Inbound Lead</h5>
                    <p className="text-[10px] text-slate-500 mt-1 font-bold">Inbound customer message: "I want custom chocolate design"</p>
                    {/* Visual connection dot */}
                    <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-[9px] w-4 h-4 bg-purple-600 border-2 border-white rounded-full z-10" />
                  </div>

                  {/* Connecting Arrow */}
                  <div className="text-slate-300 hidden lg:block">
                    <ArrowRight className="w-6 h-6 stroke-[3px]" />
                  </div>

                  {/* Node 2: AI Lead Qualifier Classifier */}
                  <div className="bg-white border-2 border-purple-500 rounded-2xl p-4 shadow-md w-full lg:max-w-[220px] relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                      <span className="text-[8px] bg-purple-100 text-purple-800 font-black px-2 py-0.5 rounded-full uppercase">AI Decision</span>
                      <Bot className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                    </div>
                    <h5 className="text-xs font-black text-slate-900 uppercase">AI-Checks if VIP?</h5>
                    <p className="text-[10px] text-slate-500 mt-1 font-bold">Classifies LTV or lead tags to branch communication strategy.</p>
                    {/* Visual connection dot */}
                    <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-[9px] w-4 h-4 bg-purple-600 border-2 border-white rounded-full z-10" />
                  </div>

                  {/* Connecting Arrow */}
                  <div className="text-slate-300 hidden lg:block">
                    <ArrowRight className="w-6 h-6 stroke-[3px]" />
                  </div>

                  {/* Node 3: Custom WhatsApp Action */}
                  <div className="bg-white border-2 border-emerald-500 rounded-2xl p-4 shadow-md w-full lg:max-w-[220px] relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                      <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full uppercase">Action: WhatsApp</span>
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <h5 className="text-xs font-black text-slate-900 uppercase">Send WhatsApp Campaign</h5>
                    <p className="text-[10px] text-slate-500 mt-1 font-bold">Pushes fresh weekend treats template with action quick replies.</p>
                    {/* Visual connection dot */}
                    <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-[9px] w-4 h-4 bg-purple-600 border-2 border-white rounded-full z-10" />
                  </div>

                  {/* Connecting Arrow */}
                  <div className="text-slate-300 hidden lg:block">
                    <ArrowRight className="w-6 h-6 stroke-[3px]" />
                  </div>

                  {/* Node 4: CRM Webhook & Payment trigger */}
                  <div className="bg-white border-2 border-pink-500 rounded-2xl p-4 shadow-md w-full lg:max-w-[220px]">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                      <span className="text-[8px] bg-pink-100 text-pink-800 font-black px-2 py-0.5 rounded-full uppercase">Terminal Webhook</span>
                      <Layers className="w-3.5 h-3.5 text-pink-500" />
                    </div>
                    <h5 className="text-xs font-black text-slate-900 uppercase">Update CRM & Razorpay</h5>
                    <p className="text-[10px] text-slate-500 mt-1 font-bold">Appends "Engaged" tag in Bakesync database and auto-pings payments.</p>
                  </div>

                </div>

                <div className="border-t border-slate-200/60 pt-4 flex flex-col sm:flex-row justify-between items-center text-xs gap-3">
                  <div className="flex gap-2 items-center text-slate-500">
                    <Info className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-slate-600 text-wrap">Click any node block to configure payload details, parameters, variables, or timeout delay thresholds.</span>
                  </div>
                  <button
                    onClick={() => alert('Testing webhook simulation: Outbound ping sent successfully to Meta Gateway.')}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-all"
                  >
                    ⚡ Test Live Webhook Ping
                  </button>
                </div>
              </div>
            </div>

            {/* Autopilot trigger lists */}
            <div className="bg-white rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-4">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Active Customer Journey Triggers ({workflows.length})</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {workflows.map(wf => (
                  <div 
                    key={wf.id}
                    onClick={() => setSelectedWorkflowId(wf.id)}
                    className={`p-5 rounded-[2rem] border transition-all cursor-pointer ${
                      selectedWorkflowId === wf.id
                        ? 'border-purple-600 bg-purple-50/10 shadow-md ring-2 ring-purple-600/5'
                        : wf.active 
                          ? 'border-slate-200 bg-white hover:bg-slate-50/40' 
                          : 'border-slate-150 bg-slate-50 opacity-75'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 ${
                        wf.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' :
                        wf.channel === 'sms' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {wf.channel}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={wf.active} 
                          onChange={() => toggleWorkflow(wf.id)}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    <h4 className="font-black text-slate-900 text-xs mt-3 leading-snug truncate">{wf.name}</h4>
                    
                    <div className="mt-4 pt-4 border-t border-slate-150/60 space-y-2 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-bold uppercase">Trigger:</span>
                        <span className="text-slate-700 font-black">{wf.trigger}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-bold uppercase">Action:</span>
                        <span className="text-slate-800 font-black text-right">{wf.action}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* App Integrations Hub View */
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Header Description */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="text-[9px] bg-indigo-100 text-indigo-800 border border-indigo-200 px-3 py-1 rounded-full font-black uppercase tracking-wider">
                Integrations Marketplace (8000+ Apps Ready)
              </span>
              <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight mt-3">
                Connect Your Marketing Tech Stack
              </h2>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                Automatically synchronize contacts, orders, invoices, and messaging webhook endpoints
              </p>
            </div>
            <button
              onClick={() => {
                setSyncLogs(logs => [
                  { source: 'ALL', message: 'Manual resynchronization request successfully initiated.', time: 'Just now', type: 'info' },
                  ...logs
                ]);
                alert('Success! Initiated deep CRM sync for all active connections. Review logs below.');
              }}
              className="px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all bg-indigo-600 border border-indigo-500 text-white hover:bg-indigo-700"
            >
              🔄 Resync All Connections
            </button>
          </div>

          {/* Integrations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { id: 'shopify', name: 'Shopify Store', logo: '🛍️', color: 'from-emerald-500 to-green-600', desc: 'Sync Shopify client checkout details and orders dynamically to Bakesync CRM.' },
              { id: 'woocommerce', name: 'WooCommerce', logo: '🛒', color: 'from-purple-500 to-indigo-600', desc: 'Retrieve WordPress WooCommerce customer profiles and tag loyalty segments.' },
              { id: 'google_sheets', name: 'Google Sheets', logo: '📊', color: 'from-green-500 to-emerald-600', desc: 'Instantly append campaign lists, phone registers, and unsubscribed records.' },
              { id: 'salesforce', name: 'Salesforce CRM', logo: '☁️', color: 'from-blue-400 to-sky-600', desc: 'Enterprise data warehouse lead router syncing pipeline opportunities.' },
              { id: 'hubspot', name: 'HubSpot', logo: '🎯', color: 'from-amber-500 to-orange-600', desc: 'Sync HubSpot contacts pipeline milestones to dispatch automated campaign alerts.' },
              { id: 'razorpay', name: 'Razorpay Gateway', logo: '💳', color: 'from-blue-600 to-indigo-700', desc: 'Auto-generate and text payment link requests when customers reply "BUY".' },
              { id: 'twilio', name: 'Twilio SMS Gateway', logo: '💬', color: 'from-rose-500 to-red-600', desc: 'Secondary fallback SMS delivery gateway for priority client updates.' },
              { id: 'zapier', name: 'Zapier Webhooks', logo: '⚡', color: 'from-orange-500 to-amber-600', desc: 'Unlock powerful webhook pipelines to sync Bakesync with over 8000+ apps.' }
            ].map(app => {
              const isActive = connectedApps[app.id];
              return (
                <div 
                  key={app.id} 
                  className={`bg-white rounded-[2.2rem] p-6 border transition-all ${
                    isActive 
                      ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/5' 
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${app.color} text-white text-xl flex items-center justify-center shadow-md`}>
                      {app.logo}
                    </div>
                    
                    {/* IOS switch toggle */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isActive} 
                        onChange={() => handleToggleApp(app.id)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-slate-900 text-sm">{app.name}</h4>
                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                      isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {isActive ? 'Connected' : 'Offline'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold mt-2">{app.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Sync Terminal Stream logs */}
          <div className="bg-slate-950 rounded-[2.5rem] p-6 text-slate-200 border border-slate-900 shadow-lg font-mono">
            <div className="flex justify-between items-center border-b border-slate-900 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Live Synchronization Feed & Webhook Logs</span>
              </div>
              <button 
                onClick={() => setSyncLogs([])}
                className="text-[10px] bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-900"
              >
                Clear Terminal Logs
              </button>
            </div>

            <div className="space-y-2 text-xs max-h-56 overflow-y-auto">
              {syncLogs.length === 0 ? (
                <p className="text-slate-500 text-center py-6">-- No logs captured. Force resync or toggle an app to see live streaming hook records --</p>
              ) : (
                syncLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-4 items-start py-1.5 border-b border-slate-900/60 last:border-0">
                    <span className="text-slate-500 min-w-[70px] select-none">[{log.time}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase select-none ${
                      log.type === 'success' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/40' : 'bg-blue-950/60 text-blue-400 border border-blue-900/40'
                    }`}>
                      {log.source}
                    </span>
                    <span className="flex-1 text-slate-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
