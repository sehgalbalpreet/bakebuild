
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export type UserRole = 'super_admin' | 'bakery_admin' | 'staff' | 'production' | 'dealer' | 'dealer_staff' | 'sales' | 'delivery' | 'chocolate_production';

export type OrderStatus = 'pending' | 'received' | 'in_progress' | 'ready' | 'sent' | 'cancelled';

export type OrderType = 'dealer_cake' | 'custom_cake' | 'chocolate';

export interface Bakery {
  id: string;
  name: string;
  pin?: string;
  trialStartedAt: any; // Firestore Timestamp
  trialEndDate?: any; // Firestore Timestamp
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'free_partner' | 'pending_verification';
  subscriptionEndsAt?: any; // Firestore Timestamp
  subscriptionPlan?: string;
  paymentScreenshotUrl?: string;
  paymentUploadedAt?: any; // Firestore Timestamp
  adminEmail: string;
  ownerEmail?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  isDeleted?: boolean;
  settings: {
    whatsappNumber?: string;
    googleReviewLink?: string;
  };
  notificationSettings?: {
    newOrderSound?: string;
    readySound?: string;
    sentSound?: string;
  };
  attendanceSettings?: {
    enabled?: boolean;
    latitude?: number;
    longitude?: number;
    radius?: number;
  };
}

export interface FeatureLimits {
  attendanceEnabled: boolean;
  payrollEnabled: boolean;
  maxStaff: number;
  maxDealers: number;
  maxMembersPerDealer: number;
}

export interface PaymentSettings {
  phonePeUpiId: string;
  phonePeMerchantName: string;
  plans: {
    id: string;
    name: string;
    price: number;
    durationDays: number;
    description: string;
  }[];
  trialDays?: number;
  trialDescription?: string;
  trialFeatures?: FeatureLimits;
  paidFeatures?: FeatureLimits;
}

export interface UserProfile {
  uid: string;
  email?: string;
  phone?: string;
  role: UserRole;
  bakeryId: string;
  displayName: string;
  dealerId?: string; // Only for dealer role
  isDeleted?: boolean;
  baseSalary?: number;
  overtimeRate?: number;
  pin?: string;
  faceDescriptor?: number[]; // 128-point face-api.js descriptor for biometric attendance
  faceEnrolledAt?: any; // Firestore Timestamp
  allUids?: string[];
  isSessionDoc?: boolean;
  originalUserId?: string;
}

export interface Dealer {
  id: string;
  bakeryId: string;
  companyName: string; // Tata, MG, Skoda, etc.
  city?: string;
  orderPrefix?: string; // e.g. "TA" for Tata
  lastOrderSequence?: number; // Monotonically increasing counter for order IDs
  phone: string;
  staffName: string;
  email?: string;
  customCakeDiscount?: number; // Fixed amount discount per cake
  preferredFlavor?: string;
  preferredWeight?: number;
  customPricePerKg?: number;
  customPrices?: Record<string, number>; // Mapping from menu_item.id to customized quoted base price (before tax)
  priceListExpiryDate?: string; // YYYY-MM-DD
  color?: string; // Hex color code for identifying dealer in UI
  isDeleted?: boolean;
}

export interface CakeDetails {
  weight: number; // 0.5, 1, 2, etc.
  flavor: string;
  isPhotoCake: boolean;
  photoUrl?: string;
  instruction?: string;
}

export interface ChocolateDetails {
  quantity: number;
  productType: 'bites' | 'dragees' | 'center_filled';
  flavor: string;
  referenceImageUrl?: string;
  slipUrl?: string;
  instruction?: string;
}

export interface MenuItem {
  id: string;
  bakeryId: string;
  name: string;
  description?: string;
  category: 'cake' | 'chocolate' | 'dealer_cake_base' | 'other';
  price: number;
  weight?: string; // e.g. "500g", "1kg"
  gstPercent: number;
  hsnCode?: string;
  imageUrl?: string;
  isDeleted?: boolean;
  isSourced?: boolean;
  supplierName?: string;
}

