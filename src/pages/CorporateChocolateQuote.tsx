import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Briefcase,
  Layers,
  ChevronLeft,
  Coins,
  IndianRupee,
  FileText,
  Mail,
  User,
  Plus,
  Minus,
  Sparkles,
  Search,
  Sliders,
  Calendar,
  Percent,
  Calculator,
  Compass,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Trash2,
  Copy,
  Check,
  Send,
  Zap,
  Tag,
  Image as ImageIcon,
  UploadCloud,
  Move,
  RotateCw,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';

// Since jspdf-autotable extends jsPDF, we just import it to register
import 'jspdf-autotable';

// Luxury Box packaging vector presets for direct visual play when no files are uploaded
const SAMPLE_BOXES = [
  {
    id: 'navy',
    name: 'Royal Velvet Navy Gift Box',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%230f172a"/><rect x="40" y="40" width="520" height="320" rx="20" fill="%231e293b" stroke="%23334155" stroke-width="6"/><rect x="50" y="50" width="500" height="300" rx="15" fill="%231e1b4b" stroke="%23b45309" stroke-width="3"/><rect x="80" y="80" width="440" height="240" rx="8" fill="%230f172a" stroke="%231e293b" stroke-width="2"/><text x="300" y="210" font-family="system-ui, sans-serif" font-size="14" font-weight="900" fill="%234b5563" letter-spacing="4" text-anchor="middle">PREMIUM CHOCOLATE CASE</text></svg>`
  },
  {
    id: 'wood',
    name: 'Artisanal Walnut Slide Case',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23451a03"/><rect x="40" y="40" width="520" height="320" rx="10" fill="%2378350f" stroke="%2392400e" stroke-width="8"/><rect x="65" y="65" width="470" height="270" rx="6" fill="%23b45309" stroke="%23451a03" stroke-width="4"/><rect x="80" y="80" width="440" height="240" rx="4" fill="%231c1917" stroke="%2378350f" stroke-width="2"/><text x="300" y="210" font-family="Courier, monospace" font-size="15" font-weight="900" fill="%2357534e" letter-spacing="6" text-anchor="middle">HANDCRAFTED CONFECTIONERY</text></svg>`
  },
  {
    id: 'ivory',
    name: 'Minimalist Ivory Cardboard Case',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23f8fafc"/><rect x="40" y="40" width="520" height="320" rx="24" fill="%23ffffff" stroke="%23e2e8f0" stroke-width="6"/><rect x="60" y="60" width="480" height="280" rx="18" fill="%23fdfcfb" stroke="%23f1f5f9" stroke-width="3"/><rect x="80" y="80" width="440" height="240" rx="10" fill="%23fdfbf7" stroke="%23fafaf9" stroke-width="1"/><text x="300" y="210" font-family="system-ui, sans-serif" font-size="14" font-weight="900" fill="%2394a3b8" letter-spacing="5" text-anchor="middle">ORGANIC TRUFFLE GIFTCASE</text></svg>`
  }
];

// Elegant vector client logos for immediate visual prototyping
const SAMPLE_LOGOS = [
  {
    id: 'google',
    name: 'Gilded Crest',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><polygon points="100,20 180,160 20,160" fill="none" stroke="%23b45309" stroke-width="8"/><text x="100" y="115" font-family="Helvetica, sans-serif" font-size="18" font-weight="bold" fill="%23b45309" text-anchor="middle">STARK</text><text x="100" y="135" font-family="Helvetica, sans-serif" font-size="10" fill="%23d97706" letter-spacing="1" text-anchor="middle">GLOBAL</text></svg>`
  },
  {
    id: 'vertex',
    name: 'Vertex Sphere',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="70" fill="none" stroke="%23059669" stroke-width="8"/><path d="M 65 100 A 35 35 0 1 1 135 100" fill="none" stroke="%2310b981" stroke-width="6"/><text x="100" y="105" font-family="Helvetica, sans-serif" font-size="22" font-weight="900" fill="%23047857" text-anchor="middle">VERTEX</text></svg>`
  },
  {
    id: 'luxury',
    name: 'Crown Royal',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><path d="M 60 140 L 70 80 L 100 110 L 130 80 L 140 140 Z" fill="none" stroke="%23d97706" stroke-width="6"/><circle cx="70" cy="75" r="5" fill="%23d97706"/><circle cx="100" cy="105" r="5" fill="%23d97706"/><circle cx="130" cy="75" r="5" fill="%23d97706"/><text x="100" y="165" font-family="Georgia, serif" font-size="14" font-weight="bold" fill="%23b45309" text-anchor="middle">CROWN</text></svg>`
  }
];

// Festive Diwali / Corporate Celebration preset vector motifs
const SAMPLE_DIWALI_MOTIFS = [
  {
    id: 'diya_gold',
    name: 'Festive Golden Diya Lamp',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><path d="M 100 20 Q 80 75 100 100 Q 120 75 100 20 Z" fill="%23f59e0b" stroke="%23ea580c" stroke-width="2"/><path d="M 100 35 Q 90 75 100 90 Q 110 75 100 35 Z" fill="%23fef08a"/><path d="M 40 100 C 40 150 160 150 160 100 C 140 100 120 130 100 130 C 80 130 60 100 40 100 Z" fill="%23b45309" stroke="%2378350f" stroke-width="4"/><path d="M 40 100 Q 100 120 160 100" fill="none" stroke="%23f59e0b" stroke-width="3"/><circle cx="100" cy="115" r="4" fill="%23f59e0b"/><circle cx="80" cy="112" r="3" fill="%23f59e0b"/><circle cx="120" cy="112" r="3" fill="%23f59e0b"/><text x="100" y="170" font-family="system-ui, sans-serif" font-size="12" font-weight="900" fill="%23ea580c" letter-spacing="2" text-anchor="middle">HAPPY DIWALI</text></svg>`
  },
  {
    id: 'mandala_art',
    name: 'Sacred Diwali Mandala',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="none" stroke="%23d97706" stroke-width="3" stroke-dasharray="6,4"/><circle cx="100" cy="100" r="60" fill="none" stroke="%23f59e0b" stroke-width="2"/><circle cx="100" cy="100" r="40" fill="none" stroke="%23ea580c" stroke-width="4"/><path d="M 100 20 L 100 180 M 20 100 L 180 100 M 43.4 43.4 L 156.6 156.6 M 43.4 156.6 L 156.6 43.4" stroke="%23d97706" stroke-width="1.5"/><circle cx="100" cy="100" r="10" fill="%23ea580c"/><circle cx="100" cy="40" r="4" fill="%23f59e0b"/><circle cx="100" cy="160" r="4" fill="%23f59e0b"/><circle cx="40" cy="100" r="4" fill="%23f59e0b"/><circle cx="160" cy="100" r="4" fill="%23f59e0b"/><text x="100" y="195" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="%23b45309" letter-spacing="3" text-anchor="middle">SHUBH DEEPAWALI</text></svg>`
  },
  {
    id: 'shubh_labh',
    name: 'Ornate Shubh Labh Crest',
    url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect x="25" y="25" width="150" height="150" rx="30" fill="none" stroke="%23b45309" stroke-width="4"/><circle cx="100" cy="100" r="55" fill="none" stroke="%23ea580c" stroke-width="2"/><path d="M 80 80 L 120 80 M 100 80 L 100 120 M 80 80 L 80 100 M 120 120 L 120 100 M 80 120 L 100 120 M 120 80 L 100 80" fill="none" stroke="%23ea580c" stroke-width="5" stroke-linecap="round"/><circle cx="90" cy="90" r="3" fill="%23ea580c"/><circle cx="110" cy="90" r="3" fill="%23ea580c"/><circle cx="90" cy="110" r="3" fill="%23ea580c"/><circle cx="110" cy="110" r="3" fill="%23ea580c"/><text x="45" y="110" font-family="system-ui, sans-serif" font-size="15" font-weight="900" fill="%23b45309" text-anchor="middle">शुभ</text><text x="155" y="110" font-family="system-ui, sans-serif" font-size="15" font-weight="900" fill="%23b45309" text-anchor="middle">लाभ</text></svg>`
  }
];

// High fidelity chocolate piece background mockups
const CHOCOLATE_BASES = {
  dark: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%231a0e05"/><rect x="60" y="60" width="480" height="280" rx="20" fill="%232d190b" stroke="%2340240f" stroke-width="12"/><rect x="100" y="100" width="400" height="200" rx="12" fill="%231a0e05" stroke="%232d190b" stroke-width="6"/><circle cx="300" cy="200" r="60" fill="%23120a03" opacity="0.6"/><text x="300" y="205" font-family="Georgia, serif" font-size="13" font-style="italic" fill="%235c3412" letter-spacing="4" text-anchor="middle">ARTISANAL CHOCOLAT</text></svg>`,
  white: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23f7f4eb"/><rect x="60" y="60" width="480" height="280" rx="20" fill="%23fffefa" stroke="%23efebd8" stroke-width="12"/><rect x="100" y="100" width="400" height="200" rx="12" fill="%23f7f4eb" stroke="%23fffefa" stroke-width="6"/><circle cx="300" cy="200" r="60" fill="%23e2ddc4" opacity="0.4"/><text x="300" y="205" font-family="Georgia, serif" font-size="13" font-style="italic" fill="%23c2baa1" letter-spacing="4" text-anchor="middle">ARTISANAL CHOCOLAT</text></svg>`
};

interface ChocolateBasePreset {
  id: string;
  name: string;
  pieces: number;
  packagingCostPrice: number;
  packagingRetailPrice: number;
}

