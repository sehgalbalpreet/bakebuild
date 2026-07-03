import React, { useState, useEffect, useRef } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store, ShieldCheck, ChevronRight, Phone, Fingerprint, Camera, AlertCircle, LogIn, LogOut, CheckCircle2, Timer, MapPin, Loader2, Sparkles, XCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { UserProfile, Bakery } from '../types';
import { APP_VERSION } from '../version';
import { loadFaceModels, getFaceDescriptorFromVideo, compareFaceDescriptors, isFaceCaptureSupported } from '../utils/biometric';
import { FaceEnrollmentModal } from '../components/FaceEnrollmentModal';
import { format } from 'date-fns';


export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [step, setStep] = useState<'phone' | 'pin' | 'attendance_face'>('phone');
  const [identifiedUser, setIdentifiedUser] = useState<UserProfile | null>(null);

  // Custom Face Attendance States for Staff Logins
  const [attendanceStream, setAttendanceStream] = useState<MediaStream | null>(null);
  const [attendancePhoto, setAttendancePhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [attendanceAction, setAttendanceAction] = useState<'clock_in' | 'clock_out' | null>(null);
  const [todayRecordStatus, setTodayRecordStatus] = useState<any>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  
  const attendanceVideoRef = useRef<HTMLVideoElement | null>(null);
  const attendanceStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { loginManual, logout } = useAuth();
  
  // Biometrics States
  const [biometricUsers, setBiometricUsers] = useState<UserProfile[]>([]);
  const [showBiometricSelector, setShowBiometricSelector] = useState(false);
  const [scanningBiometric, setScanningBiometric] = useState<UserProfile | null>(null);
  const [scanResult, setScanResult] = useState<'success' | 'failing' | null>(null);
  const [scanType, setScanType] = useState<'face' | 'fingerprint'>('face');
  const [showRealFaceEnroll, setShowRealFaceEnroll] = useState<boolean>(false);
  const realFaceVideoRef = useRef<HTMLVideoElement | null>(null);
  const realFaceStreamRef = useRef<MediaStream | null>(null);

  // Success kiosk state
  const [kioskUser, setKioskUser] = useState<UserProfile | null>(null);
  const [kioskProfileToBind, setKioskProfileToBind] = useState<UserProfile | null>(null);
  const [kioskBakery, setKioskBakery] = useState<Bakery | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<any | null>(null);
  const [checkingAttendanceState, setCheckingAttendanceState] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Enrollment Prompt after success PIN Login
  const [showEnrollmentPrompt, setShowEnrollmentPrompt] = useState<{ profile: UserProfile; pin: string } | null>(null);

  // Geofencing in login page
  const [gpsChecking, setGpsChecking] = useState(false);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Custom Attendance Camera Control Functions
  const startAttendanceCamera = async () => {
    try {
      if (attendanceStreamRef.current) {
        attendanceStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 400, facingMode: 'user' }
      });
      attendanceStreamRef.current = stream;
      setAttendanceStream(stream);
      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
        attendanceVideoRef.current.play().catch(err => console.warn("Video play interrupted:", err));
      }
    } catch (err: any) {
      console.warn("Camera check failed, checking permission options:", err);
      // Don't alert immediately, user can use file trigger fallback gracefully
    }
  };

  const stopAttendanceCamera = () => {
    if (attendanceStreamRef.current) {
      attendanceStreamRef.current.getTracks().forEach(track => track.stop());
      attendanceStreamRef.current = null;
    }
    setAttendanceStream(null);
    setIsCameraActive(false);
  };

  const fetchTodayAttendanceState = async (user: UserProfile) => {
    try {
      const masterUserId = user.originalUserId || user.uid;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const recordId = `${masterUserId}_${todayStr}`;
      const attSnap = await getDoc(doc(db, 'attendance', recordId));
      if (attSnap.exists()) {
        const data = attSnap.data();
        setTodayRecordStatus(data);
        // If they checked in but haven't clocked out, toggle default to clock_out
        setAttendanceAction(data.clockOut ? 'clock_in' : 'clock_out');
      } else {
        setTodayRecordStatus(null);
        setAttendanceAction('clock_in');
      }
    } catch (err) {
      console.error("Could not fetch today status:", err);
      setAttendanceAction('clock_in');
    }
  };

  const takeSelfieSnapshot = () => {
    if (attendanceVideoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw the current mirrored camera frame
        ctx.save();
        ctx.translate(300, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(attendanceVideoRef.current, 0, 0, 300, 300);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setAttendancePhoto(dataUrl);
        stopAttendanceCamera();
      }
    }
  };

  const handleNativeCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 300;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 300, 300);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setAttendancePhoto(dataUrl);
            stopAttendanceCamera();
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmAttendance = async (action: 'clock_in' | 'clock_out') => {
    if (!identifiedUser || !attendancePhoto) return;
    setLoading(true);
    setError(null);

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("Session terminated. Try again.");
      setLoading(false);
      return;
    }

    try {
      const masterUserId = identifiedUser.originalUserId || identifiedUser.uid;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const recordId = `${masterUserId}_${todayStr}`;
      const recordRef = doc(db, 'attendance', recordId);

      let userLat: number | undefined;
      let userLng: number | undefined;

      // Geofence lock check
      const bakerySnap = await getDoc(doc(db, 'bakeries', identifiedUser.bakeryId));
      if (bakerySnap.exists()) {
        const b = bakerySnap.data() as Bakery;
        const geoConfig = b.attendanceSettings;
        if (geoConfig?.enabled) {
          if (geoConfig.latitude && geoConfig.longitude) {
            try {
              setGpsLoading(true);
              const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 8000
                });
              });
              userLat = position.coords.latitude;
              userLng = position.coords.longitude;
              const dist = calculateDistance(
                userLat,
                userLng,
                geoConfig.latitude,
                geoConfig.longitude
              );
              const allowedRadius = geoConfig.radius || 20;
              if (dist > allowedRadius) {
                throw new Error(`Geofencing block: You are ${Math.round(dist)} meters away from the bakery. Allowed range is ${allowedRadius} meters. Please move closer.`);
              }
            } catch (gpsErr: any) {
              console.warn("GPS lookup failed:", gpsErr);
              if (gpsErr.code === 1) {
                throw new Error("Unable to check geofence location: Please approve browser GPS access to submit attendance.");
              } else {
                throw new Error("Geolocation failed: " + (gpsErr.message || "Ensure your mobile device GPS location is active and try again."));
              }
            } finally {
              setGpsLoading(false);
            }
          }
        }
      }

      if (action === 'clock_in') {
        const newRecord = {
          id: recordId,
          userId: masterUserId,
          userName: identifiedUser.displayName,
          bakeryId: identifiedUser.bakeryId,
          date: todayStr,
          clockIn: serverTimestamp(),
          status: 'present',
          photoUrl: attendancePhoto,
          ...(userLat !== undefined && userLng !== undefined ? { location: { lat: userLat, lng: userLng } } : {})
        };
        await setDoc(recordRef, newRecord);
      } else {
        const updateData: any = {
          clockOut: serverTimestamp(),
          photoUrl: attendancePhoto
        };
        if (userLat !== undefined && userLng !== undefined) {
          updateData.locationOut = { lat: userLat, lng: userLng };
        }
        await updateDoc(recordRef, updateData);
      }

      // Bind the manual login profile so they proceed into dashboard
      const profileToBind = {
        ...identifiedUser,
        uid: currentUser.uid,
        lastLogin: serverTimestamp(),
        isSessionDoc: true,
        originalUserId: masterUserId
      };

      try {
        await setDoc(doc(db, 'users', currentUser.uid), profileToBind);
      } catch (bindErr) {
        console.warn("Failed creating permanent UID document:", bindErr);
      }

      try {
        await setDoc(doc(db, 'sessions', currentUser.uid), {
          userId: currentUser.uid,
          pin: identifiedUser.pin || '1234',
          timestamp: serverTimestamp()
        }, { merge: true });
      } catch (sessErr) {
        console.warn("Session marker write failed:", sessErr);
      }

      loginManual(profileToBind as any);
      navigate('/dashboard');
    } catch (err: any) {
      console.error("Attendance Log Error:", err);
      setError(err.message || "Failed to log attendance check-in.");
    } finally {
      setLoading(false);
      setGpsLoading(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // Radius of the earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c; // Distance in meters
  };

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (attendanceStreamRef.current) {
        attendanceStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (realFaceStreamRef.current) {
        realFaceStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [initializingTooLong, setInitializingTooLong] = useState(false);

  const initAuth = async () => {
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      } else {
        setIsAuthReady(true);
      }
    } catch (err) {
      console.error('Manual Init failed:', err);
      setError('Connection failed. Please check your network.');
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        setIsAuthReady(true);
        setError(null);
      }
    });

    const init = async () => {
      try {
        if (!auth.currentUser) {
          // Attempt anonymous auth, but don't block the UI with an error message immediately
          // if it fails on page load (could be temporary network glitch).
          await signInAnonymously(auth);
        } else {
          setIsAuthReady(true);
        }
      } catch (err) {
        console.warn('Background Auth failed:', err);
        // Silent fail on background init to avoid scaring users on page load.
      }
    };

    init();

    const timer = setTimeout(() => {
      if (!auth.currentUser) {
        setInitializingTooLong(true);
      }
    }, 6000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !phone) {
          setPhone(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showPhoneLogin) fetchISD();
  }, [showPhoneLogin]);

  const handlePhoneIdentification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isAuthReady) {
      setError('System is initializing, please wait a moment...');
      setLoading(false);
      return;
    }

    const cleanPh = phone.trim().replace(/\s/g, '');
    if (cleanPh.length < 5 || cleanPh.length > 20) {
      setError('Please enter a valid phone number (between 5 and 20 characters).');
      setLoading(false);
      return;
    }
    const last10 = cleanPh.replace(/\D/g, '').slice(-10);
    const possiblePhones = [cleanPh];
    if (last10.length === 10) {
      if (!possiblePhones.includes(last10)) possiblePhones.push(last10);
      if (!possiblePhones.includes(`+91${last10}`)) possiblePhones.push(`+91${last10}`);
      if (!possiblePhones.includes(`91${last10}`)) possiblePhones.push(`91${last10}`);
    }

    try {
      // 1. Check users collection
      const q = query(collection(db, 'users'), where('phone', 'in', possiblePhones));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // 2. Check bakeries collection (Primary Owners)
        const bakeryQuery = query(collection(db, 'bakeries'), where('phone', 'in', possiblePhones));
        const bakerySnapshot = await getDocs(bakeryQuery);

        if (bakerySnapshot.empty) {
          throw new Error('This number is not registered. Please ask your administrator to add you as staff or partner.');
        } else {
          const b = bakerySnapshot.docs[0].data();
          setIdentifiedUser({
            uid: `owner_${bakerySnapshot.docs[0].id}`,
            displayName: b.name,
            email: b.adminEmail || '',
            role: 'bakery_admin',
            bakeryId: bakerySnapshot.docs[0].id,
            phone: cleanPh,
            pin: b.pin || '1234'
          } as any);
        }
      } else {
        const usersList = querySnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
        const activeUser = usersList.find(u => !u.isDeleted && (u.role as string) !== 'disabled' && !u.isSessionDoc);
        
        if (activeUser) {
          setIdentifiedUser(activeUser);
        } else {
          throw new Error('This account has been disabled or suspended. Please contact your administrator.');
        }
      }
      setStep('pin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePinVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiedUser) return;
    
    setLoading(true);
    setError(null);

    try {
      const expectedPin = String(identifiedUser.pin || '1234');
      
      if (String(pin).trim() === expectedPin.trim()) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Auth session lost. Please refresh.');

        const originalUserId = identifiedUser.originalUserId || identifiedUser.uid;

        // Bind the profile to this unique anonymous UID
        // This makes security rules MUCH faster and reliable (avoiding recursive get() calls)
        const profileToBind = {
          ...identifiedUser,
          uid: currentUser.uid,
          lastLogin: serverTimestamp(),
          isSessionDoc: true,
          originalUserId: originalUserId
        };

        // If the current document ID is different (first time login or new device), 
        // we create the new one and eventually the old one would be cleaned up or just left as a template
        // Actually, we should check if we need to migrate or just set the new one
        try {
          await setDoc(doc(db, 'users', currentUser.uid), profileToBind);
        } catch (setErr: any) {
          console.error("Profile Bind Error:", setErr);
          if (setErr.code === 'permission-denied') {
            throw new Error(`Permission Denied while binding profile (UID: ${currentUser.uid}). Please contact Admin.`);
          }
          throw setErr;
        }

        // Still create the session for backward compatibility during rules transition
        try {
          await setDoc(doc(db, 'sessions', currentUser.uid), {
            userId: currentUser.uid,
            pin: expectedPin,
            timestamp: serverTimestamp()
          });
        } catch (sessErr: any) {
          console.warn("Session marker could not be created (Rule delay or permission issue):", sessErr);
          // If profile was bound, we can still proceed as long as rules allow dashboard access via profile
        }
        
        const isDealer = ['dealer', 'dealer_staff'].includes(profileToBind.role);
        const isStaff = !['bakery_admin', 'super_admin', 'dealer', 'dealer_staff'].includes(profileToBind.role);

        if (isDealer) {
          loginManual(profileToBind as any);
          navigate('/dashboard');
        } else if (isStaff) {
          setIdentifiedUser(profileToBind as any);
          
          // Check if punch in is already there for today
          const todayStr = format(new Date(), "yyyy-MM-dd");
          const recordId = `${originalUserId}_${todayStr}`;
          let attSnap = null;
          try {
            attSnap = await getDoc(doc(db, "attendance", recordId));
          } catch (attErr) {
            console.error("Could not fetch today's attendance on PIN verification:", attErr);
          }

          let isAlreadyPunchedIn = false;
          if (attSnap && attSnap.exists()) {
            const data = attSnap.data();
            setTodayRecordStatus(data);
            if (data.clockIn) {
              isAlreadyPunchedIn = true;
            }
            // If they have clocked out today, default the next action to 'clock_in'
            setAttendanceAction(data.clockOut ? 'clock_in' : 'clock_out');
          } else {
            setTodayRecordStatus(null);
            setAttendanceAction('clock_in');
          }

          if (isAlreadyPunchedIn && !attSnap?.data()?.clockOut) {
            // "If yes punching is not required, staff should not see this window."
            loginManual(profileToBind as any);
            navigate('/dashboard');
          } else {
            // Need to clock in (or clock in again because they clocked out)
            setStep('attendance_face');
            setTimeout(() => {
              startAttendanceCamera();
            }, 150);
          }
        } else {
          if (!profileToBind.faceDescriptor) {
            setShowEnrollmentPrompt({ profile: profileToBind as any, pin: expectedPin });
          } else {
            loginManual(profileToBind as any);
            navigate('/dashboard');
          }
        }
      } else {
        throw new Error('Security Alert: Incorrect PIN. Access denied.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDeviceBakeryId = (): string | null => {
    try {
      const savedProfile = localStorage.getItem('bakesync_manual_profile');
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        if (p && p.bakeryId) return p.bakeryId;
      }
      const savedBios = localStorage.getItem('bakesync_biometric_profiles');
      if (savedBios) {
        const bios = JSON.parse(savedBios);
        if (Array.isArray(bios) && bios.length > 0 && bios[0].bakeryId) {
          return bios[0].bakeryId;
        }
      }
    } catch (e) {
      console.error("Error retrieving device bakery ID:", e);
    }
    return null;
  };

  const stopRealFaceCamera = () => {
    if (realFaceStreamRef.current) {
      realFaceStreamRef.current.getTracks().forEach((track) => track.stop());
      realFaceStreamRef.current = null;
    }
  };

  // Biometric methods
  const handleBiometricEnroll = (type: 'face' | 'fingerprint') => {
    if (!showEnrollmentPrompt) return;
    setShowRealFaceEnroll(true);
  };

  const handleSkipEnrollment = () => {
    if (!showEnrollmentPrompt) return;
    loginManual(showEnrollmentPrompt.profile);
    setShowEnrollmentPrompt(null);
    navigate('/dashboard');
  };

  const handleBiometricLoginTrigger = async () => {
    setError(null);
    setLoading(true);

    try {
      const bId = getDeviceBakeryId();
      if (!bId) {
        throw new Error("This device/browser is not yet associated with any bakery. Please log in once using Phone & PIN first to sync this station.");
      }

      // Fetch all staff for this bakery from Firestore
      const q = query(
        collection(db, 'users'),
        where('bakeryId', '==', bId)
      );
      const querySnapshot = await getDocs(q);
      const activeStaff = querySnapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => !u.isDeleted && (u.role as string) !== 'disabled' && u.faceDescriptor && Array.isArray(u.faceDescriptor) && u.faceDescriptor.length > 0 && !u.isSessionDoc);

      if (activeStaff.length === 0) {
        throw new Error("No registered Face IDs found for this bakery. Please log in once with Phone & PIN, then enroll your face in the attendance settings.");
      }

      setBiometricUsers(activeStaff);

      if (activeStaff.length === 1) {
        handleSelectBiometricProfile(activeStaff[0]);
      } else {
        setShowBiometricSelector(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBiometricProfile = async (bUser: UserProfile) => {
    setShowBiometricSelector(false);
    setScanningBiometric(bUser);
    setScanType('face');
    setScanResult(null);
    setError(null);

    // Initialize real camera stream and face detection loop!
    try {
      await loadFaceModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: 'user' }
      });
      realFaceStreamRef.current = stream;
      if (realFaceVideoRef.current) {
        realFaceVideoRef.current.srcObject = stream;
        realFaceVideoRef.current.play().catch(pErr => console.warn("Biometric video play error:", pErr));
      }

      // Start detection loop
      let matched = false;
      const startTime = Date.now();
      const matchTimeout = 30000; // 30 seconds

      const runDetection = async () => {
        if (matched || !realFaceStreamRef.current) return;

        if (Date.now() - startTime > matchTimeout) {
          // Timeout
          stopRealFaceCamera();
          setScanningBiometric(null);
          setError("Biometric matching timed out. Please try again or log in with PIN.");
          return;
        }

        if (realFaceVideoRef.current) {
          const { descriptor, error: detectErr } = await getFaceDescriptorFromVideo(realFaceVideoRef.current);
          if (descriptor && bUser.faceDescriptor) {
            const { distance, isMatch } = compareFaceDescriptors(descriptor, bUser.faceDescriptor);
            console.log(`Face match distance for ${bUser.displayName}:`, distance);
            if (isMatch) {
              matched = true;
              setScanResult('success');
              stopRealFaceCamera();
              setTimeout(() => {
                handleBiometricSuccess(bUser);
                setScanningBiometric(null);
              }, 1200);
              return;
            }
          }
        }

        // Retry next frame
        setTimeout(runDetection, 600);
      };

      // Trigger first run after stream starts
      setTimeout(runDetection, 1000);

    } catch (camErr: any) {
      console.error("Biometric camera check-in error:", camErr);
      stopRealFaceCamera();
      setScanningBiometric(null);
      setError("Camera access is required for Face ID verification: " + camErr.message);
    }
  };

  const handleBiometricSuccess = async (bUser: UserProfile) => {
    setCheckingAttendanceState(true);
    setError(null);

    try {
      // 1. Re-bind custom Profile dynamically matching PIN Login UID mapping
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Auth state lost. Please refresh the page.");

      const originalUserId = bUser.originalUserId || bUser.uid;

      // Form the profile object
      const boundProfile: UserProfile = {
        uid: currentUser.uid,
        phone: bUser.phone,
        displayName: bUser.displayName,
        role: bUser.role as any,
        bakeryId: bUser.bakeryId,
        pin: bUser.pin,
        isSessionDoc: true,
        originalUserId: originalUserId
      };

      // Set user profile in Firestore
      await setDoc(doc(db, 'users', currentUser.uid), {
        ...boundProfile,
        lastLogin: serverTimestamp()
      }, { merge: true });

      // Create session document
      await setDoc(doc(db, 'sessions', currentUser.uid), {
        userId: currentUser.uid,
        pin: bUser.pin,
        timestamp: serverTimestamp()
      }, { merge: true });

      // Save references in Kiosk states so they can punch or proceed to full dashboard
      setKioskUser(boundProfile);
      setKioskProfileToBind(boundProfile);

      // Fetch Bakery coordinates & details
      const bSnap = await getDoc(doc(db, 'bakeries', bUser.bakeryId));
      if (bSnap.exists()) {
        setKioskBakery({ id: bSnap.id, ...bSnap.data() } as Bakery);
      }

      // Check current today attendance status
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const recId = `${originalUserId}_${todayStr}`;
      const attSnap = await getDoc(doc(db, 'attendance', recId));
      if (attSnap.exists()) {
        setTodayAttendance({ id: attSnap.id, ...attSnap.data() });
      } else {
        setTodayAttendance(null);
      }

    } catch (err: any) {
      console.error("Biometric registration check-in bind failed:", err);
      setError("Biometric sign-in synced failed: " + err.message);
    } finally {
      setCheckingAttendanceState(false);
    }
  };

  const handleKioskPunchIn = async () => {
    if (!kioskUser || !kioskBakery) return;
    setGpsError(null);
    setGpsChecking(true);

    const geoConfig = kioskBakery.attendanceSettings;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const masterUserId = kioskUser.originalUserId || kioskUser.uid;
    const recordId = `${masterUserId}_${todayStr}`;

    let userLat: number | undefined;
    let userLng: number | undefined;

    if (geoConfig?.enabled) {
      if (!geoConfig.latitude || !geoConfig.longitude) {
        setGpsError("Bakery coordinates have not been pinpointed. Ask manager to configure geofencing coords in settings.");
        setGpsChecking(false);
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
          });
        });

        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        const distance = calculateDistance(
          userLat,
          userLng,
          geoConfig.latitude,
          geoConfig.longitude
        );

        setGpsDistance(distance);

        const allowedRadius = geoConfig.radius || 20;
        if (distance > allowedRadius) {
          setGpsError(`You are ${Math.round(distance)} meters away. Permitted radius is ${allowedRadius} meters. Move closer & retry.`);
          setGpsChecking(false);
          return;
        }
      } catch (err: any) {
        let errorMsg = "Unable to lock GPS position. Ensure locations are turned on inside your browser.";
        if (err.code === 1) {
          errorMsg = "Geolocation access denied. Approve browser geolocation settings to finish punching in.";
        }
        setGpsError(errorMsg);
        setGpsChecking(false);
        return;
      }
    }

    try {
      const recordRef = doc(db, 'attendance', recordId);
      const newRecord = {
        id: recordId,
        userId: masterUserId,
        userName: kioskUser.displayName,
        bakeryId: kioskBakery.id,
        date: todayStr,
        clockIn: serverTimestamp(),
        status: 'present',
        photoUrl: 'face_verified',
        ...(userLat !== undefined && userLng !== undefined ? { location: { lat: userLat, lng: userLng } } : {})
      };

      await setDoc(recordRef, newRecord);
      setTodayAttendance(newRecord);
      setCountdown(4);
    } catch (err: any) {
      console.error(err);
      setError("Punch In failed: " + err.message);
    } finally {
      setGpsChecking(false);
    }
  };

  const handleKioskPunchOut = async () => {
    if (!kioskUser) return;
    setGpsChecking(true);
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const masterUserId = kioskUser.originalUserId || kioskUser.uid;
    const recordId = `${masterUserId}_${todayStr}`;

    try {
      const recordRef = doc(db, 'attendance', recordId);
      await updateDoc(recordRef, {
        clockOut: serverTimestamp()
      });
      
      setTodayAttendance({
        ...todayAttendance,
        clockOut: { toDate: () => new Date() }
      });
      setCountdown(4);
    } catch (err: any) {
      console.error(err);
      setError("Punch Out failed: " + err.message);
    } finally {
      setGpsChecking(false);
    }
  };

  const handleKioskClose = async () => {
    setKioskUser(null);
    setKioskProfileToBind(null);
    setKioskBakery(null);
    setTodayAttendance(null);
    setCountdown(null);
    setScanResult(null);
    setGpsDistance(null);
    setGpsError(null);
    // Logout from current bound session to prevent unauthorized access
    await logout();
  };

  const handleKioskProceedToDashboard = () => {
    if (kioskProfileToBind) {
      loginManual(kioskProfileToBind);
      navigate('/dashboard');
    }
  };

  // Kiosk countdown effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      handleKioskClose();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      const existingProfile = profileDoc.exists() ? profileDoc.data() as UserProfile : null;
      const isProfileActive = existingProfile && !existingProfile.isDeleted && (existingProfile.role as string) !== 'disabled';
      
      if (!isProfileActive) {
        // 1. Check if invited by Email
        const emailQuery = query(collection(db, 'users'), where('email', '==', user.email));
        const emailSnapshot = await getDocs(emailQuery);

        // 2. NEW: Check if invited by Phone (Deduplication)
        // Note: Google User might have phone number, but often we just rely on the user having been added by the admin previously
        // We'll also check if there's any user with the same phone if user.phoneNumber exists
        let phoneMatchSnapshot: any = { empty: true };
        if (user.phoneNumber) {
          const cleanGooglePhone = user.phoneNumber.replace(/\s/g, '');
          const phoneQuery = query(collection(db, 'users'), where('phone', '==', cleanGooglePhone));
          phoneMatchSnapshot = await getDocs(phoneQuery);
        }

        let assignedBakeryId = '';
        let assignedRole: any = 'bakery_admin';
        let extraData: any = {};
        let matchingDocId = '';

        if (!emailSnapshot.empty) {
          const docs = emailSnapshot.docs.map(docSnap => ({ ...docSnap.data(), uid: docSnap.id } as UserProfile));
          const activeInv = docs.find(u => !u.isDeleted && (u.role as string) !== 'disabled' && !u.isSessionDoc);
          matchingDocId = activeInv ? activeInv.uid : emailSnapshot.docs[0].id;
        } else if (!phoneMatchSnapshot.empty) {
          const docs = phoneMatchSnapshot.docs.map(docSnap => ({ ...docSnap.data(), uid: docSnap.id } as UserProfile));
          const activeInv = docs.find(u => !u.isDeleted && (u.role as string) !== 'disabled' && !u.isSessionDoc);
          matchingDocId = activeInv ? activeInv.uid : phoneMatchSnapshot.docs[0].id;
        }

        if (matchingDocId) {
          const matchingDocSnap = await getDoc(doc(db, 'users', matchingDocId));
          const invitedUser = matchingDocSnap.exists() ? (matchingDocSnap.data() as UserProfile) : null;

          if (!invitedUser || !invitedUser.phone) {
             throw new Error('you are not authorised by the superadmin (Profile missing phone number)');
          }

          if ((invitedUser.role as string) === 'disabled' || invitedUser.isDeleted) {
             throw new Error('This account has been disabled. Please contact your administrator.');
          }

          assignedBakeryId = invitedUser.bakeryId;
          assignedRole = invitedUser.role;
          extraData = { ...invitedUser };
          // Keep important fields but overwrite IDs
          delete extraData.uid;
          
          // Delete the temporary "phone-only" record to replace with full Google UID record
          await deleteDoc(doc(db, 'users', matchingDocId));
        } else {
          // 3. Check if this is the Bakery Admin (Owner) invited by Super Admin
          const bakeriesQuery = query(collection(db, 'bakeries'), where('adminEmail', '==', user.email));
          const bakerySnapshot = await getDocs(bakeriesQuery);
          
          if (!bakerySnapshot.empty) {
            const bakeryData = bakerySnapshot.docs[0].data();
            if (!bakeryData.phone) {
              throw new Error('you are not authorised by the superadmin (Bakery missing contact number)');
            }
            assignedBakeryId = bakerySnapshot.docs[0].id;
          } else {
            // 4. Super Admin logic
            if (user.email === 'sehgalbalpreet@gmail.com') {
              assignedBakeryId = 'system';
              assignedRole = 'super_admin';
            } else {
              // No longer allowing auto-signup
              throw new Error('you are not authorised by the superadmin');
            }
          }
        }

        const profile: UserProfile = {
          uid: user.uid,
          email: user.email!,
          role: assignedRole,
          bakeryId: assignedBakeryId,
          displayName: user.displayName || 'User',
          ...extraData
        };

        await setDoc(doc(db, 'users', user.uid), profile);

        if (assignedRole === 'super_admin') {
           await setDoc(doc(db, 'admins', user.uid), { email: user.email });
        }
      }

      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Store className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">BakeSync SaaS</h1>
            <p className="text-slate-500">The central nervous system for your bakery operations.</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs mb-6 flex items-start gap-3 border border-red-100 animate-in fade-in zoom-in duration-300">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="font-bold leading-relaxed">{error}</div>
            </div>
          )}

          <div className="space-y-4">
            {!showPhoneLogin ? (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 py-3.5 px-4 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm active:scale-95"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="Google" className="w-5 h-5" />
                  {loading ? 'Authenticating...' : 'Sign in with Google'}
                </button>

                <div className="relative my-6 text-center">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <span className="relative px-4 text-xs font-black uppercase text-slate-400 bg-white tracking-widest">or access via phone</span>
                </div>

                <button 
                  onClick={() => setShowPhoneLogin(true)}
                  className="w-full py-3.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-sm hover:border-blue-300 hover:text-blue-500 transition-all"
                >
                  STAFF LOGIN (PHONE NUMBER)
                </button>

                <button 
                  onClick={handleBiometricLoginTrigger}
                  className="w-full py-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Camera size={16} />
                  1-TAP SECURE FACE LOGIN
                </button>

                <div className="pt-4 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bakery Owner?</p>
                  <button 
                    onClick={() => navigate('/signup')}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Click here to register your bakery
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={step === 'phone' ? handlePhoneIdentification : step === 'pin' ? handlePinVerification : (e) => e.preventDefault()} className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                {step === 'phone' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Pre-Approved Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        placeholder="+91..."
                      />
                    </div>
                  </div>
                )}

                {step === 'pin' && (
                  <div>
                    <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">{identifiedUser?.displayName.charAt(0)}</div>
                      <div>
                        <p className="text-xs font-black text-blue-900 leading-none mb-1">{identifiedUser?.displayName}</p>
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{identifiedUser?.role.replace('_', ' ')} Identified</p>
                      </div>
                    </div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 text-center">Enter 4-Digit Login PIN</label>
                    <input 
                      type="password"
                      maxLength={4}
                      required
                      autoFocus
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-black outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center text-2xl tracking-[1em]"
                      placeholder="••••"
                    />
                  </div>
                )}

                {step === 'attendance_face' && (
                  <div className="space-y-4 text-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 bg-indigo-50 border border-indigo-100/60 rounded-2xl flex items-center gap-3 text-left">
                      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-md shrink-0">
                        {identifiedUser?.displayName ? identifiedUser.displayName.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-indigo-900 leading-tight truncate">{identifiedUser?.displayName}</p>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none mt-1">
                          Role: {identifiedUser?.role?.replace('_', ' ')}
                        </p>
                      </div>
                    </div>

                    <div className="relative w-full aspect-square max-w-[240px] mx-auto bg-slate-950 rounded-[2rem] overflow-hidden border-2 border-indigo-500 shadow-xl flex items-center justify-center">
                      {attendancePhoto ? (
                        <div className="relative w-full h-full">
                          <img
                            src={attendancePhoto}
                            alt="Selfie"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setAttendancePhoto(null);
                              startAttendanceCamera();
                            }}
                            className="absolute bottom-3 right-3 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full transition-all border border-slate-700/50 backdrop-blur"
                            title="Retake photo"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative w-full h-full">
                          <video
                            ref={attendanceVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover scale-x-[-1]"
                          />
                          {/* Guideline Overlay */}
                          <div className="absolute inset-0 border-2 border-dashed border-white/50 rounded-full m-8 pointer-events-none animate-pulse" />
                          
                          <button
                            type="button"
                            onClick={takeSelfieSnapshot}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-full hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            CAPTURE PHOTO
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Fallback Selector for iPhone/Android Native Camera Capture if streaming is disabled or not allowed */}
                    {!attendancePhoto && (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          ref={fileInputRef}
                          onChange={handleNativeCapture}
                          className="hidden"
                          id="native-camera-fallback"
                        />
                        <label
                          htmlFor="native-camera-fallback"
                          className="inline-flex items-center gap-1.5 text-[9.5px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 cursor-pointer pt-1 transition-colors"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          Click here if camera access fails
                        </label>
                      </div>
                    )}

                    {attendancePhoto && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {todayRecordStatus 
                            ? (todayRecordStatus.clockOut ? "You have finished shifts today" : "Already Clocked In today")
                            : "New shift detected for today"}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={loading || gpsLoading}
                            onClick={() => handleConfirmAttendance('clock_in')}
                            className={`py-3.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              attendanceAction === 'clock_in' 
                                ? 'bg-green-600 text-white shadow-md shadow-green-100 hover:bg-green-700' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            {loading && attendanceAction === 'clock_in' ? 'SUBMITTING...' : 'CLOCK IN'}
                          </button>

                          <button
                            type="button"
                            disabled={loading || gpsLoading}
                            onClick={() => handleConfirmAttendance('clock_out')}
                            className={`py-3.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              attendanceAction === 'clock_out' 
                                ? 'bg-orange-600 text-white shadow-md shadow-orange-100 hover:bg-orange-700' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            {loading && attendanceAction === 'clock_out' ? 'SUBMITTING...' : 'CLOCK OUT'}
                          </button>
                        </div>

                        {gpsLoading && (
                          <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-widest pt-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Verifying Geofence GPS...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {step !== 'attendance_face' && (
                  <button 
                    type="submit"
                    disabled={loading || !isAuthReady}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    {loading ? 'VERIFYING...' : !isAuthReady ? 'INITIALIZING...' : step === 'phone' ? 'NEXT: ENTER PIN' : 'LOGIN TO STATION'}
                  </button>
                )}

                {!isAuthReady && initializingTooLong && (
                  <button
                    type="button"
                    onClick={initAuth}
                    className="w-full py-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    System Slow? Click to Re-connect
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => {
                    if (step === 'attendance_face') {
                      stopAttendanceCamera();
                      setAttendancePhoto(null);
                      setStep('phone');
                    } else if (step === 'pin') {
                      setStep('phone');
                    } else {
                      setShowPhoneLogin(false);
                    }
                  }}
                  className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                >
                  {step === 'attendance_face' || step === 'pin' ? '← Wrong Number / Go Back' : 'Back to Main Login'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center mt-8 text-xs text-gray-400">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
          <div className="mt-4 text-center">
            <button 
              onClick={() => {
                if(confirm("EMERGENCY REPAIR: This will clear your local browser cache and force the application to update. Recommended if you are seeing an old version or the app is stuck. Proceed?")) {
                  localStorage.clear();
                  sessionStorage.clear();
                  // Try to find sw and unregister
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(registrations => {
                      for (const registration of registrations) {
                        registration.unregister();
                      }
                    });
                  }
                  window.location.href = window.location.pathname + "?force_upgrade=true&repair=manual";
                }
              }}
              className="text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-blue-400 transition-colors"
            >
              System stuck? Force Repair (v{APP_VERSION})
            </button>
          </div>
        </div>
        
        <div className="bg-gray-50 px-8 py-4 flex items-center justify-between border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-gray-500 tracking-wide uppercase">System Status: Live</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>

      {/* Biometric Selector */}
      {showBiometricSelector && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-black text-slate-950 uppercase tracking-wide">Select Staff Profile</h3>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">Ready for 1-tap biometric scan</p>
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {biometricUsers.map((user, idx) => (
                <button
                  key={`${user.uid}_face_${idx}`}
                  onClick={() => handleSelectBiometricProfile(user)}
                  className="w-full p-4 hover:bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-tr from-slate-100 to-slate-200 rounded-xl flex items-center justify-center text-slate-700 font-black">
                      {user.displayName.charAt(0)}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-slate-900 leading-none mb-1 group-hover:text-blue-600 transition-colors">{user.displayName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{user.role?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
                    <Camera size={16} />
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowBiometricSelector(false)}
              className="w-full py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Biometric Scanning Overlay */}
      {scanningBiometric && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[300] flex flex-col items-center justify-center p-8 text-white animate-in fade-in duration-300">
          <div className="w-full max-w-xs aspect-square rounded-[3rem] border-4 border-indigo-500/30 relative overflow-hidden flex flex-col items-center justify-center bg-slate-900/60 shadow-2xl">
            {/* Scanning Radar Laser Line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400/50 shadow-[0_0_20px_rgba(129,140,248,0.8)] animate-scan z-20" />
            
            {scanType === 'face' ? (
              <div className="absolute inset-0 w-full h-full bg-slate-950">
                <video
                  ref={realFaceVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {/* Guideline Circle Overlay */}
                <div className="absolute inset-0 border-4 border-dashed border-white/40 m-8 rounded-full pointer-events-none z-10 animate-pulse" />
              </div>
            ) : (
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 w-32 h-32 bg-indigo-500/10 blur-xl rounded-full animate-ping" />
                <div className="w-24 h-24 rounded-full border border-indigo-500/20 flex items-center justify-center relative">
                  <Fingerprint className={`w-14 h-14 text-indigo-400 transition-colors duration-500 ${scanResult === 'success' ? 'text-green-400 animate-none' : 'animate-pulse'}`} />
                </div>
              </div>
            )}

            {/* Progress state banner */}
            <div className="absolute bottom-8 left-0 right-0 text-center z-20">
              <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-[9px] uppercase tracking-widest ${
                scanResult === 'success' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-indigo-950/80 border border-indigo-500/40 backdrop-blur-sm'
              }`}>
                {scanResult === 'success' ? <CheckCircle2 size={12} className="text-white" /> : <Camera size={12} className="animate-pulse text-indigo-300" />}
                {scanResult === 'success' ? 'Verified Successfully' : 'Searching Face Match...'}
              </span>
            </div>
          </div>

          <div className="mt-8 text-center space-y-1">
            <h3 className="text-lg font-black">{scanningBiometric.displayName}</h3>
            <p className="text-[9px] font-black uppercase text-indigo-400 tracking-[0.2em]">DO NOT CLOSE CAMERA - KEEP FACE IN DIGITAL FOCUS</p>
          </div>

          <button
            onClick={() => {
              stopRealFaceCamera();
              setScanningBiometric(null);
            }}
            className="mt-6 px-6 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition"
          >
            Cancel Scan
          </button>
        </div>
      )}

      {/* Real Face Enrollment Modal */}
      {showRealFaceEnroll && showEnrollmentPrompt && (
        <FaceEnrollmentModal
          userId={showEnrollmentPrompt.profile.uid}
          userName={showEnrollmentPrompt.profile.displayName}
          onClose={() => {
            setShowRealFaceEnroll(false);
            loginManual(showEnrollmentPrompt.profile);
            setShowEnrollmentPrompt(null);
            navigate('/dashboard');
          }}
          onEnrolled={() => {
            setShowRealFaceEnroll(false);
            loginManual(showEnrollmentPrompt.profile);
            setShowEnrollmentPrompt(null);
            navigate('/dashboard');
          }}
        />
      )}

      {/* Attendance Quick-Action Kiosk Overlay */}
      {kioskUser && (
        <div className="fixed inset-0 bg-slate-905/70 backdrop-blur-md z-[280] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 max-w-md w-full border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] rotate-12 scale-150">
              <Timer size={100} />
            </div>

            <div className="flex items-center justify-between border-b border-slate-50 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center font-black text-indigo-600 text-lg">
                  {kioskUser.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">{kioskUser.displayName}</h3>
                  <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">{kioskUser.role.replace('_', ' ')}</p>
                </div>
              </div>

              <div className={`px-4 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-wider ${
                todayAttendance?.clockIn ? (todayAttendance.clockOut ? "bg-slate-50 text-slate-400 border-slate-100" : "bg-green-50 text-green-600 border-green-100") : "bg-amber-50 text-amber-600 border-amber-100"
              }`}>
                {todayAttendance?.clockIn ? (todayAttendance.clockOut ? "Clocked Out" : "Clocked In / Active") : "Off Duty"}
              </div>
            </div>

            <div className="text-center space-y-2 py-4 bg-slate-50 border border-slate-100 rounded-3xl relative">
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Current Station Time</p>
              <p className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                {format(new Date(), 'HH:mm:ss')}
              </p>
              <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
            </div>

            {gpsChecking ? (
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest animate-pulse">Locking GPS Location & Proximity...</p>
              </div>
            ) : gpsError ? (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center text-rose-700 space-y-2">
                <AlertCircle className="w-5 h-5 mx-auto text-rose-500" />
                <p className="text-xs font-black uppercase tracking-wider">GPS Restriction Failed</p>
                <p className="text-[10px] font-medium leading-relaxed">{gpsError}</p>
                <button
                  onClick={() => { setGpsError(null); setGpsDistance(null); }}
                  className="text-[9px] font-black uppercase tracking-wider text-rose-500 hover:underline pt-1 block mx-auto outline-none"
                >
                  Acknowledge & Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {countdown !== null ? (
                  <div className="p-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-3xl text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <h4 className="font-black text-sm uppercase tracking-wide">Punch Logged Successfully!</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Shift status updated beautifully.
                    </p>
                    <div className="pt-2">
                      <span className="inline-block px-3 py-1 bg-white border border-emerald-100 text-[9px] font-black uppercase tracking-widest rounded-lg">
                        Kiosk resetting in {countdown}s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {!todayAttendance?.clockIn ? (
                      <button
                        onClick={handleKioskPunchIn}
                        className="p-6 bg-green-600 hover:bg-green-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3 shadow-lg shadow-green-100 transition-all hover:scale-[1.02] active:scale-95 outline-none font-mono"
                      >
                        <LogIn size={24} />
                        Punch In
                      </button>
                    ) : !todayAttendance.clockOut ? (
                      <button
                        onClick={handleKioskPunchOut}
                        className="p-6 bg-slate-900 hover:bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3 shadow-lg transition-all hover:scale-[1.02] active:scale-95 outline-none font-mono"
                      >
                        <LogOut size={24} />
                        Punch Out
                      </button>
                    ) : (
                      <div className="col-span-2 p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center text-slate-400 font-bold text-[10px] uppercase tracking-widest leading-relaxed">
                        Shift Completed For Today. <br/> See you tomorrow!
                      </div>
                    )}

                    <button
                      onClick={handleKioskProceedToDashboard}
                      className={`p-6 rounded-[2rem] font-black text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3 transition-all outline-none ${
                        !todayAttendance?.clockIn 
                          ? "col-span-1 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:scale-[1.02]"
                          : todayAttendance?.clockOut
                            ? "col-span-2 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:scale-[1.02]"
                            : "bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:scale-[1.02] active:scale-95 shadow-md"
                      }`}
                    >
                      <Sparkles size={24} />
                      Dashboard
                    </button>
                  </div>
                )}
              </div>
            )}

            {countdown === null && (
              <button
                onClick={handleKioskClose}
                className="w-full py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors outline-none"
              >
                Close Kiosk / Log Out
              </button>
            )}
          </div>
        </div>
      )}

      {/* Enrollment Prompt */}
      {showEnrollmentPrompt && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-sm w-full p-8 border border-slate-100 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 bg-blue-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Camera className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Enable Face ID?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Unlock 1-tap face-scan login and clock-in/out on this device. Perfect for quick shifts!
              </p>
            </div>

            <div>
              <button
                onClick={() => handleBiometricEnroll('face')}
                className="w-full py-4 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 outline-none hover:bg-indigo-500 transition shadow-md"
              >
                <Camera size={16} />
                Enroll Face ID
              </button>
            </div>

            <button
              onClick={handleSkipEnrollment}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mx-auto hover:text-slate-600 outline-none"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
        .animate-spin-slow {
          animation: spin 10s linear infinite;
        }
      `}</style>
    </div>
  );
};
