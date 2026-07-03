import { AttendanceRecord } from '../types';

export interface PendingPunch {
  id: string; // unique event id
  recordId: string; // attendance record ID (e.g. userId_date)
  userId: string;
  bakeryId: string;
  userName: string;
  date: string;
  type: 'clockIn' | 'clockOut';
  timestamp: number; // millisecond timestamp
  status: 'present' | 'absent' | 'late' | 'half_day';
  photoUrl?: string;
  location?: { lat: number; lng: number };
}

const DB_NAME = 'BakeryAttendanceOfflineDB';
const STORE_NAME = 'pending_punches';
const DB_VERSION = 1;

export const openOfflineDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const savePendingPunch = async (punch: Omit<PendingPunch, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): Promise<void> => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const finalPunch: PendingPunch = {
      ...punch,
      id: punch.id || `${punch.userId}_${punch.date}_${punch.type}_${Date.now()}`,
      timestamp: punch.timestamp || Date.now()
    };

    const request = store.put(finalPunch);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const getPendingPunches = async (): Promise<PendingPunch[]> => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error reading pending punches from IndexedDB:', err);
    return [];
  }
};

export const deletePendingPunch = async (id: string): Promise<void> => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

export const clearPendingPunches = async (): Promise<void> => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};
