import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const createArchive = async (collectionName: string, docId: string, data: any, reason: 'update' | 'delete') => {
  try {
    const archiveId = `arch_${Math.random().toString(36).substring(2, 9)}`;
    await setDoc(doc(db, 'archives', archiveId), {
      originalCollection: collectionName,
      documentId: docId,
      data: data,
      archivedAt: serverTimestamp(),
      archivedBy: auth.currentUser?.email || 'unknown',
      reason: reason
    });
    console.log(`Restore point created for ${collectionName}/${docId}`);
  } catch (err) {
    console.warn('Archive failed (silent):', err);
    // Don't block the main operation if archiving fails
  }
};