export interface DesignQuote {
  fondantType: 'none' | 'half' | 'full';
  fondantCost: number;
  tierSelected: number;
  tierSource: 'ai' | 'admin';
  tierConfidence?: 'high' | 'medium' | 'low';
  tierReason?: string;
  characters: {
    small: number;
    large: number;
    cost: number;
  };
  flowers: {
    fondant: number;
    real: number;
    procurementIncluded: boolean;
    cost: number;
  };
  complexityItems: string[];
  surchargePercent: number;
  surchargeAmount: number;
  rushCharge: number;
  basePrice: number;
  marketPrice: number;
  internalPrice: number;
  finalQuote: number;
  negotiationFloor: number;
  profitIndicator: 'high' | 'safe' | 'risky';
  adminOverridePrice?: number;
  adminOverrideReason?: string;
  quoteSentAt?: any;
  quoteSentVia?: 'whatsapp';
  adminWhoQuoted?: string;
}

export interface Order {
  id: string;
  bakeryId: string;
  displayId?: string; // e.g. TA101
  dealerId?: string;
  dealerCompanyName?: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: any;
  receivedAt?: any;
  receivedBy?: string; // Staff name/email
  updatedAt?: any; // To track last modification
  isDeleted?: boolean;
  inProgressAt?: any;
  inProgressBy?: string;
  readyAt?: any;
  readyBy?: string; // Staff name/email
  sentAt?: any;
  sentBy?: string; // Staff name/email
  cancelledAt?: any;
  cancelledBy?: string;
  cancelledReason?: string;
  confirmationReminderSentAt?: any;
  deliveryDate?: string; // YYYY-MM-DD
  deliveryTime?: string; // HH:mm
  details: CakeDetails | ChocolateDetails;
  totalAmount: number;
  discountApplied?: number;
  advanceReceived: number;
  customerDetails?: {
    name: string;
    phone: string;
    birthday?: string;
    anniversary?: string;
    engagementDate?: string;
  };
  designQuote?: DesignQuote;
  quoteTag?: 'DESIGN QUOTE PENDING' | 'QUOTE SENT — AWAITING CONFIRM' | 'CONFIRMED' | 'DECLINED';
  isQuoteLocked?: boolean;
  problemDetails?: {
    reason: 'electricity' | 'oven' | 'delay' | 'cancel' | 'other';
    description: string;
    reportedAt: any;
  };
  problemSeenByDealer?: boolean;
  cancelSeenByDealer?: boolean;
  readySeenByDealer?: boolean;
}

export interface DrageesCostSetup {
  id: string;
  bakeryId: string;
  month: string; // YYYY-MM
  chocolatePriceKg: number;
  centerPriceKg: number;
  labourRateHour: number;
  electricityRateHour: number;
  updatedAt: any;
}

export interface DrageesBatch {
  id: string;
  bakeryId: string;
  batchSize: number;
  batchNo?: string; // e.g. K0630-001
  productName?: string; // Specific product name, e.g. Almond Dark Chocolate Dragee
  actualOutputKg?: number; // Optional until completed
  machine: string;
  chocolateType?: 'Compound' | 'Couverture' | 'Both';
  costBreakdown: {
    rawMaterials: number;
    electricity: number;
    labour: number;
    packaging: number;
  };
  status: 'pending' | 'draft' | 'production' | 'completed';
  createdAt: any;
  perKgCost?: number;
}

export interface ProductionTracking {
  id: string; // Same as batchId
  bakeryId: string;
  assignedStaff: string;
  startTime: any;
  endTime?: any;
  status: 'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  actualProductionTime: number; // minutes
  totalPauseTime: number; // minutes
  efficiencyStatus?: 'On Time' | 'Slightly Over' | 'Significantly Over';
  labourCostActual: number;
  labourCostEstimated: number;
  pauses: {
    reason: string;
    pauseStart: any;
    pauseEnd?: any;
    duration?: number;
  }[];
}

