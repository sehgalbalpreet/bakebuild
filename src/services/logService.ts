import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export type LogType = 'auth' | 'order' | 'bakery' | 'dealer' | 'staff' | 'system';

export const createLog = async (
  type: LogType,
  message: string,
  userId?: string,
  userEmail?: string,
  bakeryId?: string,
  metadata?: any
) => {
  try {
    await addDoc(collection(db, 'system_logs'), {
      type,
      message,
      userId: userId || null,
      userEmail: userEmail || null,
      bakeryId: bakeryId || null,
      timestamp: serverTimestamp(),
      metadata: metadata || {}
    });
  } catch (err) {
    console.error('Failed to create log:', err);
  }
};