const BOX_PRESETS: ChocolateBasePreset[] = [
  { id: '4pc', name: '4 Pieces Box', pieces: 4, packagingCostPrice: 35, packagingRetailPrice: 65 },
  { id: '6pc', name: '6 Pieces Box', pieces: 6, packagingCostPrice: 45, packagingRetailPrice: 85 },
  { id: '9pc', name: '9 Pieces Box', pieces: 9, packagingCostPrice: 60, packagingRetailPrice: 110 },
  { id: '12pc', name: '12 Pieces Box', pieces: 12, packagingCostPrice: 75, packagingRetailPrice: 140 },
  { id: '15pc', name: '15 Pieces Box', pieces: 15, packagingCostPrice: 90, packagingRetailPrice: 170 },
  { id: '18pc', name: '18 Pieces Box', pieces: 18, packagingCostPrice: 110, packagingRetailPrice: 200 },
  { id: '24pc', name: '24 Pieces Box', pieces: 24, packagingCostPrice: 140, packagingRetailPrice: 250 },
  { id: 'custom', name: 'Custom Box Size', pieces: 10, packagingCostPrice: 50, packagingRetailPrice: 100 }
];

interface QuoteRecord {
  id?: string;
  bakeryId: string;
  quoteNumber: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  boxPresetId: string;
  boxPresetName: string;
  pieceCount: number;
  quantity: number;
  discountPercent: number;
  cocoBaseCost: number;
  cocoBaseRSP: number;
  boxPackagingCost: number;
  boxPackagingRSP: number;
  logoCost: number;
  logoRSP: number;
  logoRequested: boolean;
  ribbonCost: number;
  ribbonRSP: number;
  ribbonRequested: boolean;
  
  // New Edible Print parameters
  includeEdiblePrint?: boolean;
  ediblePrintPieces?: number;
  ediblePrintCost?: number;
  ediblePrintRSP?: number;

  // New Brand Mockup fields
  brandStylingRecommendation?: string;
  aestheticCritique?: string;

  transportation: number;
  includeGST: boolean;
  gstPercent?: number;
  unitCostPrice: number;
  unitRetailPrice: number;
  quotedPricePerBox: number;
  netOrderValue: number;
  gstAmount: number;
  totalBillingAmount: number;
  options?: any[];
  createdAt: any;
  createdBy: string;
}

interface AINegotiationResult {
  isProfitable: boolean;
  calculatedMarginAtTargetPercent: number;
  overallStrategyRating: string;
  recommendationMessage: string;
  tieredCounters: Array<{
    tierName: string;
    unitPrice: number;
    discountApplied: number;
    conditionsOrPerks: string;
  }>;
  talkingPoints: string[];
  tradeOffs: string[];
}