export interface DrageesPriceEntry {
  id: string;
  bakeryId: string;
  wholesalePricePerKg: number;
  retailPricePerJar: number;
  marginWholesale: number;
  marginRetail: number;
  batchRef: string;
  date: string;
  savedBy: string;
  savedAt: any;
}

export interface Customer {
  id: string;
  bakeryId: string;
  name: string;
  phone: string;
  email?: string;
  birthday?: string;
  anniversary?: string;
  engagementDate?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  tags?: string[];
  createdAt: any;
  lastOrderAt?: any;
  totalOrders: number;
  isDeleted?: boolean;
  deletedAt?: any;
}

export interface Campaign {
  id: string;
  bakeryId: string;
  name: string;
  channel: 'whatsapp' | 'sms' | 'email';
  messageType: 'text' | 'template' | 'rich';
  templateName?: string;
  messageContent: string;
  mediaUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  targetSegment: string;
  geoTargeting?: {
    enabled: boolean;
    centerAddress: string;
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  recipientCount: number;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
  sentAt?: any; // Timestamp
  scheduledFor?: any; // Timestamp
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied?: number;
  };
}

export interface AttendanceRecord {
  id: string; // userId_yyyy-MM-dd
  userId: string;
  bakeryId: string;
  date: string; // yyyy-MM-dd
  userName: string;
  clockIn: any; // Timestamp
  clockOut?: any; // Timestamp
  status: 'present' | 'absent' | 'late' | 'half_day';
  photoUrl?: string; // For face scan verification thumbnail
  location?: {
    lat: number;
    lng: number;
  };
  notes?: string;
  outOfOfficeDuty?: boolean;
  awaySince?: any; // Timestamp
  lastCheckedLocation?: {
    lat: number;
    lng: number;
    distance: number;
    timestamp: any;
  };
  autoClockedOut?: boolean;
  isManualAdjustment?: boolean;
  manuallyClockedOutByAdmin?: boolean;
}

export interface SystemNotification {
  id: string;
  bakeryId: string;
  title: string;
  message: string;
  type: 'order_pending' | 'attendance_alert';
  createdAt: any;
  read?: boolean;
  metadata?: {
    orderId?: string;
    userId?: string;
    userName?: string;
    reason?: 'office_duty' | 'no_notice';
    awayDurationMinutes?: number;
  };
}

export interface PayrollRecord {
  id: string; // userId_month_year
  userId: string;
  bakeryId: string;
  userName: string;
  period: string; // MM-YYYY
  workingDays: number;
  presentDays: number;
  baseSalary: number;
  overtimeHours: number;
  overtimeRate?: number;
  bonus: number;
  deductions: number;
  netPay: number;
  status: 'draft' | 'approved' | 'paid';
  createdAt: any;
  updatedAt: any;
}

export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: string;
}

export interface RecipeNutrition {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  servingSize?: string;
}

export interface Recipe {
  id: string;
  bakeryId: string;
  name: string;
  description?: string;
  category?: string;
  prepTime?: string;
  bakingTime?: string;
  yield?: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  allergenInfo?: string;
  aiTips?: string;
  nutrition?: RecipeNutrition;
  createdAt: any;
  createdBy?: string;
}

export interface Expense {
  id?: string;
  bakeryId: string;
  title: string;
  amount: number;
  category: 'rent' | 'utilities' | 'ingredients' | 'salaries' | 'maintenance' | 'other';
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt?: any;
  createdBy?: string;
}

export interface CustomerFeedback {
  id?: string;
  bakeryId: string;
  orderId: string;
  customerName: string;
  customerPhone?: string;
  rating: number; // 1 to 5
  comments?: string;
  status?: 'pending' | 'resolved' | 'redirected_to_google';
  createdAt?: any;
}
