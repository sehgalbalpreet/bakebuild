
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, Bakery, UserRole } from '../types';
import { errorHub } from '../utils/errorHub';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  bakery: Bakery | null;
  loading: boolean;
  isSuperAdmin: boolean;
  realProfile: UserProfile | null;
  // Super Admin "Login As" state
  impersonatedProfile: UserProfile | null;
  impersonatedBakery: Bakery | null;
  impersonate: (profile: UserProfile, bakery: Bakery) => void;
  stopImpersonating: () => void;
  loginManual: (profile: UserProfile) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [manualProfile, setManualProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('bakesync_manual_profile');
      if (!saved) return null;
      return JSON.parse(saved);
    } catch (err) {
      console.warn('Failed to parse manual profile:', err);
      localStorage.removeItem('bakesync_manual_profile');
      return null;
    }
  });
  const [bakery, setBakery] = useState<Bakery | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Milestone logging for debugging "warming up" issues
  const logMilestone = (msg: string) => {
    console.log(`[AuthContext] ${msg} at ${new Date().toLocaleTimeString()}`);
  }

  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = sessionStorage.getItem('bakesync_impersonated_profile');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  const [impersonatedBakery, setImpersonatedBakery] = useState<Bakery | null>(() => {
    try {
      const saved = sessionStorage.getItem('bakesync_impersonated_bakery');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });

  useEffect(() => {
    logMilestone('Initializing Auth Listener');
    
    // Safety Force Stop Loading after 8 seconds to prevent permanent "warming up" hang
    const safetyTimer = setTimeout(() => {
      if (loading) {
        logMilestone('SAFETY TRIGGER: Auth initialization took too long. Forcing app start.');
        setLoading(false);
      }
    }, 8000);

    const fetchBakery = async (bakeryId: string) => {
      try {
        logMilestone(`Fetching bakery ${bakeryId}`);
        const bakeryDoc = await getDoc(doc(db, 'bakeries', bakeryId));
        if (bakeryDoc.exists()) {
          setBakery({ id: bakeryDoc.id, ...bakeryDoc.data() } as Bakery);
        }
      } catch (error) {
        console.error("Error fetching bakery:", error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      logMilestone(`Auth State changed: ${firebaseUser ? 'User UID: ' + firebaseUser.uid : 'No User'}`);
      setLoading(true);
      setUser(firebaseUser);
      
      try {
        if (firebaseUser) {
          // AUTO-EXIT SIMULATION ON FRESH LOGIN AS SUPER ADMIN
          if (firebaseUser.email === 'sehgalbalpreet@gmail.com') {
            if (sessionStorage.getItem('bakesync_impersonated_profile')) {
              logMilestone('Super Admin Login detected. Auto-clearing simulation states.');
              setImpersonatedProfile(null);
              setImpersonatedBakery(null);
              sessionStorage.removeItem('bakesync_impersonated_profile');
              sessionStorage.removeItem('bakesync_impersonated_bakery');
            }
          }

          // Clear legacy manual profile immediately if we have a real Google user
          if (manualProfile && !firebaseUser.isAnonymous) {
            logMilestone('Active Google Session detected. Purging manual PIN session.');
            setManualProfile(null);
            localStorage.removeItem('bakesync_manual_profile');
          }

          // Auto-sync super admin record
          if (firebaseUser.email === 'sehgalbalpreet@gmail.com') {
            logMilestone('Super Admin Identified. Syncing admin doc.');
            await setDoc(doc(db, 'admins', firebaseUser.uid), {
              email: firebaseUser.email,
              lastLogin: new Date().toISOString(),
              role: 'super_admin'
            }, { merge: true }).catch(err => console.warn("Admin sync failed (expected if rules not matching yet):", err));
          }

          logMilestone('Fetching profile from Firestore');
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            let profileData = profileDoc.data() as UserProfile;
            logMilestone(`Profile found (role: ${profileData.role})`);
            
            // AUTOMATIC HEALING: If session was written with a disabled/deleted profile, but is currently logged in,
            // check for any active, non-deleted profile under the same phone or email and heal the session!
            if (profileData.isDeleted || (profileData.role as string) === 'disabled') {
              logMilestone('Profile is stale, suspended, or disabled. Searching for active duplicated login record...');
              let foundActive: UserProfile | null = null;
              
              if (profileData.phone) {
                const cleanPh = profileData.phone.trim().replace(/\s/g, '');
                const last10 = cleanPh.replace(/\D/g, '').slice(-10);
                const possiblePhones = [cleanPh];
                if (last10.length === 10) {
                  if (!possiblePhones.includes(last10)) possiblePhones.push(last10);
                  if (!possiblePhones.includes(`+91${last10}`)) possiblePhones.push(`+91${last10}`);
                  if (!possiblePhones.includes(`91${last10}`)) possiblePhones.push(`91${last10}`);
                }
                const phoneQ = query(collection(db, 'users'), where('phone', 'in', possiblePhones));
                const snap = await getDocs(phoneQ);
                const docs = snap.docs.map(docSnap => {
                  const d = docSnap.data();
                  return { ...d, uid: docSnap.id } as UserProfile;
                });
                const active = docs.find(u => !u.isDeleted && (u.role as string) !== 'disabled' && u.uid !== firebaseUser.uid && !u.isSessionDoc);
                if (active) foundActive = active;
              }
              
              if (!foundActive && profileData.email) {
                const emailQ = query(collection(db, 'users'), where('email', '==', profileData.email.toLowerCase().trim()));
                const snap = await getDocs(emailQ);
                const docs = snap.docs.map(docSnap => {
                  const d = docSnap.data();
                  return { ...d, uid: docSnap.id } as UserProfile;
                });
                const active = docs.find(u => !u.isDeleted && (u.role as string) !== 'disabled' && u.uid !== firebaseUser.uid && !u.isSessionDoc);
                if (active) foundActive = active;
              }

              if (foundActive) {
                logMilestone(`Auto-healing session: Found active profile under UID ${foundActive.uid}. Overwriting stale bound session doc...`);
                const healedProfile = {
                  ...foundActive,
                  uid: firebaseUser.uid,
                  lastLogin: new Date().toISOString(),
                  isSessionDoc: true,
                  originalUserId: foundActive.originalUserId || foundActive.uid
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), healedProfile);
                profileData = healedProfile;
                logMilestone(`Session successfully healed! Active Role: ${profileData.role}`);
              }
            }

            setProfile(profileData);
            if (profileData.bakeryId) {
              logMilestone('Fetching bakery details');
              const bDoc = await getDoc(doc(db, 'bakeries', profileData.bakeryId));
              if (bDoc.exists()) {
                const bData = bDoc.data() as Bakery;
                
                // Subscription Logic
                let status = bData.subscriptionStatus;
                
                // Auto-expire trial if past date
                if (status === 'trial' && bData.subscriptionEndsAt) {
                  let end: Date | null = null;
                  if (typeof bData.subscriptionEndsAt.toDate === 'function') {
                    end = bData.subscriptionEndsAt.toDate();
                  } else if (typeof bData.subscriptionEndsAt === 'string') {
                    end = new Date(bData.subscriptionEndsAt);
                  } else if (bData.subscriptionEndsAt.seconds) {
                    end = new Date(bData.subscriptionEndsAt.seconds * 1000);
                  }
                  
                  if (end && new Date() > end) {
                    status = 'expired';
                    if (profileData.role === 'bakery_admin' || profileData.role === 'super_admin') {
                      await updateDoc(doc(db, 'bakeries', bDoc.id), { subscriptionStatus: 'expired' }).catch(e => console.error("Could not auto-expire trial:", e));
                    }
                  }
                }

                setBakery({ id: bDoc.id, ...bData, subscriptionStatus: status } as Bakery);
              }
            }
          } else {
            logMilestone('No Firestore profile found for this Google user');
            setProfile(null);
            setBakery(null);
          }
        } else if (manualProfile) {
          logMilestone('Handling Manual PIN Profile');
          if (manualProfile.bakeryId) {
            await fetchBakery(manualProfile.bakeryId);
          }
        } else {
          logMilestone('No authenticated session');
          setProfile(null);
          setBakery(null);
          setImpersonatedProfile(null);
          setImpersonatedBakery(null);
        }
      } catch (error: any) {
        console.error("Auth Listener Error:", error);
        setInitError("Network sync is taking longer than usual...");
        errorHub.emit({
          name: error?.name || 'AuthListenerError',
          message: error?.message || String(error),
          type: 'auth',
          context: { error }
        });
      } finally {
        logMilestone('Initialization Sequence Complete');
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, [manualProfile]);

  const loginManual = (profile: UserProfile) => {
    // Perform robust, deep sanitization to strip all non-serializable objects (like Firestore FieldValue or circular objects)
    const sanitizeValue = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val !== 'object') return val;
      
      // If it's a Firestore Timestamp instance
      if (typeof val.toDate === 'function') {
        return val.toDate().toISOString();
      }
      
      // Handle array
      if (Array.isArray(val)) {
        return val.map(sanitizeValue);
      }
      
      // If it has constructor of Firestore FieldValue (such as serverTimestamp)
      if (
        val.constructor && 
        (
          val.constructor.name === 'FieldValue' || 
          val.constructor.name === 'FieldValueImpl' || 
          val.constructor.name === 'b' || 
          val.constructor.name === 'f'
        )
      ) {
        return new Date().toISOString();
      }
      
      // Safe object recursion
      const sanitizedObj: any = {};
      for (const key of Object.keys(val)) {
        try {
          sanitizedObj[key] = sanitizeValue(val[key]);
        } catch (e) {
          console.warn(`Could not sanitize field ${key}:`, e);
        }
      }
      return sanitizedObj;
    };

    const sanitizedProfile = sanitizeValue(profile);
    setManualProfile(sanitizedProfile);
    localStorage.setItem('bakesync_manual_profile', JSON.stringify(sanitizedProfile));
  };

  const logout = async () => {
    await auth.signOut();
    setManualProfile(null);
    localStorage.removeItem('bakesync_manual_profile');
  };

  const impersonate = (profile: UserProfile, bakery: Bakery) => {
    // Only allow if the REAL profile or email warrants super admin status
    // Note: Use isSuperAdmin helper but be careful with recursion
    const realIsAdmin = user?.email === 'sehgalbalpreet@gmail.com' || (manualProfile || profile)?.role === 'super_admin';
    
    if (realIsAdmin) {
      setImpersonatedProfile(profile);
      setImpersonatedBakery(bakery);
      sessionStorage.setItem('bakesync_impersonated_profile', JSON.stringify(profile));
      sessionStorage.setItem('bakesync_impersonated_bakery', JSON.stringify(bakery));
    }
  };

  const stopImpersonating = () => {
    setImpersonatedProfile(null);
    setImpersonatedBakery(null);
    sessionStorage.removeItem('bakesync_impersonated_profile');
    sessionStorage.removeItem('bakesync_impersonated_bakery');
  };

  const isSuperAdmin = 
    (user?.email === 'sehgalbalpreet@gmail.com') ||
    (impersonatedProfile?.role === 'super_admin') || 
    (manualProfile?.role === 'super_admin') || 
    (profile?.role === 'super_admin');

  let realProfile: UserProfile | null = null;
  
  if (user?.email === 'sehgalbalpreet@gmail.com') {
    realProfile = {
      uid: user.uid,
      displayName: 'Balpreet Singh',
      email: user.email,
      role: 'super_admin',
      bakeryId: profile?.bakeryId || ''
    };
  } else {
    realProfile = manualProfile || profile;
  }

  const value = {
    user,
    profile: impersonatedProfile || manualProfile || profile,
    realProfile,
    bakery: impersonatedBakery || bakery,
    loading,
    isSuperAdmin,
    impersonatedProfile,
    impersonatedBakery,
    impersonate,
    stopImpersonating,
    loginManual,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
