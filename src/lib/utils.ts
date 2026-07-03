
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateWhatsAppInviteLink(phone: string, name: string, portalUrl: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = `Hello ${name}! Welcome to the KreativeOTP Portal. You have been added as a team member. You can access the dashboard here: ${portalUrl}`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function safeTimestampToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') return new Date(ts);
  return null;
}

export function safeGetTime(ts: any): number {
  return safeTimestampToDate(ts)?.getTime() || 0;
}

export function generateDealerSupportWhatsAppLink(bakeryPhoneOrWa: string | undefined, dealerCompanyName: string, orderId?: string, problemReason?: string) {
  const cleanPhone = (bakeryPhoneOrWa || '').replace(/\D/g, '');
  const groupName = `Kreative ${dealerCompanyName.trim() || 'Partner'}`;
  let message = `Hello ${groupName} Support 👋\n\n`;
  if (orderId) {
    message += `Reaching out from ${dealerCompanyName || 'Dealership'} regarding Order #${orderId}.\n`;
  } else {
    message += `Reaching out from ${dealerCompanyName || 'Dealership'} for bakery support.\n`;
  }
  if (problemReason) {
    message += `Reported Issue: ${problemReason}\n`;
  }
  message += `Please check and coordinate resolution. Thank you!`;
  
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function generateCustomerFeedbackWhatsAppLink(customerPhone: string, customerName: string, orderId: string, bakeryName: string, bakeryId: string) {
  const cleanPhone = (customerPhone || '').replace(/\D/g, '');
  const rateUrl = `${window.location.origin}/rate/${encodeURIComponent(bakeryId)}/${encodeURIComponent(orderId)}`;
  const message = `Hello ${customerName || 'Customer'} 👋\n\nYour order #${orderId} from ${bakeryName || 'Kreative Chocolates'} has been completed & dispatched! 🎂✨\n\nWe would love your feedback. Please tap the link below to rate your cake & experience:\n${rateUrl}\n\nThank you for choosing us! 🙏`;
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function triggerAutoFeedback(order: any, bakeryName: string = 'Kreative Chocolates', bakeryId: string = '') {
  if (!order || !bakeryId) return;
  if (order.dealerId || order.type === 'dealer_cake' || order.type === 'dealer') return; // Only trigger customer rating loop for retail/custom clients, not dealers
  const phone = order.customerDetails?.phone || (order.details && 'phone' in order.details ? (order.details as any).phone : '') || '';
  const name = order.customerDetails?.name || (order.details && 'customerName' in order.details ? (order.details as any).customerName : '') || 'Customer';
  const orderId = order.displayId || `#${(order.id || '').slice(-6).toUpperCase()}`;
  const waUrl = generateCustomerFeedbackWhatsAppLink(phone, name, orderId, bakeryName, bakeryId);
  window.open(waUrl, '_blank');
}

export function buildAutoFeedbackPrompt(order: any, bakeryName: string = 'Kreative Chocolates', bakeryId: string = ''): { url: string; customerName: string } | null {
  if (!order || !bakeryId) return null;
  if (order.dealerId || order.type === 'dealer_cake' || order.type === 'dealer') return null;
  const phone = order.customerDetails?.phone || '';
  const name = order.customerDetails?.name || 'Customer';
  const orderId = order.displayId || '#' + (order.id || '').slice(-6).toUpperCase();
  const waUrl = generateCustomerFeedbackWhatsAppLink(phone, name, orderId, bakeryName, bakeryId);
  return { url: waUrl, customerName: name };
}