export const CorporateChocolateQuote: React.FC = () => {
  const { bakery, user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteOptions, setQuoteOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Form State - Client Information
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Box Selection
  const [selectedPresetId, setSelectedPresetId] = useState<string>('9pc');
  const [customPieces, setCustomPieces] = useState(10);
  const [customPackagingCP, setCustomPackagingCP] = useState(50);
  const [customPackagingRSP, setCustomPackagingRSP] = useState(100);

  // Chocolate Filling Settings
  const [chocolateType, setChocolateType] = useState<'classic' | 'premium' | 'custom'>('classic');
  const [chocoCPPerPiece, setChocoCPPerPiece] = useState(12);
  const [chocoRSPPerPiece, setChocoRSPPerPiece] = useState(25);

  // New Edible Print Chocolate state: CP ₹40, default RSP ₹75
  const [includeEdiblePrint, setIncludeEdiblePrint] = useState(false);
  const [ediblePrintPieces, setEdiblePrintPieces] = useState(2);
  const [ediblePrintCP] = useState(40);
  const [ediblePrintRSP, setEdiblePrintRSP] = useState(75);

  // Interactive AI Brand Mockup visualizer state
  const [brandingMode, setBrandingMode] = useState<'box_top' | 'edible_print'>('box_top');
  const [boxPhoto, setBoxPhoto] = useState<string>(SAMPLE_BOXES[0].url);
  const [logoPhoto, setLogoPhoto] = useState<string>(SAMPLE_LOGOS[0].url);
  const [logoX, setLogoX] = useState(50); // layout percentage
  const [logoY, setLogoY] = useState(50); // layout percentage
  const [logoScale, setLogoScale] = useState(100); // overlay size scale
  const [logoRotation, setLogoRotation] = useState(0); // tilt degrees
  const [logoOpacity, setLogoOpacity] = useState(90); // opacity percent
  const [logoBlendMode, setLogoBlendMode] = useState('normal');
  const [logoColorTreatment, setLogoColorTreatment] = useState<'original' | 'white' | 'gold' | 'silver' | 'two_color' | 'three_color'>('original');
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isRotatingLogo, setIsRotatingLogo] = useState(false);
  const [isResizingLogo, setIsResizingLogo] = useState(false);

  // Secondary Diwali / Festive themed logo states
  const [includeFestival, setIncludeFestival] = useState(false);
  const [festivalPhoto, setFestivalPhoto] = useState<string>(SAMPLE_DIWALI_MOTIFS[0].url);
  const [festivalX, setFestivalX] = useState(70); // layout percentage
  const [festivalY, setFestivalY] = useState(30); // layout percentage
  const [festivalScale, setFestivalScale] = useState(80); // size percentage
  const [festivalRotation, setFestivalRotation] = useState(0); // rotation degrees
  const [isDraggingFestival, setIsDraggingFestival] = useState(false);
  const [isRotatingFestival, setIsRotatingFestival] = useState(false);
  const [isResizingFestival, setIsResizingFestival] = useState(false);

  // AI Brand Placement vision feedback state
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandResult, setBrandResult] = useState<{
    recommendedStyle: string;
    aestheticCritique: string;
    layout: {
      topPercent: number;
      leftPercent: number;
      scalePercent: number;
      rotationDegree: number;
      opacity: number;
      blendMode: string;
    };
    packagingEnhancements: string[];
  } | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleLogoMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const initialLogoX = logoX;
    const initialLogoY = logoY;
    
    const handleMouseMove = (mvEv: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((mvEv.clientX - startX) / rect.width) * 100;
      const dy = ((mvEv.clientY - startY) / rect.height) * 100;
      setLogoX(parseFloat(Math.min(100, Math.max(0, initialLogoX + dx)).toFixed(1)));
      setLogoY(parseFloat(Math.min(100, Math.max(0, initialLogoY + dy)).toFixed(1)));
    };
    
    const handleMouseUp = () => {
      setIsDraggingLogo(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleRotateMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotatingLogo(true);
    
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    const centerX = rect.left + rect.width * (logoX / 100);
    const centerY = rect.top + rect.height * (logoY / 100);
    
    const handleMouseMove = (mvEv: MouseEvent) => {
      const dx = mvEv.clientX - centerX;
      const dy = mvEv.clientY - centerY;
      const angleRad = Math.atan2(dy, dx);
      let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90; // offset so straight-up is 0
      
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;
      setLogoRotation(angleDeg);
    };
    
    const handleMouseUp = () => {
      setIsRotatingLogo(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingLogo(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const initialScale = logoScale;
    
    const handleMouseMove = (mvEv: MouseEvent) => {
      const dx = mvEv.clientX - startX;
      const dy = mvEv.clientY - startY;
      const delta = (dx + dy) * 0.7; // factor
      setLogoScale(Math.round(Math.min(300, Math.max(10, initialScale + delta))));
    };
    
    const handleMouseUp = () => {
      setIsResizingLogo(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Secondary Festival/Diwali mouse event handlers
  const handleFestivalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFestival(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = festivalX;
    const initialY = festivalY;
    
    const handleMouseMove = (mvEv: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((mvEv.clientX - startX) / rect.width) * 100;
      const dy = ((mvEv.clientY - startY) / rect.height) * 100;
      setFestivalX(parseFloat(Math.min(100, Math.max(0, initialX + dx)).toFixed(1)));
      setFestivalY(parseFloat(Math.min(100, Math.max(0, initialY + dy)).toFixed(1)));
    };
    
    const handleMouseUp = () => {
      setIsDraggingFestival(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleFestivalRotateMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotatingFestival(true);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width * (festivalX / 100);
    const centerY = rect.top + rect.height * (festivalY / 100);
    
    const handleMouseMove = (mvEv: MouseEvent) => {
      const dx = mvEv.clientX - centerX;
      const dy = mvEv.clientY - centerY;
      const angleRad = Math.atan2(dy, dx);
      let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90;
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;
      setFestivalRotation(angleDeg);
    };
    
    const handleMouseUp = () => {
      setIsRotatingFestival(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleFestivalResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingFestival(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const initialScale = festivalScale;
    
    const handleMouseMove = (mvEv: MouseEvent) => {
      const dx = mvEv.clientX - startX;
      const dy = mvEv.clientY - startY;
      const delta = (dx + dy) * 0.7;
      setFestivalScale(Math.round(Math.min(300, Math.max(10, initialScale + delta))));
    };
    
    const handleMouseUp = () => {
      setIsResizingFestival(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Optional Add-ons
  const [logoRequested, setLogoRequested] = useState(false);
  const [logoCP, setLogoCP] = useState(15);
  const [logoRSP, setLogoRSP] = useState(25);

  const [ribbonRequested, setRibbonRequested] = useState(false);
  const [ribbonCP, setRibbonCP] = useState(8);
  const [ribbonRSP, setRibbonRSP] = useState(15);

  // Logistics & Billing
  const [volume, setVolume] = useState(100);
  const [discountPercent, setDiscountPercent] = useState(15);
  const [transportation, setTransportation] = useState(1500);
  const [includeGST, setIncludeGST] = useState(true);
  const [gstPercent, setGstPercent] = useState(5);

  // AI Assistant State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AINegotiationResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Search Filter
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!bakery?.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'corporate_chocolate_quotes'),
      where('bakeryId', '==', bakery.id)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const records: QuoteRecord[] = [];
      snap.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() } as QuoteRecord);
      });
      // Sort on client to avoid composite index requirement
      records.sort((a, b) => {
        const timeA = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
        const timeB = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
        return timeB - timeA;
      });
      setQuotes(records);
      setLoading(false);
    }, (err) => {
      console.error("Error loaded corporate quotes:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [bakery]);

  // Sync preset values when selecting a preset size
  const activePreset = useMemo(() => {
    return BOX_PRESETS.find(p => p.id === selectedPresetId) || BOX_PRESETS[2];
  }, [selectedPresetId]);

  // Apply default filling cost profiles
  useEffect(() => {
    if (chocolateType === 'classic') {
      setChocoCPPerPiece(12);
      setChocoRSPPerPiece(25);
    } else if (chocolateType === 'premium') {
      setChocoCPPerPiece(18);
      setChocoRSPPerPiece(38);
    }
  }, [chocolateType]);

  // Pricing calculations
  const calcs = useMemo(() => {
    const pieces = selectedPresetId === 'custom' ? customPieces : activePreset.pieces;
    const pkgCP = selectedPresetId === 'custom' ? customPackagingCP : activePreset.packagingCostPrice;
    const pkgRSP = selectedPresetId === 'custom' ? customPackagingRSP : activePreset.packagingRetailPrice;

    // Split standard chocolate pieces vs edible print pieces
    const activeEdibleCount = includeEdiblePrint ? Math.min(pieces, ediblePrintPieces) : 0;
    const standardPiecesCount = Math.max(0, pieces - activeEdibleCount);

    // Chocolate portions
    const standardCocoCP = standardPiecesCount * chocoCPPerPiece;
    const standardCocoRSP = standardPiecesCount * chocoRSPPerPiece;

    const edibleCocoCP = activeEdibleCount * ediblePrintCP;
    const edibleCocoRSP = activeEdibleCount * ediblePrintRSP;

    // Combined Chocolate portion
    const cocoCP = standardCocoCP + edibleCocoCP;
    const cocoRSP = standardCocoRSP + edibleCocoRSP;

    // Direct add-on portions
    const logoAddonCP = logoRequested ? logoCP : 0;
    const logoAddonRSP = logoRequested ? logoRSP : 0;

    const ribbonAddonCP = ribbonRequested ? ribbonCP : 0;
    const ribbonAddonRSP = ribbonRequested ? ribbonRSP : 0;

    // Single Box Calculations
    const unitCP = cocoCP + pkgCP + logoAddonCP + ribbonAddonCP;
    const unitRegularRSP = cocoRSP + pkgRSP + logoAddonRSP + ribbonAddonRSP;

    // Discounted wholesale price
    const quotedPricePerBox = Math.max(unitCP, Math.round(unitRegularRSP * (1 - discountPercent / 100)));

    // Order Totals
    const netOrderValue = quotedPricePerBox * volume;
    const totalOrderCP = unitCP * volume;
    const gstValue = includeGST ? Math.round(netOrderValue * (gstPercent / 100)) : 0;
    const totalBillingAmount = netOrderValue + gstValue + Number(transportation || 0);

    // Margins logic
    const unitProfitAmount = quotedPricePerBox - unitCP;
    const grossProfitPercent = unitCP > 0 ? (unitProfitAmount / unitCP) * 100 : 0;
    const orderTotalProfit = netOrderValue - totalOrderCP;

    return {
      pieces,
      cocoCP,
      cocoRSP,
      pkgCP,
      pkgRSP,
      unitCP,
      unitRegularRSP,
      quotedPricePerBox,
      netOrderValue,
      totalOrderCP,
      gstValue,
      totalBillingAmount,
      unitProfitAmount,
      grossProfitPercent,
      orderTotalProfit,
      activeEdibleCount,
      standardPiecesCount
    };
  }, [
    selectedPresetId,
    activePreset,
    customPieces,
    customPackagingCP,
    customPackagingRSP,
    chocolateType,
    chocoCPPerPiece,
    chocoRSPPerPiece,
    logoRequested,
    logoCP,
    logoRSP,
    ribbonRequested,
    ribbonCP,
    ribbonRSP,
    volume,
    discountPercent,
    transportation,
    includeGST,
    gstPercent,
    includeEdiblePrint,
    ediblePrintPieces,
    ediblePrintCP,
    ediblePrintRSP
  ]);

  const handleCopyText = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(identifier);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleAddOption = () => {
    const pieces = selectedPresetId === 'custom' ? customPieces : activePreset.pieces;
    const boxPresetName = selectedPresetId === 'custom' ? 'Custom Box Layout' : activePreset.name;
    const fillingName = chocolateType === 'classic' 
      ? 'Classic Assortment' 
      : chocolateType === 'premium' 
        ? 'Premium Centerfill' 
        : 'Custom Blend';

    const newOption = {
      id: 'opt_' + Date.now() + '_' + Math.floor(Math.random() * 100),
      boxPresetId: selectedPresetId,
      boxPresetName,
      pieceCount: pieces,
      chocolateType,
      chocoCPPerPiece,
      chocoRSPPerPiece,
      quantity: volume,
      discountPercent,
      logoRequested,
      logoCP,
      logoRSP,
      ribbonRequested,
      ribbonCP,
      ribbonRSP,
      includeEdiblePrint,
      ediblePrintPieces: includeEdiblePrint ? ediblePrintPieces : 0,
      
      // calculated stored metrics
      unitCostPrice: calcs.unitCP,
      unitRetailPrice: calcs.unitRegularRSP,
      quotedPricePerBox: calcs.quotedPricePerBox,
      netOrderValue: calcs.netOrderValue,
      gstAmount: calcs.gstValue,
      totalBillingAmount: calcs.totalBillingAmount
    };

    setQuoteOptions(prev => [...prev, newOption]);
    alert(`Successfully added Option: ${boxPresetName} (${pieces} Pcs - ${fillingName}) to the quote details comparison basket!`);
  };

  const handleLoadOption = (opt: any) => {
    setSelectedPresetId(opt.boxPresetId);
    if (opt.boxPresetId === 'custom') {
      setCustomPieces(opt.pieceCount);
    }
    setChocolateType(opt.chocolateType);
    setChocoCPPerPiece(opt.chocoCPPerPiece);
    setChocoRSPPerPiece(opt.chocoRSPPerPiece);
    setVolume(opt.quantity);
    setDiscountPercent(opt.discountPercent);
    setLogoRequested(opt.logoRequested);
    if (opt.logoRequested) {
      setLogoCP(opt.logoCP);
      setLogoRSP(opt.logoRSP);
    }
    setRibbonRequested(opt.ribbonRequested);
    if (opt.ribbonRequested) {
      setRibbonCP(opt.ribbonCP);
      setRibbonRSP(opt.ribbonRSP);
    }
    setIncludeEdiblePrint(opt.includeEdiblePrint);
    if (opt.includeEdiblePrint) {
      setEdiblePrintPieces(opt.ediblePrintPieces);
    }
  };

  // Safe Firebase logging
  const handleSaveQuote = async () => {
    if (!bakery?.id) return;
    if (!companyName.trim()) {
      alert("Please fill out the corporate Company Name.");
      return;
    }

    try {
      const yearStr = format(new Date(), 'yyyyMM');
      const rand = Math.floor(100 + Math.random() * 900);
      const quoteNumber = `Q-CRP-${yearStr}-${rand}`;

      const hasOptions = quoteOptions.length > 0;
      
      const aggregatedNetOrderValue = hasOptions 
        ? quoteOptions.reduce((sum, o) => sum + (o.netOrderValue || 0), 0)
        : calcs.netOrderValue;
        
      const aggregatedGstAmount = hasOptions
        ? quoteOptions.reduce((sum, o) => sum + (o.gstAmount || 0), 0)
        : calcs.gstValue;

      const aggregatedTotalBillingAmount = aggregatedNetOrderValue + aggregatedGstAmount + Number(transportation || 0);

      const newQuote: QuoteRecord = {
        bakeryId: bakery.id,
        quoteNumber,
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        phone: phone.trim(),
        boxPresetId: hasOptions ? 'multi_option' : selectedPresetId,
        boxPresetName: hasOptions 
          ? `Multi-Option Comparison (${quoteOptions.length} configurations)` 
          : (selectedPresetId === 'custom' ? 'Custom Box Layout' : activePreset.name),
        pieceCount: hasOptions ? quoteOptions[0].pieceCount : calcs.pieces,
        quantity: hasOptions ? quoteOptions.reduce((sum, o) => sum + o.quantity, 0) : volume,
        discountPercent: hasOptions ? Math.round(quoteOptions.reduce((sum, o) => sum + o.discountPercent, 0) / quoteOptions.length) : discountPercent,
        cocoBaseCost: hasOptions ? quoteOptions[0].unitCostPrice : calcs.cocoCP,
        cocoBaseRSP: hasOptions ? quoteOptions[0].unitRetailPrice : calcs.cocoRSP,
        boxPackagingCost: hasOptions ? 0 : calcs.pkgCP,
        boxPackagingRSP: hasOptions ? 0 : calcs.pkgRSP,
        logoCost: logoRequested ? logoCP : 0,
        logoRSP: logoRequested ? logoRSP : 0,
        logoRequested,
        ribbonCost: ribbonRequested ? ribbonCP : 0,
        ribbonRSP: ribbonRequested ? ribbonRSP : 0,
        ribbonRequested,
        
        // Save edible print details
        includeEdiblePrint,
        ediblePrintPieces: includeEdiblePrint ? ediblePrintPieces : 0,
        ediblePrintCost: ediblePrintCP,
        ediblePrintRSP: ediblePrintRSP,
        brandStylingRecommendation: brandResult?.recommendedStyle || '',
        aestheticCritique: brandResult?.aestheticCritique || '',

        transportation: Number(transportation || 0),
        includeGST,
        gstPercent,
        unitCostPrice: hasOptions ? 0 : calcs.unitCP,
        unitRetailPrice: hasOptions ? 0 : calcs.unitRegularRSP,
        quotedPricePerBox: hasOptions ? 0 : calcs.quotedPricePerBox,
        netOrderValue: aggregatedNetOrderValue,
        gstAmount: aggregatedGstAmount,
        totalBillingAmount: aggregatedTotalBillingAmount,
        options: quoteOptions,
        createdAt: serverTimestamp() as any,
        createdBy: user?.displayName || user?.email || 'Sales Specialist'
      };

      await addDoc(collection(db, 'corporate_chocolate_quotes'), newQuote);
      alert(`Quote saved successfully! Invoice #: ${quoteNumber}`);

      // Log activity
      await addDoc(collection(db, 'logs'), {
        type: 'quote',
        message: hasOptions
          ? `Corporate comparison quote saved for ${companyName.trim()} with ${quoteOptions.length} options: Total ₹${aggregatedTotalBillingAmount.toLocaleString()}`
          : `Corporate quote saved for ${companyName.trim()} (${volume} boxes): Total ₹${calcs.totalBillingAmount.toLocaleString()}`,
        bakeryId: bakery.id,
        userId: user?.uid,
        userEmail: user?.email,
        createdAt: serverTimestamp()
      }).catch(e => console.error("logging skipped", e));

    } catch (err) {
      console.error(err);
      alert("Failed to save quote. Please check Firestore connection.");
    }
  };

  const handleDeleteQuote = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the quote for ${name}?`)) return;
    try {
      await deleteDoc(doc(db, 'corporate_chocolate_quotes', id));
      if (bakery?.id) {
        await addDoc(collection(db, 'logs'), {
          type: 'quote',
          message: `Corporate chocolate quote deleted for ${name}`,
          bakeryId: bakery.id,
          userId: user?.uid,
          userEmail: user?.email,
          createdAt: serverTimestamp()
        }).catch(() => {});
      }
    } catch (e) {
      alert("Error deleting quote record.");
    }
  };

  const handleNegotiateWithAI = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    try {
      const resp = await fetch('/api/chocolate-quote/negotiator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxDetails: {
            preset: selectedPresetId,
            pieces: calcs.pieces,
            chocolateType,
            logoIncluded: logoRequested,
            customRibbonIncluded: ribbonRequested
          },
          volume: volume,
          targetPricePerBox: calcs.quotedPricePerBox,
          baseCostPricePerBox: calcs.unitCP,
          suggestedRetailPricePerBox: calcs.unitRegularRSP,
          targetDiscountPercent: discountPercent
        })
      });

      if (!resp.ok) {
        throw new Error("Negotiator engine returned an error.");
      }

      const outcome = await resp.json();
      setAiResult(outcome);
    } catch (err: any) {
      setAiError(err?.message || "Something went wrong consulting the negotiation algorithm.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportPDF = (quote: any) => {
    const doc = new jsPDF();

    // Color Theme Styling (Royal Blue / Gold Theme)
    const primaryColor = '#1e3a8a'; // Royal Blue
    const accentColor = '#b45309';  // Amber Gold
    const lightBg = '#f8fafc';      // Slate 50
    const textDark = '#0f172a';     // Slate 900
    const textGray = '#64748b';     // Slate 500

    // Header Branding Card
    doc.setFillColor(30, 58, 138); // primaryColor
    doc.rect(0, 0, 210, 42, 'F');

    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(bakery?.name?.toUpperCase() || "BAKESYNC PREMIUM CONFECTIONERY", 15, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Artisanal Chocolates • Custom Gifting • Corporate Hampers", 15, 25);
    doc.text(`Contact: ${user?.email || 'sales@bakesync.com'} | Generated: ${format(new Date(), 'dd MMMM yyyy')}`, 15, 30);

    // Document Title Flag
    doc.setFillColor(180, 83, 9); // Gold accent
    doc.rect(135, 12, 60, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("WH0LESALE QUOTATION", 139, 19);
    doc.text(quote.quoteNumber || "Q-TEMP-9991", 139, 25);

    // Client Card info
    doc.setTextColor(textDark);
    doc.setFontSize(11);
    doc.text("PREPARED FOR (CORPORATE CLIENT):", 15, 54);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(quote.companyName, 15, 62);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(textGray);
    if (quote.contactPerson) doc.text(`Contact Person: ${quote.contactPerson}`, 15, 68);
    if (quote.email) doc.text(`Email: ${quote.email}`, 15, 73);
    if (quote.phone) doc.text(`Cell: ${quote.phone}`, 15, 78);

    // Box Configuration Details
    doc.setTextColor(textDark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("GIFT SPECIFICATION:", 115, 54);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(textGray);
    doc.text(`Packaging: ${quote.boxPresetName || 'Standard'}`, 115, 62);
    doc.text(`Chocolates Count: ${quote.pieceCount} Pieces`, 115, 67);
    
    const hasEdiblePrint = quote.includeEdiblePrint && (quote.ediblePrintPieces || 0) > 0;
    const profileText = hasEdiblePrint
      ? `${quote.pieceCount - (quote.ediblePrintPieces || 0)} Artisanal + ${quote.ediblePrintPieces} Edible Prints`
      : (quote.pieceCount * quote.quotedPricePerBox > 4000 ? 'Premium Centerfills' : 'Confectioner Classics');
    doc.text(`Filling Profile: ${profileText}`, 115, 72);
    doc.text(`Branding: ${quote.logoRequested || hasEdiblePrint ? 'Custom Logo Branding' : 'Standard Ribbon Only'}`, 115, 77);

    // Decorative Separator Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(15, 84, 195, 84);

    // Table of Items
    const hasOptions = quote.options && quote.options.length > 0;
    const tableBody: any[] = [];

    if (hasOptions) {
      quote.options.forEach((opt: any, idx: number) => {
        const hasEdible = opt.includeEdiblePrint && (opt.ediblePrintPieces || 0) > 0;
        const specDetails = `${opt.pieceCount} Pcs Case (${opt.chocolateType === 'classic' ? 'Classic Confectionery' : opt.chocolateType === 'premium' ? 'Premium Centerfills' : 'Custom Flavors'})${hasEdible ? ` [with ${opt.ediblePrintPieces} Edible prints]` : ''}${opt.logoRequested ? ' + Custom Logo' : ''}${opt.ribbonRequested ? ' + Satin Ribbon' : ''}`;
        
        tableBody.push([
          `Option ${idx + 1}: ${opt.boxPresetName || `${opt.pieceCount} Pcs`}`,
          specDetails,
          `${opt.quantity} Boxes`,
          `₹${opt.quotedPricePerBox.toLocaleString()}`,
          `${opt.discountPercent}%`,
          `₹${opt.netOrderValue.toLocaleString()}`
        ]);
      });
    } else {
      tableBody.push(
        [
          "Artisanal Finished Box Base",
          `Custom corporate chocolate assortment gift box setup (${quote.pieceCount} pcs)`,
          `${quote.quantity} Pcs`,
          `₹${quote.unitRetailPrice.toFixed(2)}`,
          `0.00%`,
          `₹${(quote.unitRetailPrice * quote.quantity).toLocaleString()}`
        ],
        [
          "Volume Discount Concession",
          `Approved corporate bulk negotiation discount rate`,
          `-`,
          `-`,
          `${quote.discountPercent}%`,
          `-₹${((quote.unitRetailPrice - quote.quotedPricePerBox) * quote.quantity).toLocaleString()}`
        ]
      );

      if (hasEdiblePrint) {
        tableBody.push([
          "Edible-Print Chocolate Bites",
          `Specialist logo prints inside packaging box (${quote.ediblePrintPieces} pcs per box)`,
          "Included",
          "-",
          "-",
          "Included in Box Price"
        ]);
      }

      if (quote.logoRequested) {
        tableBody.push([
          "Premium Visual Logo Branding",
          "Edible logo plaque print formulation & sleeve wrap execution",
          "Included",
          "-",
          "-",
          "Included in Box Price"
        ]);
      }

      if (quote.ribbonRequested) {
        tableBody.push([
          "Satin Ribbon & Bow Presentation",
          "Premium color-coordinated satin ribbon outer binding styling",
          "Included",
          "-",
          "-",
          "Included in Box Price"
        ]);
      }
    }

    (doc as any).autoTable({
      startY: 88,
      head: [["Line Item Description", "Specifications", "Quantity", "Base Rate", "Discount", "Gross Amount"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9
      },
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 4,
        valign: 'middle'
      },
      columnStyles: {
        0: { width: 45, fontStyle: "bold" },
        1: { width: 75 },
        2: { width: 20, alignment: 'center' },
        3: { width: 22, alignment: 'right' },
        4: { width: 18, alignment: 'center' },
        5: { width: 25, alignment: 'right' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;

    // Subtotal Summary Block Table
    doc.setFillColor(lightBg);
    doc.rect(110, finalY, 85, 45, 'F');
    doc.setTextColor(textDark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);

    const displayNetOrderValue = hasOptions
      ? quote.options.reduce((sum: number, o: any) => sum + (o.netOrderValue || 0), 0)
      : quote.netOrderValue;

    const displayGstAmount = hasOptions
      ? quote.options.reduce((sum: number, o: any) => sum + (o.gstAmount || 0), 0)
      : quote.gstAmount;

    const displayTotalBillingAmount = displayNetOrderValue + displayGstAmount + Number(quote.transportation || 0);

    doc.text("Gross Product Net:", 114, finalY + 8);
    doc.text(`₹${displayNetOrderValue.toLocaleString()}`, 190, finalY + 8, { align: 'right' });

    doc.text("Logistics / Delivery (Extra):", 114, finalY + 16);
    doc.text(`₹${quote.transportation.toLocaleString()}`, 190, finalY + 16, { align: 'right' });

    const gstPct = quote.gstPercent !== undefined ? quote.gstPercent : 18;
    doc.text(`Confectionery GST (${gstPct.toFixed(1)}%):`, 114, finalY + 24);
    doc.text(quote.includeGST ? `₹${displayGstAmount.toLocaleString()}` : '₹0.00 (Exempt)', 190, finalY + 24, { align: 'right' });

    // Total Amount Highlight
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.8);
    doc.line(112, finalY + 28, 193, finalY + 28);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 138);
    doc.text("Grand Total Due:", 114, finalY + 36);
    doc.setFontSize(12);
    doc.text(`INR ${displayTotalBillingAmount.toLocaleString()}`, 190, finalY + 36, { align: 'right' });

    // Terms and Guidelines Column
    doc.setTextColor(textDark);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("STANDARD CORPORATE Gifting Terms:", 15, finalY + 8);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(textGray);
    doc.setFontSize(7.5);
    doc.text("1. 50% upfront payment is mandatory to activate raw cocoa/mold booking.", 15, finalY + 14);
    doc.text("2. 50% remainder payment strictly within 7 workdays post direct handoff.", 15, finalY + 20);
    doc.text("3. Freight costs reflect custom refrigerated distribution routes.", 15, finalY + 26);
    doc.text("4. Quotation remains valid for 30 consecutive calendar days from creation.", 15, finalY + 32);
    doc.text("5. Handcrafted with clean production food grade safety protocols.", 15, finalY + 38);

    // Footer Signature Space
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, finalY + 58, 65, finalY + 58);
    doc.line(135, finalY + 58, 185, finalY + 58);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("Client Corporate Acceptance Signature", 15, finalY + 63);
    doc.text("Authorized Bakery Operations Signatory", 135, finalY + 63);

    // Save
    doc.save(`Quote_${quote.companyName.replace(/\s+/g, '_')}_${quote.quoteNumber}.pdf`);
  };

  // Filter historical quotes
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      const company = (q.companyName || '').toLowerCase();
      const person = (q.contactPerson || '').toLowerCase();
      const num = (q.quoteNumber || '').toLowerCase();
      const sQuery = searchQuery.toLowerCase();
      return company.includes(sQuery) || person.includes(sQuery) || num.includes(sQuery);
    });
  }, [quotes, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            Corporate Chocolate Quote Builder
          </h1>
          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">
            Premium wholesale box quote generation & AI negotiation counter-intelligence
          </p>
        </div>
      </div>

      {/* Main Board Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Parameters Form & Live Calculations */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <User className="text-blue-500 w-5 h-5" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Corporate Client Information</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Company / Group Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Google India Pvt Ltd"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-xs text-slate-900 outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Contact Person</label>
                <input 
                  type="text" 
                  placeholder="e.g. Ms. Priya Sharma (HR)"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-xs text-slate-900 outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Contact Email</label>
                <input 
                  type="email" 
                  placeholder="e.g. corporate@google.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-xs text-slate-900 outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Cell / Phone Number</label>
                <input 
                  type="tel" 
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-xs text-slate-900 outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                />
              </div>
            </div>
          </div>

          {/* Configuration Setup */}
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
            {/* Box Size Picker */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Layers className="text-amber-500 w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Box Style & Piece Presets</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {BOX_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(p.id);
                      if (p.id !== 'custom') {
                        setCustomPieces(p.pieces);
                      }
                    }}
                    className={cn(
                      "p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between h-20",
                      selectedPresetId === p.id 
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 ring-2 ring-blue-100" 
                        : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                    )}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider block">{p.name}</span>
                    <span className="text-[11px] font-mono leading-none font-bold text-slate-400">
                      {p.id === 'custom' ? `${customPieces} Pcs` : `${p.pieces} Chocolates`}
                    </span>
                  </button>
                ))}
              </div>

              {/* Custom box options inputs */}
              {selectedPresetId === 'custom' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 mt-2"
                >
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Piece Count</label>
                    <input 
                      type="number" 
                      value={customPieces}
                      onChange={e => setCustomPieces(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Packaging Cost Price (CP)</label>
                    <input 
                      type="number" 
                      value={customPackagingCP}
                      onChange={e => setCustomPackagingCP(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Packaging Retail Price (RSP)</label>
                    <input 
                      type="number" 
                      value={customPackagingRSP}
                      onChange={e => setCustomPackagingRSP(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Chocolate Quality Selection */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Coins className="text-emerald-500 w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Chocolate Filling Options</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setChocolateType('classic')}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    chocolateType === 'classic' ? "border-emerald-600 bg-emerald-50/20" : "border-slate-200 bg-white"
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-800">Classic Assortment</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">Caramel, fruit flavors & sweet centerfills</p>
                  <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[8px] font-bold mt-2 font-mono">₹12 CP • ₹25 RSP / pc</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChocolateType('premium')}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    chocolateType === 'premium' ? "border-emerald-600 bg-emerald-50/20" : "border-slate-200 bg-white"
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-800">Premium Single Origin</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">Hazelnut pralines, pistachio ganache</p>
                  <span className="inline-block bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[8px] font-bold mt-2 font-mono">₹18 CP • ₹38 RSP / pc</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChocolateType('custom')}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    chocolateType === 'custom' ? "border-emerald-600 bg-emerald-50/20" : "border-slate-200 bg-white"
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-800">Custom Flavor Pricing</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">Explicit manual piece price entry</p>
                  <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[8px] font-bold mt-2 font-mono">Editable Inputs below</span>
                </button>
              </div>

              {chocolateType === 'custom' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200"
                >
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Custom Chocolate CP (Per Piece)</label>
                    <input 
                      type="number" 
                      value={chocoCPPerPiece}
                      onChange={e => setChocoCPPerPiece(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Custom Chocolate Retail Price (RSP)</label>
                    <input 
                      type="number" 
                      value={chocoRSPPerPiece}
                      onChange={e => setChocoRSPPerPiece(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black"
                    />
                  </div>
                </motion.div>
              )}

              {/* Edible Print Option Block */}
              <div className="p-5 rounded-3xl border transition-all mt-4 border-slate-200 bg-slate-50/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-blue-100 rounded-2xl text-blue-600 mt-1">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                        Include Edible Logo Case Pieces
                        <span className="bg-blue-600 text-white text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest">₹40 Fixed Cost</span>
                      </h5>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">Prints highly-detailed custom logos onto individual gourmet chocolate pieces inside each box.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={includeEdiblePrint} 
                      onChange={e => {
                        setIncludeEdiblePrint(e.target.checked);
                        if (e.target.checked && ediblePrintPieces === 0) {
                          setEdiblePrintPieces(2); // default to 2 prints if checked
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {includeEdiblePrint && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4 pt-4 border-t border-slate-200"
                  >
                    <div>
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Quantity of Prints / Box</span>
                      <div className="flex items-center gap-2">
                        <button 
                          type="button" 
                          onClick={() => setEdiblePrintPieces(Math.max(1, ediblePrintPieces - 1))}
                          className="p-1 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all select-none"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs font-black min-w-[24px] text-center text-slate-900">{ediblePrintPieces}</span>
                        <button 
                          type="button" 
                          onClick={() => setEdiblePrintPieces(Math.min(calcs.pieces, ediblePrintPieces + 1))}
                          className="p-1 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all select-none"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[7.5px] text-slate-400 block mt-1 font-bold">Max Limit: {calcs.pieces} pieces</span>
                    </div>

                    <div>
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Print Cost Price (CP/pc)</span>
                      <input 
                        type="number" 
                        value={ediblePrintCP}
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black text-slate-400"
                      />
                    </div>

                    <div>
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Print Retail Price (RSP/pc)</span>
                      <input 
                        type="number" 
                        value={ediblePrintRSP} 
                        onChange={e => setEdiblePrintRSP(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                      />
                    </div>

                    <div className="md:col-span-3 bg-blue-100/30 p-3 rounded-2xl border border-blue-100 text-[9px] text-blue-800 font-bold flex items-center gap-1.5 leading-tight">
                      <Sparkles className="w-4 h-4 shrink-0 text-blue-500 animate-pulse" />
                      <span>
                        Composition Setup: The giftbox will be packed with <span className="font-black text-blue-600">{calcs.pieces - ediblePrintPieces}x</span> regular {chocolateType} piece(s) and <span className="font-black text-blue-600">{ediblePrintPieces}x</span> custom edible logo-printed bite(s).
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Custom Extras & Branding */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Tag className="text-purple-500 w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Corporate Branding Extras</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Logo Option */}
                <div className={cn(
                  "p-4 rounded-3xl border transition-all",
                  logoRequested ? "border-purple-600 bg-purple-50/10" : "border-slate-100 bg-slate-50/40"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-900">Metallic Logo Sleeve/Print</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">Customize outer cover with client symbol</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={logoRequested} 
                        onChange={e => setLogoRequested(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {logoRequested && (
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-purple-100">
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Logo CP / Box</span>
                        <input 
                          type="number" 
                          value={logoCP} 
                          onChange={e => setLogoCP(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black"
                        />
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Logo Retail Price</span>
                        <input 
                          type="number" 
                          value={logoRSP} 
                          onChange={e => setLogoRSP(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Satin Ribbon Option */}
                <div className={cn(
                  "p-4 rounded-3xl border transition-all",
                  ribbonRequested ? "border-purple-600 bg-purple-50/10" : "border-slate-100 bg-slate-50/40"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-900">Premium Branding Ribbon</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">Tie bespoke satin bow with custom label</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={ribbonRequested} 
                        onChange={e => setRibbonRequested(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {ribbonRequested && (
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-purple-100">
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Ribbon CP / Box</span>
                        <input 
                          type="number" 
                          value={ribbonCP} 
                          onChange={e => setRibbonCP(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black"
                        />
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Ribbon Retail Price</span>
                        <input 
                          type="number" 
                          value={ribbonRSP} 
                          onChange={e => setRibbonRSP(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Scale & Profit sliders */}
            <div className="space-y-6 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs ml-1">
                    <span className="font-black text-slate-500 uppercase tracking-wider">Corporate Order Volume</span>
                    <span className="font-black font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[11px]">{volume} Boxes</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="2000" 
                    step="10"
                    value={volume}
                    onChange={e => setVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-slate-400 px-1">
                    <span>10 Boxes</span>
                    <span>500</span>
                    <span>1000</span>
                    <span>2000 Boxes</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs ml-1">
                    <span className="font-black text-slate-500 uppercase tracking-wider">Volume Discount Allowed</span>
                    <span className="font-black font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[11px]">{discountPercent}% Discount</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="50" 
                    step="1"
                    value={discountPercent}
                    onChange={e => setDiscountPercent(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
                  <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-slate-400 px-1">
                    <span>0% (Retail MSRP)</span>
                    <span>15% Recommended</span>
                    <span>30% Limit</span>
                    <span>50% Extreme</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Freight and GST details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-200">
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Transportation & Freight (₹)</label>
                <input 
                  type="number"
                  placeholder="e.g. 1500"
                  value={transportation}
                  onChange={e => setTransportation(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black font-mono outline-none focus:ring-4 focus:ring-blue-100 transition-all text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Confectionery GST Rate (%)</label>
                <input 
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 5"
                  value={gstPercent}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setGstPercent(isNaN(val) ? 0 : val);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black font-mono outline-none focus:ring-4 focus:ring-blue-100 transition-all text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2 pt-4 pl-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={includeGST}
                    onChange={e => setIncludeGST(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase text-slate-700 leading-tight">Apply GST to Quote</p>
                  <p className="text-[9px] font-semibold text-slate-400">{includeGST ? `Add ${gstPercent}% GST to bill totals` : 'Exempt from GST'}</p>
                </div>
              </div>
            </div>

            {/* 💎 AI BRAND PROTOTYPING STUDIO & DYNAMIC VISIO-GRID ACCENT */}
            <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-6 mt-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-850">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg ring-4 ring-indigo-500/20">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-100 flex items-center gap-2">
                      AI Brand Prototyping Studio
                      <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[7px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Vision Mode</span>
                    </h3>
                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">Tactile logo overlays and real-time aesthetic visual alignment analysis</p>
                  </div>
                </div>

                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700/60 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setBrandingMode('box_top');
                      setBoxPhoto(SAMPLE_BOXES[0].url);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                      brandingMode === 'box_top' 
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md" 
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    Outer Box Lid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandingMode('edible_print');
                      setBoxPhoto(CHOCOLATE_BASES.dark);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                      brandingMode === 'edible_print' 
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md" 
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    Chocolate print piece
                  </button>
                </div>
              </div>

              {/* DYNAMIC CANVAS WRAPPER */}
              <div className="space-y-4">
                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Live Inter-tactile Box Canvas (Drag logo to reposition, drag top knob to rotate)</span>
                <div 
                  ref={canvasRef}
                  onClick={(e) => {
                    if (!canvasRef.current) return;
                    const rect = canvasRef.current.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setLogoX(parseFloat(x.toFixed(1)));
                    setLogoY(parseFloat(y.toFixed(1)));
                  }}
                  className="relative w-full aspect-[3/2] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden cursor-crosshair group shadow-inner"
                >
                  {/* Outer texture background */}
                  <img 
                    src={boxPhoto} 
                    alt="Confectionery Packaging template" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover select-none pointer-events-none opacity-90 transition-all duration-300 group-hover:scale-[1.01]"
                  />

                  {/* Overlaid Logo graphic element (Draggable & Rotatable) */}
                  <div 
                    onMouseDown={handleLogoMouseDown}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: `${logoY}%`,
                      left: `${logoX}%`,
                      transform: `translate(-50%, -50%) rotate(${logoRotation}deg) scale(${logoScale / 100})`,
                      opacity: logoOpacity / 100,
                      mixBlendMode: logoBlendMode as any,
                      transition: (isDraggingLogo || isRotatingLogo) ? 'none' : 'top 0.25s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s ease-out'
                    }}
                    className={cn(
                      "p-3 rounded-xl border border-dashed select-none max-w-[150px] max-h-[150px] flex items-center justify-center transition-colors pointer-events-auto cursor-grab active:cursor-grabbing overflow-visible",
                      isDraggingLogo 
                        ? "border-blue-500 bg-blue-500/10 cursor-grabbing" 
                        : isRotatingLogo
                          ? "border-indigo-500 bg-indigo-500/10 cursor-alias"
                          : "border-transparent hover:border-slate-400/65 bg-transparent"
                    )}
                  >
                    {/* Rotation Handle (CorelDraw Style) */}
                    <div 
                      onMouseDown={handleRotateMouseDown}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-alias pointer-events-auto group/rotate"
                      title="Drag to Rotate (CorelDraw Style)"
                    >
                      <div className={cn("w-[2px] h-6 bg-blue-500 transition-all", (isRotatingLogo || isDraggingLogo) ? "bg-blue-400 h-7" : "bg-blue-500/50")} />
                      <div className={cn(
                        "w-6 h-6 rounded-full bg-blue-600 border border-white/50 shadow-md flex items-center justify-center hover:bg-blue-500 hover:scale-110 active:scale-95 transition-all text-white",
                        isRotatingLogo && "bg-indigo-600 hover:bg-indigo-500 scale-105"
                      )}>
                        <RotateCw className="w-3 h-3 shrink-0" />
                      </div>
                    </div>

                    <img 
                      src={logoPhoto} 
                      alt="Brand Seal" 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain pointer-events-none select-none max-w-[90px] max-h-[90px]"
                      style={{ 
                        filter: 
                          logoColorTreatment === 'white' 
                            ? 'brightness(0) invert(1)' 
                            : logoColorTreatment === 'gold' 
                              ? 'brightness(0) saturate(100%) invert(80%) sepia(40%) saturate(1500%) hue-rotate(345deg) brightness(100%) contrast(100%)' 
                              : logoColorTreatment === 'silver' 
                                ? 'brightness(0) saturate(100%) invert(85%) sepia(0%) saturate(0%) brightness(100%) contrast(100%)' 
                                : 'none' 
                      }}
                    />

                    {/* Interactive Click-to-Resize Logo Corner Handle */}
                    <div 
                      onMouseDown={handleResizeMouseDown}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-indigo-600 border border-white shadow-md flex items-center justify-center cursor-se-resize hover:bg-indigo-500 hover:scale-110 active:scale-95 transition-all text-white z-20 pointer-events-auto",
                        isResizingLogo && "bg-blue-600 animate-pulse"
                      )}
                      title="Drag to Resize Logo"
                    >
                      <span className="text-[9px] font-bold">⤡</span>
                    </div>
                  </div>

                  {/* Overlaid Diwali Festival Motif (Draggable, Rotatable & Resizable alongside custom logo) */}
                  {includeFestival && (
                    <div 
                      onMouseDown={handleFestivalMouseDown}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: `${festivalY}%`,
                        left: `${festivalX}%`,
                        transform: `translate(-50%, -50%) rotate(${festivalRotation}deg) scale(${festivalScale / 100})`,
                        transition: (isDraggingFestival || isRotatingFestival || isResizingFestival) ? 'none' : 'top 0.25s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s ease-out'
                      }}
                      className={cn(
                        "p-3 rounded-xl border border-dashed select-none max-w-[150px] max-h-[150px] flex items-center justify-center transition-colors pointer-events-auto cursor-grab active:cursor-grabbing overflow-visible z-10",
                        isDraggingFestival 
                          ? "border-amber-500 bg-amber-500/10 cursor-grabbing" 
                          : isRotatingFestival
                            ? "border-orange-500 bg-orange-500/10 cursor-alias"
                            : isResizingFestival
                              ? "border-yellow-500 bg-yellow-500/10 cursor-se-resize"
                              : "border-transparent hover:border-amber-400/50 bg-transparent"
                      )}
                    >
                      {/* Rotation Handle for Festival Motif */}
                      <div 
                        onMouseDown={handleFestivalRotateMouseDown}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-alias pointer-events-auto group/rotate"
                        title="Drag to Rotate Festival Motif"
                      >
                        <div className={cn("w-[2px] h-6 bg-amber-500 transition-all", (isRotatingFestival || isDraggingFestival) ? "bg-amber-400 h-7" : "bg-amber-500/50")} />
                        <div className={cn(
                          "w-6 h-6 rounded-full bg-amber-600 border border-white/50 shadow-md flex items-center justify-center hover:bg-amber-500 hover:scale-110 active:scale-95 transition-all text-white",
                          isRotatingFestival && "bg-orange-600 hover:bg-orange-500 scale-105"
                        )}>
                          <RotateCw className="w-3 h-3 shrink-0" />
                        </div>
                      </div>

                      <img 
                        src={festivalPhoto} 
                        alt="Festival Greeting Overlay" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain pointer-events-none select-none max-w-[90px] max-h-[90px]"
                      />

                      {/* Resize Handle for Festival Motif */}
                      <div 
                        onMouseDown={handleFestivalResizeMouseDown}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-amber-600 border border-white shadow-md flex items-center justify-center cursor-se-resize hover:bg-amber-500 hover:scale-110 active:scale-95 transition-all text-white z-20 pointer-events-auto",
                          isResizingFestival && "bg-yellow-600 animate-pulse"
                        )}
                        title="Drag to Resize Festival Motif"
                      >
                        <span className="text-[9px] font-bold">⤡</span>
                      </div>
                    </div>
                  )}

                  {/* Positioning Float HUD */}
                  <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-800 text-[8px] font-mono font-bold text-slate-400 select-none flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-pulse" />
                    <span>X: {logoX}% | Y: {logoY}% | Scale: {logoScale}% | Rotation: {logoRotation}°</span>
                  </div>

                  {/* Target Crosshair */}
                  <div 
                    style={{
                      position: 'absolute',
                      top: `${logoY}%`,
                      left: `${logoX}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                    className="w-8 h-8 rounded-full border border-dashed border-white/50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  </div>
                </div>
              </div>

              {/* BRANDING TREATMENTS & ALIGNMENT PANEL */}
              <div className="bg-slate-900/40 p-5 border border-slate-800/80 rounded-3xl space-y-4 pt-4">
                <div>
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Screen Print Ink / Treatment Selection</span>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Pick the ink treatment to screen print on solid corporate box covers or chocolate bites.</p>
                </div>
                
                <div className="w-full">
                  <select
                    value={logoColorTreatment}
                    onChange={(e) => setLogoColorTreatment(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200"
                  >
                    <option value="original">Original Color (No color overrides)</option>
                    <option value="white">White Silk Print (Opaque single-ink print for maximum contrast)</option>
                    <option value="gold">Metallic Gold Foil (Premium metallic hot stamping)</option>
                    <option value="silver">Metallic Silver Foil (Slick, elegant silver foil stamp)</option>
                    <option value="two_color">2-Color Screen Printing (Special multi-pass screen setup)</option>
                    <option value="three_color">3-Color Screen Printing (Multi-sleeve visual registration)</option>
                  </select>
                </div>

                {(logoColorTreatment === 'two_color' || logoColorTreatment === 'three_color') && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-[9.5px] font-semibold text-amber-300 leading-snug">
                    ⚠️ Handled with extreme precision. We recommend single-color screen prints (White, Golden, Silver) on solid black or blue boxes, as multiple ink overlays on dark backgrounds can have misalignment issues.
                  </div>
                )}
              </div>

              {/* UPLOAD CUSTOM GRAPHICS ZONE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-850/60 p-4 rounded-3xl border border-slate-800/80">
                {/* Box Upload */}
                <div className="relative group">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5">Upload Custom Box Photograph</span>
                  <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result) setBoxPhoto(ev.target.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="border-2 border-dashed border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 text-center cursor-pointer bg-slate-900/60 transition-all select-none"
                  >
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (ev.target?.result) setBoxPhoto(ev.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <UploadCloud className="w-5 h-5 text-slate-500 mx-auto group-hover:text-blue-400 transition-colors" />
                    <p className="text-[9px] font-semibold text-slate-400 group-hover:text-slate-300 mt-1 transition-colors">Drag box photo here or click browser</p>
                  </div>
                </div>

                {/* Logo Upload */}
                <div className="relative group">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5">Upload Client Corporate Logo</span>
                  <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result) setLogoPhoto(ev.target.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 text-center cursor-pointer bg-slate-900/60 transition-all select-none"
                  >
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (ev.target?.result) setLogoPhoto(ev.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <UploadCloud className="w-5 h-5 text-slate-500 mx-auto group-hover:text-indigo-400 transition-colors" />
                    <p className="text-[9px] font-semibold text-slate-400 group-hover:text-slate-300 mt-1 transition-colors">Drag logo image here or click search</p>
                  </div>
                </div>
              </div>

                {/* FESTIVAL / DIWALI OVERLAY BUILDER */}
              <div className="bg-slate-900/50 p-5 border border-slate-800/80 rounded-3xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-rose-500/15">
                  <div>
                    <span className="block text-[8px] font-black text-amber-400 uppercase tracking-widest ml-1">Festive / Diwali Greeting Custom Layout</span>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Overlay luxury Diwali motifs or custom graphics alongside business logo.</p>
                  </div>
                  
                  {/* Switch Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{includeFestival ? 'Active' : 'Disabled'}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={includeFestival}
                        onChange={e => setIncludeFestival(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-amber-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>
                </div>

                {includeFestival && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 overflow-visible"
                  >
                    {/* Preset Selector */}
                    <div className="space-y-2">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Diwali Motif</span>
                      <div className="grid grid-cols-3 gap-2">
                        {SAMPLE_DIWALI_MOTIFS.map((motif) => (
                          <button
                            key={motif.id}
                            type="button"
                            onClick={() => setFestivalPhoto(motif.url)}
                            className={cn(
                              "relative aspect-square flex flex-col items-center justify-center p-2 rounded-2xl border transition-all hover:scale-[1.03]",
                              festivalPhoto === motif.url 
                                ? "bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-amber-300"
                                : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                            )}
                          >
                            <img 
                              src={motif.url} 
                              alt={motif.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 object-contain select-none pointer-events-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                            />
                            <span className="text-[8px] font-black uppercase text-center tracking-tight mt-1.5 truncate w-full">{motif.name.split(' ').pop()}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Upload Festive Photo */}
                    <div className="relative group">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 font-mono">Or Upload Any Festive Photo / Greeting</span>
                      <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result) setFestivalPhoto(ev.target.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="border border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 text-center cursor-pointer bg-slate-950/40 transition-all select-none"
                      >
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                if (ev.target?.result) setFestivalPhoto(ev.target.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <UploadCloud className="w-5 h-5 text-slate-500 mx-auto group-hover:text-amber-400 transition-colors" />
                        <p className="text-[9px] font-semibold text-slate-400 group-hover:text-slate-300 mt-1 transition-colors">Drag custom festival files here or browse folder</p>
                      </div>
                    </div>

                    <div className="text-[9px] font-medium text-slate-400 leading-snug bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                      ✨ <strong className="text-amber-400">Tactile Interactive Layout:</strong> Drag the festive ornament anywhere on the box. Use the top gold handle to rotate it (free axis rotation), and drag the bottom-right corner to resize.
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
            {/* GST AND FREIGHT CONTAINER ENDS */}
          </div>
        </div>

        {/* Right Side: Quote Summary, Margins Board & AI Brain */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
          {/* QUOTATION OPTIONS & COMPARISON BASKET */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 space-y-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="text-blue-500 w-5 h-5 shrink-0" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Quotation Options Basket</h3>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">Build and compare multiple custom option alternatives</p>
                </div>
              </div>
              <span className="bg-blue-50 text-blue-700 text-[10px] px-2.5 py-0.5 rounded-full font-black font-mono select-none">
                {quoteOptions.length} Option(s)
              </span>
            </div>

            {quoteOptions.length === 0 ? (
              <div className="py-7 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <p className="text-[10px] text-slate-400 font-bold">No comparison options added yet.</p>
                <p className="text-[9px] text-slate-400/80 mt-1 leading-snug px-3 font-semibold">
                  Adjust standard/custom pieces or filling specifications on the left, then click the dark action below to queue as a proposal option.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {quoteOptions.map((opt, idx) => (
                  <div key={opt.id} className="p-3 bg-slate-50/70 border border-slate-200 rounded-2xl flex flex-col gap-2 relative hover:border-slate-300 hover:bg-slate-50 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[9.5px] font-black text-slate-800 uppercase block">Option #{idx + 1}: {opt.boxPresetName}</span>
                        <span className="text-[9px] text-slate-400 font-bold block mt-0.5 leading-tight">
                          {opt.pieceCount} Pieces • {opt.chocolateType === 'classic' ? 'Classic Assortment' : opt.chocolateType === 'premium' ? 'Premium Centerfills' : 'Custom Flavors'}
                        </span>
                      </div>
                      
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadOption(opt)}
                          title="Load specification back into designer to refine"
                          className="bg-blue-50 hover:bg-blue-100 text-blue-600 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded transition-colors"
                        >
                          Refine
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuoteOptions(prev => prev.filter(o => o.id !== opt.id))}
                          title="Delete this quote option"
                          className="text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[9px] font-mono border-t border-slate-200/50 pt-1.5 mt-0.5 text-slate-500">
                      <span>Volume: <span className="text-slate-800 font-bold">{opt.quantity} boxes</span></span>
                      <span>Per Box: <span className="text-slate-800 font-bold">₹{opt.quotedPricePerBox.toFixed(0)}</span></span>
                      <span>Net Total: <span className="text-indigo-600 font-black">₹{opt.netOrderValue.toLocaleString()}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddOption}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-3 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 select-none"
            >
              <Plus className="w-4 h-4 shrink-0 text-amber-500" />
              <span>Add Current Setup as Option</span>
            </button>
          </div>

          <div className="bg-slate-950 text-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-slate-800 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            
            <div>
              {quoteOptions.length > 0 ? (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Merged Comparative Quote Total</p>
                  <h2 className="text-2xl font-black mt-1 text-white tracking-tight">INR {quoteOptions.reduce((sum, o) => sum + o.netOrderValue, 0).toLocaleString()}</h2>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 font-mono">For {quoteOptions.length} custom options combined</p>
                </div>
              ) : (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Corporate Quotation Summary</p>
                  <h2 className="text-2xl font-black mt-1 text-white tracking-tight">INR {calcs.totalBillingAmount.toLocaleString()}</h2>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 font-mono">For {volume} custom gift boxes</p>
                </div>
              )}
            </div>

            {/* Calculations metrics stack */}
            <div className="space-y-3.5 border-t border-slate-800 pt-5 text-xs text-slate-300">
              <div className="flex justify-between items-center font-mono">
                <span>Unit Production Cost (CP):</span>
                <span className="font-bold text-white">₹{calcs.unitCP.toFixed(0)}</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span>Standard Unit MSRP:</span>
                <span className="font-bold text-slate-400 line-through">₹{calcs.unitRegularRSP.toFixed(0)}</span>
              </div>
              <div className="flex justify-between items-center font-mono text-emerald-400">
                <span>Quoted Price/Box:</span>
                <span className="font-bold text-emerald-400 font-black">₹{calcs.quotedPricePerBox.toFixed(0)}</span>
              </div>

              <div className="h-px bg-slate-800 my-4" />

              <div className="flex justify-between items-center font-mono">
                <span>Net Product Sale sum:</span>
                <span className="font-bold text-slate-200">₹{calcs.netOrderValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span>Refrigerated Distribution:</span>
                <span className="font-bold text-slate-200">₹{Number(transportation || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span>CGST & SGST ({includeGST ? `${gstPercent}%` : 'Exempt'}):</span>
                <span className="font-bold text-slate-200">₹{calcs.gstValue.toLocaleString()}</span>
              </div>
            </div>

            {/* Gross margin visual shield indicator */}
            <div className={cn(
              "p-4 rounded-2xl flex flex-col justify-between gap-1.5",
              calcs.grossProfitPercent >= 30 
                ? "bg-emerald-950/40 border border-emerald-800 text-emerald-400" 
                : calcs.grossProfitPercent >= 15 
                  ? "bg-amber-950/40 border border-amber-800 text-amber-400" 
                  : "bg-red-950/40 border border-red-800 text-red-400 animate-pulse"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider">Gross margin rate:</span>
                <span className="font-black text-sm font-mono">{calcs.grossProfitPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1 bg-white/10">
                <div 
                  className={cn(
                    "h-1.5 rounded-full",
                    calcs.grossProfitPercent >= 30 ? "bg-emerald-500" : calcs.grossProfitPercent >= 15 ? "bg-amber-500" : "bg-red-500"
                  )} 
                  style={{ width: `${Math.min(100, Math.max(0, calcs.grossProfitPercent))}%` }}
                />
              </div>
              <p className="text-[8px] font-semibold text-slate-400 leading-tight mt-1">
                {calcs.grossProfitPercent >= 30 
                  ? "✓ Margins are highly standard and safe for high volume approvals."
                  : calcs.grossProfitPercent >= 15
                    ? "⚠ Moderate margins. Proceed conditional on rapid settlement terms."
                    : "❌ ALARM: Price drops below secure margin limits. AI Negotiation advised."}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSaveQuote}
                className="w-full bg-blue-600 text-white rounded-2xl py-4 text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Save Quote in History
              </button>
            </div>
          </div>

          {/* AI Negotiation Strategist Widget */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 bg-gradient-to-r from-blue-700 to-indigo-800 text-white relative">
              <Sparkles className="w-5 h-5 absolute right-6 top-6 text-yellow-300 animate-pulse" />
              <h3 className="text-sm font-black uppercase tracking-widest">AI negotiation strategics</h3>
              <p className="text-[10px] text-blue-100 font-bold mt-1">Simulate corporate counters & preserve order margins</p>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Corporate administrators demand discounts for volume orders. Give your sales staff analytical arguments.
              </p>

              {!aiResult && !aiLoading && (
                <button
                  onClick={handleNegotiateWithAI}
                  className="w-full bg-slate-900 text-white hover:bg-slate-800 rounded-2xl py-3.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 text-amber-400" /> Consult AI Strategist
                </button>
              )}

              {aiLoading && (
                <div className="py-8 text-center space-y-3">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Simulating multi-tier discount concessions...</p>
                </div>
              )}

              {aiResult && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-5"
                >
                  <div className="h-px bg-slate-100" />
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-black uppercase text-slate-400">Deal Assessment:</span>
                      <span className={cn(
                        "text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider",
                        aiResult.isProfitable ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}>
                        {aiResult.overallStrategyRating}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">{aiResult.recommendationMessage}</p>
                  </div>

                  {/* Pricing Tiers suggestion table */}
                  <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Recommended counter pricing tiers:</p>
                    <div className="space-y-1.5">
                      {aiResult.tieredCounters?.map((tier, idx) => (
                        <div key={idx} className="flex justify-between items-start text-[10px] border-b border-white/80 pb-1.5 last:border-0 last:pb-0">
                          <div>
                            <span className="font-bold text-slate-800 block">{tier.tierName}</span>
                            <span className="text-[8px] text-slate-400">{tier.conditionsOrPerks}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-slate-900 block font-mono">₹{tier.unitPrice}/box</span>
                            <span className="text-[8px] font-mono font-black text-emerald-600">({tier.discountApplied}% off)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Talking points with quick clipboard copy buttons */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Verbal client negotiation briefs:</p>
                    <div className="space-y-2">
                      {aiResult.talkingPoints?.map((tp, idx) => (
                        <div key={idx} className="p-3 bg-blue-50/50 rounded-xl flex justify-between items-start gap-2 border border-blue-50">
                          <p className="text-[10px] font-semibold text-slate-600 leading-normal">{tp}</p>
                          <button
                            onClick={() => handleCopyText(tp, `tp_${idx}`)}
                            className="text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                          >
                            {copiedText === `tp_${idx}` ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Non monetary trade-offs suggestions */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Concessions to save raw profit margins:</p>
                    <ul className="space-y-1 text-[10px] text-slate-600 font-semibold list-disc list-inside bg-amber-50/40 p-4 rounded-2xl border border-amber-100/60">
                      {aiResult.tradeOffs?.map((to, idx) => (
                        <li key={idx} className="leading-normal">{to}</li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => { setAiResult(null); }}
                    className="w-full bg-slate-100 hover:bg-slate-200 rounded-xl py-2 text-[8px] font-black uppercase tracking-wider text-slate-500"
                  >
                    Clear AI feedback
                  </button>
                </motion.div>
              )}

              {aiError && (
                <div className="p-3 bg-red-50 text-red-600 text-[10px] rounded-xl border border-red-100 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" strokeWidth={3} /> {aiError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Corporate quotes History List Container */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Wholesale Corporate Quote Ledger</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Search and retrieve historic corporate PDF quotations</p>
          </div>

          <div className="relative w-full md:max-w-xs">
            <Search className="w-4 h-4 absolute left-4 top-3 ml-0.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by company or quote reference..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Quotes Ledger table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center animate-pulse font-black text-slate-400 text-[10px] uppercase tracking-widest">
              Loading corporate quotation history logs...
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="py-24 text-center">
              <Briefcase className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">No historical quotes logged to database.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-4.5 px-8">Quotation No.</th>
                  <th className="py-4.5 px-6">Recipient Corporate</th>
                  <th className="py-4.5 px-6">Configuration</th>
                  <th className="py-4.5 px-6">Quantity Order</th>
                  <th className="py-4.5 px-6">Grand Total Invoice</th>
                  <th className="py-4.5 px-8 text-right">Actions Operations</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 px-8">
                      <div className="font-mono text-xs font-black text-slate-900">
                        {q.quoteNumber}
                      </div>
                      <div className="text-[8px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
                        {(() => {
                          if (!q.createdAt) return 'Just now';
                          if (typeof q.createdAt.toDate === 'function') {
                            return format(q.createdAt.toDate(), 'dd MMM yyyy');
                          }
                          if (q.createdAt.seconds) {
                            return format(new Date(q.createdAt.seconds * 1000), 'dd MMM yyyy');
                          }
                          if (q.createdAt instanceof Date) {
                            return format(q.createdAt, 'dd MMM yyyy');
                          }
                          try {
                            return format(new Date(q.createdAt), 'dd MMM yyyy');
                          } catch (err) {
                            return 'Just now';
                          }
                        })()}
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div>
                        <div className="text-xs font-black text-slate-900">{q.companyName}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 flex items-center gap-1.5">
                          <User className="w-3 h-3 text-slate-400" /> {q.contactPerson || 'General Admin'}
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div>
                        <div className="text-xs font-bold text-slate-600">{q.boxPresetName}</div>
                        <div className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{q.pieceCount} Pieces Assortment</div>
                      </div>
                    </td>
                    <td className="py-5 px-6 font-mono text-xs font-black text-slate-700">
                      {q.quantity} Boxes
                      <span className="text-[8.5px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-sans uppercase tracking-widest ml-1.5">{q.discountPercent}% OFF</span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="text-xs font-black text-slate-900">
                        ₹{q.totalBillingAmount.toLocaleString()}
                      </div>
                      <div className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">
                        GST {q.gstPercent !== undefined ? q.gstPercent : 18}% {q.includeGST ? 'Applied' : 'Exempted'}
                      </div>
                    </td>
                    <td className="py-5 px-8 text-right space-x-2">
                      <button
                        onClick={() => handleExportPDF(q)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-[9px] uppercase tracking-widest px-4 py-2.5 rounded-xl border border-blue-100 transition-all"
                      >
                        Download PDF Letter
                      </button>
                      <button
                        onClick={() => handleDeleteQuote(q.id!, q.companyName)}
                        className="text-red-500 hover:text-red-700 transition-all p-2 bg-red-50 hover:bg-red-100 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
