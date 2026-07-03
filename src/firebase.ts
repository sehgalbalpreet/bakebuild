
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { OperationType } from './types';

// Silence warning-level logs (such as benign client/server clock drift warnings)
setLogLevel('error');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, firebaseConfig.firestoreDatabaseId);

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Show user-friendly alert
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.toLowerCase().includes('permission-denied') || msg.toLowerCase().includes('missing or insufficient permissions')) {
    alert('Security Error: Access Denied. You do not have permission for this action.');
  } else {
    alert(`System Error: ${msg.slice(0, 100)}...`);
  }
  
  throw new Error(JSON.stringify(errInfo));
}

// No automatic testConnection at top level as it can trigger early crashes
// if Firestore initialization is stuck or if multiple tabs are fighting.
