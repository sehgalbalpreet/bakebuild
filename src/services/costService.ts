import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, limit, startAt, endAt } from 'firebase/firestore';

export interface MonthlyCost {
  id: string;
  bakeryId: string;
  month: string; // YYYY-MM
  chocolateCostCompound: number;
  chocolateCostCouverture: number;
  centerCost: number;
  electricityCostPerHour: number;
  labourCostPerHour: number;
  wholesaleMargin: number;
  retailMargin: number;
  updatedAt: any;
}

export const getActiveCost = async (bakeryId: string, date: Date = new Date()): Promise<MonthlyCost | null> => {
  try {
    const monthStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const q = query(
      collection(db, 'monthly_costs'),
      where('bakeryId', '==', bakeryId),
      where('month', '==', monthStr),
      limit(1)
    );
    
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as MonthlyCost;
    }
    
    // Fallback to latest cost if current month not found
    const fallbackQ = query(
      collection(db, 'monthly_costs'),
      where('bakeryId', '==', bakeryId),
      orderBy('month', 'desc'),
      limit(1)
    );
    const fallbackSnap = await getDocs(fallbackQ);
    if (!fallbackSnap.empty) {
      return { id: fallbackSnap.docs[0].id, ...fallbackSnap.docs[0].data() } as MonthlyCost;
    }

    return null;
  } catch (err) {
    console.error("Error fetching active cost:", err);
    return null;
  }
};

export const getNextBatchNumber = async (bakeryId: string, batchSize: number, date: Date = new Date()): Promise<string> => {
  try {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    
    // Start of the current month
    const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    // End of the current month
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const q = query(
      collection(db, 'dragees_batches'),
      where('bakeryId', '==', bakeryId),
      where('createdAt', '>=', startOfMonth),
      where('createdAt', '<=', endOfMonth)
    );

    const snap = await getDocs(q);
    const count = snap.size; // Number of batches created this month for this bakery
    const seriesNum = (count + 1).toString().padStart(3, '0');
    
    const monthStr = (month + 1).toString().padStart(2, '0');
    const weightStr = Math.round(batchSize).toString().padStart(2, '0');
    
    return `K${monthStr}${weightStr}-${seriesNum}`;
  } catch (err) {
    console.error("Error generating batch number:", err);
    // Fallback if anything fails
    const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
    const weightStr = Math.round(batchSize).toString().padStart(2, '0');
    const randSeries = Math.floor(Math.random() * 100).toString().padStart(3, '0');
    return `K${monthStr}${weightStr}-${randSeries}`;
  }
};
