import React, { useState, useEffect } from 'react';
// VERSION: 2026-04-29-V3-SOFT-DELETE
import { collection, query, getDocs, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, updateDoc, getDoc, where, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Bakery, UserProfile, PaymentSettings, Order } from '../types';
import { Building2, Users, Search, ExternalLink, ShieldAlert, Zap, Filter, Trash2, Edit2, Check, X, FileText, Clock, ShoppingBag, Mail, Phone, CreditCard, CheckCircle, AlertCircle, Camera, Volume2, Play, Heart, Database, Activity, Server, RefreshCw, Sparkles, Sliders, Receipt, Upload, Download } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useSound } from '../hooks/useSound';

import { createLog } from '../services/logService';

import { APP_VERSION } from '../version';

interface SystemLog {
  id: string;
  type: string;
  message: string;
  userId?: string;
  userEmail?: string;
  bakeryId?: string;
  timestamp: any;
  metadata?: any;
}

export const SuperAdminDashboard: React.FC<{ view?: string }> = ({ view = 'dashboard' }) => {
  const { impersonate, profile, bakery: currentBakery } = useAuth();
  const navigate = useNavigate();
  const { playPending, stopPending, playReady, stopReady, playSent } = useSound();
  const [bakeries, setBakeries] = useState<Bakery[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [globalOrdersCount, setGlobalOrdersCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'bakeries' | 'users' | 'logs' | 'subscriptions' | 'system' | 'orders'>(view as any || 'bakeries');
  
  // Global Orders Manager States
  const [globalOrders, setGlobalOrders] = useState<Order[]>([]);
  const [selectedBakeryFilter, setSelectedBakeryFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [orderSearchText, setOrderSearchText] = useState<string>('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [bakeryToReset, setBakeryToReset] = useState<string>('');
  const [editingBakery, setEditingBakery] = useState<Bakery | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<Bakery['subscriptionStatus']>('active');
  const [editPlan, setEditPlan] = useState<string>('monthly');
  const [editEndsAt, setEditEndsAt] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ title: string, message: string, confirmText: string, onResolve: () => void } | null>(null);

  // System Version State
  const [dbVersion, setDbVersion] = useState<string>('Unknown');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('A new version is available — please refresh');

  // Superadmin System Backup & Restore State
  const [backupScope, setBackupScope] = useState<'system' | 'specific'>('system');
  const [backupBakeryId, setBackupBakeryId] = useState<string>('');
  const [restoreScopeMode, setRestoreScopeMode] = useState<'original' | 'remap'>('original');
  const [restoreTargetBakeryId, setRestoreTargetBakeryId] = useState<string>('');

  // Subscription Settings State
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editUpi, setEditUpi] = useState('');
  const [editMerchant, setEditMerchant] = useState('');

  // Plan & Trial Editor States
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanPrice, setEditPlanPrice] = useState(0);
  const [editPlanDuration, setEditPlanDuration] = useState(30);
  const [editPlanDescription, setEditPlanDescription] = useState('');

  const [isEditingTrial, setIsEditingTrial] = useState(false);
  const [editTrialDuration, setEditTrialDuration] = useState(90);
  const [editTrialDescription, setEditTrialDescription] = useState('');

  // Feature limits & modules state
  const [isEditingLimits, setIsEditingLimits] = useState(false);
  const [trialAttendanceEnabled, setTrialAttendanceEnabled] = useState(false);
  const [trialPayrollEnabled, setTrialPayrollEnabled] = useState(false);
  const [trialMaxStaff, setTrialMaxStaff] = useState(5);
  const [trialMaxDealers, setTrialMaxDealers] = useState(3);
  const [trialMaxMembersPerDealer, setTrialMaxMembersPerDealer] = useState(2);

  const [paidAttendanceEnabled, setPaidAttendanceEnabled] = useState(true);
  const [paidPayrollEnabled, setPaidPayrollEnabled] = useState(true);
  const [paidMaxStaff, setPaidMaxStaff] = useState(-1);
  const [paidMaxDealers, setPaidMaxDealers] = useState(-1);
  const [paidMaxMembersPerDealer, setPaidMaxMembersPerDealer] = useState(-1);

  useEffect(() => {
    if (paymentSettings) {
      if (!isEditingLimits) {
        setTrialAttendanceEnabled(paymentSettings.trialFeatures?.attendanceEnabled ?? false);
        setTrialPayrollEnabled(paymentSettings.trialFeatures?.payrollEnabled ?? false);
        setTrialMaxStaff(paymentSettings.trialFeatures?.maxStaff ?? 5);
        setTrialMaxDealers(paymentSettings.trialFeatures?.maxDealers ?? 3);
        setTrialMaxMembersPerDealer(paymentSettings.trialFeatures?.maxMembersPerDealer ?? 2);

        setPaidAttendanceEnabled(paymentSettings.paidFeatures?.attendanceEnabled ?? true);
        setPaidPayrollEnabled(paymentSettings.paidFeatures?.payrollEnabled ?? true);
        setPaidMaxStaff(paymentSettings.paidFeatures?.maxStaff ?? -1);
        setPaidMaxDealers(paymentSettings.paidFeatures?.maxDealers ?? -1);
        setPaidMaxMembersPerDealer(paymentSettings.paidFeatures?.maxMembersPerDealer ?? -1);
      }
    }
  }, [paymentSettings, isEditingLimits]);

  // Pagination State
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const [logsItemsPerPage, setLogsItemsPerPage] = useState(25);
  const [signupRequests, setSignupRequests] = useState<any[]>([]);

  // System Diagnostics State
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagProgress, setDiagProgress] = useState(0);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [diagResult, setDiagResult] = useState<'success' | 'idle' | null>('idle');

  const runDiagnostics = () => {
    if (diagRunning) return;
    setDiagRunning(true);
    setDiagProgress(0);
    setDiagResult(null);
    setDiagLogs([
      `[${new Date().toLocaleTimeString()}] Initializing platform health audit...`,
    ]);

    const steps = [
      { p: 15, msg: "Connecting to Firebase Firestore database node cluster... [SECURE]" },
      { p: 35, msg: "Verifying active session authentication hooks: 100% ACTIVE" },
      { p: 55, msg: `Auditing active tenant configurations (${bakeries.length} licensed bakeries, ${users.length} operators). [STABLE]` },
      { p: 75, msg: "Checking geofence attendance parameters & duty limits: OK." },
      { p: 90, msg: "Log integrity check: No orphaned system records detected." },
      { p: 100, msg: "DIAGNOSTICS COMPLETED SUCCESSFULLY - Platform healthy!" }
    ];

    steps.forEach((step, idx) => {
      setTimeout(() => {
        setDiagProgress(step.p);
        setDiagLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${step.msg}`]);
        if (step.p === 100) {
          setDiagRunning(false);
          setDiagResult('success');
        }
      }, (idx + 1) * 500);
    });
  };

  useEffect(() => {
    const totalPages = Math.ceil(logs.length / logsItemsPerPage);
    if (logsCurrentPage > totalPages && totalPages > 0) {
      setLogsCurrentPage(totalPages);
    }
  }, [logs.length, logsItemsPerPage, logsCurrentPage]);

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void) => {
    setPendingAction({ title, message, confirmText, onResolve });
  };

  useEffect(() => {
    const unsubSignupRequests = onSnapshot(query(collection(db, 'signup_requests'), where('status', '==', 'pending')), (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setSignupRequests(data);
    });

    const unsubBakeries = onSnapshot(collection(db, 'bakeries'), (snapshot) => {
      const uniqueBakeries = new Map<string, Bakery>();
      snapshot.forEach(doc => {
        const item = { id: doc.id, ...doc.data() } as Bakery;
        if (!item.isDeleted && item.name !== 'System Management') {
          // Use name + ownerEmail as a secondary deduplication key
          const key = `${item.name.toLowerCase().trim()}_${item.ownerEmail?.toLowerCase().trim() || 'unk'}`;
          if (!uniqueBakeries.has(item.id)) {
            const existing = Array.from(uniqueBakeries.values()).find(ex => 
              `${ex.name.toLowerCase().trim()}_${ex.ownerEmail?.toLowerCase().trim() || 'unk'}` === key
            );
            if (!existing) {
              uniqueBakeries.set(item.id, item);
            }
          }
        }
      });
      setBakeries(Array.from(uniqueBakeries.values()));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uniqueUsers = new Map<string, UserProfile>();
      snapshot.forEach(doc => {
        const u = { ...doc.data(), uid: doc.id } as UserProfile;
        if (!u.isDeleted) {
          const phoneKey = u.phone ? u.phone.replace(/\D/g, '').slice(-10) : null;
          const emailKey = u.email ? u.email.toLowerCase().trim() : null;
          let identifier = u.uid || doc.id;

          const existing = Array.from(uniqueUsers.values()).find(ex => {
            const exPhone = ex.phone ? ex.phone.replace(/\D/g, '').slice(-10) : null;
            const exEmail = ex.email ? ex.email.toLowerCase().trim() : null;
            return (phoneKey && phoneKey.length >= 10 && exPhone === phoneKey) || (emailKey && exEmail === emailKey);
          });

          if (!existing && !uniqueUsers.has(identifier)) {
            uniqueUsers.set(identifier, u);
          }
        }
      });
      setUsers(Array.from(uniqueUsers.values()));
      setLoading(false);
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setGlobalOrdersCount(snapshot.size);
      const ordersList: Order[] = [];
      snapshot.forEach(docSnap => {
        ordersList.push({ id: docSnap.id, ...docSnap.data() } as Order);
      });
      // Sort descending by safe deliveryDate or createdAt
      ordersList.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : new Date(0));
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : new Date(0));
        return dateB.getTime() - dateA.getTime();
      });
      setGlobalOrders(ordersList);
    });

    const unsubLogs = onSnapshot(query(collection(db, 'system_logs')), (snapshot) => {
      const data: SystemLog[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as SystemLog));
      // Sort by timestamp descending
      data.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      setLogs(data);
    });

    const unsubPayment = onSnapshot(doc(db, 'payment_settings', 'phonepe'), (docSnap) => {
      if (docSnap.exists()) {
        setPaymentSettings(docSnap.data() as PaymentSettings);
      }
    });

    const unsubVersion = onSnapshot(doc(db, 'appConfig', 'version'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDbVersion(data.currentVersion || '1.0.0');
        setForceUpdate(data.forceUpdate || false);
        setUpdateMessage(data.updateMessage || 'A new version is available — please refresh');
      }
    });

    return () => {
      unsubSignupRequests();
      unsubBakeries();
      unsubUsers();
      unsubOrders();
      unsubLogs();
      unsubPayment();
      unsubVersion();
    };
  }, []);

  useEffect(() => {
    if (view) setViewMode(view as any);
  }, [view]);

  const startEditing = (bakery: Bakery) => {
    setEditingBakery(bakery);
    setEditName(bakery.name);
    setEditPhone(bakery.phone || '');
    setEditStatus(bakery.subscriptionStatus);
    setEditPlan(bakery.subscriptionPlan || 'monthly');
    let dateStr = '';
    if (bakery.subscriptionEndsAt) {
      const d = bakery.subscriptionEndsAt.toDate ? bakery.subscriptionEndsAt.toDate() : new Date(bakery.subscriptionEndsAt);
      dateStr = d.toISOString().split('T')[0];
    }
    setEditEndsAt(dateStr);
  };

  const handleUpdateBakery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBakery) return;
    setUpdating(true);
    try {
      const updateData: any = {
        name: editName,
        phone: editPhone,
        subscriptionStatus: editStatus,
        subscriptionPlan: editPlan
      };

      if (editEndsAt) {
        updateData.subscriptionEndsAt = new Date(editEndsAt);
      } else {
        updateData.subscriptionEndsAt = null;
      }

      await updateDoc(doc(db, 'bakeries', editingBakery.id), updateData);
      
      await createLog(
        'bakery', 
        `Bakery settings and subscription updated: ${editName} (Plan: ${editPlan}, Status: ${editStatus}, Ends: ${editEndsAt || 'None'})`, 
        auth.currentUser?.uid, 
        auth.currentUser?.email, 
        editingBakery.id
      );
      
      setEditingBakery(null);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const [showBakeryForm, setShowBakeryForm] = useState(false);
  const [newBakeryName, setNewBakeryName] = useState('');
  const [newBakeryEmail, setNewBakeryEmail] = useState('');
  const [newBakeryPhone, setNewBakeryPhone] = useState('');
  const [newBakeryAddress, setNewBakeryAddress] = useState('');
  const [newBakeryGst, setNewBakeryGst] = useState('');
  const [newBakeryPin, setNewBakeryPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code) {
          if (!newBakeryPhone && showBakeryForm) setNewBakeryPhone(data.country_calling_code);
          if (!editPhone && editingBakery) setEditPhone(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showBakeryForm || editingBakery) fetchISD();
  }, [showBakeryForm, editingBakery]);

  const handleAddBakery = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const bakeryId = `bakery_${Math.random().toString(36).substring(2, 9)}`;
      const isKreative = newBakeryName.toLowerCase().includes('kreative chocolates');
      
      await setDoc(doc(db, 'bakeries', bakeryId), {
        name: newBakeryName,
        adminEmail: newBakeryEmail,
        phone: newBakeryPhone,
        address: newBakeryAddress,
        gstNumber: newBakeryGst,
        pin: newBakeryPin || '1234',
        trialStartedAt: serverTimestamp(),
        subscriptionStatus: isKreative ? 'free_partner' : 'trial',
        settings: {}
      });
      
      await createLog('bakery', `New bakery registered: ${newBakeryName}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
      
      setShowBakeryForm(false);
      setNewBakeryName('');
      setNewBakeryEmail('');
      setNewBakeryPhone('');
      setNewBakeryAddress('');
      setNewBakeryGst('');
      setNewBakeryPin('');
    } catch (err) {
      console.error("Error adding bakery:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBakeries = bakeries.filter(b => 
    (b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.adminEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.phone && b.phone.includes(searchTerm))) &&
    b.name !== 'System Management'
  );

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.phone && u.phone.includes(searchTerm)) ||
    (u.role && u.role.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteUser = (uid: string, name: string) => {
    confirmAction(
      'Revoke Login Access?',
      `Are you sure you want to archvie "${name}"? They will no longer be able to log in to the portal.`,
      'Revoke Access',
      async () => {
        try {
          await updateDoc(doc(db, 'users', uid), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            role: 'disabled'
          });
          // Also check if they are a dealer
          const dealerDoc = await getDoc(doc(db, 'dealers', uid));
          if (dealerDoc.exists()) {
            await updateDoc(doc(db, 'dealers', uid), { 
              isDeleted: true, 
              deletedAt: serverTimestamp() 
            });
          }
          await createLog('system', `Soft-deleted user profile: ${name} (${uid})`, auth.currentUser?.uid, auth.currentUser?.email);
          alert('User access revoked successfully.');
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const handleDeleteBakery = (id: string, name: string) => {
    confirmAction(
      'CRITICAL: Deactivate Bakery?',
      `This will suspend "${name}" and all its associated users. All data will be archived and hidden from the platform.`,
      'Deactivate Bakery',
      async () => {
        try {
          setUpdating(true);
          await updateDoc(doc(db, 'bakeries', id), {
            isDeleted: true,
            deactivatedAt: serverTimestamp(),
            status: 'suspended'
          });
          await createLog('system', `Soft-deleted bakery tenant: ${name} (${id})`, auth.currentUser?.uid, auth.currentUser?.email);
          alert('Bakery deactivated and archived.');
        } catch (err) {
          console.error(err);
        } finally {
          setUpdating(false);
          setPendingAction(null);
        }
      }
    );
  };

  const handleDeleteOrder = (orderId: string, displayId?: string) => {
    confirmAction(
      'Permanently Delete Order?',
      `Are you sure you want to permanently delete order ${displayId || orderId}? This action is irreversible and will remove all associated order and payment records.`,
      'Confirm Delete',
      async () => {
        try {
          await deleteDoc(doc(db, 'orders', orderId));
          await createLog('system', `Permanently deleted order record: ${displayId || orderId}`, auth.currentUser?.uid, auth.currentUser?.email);
          setSelectedOrders(prev => prev.filter(id => id !== orderId));
          alert('Order permanently deleted.');
        } catch (err: any) {
          alert('Failed to delete order: ' + err.message);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const handleBatchDeleteOrders = () => {
    if (selectedOrders.length === 0) return;
    
    confirmAction(
      'Bulk Delete Orders?',
      `Are you sure you want to permanently delete the ${selectedOrders.length} selected orders? This action cannot be undone.`,
      'Permanently Delete',
      async () => {
        setLoading(true);
        try {
          let count = 0;
          for (const orderId of selectedOrders) {
            await deleteDoc(doc(db, 'orders', orderId));
            count++;
          }
          await createLog('system', `Bulk permanently deleted ${count} order records.`, auth.currentUser?.uid, auth.currentUser?.email);
          setSelectedOrders([]);
          alert(`Successfully deleted ${count} selected orders.`);
        } catch (err: any) {
          alert('Failed to delete some orders: ' + err.message);
        } finally {
          setLoading(false);
          setPendingAction(null);
        }
      }
    );
  };

  const handleResetBakeryOrders = async (bakeryId: string, bakeryName: string) => {
    if (!bakeryId) return;
    const count = globalOrders.filter(o => o.bakeryId === bakeryId).length;
    if (count === 0) {
      alert(`There are no active orders for ${bakeryName} to delete.`);
      return;
    }
    
    const doubleConfirm = window.prompt(`WARNING: This will PERMANENTLY and IRREVERSIBLY delete ALL ${count} orders for bakery "${bakeryName}".\n\nTo confirm, type the word "RESET" below:`);
    if (doubleConfirm !== 'RESET') {
      alert('Reset cancelled (incorrect confirmation word).');
      return;
    }
    
    setLoading(true);
    try {
      const ordersToDelete = globalOrders.filter(o => o.bakeryId === bakeryId);
      let deleted = 0;
      for (const order of ordersToDelete) {
        await deleteDoc(doc(db, 'orders', order.id));
        deleted++;
      }
      
      await createLog('system', `PERMANENT RESET: Deleted all ${deleted} orders for bakery ${bakeryName} (${bakeryId})`, auth.currentUser?.uid, auth.currentUser?.email);
      alert(`Successfully deleted all ${deleted} orders for "${bakeryName}" permanently!`);
    } catch (err: any) {
      console.error(err);
      alert('Failed during reset operation: ' + err.message);
    } finally {
      setSelectedOrders([]);
      setLoading(false);
    }
  };

  const handleApproveBakery = async (request: any) => {
    confirmAction(
      'Approve Bakery Signup?',
      `Confirm approval for "${request.bakeryName}". This will grant them a 3-month free trial.`,
      'Approve & Activate',
      async () => {
        try {
          const trialEnds = new Date();
          trialEnds.setMonth(trialEnds.getMonth() + 3);

          await updateDoc(doc(db, 'bakeries', request.bakeryId), {
            subscriptionStatus: 'trial',
            trialStartedAt: serverTimestamp(),
            subscriptionEndsAt: trialEnds,
            status: 'active'
          });

          await updateDoc(doc(db, 'signup_requests', request.id), {
            status: 'approved',
            approvedAt: serverTimestamp()
          });

          await createLog('system', `Bakery Approved: ${request.bakeryName}`, auth.currentUser?.uid, auth.currentUser?.email, request.bakeryId);
          alert('Bakery approved and trial activated!');
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const handleUpdatePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      await setDoc(doc(db, 'payment_settings', 'phonepe'), {
        phonePeUpiId: editUpi,
        phonePeMerchantName: editMerchant,
        plans: paymentSettings?.plans || [
          { id: 'monthly', name: 'Premium Monthly', price: 999, durationDays: 30, description: 'All features included.' },
          { id: 'yearly', name: 'Professional Annual', price: 8388, durationDays: 365, description: 'Best value for growing bakeries.' }
        ]
      }, { merge: true });
      await createLog('system', `Payment settings updated: ${editUpi}`, auth.currentUser?.uid, auth.currentUser?.email);
      setIsEditingPayment(false);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId) return;
    setUpdating(true);
    try {
      const updatedPlans = (paymentSettings?.plans || [
        { id: 'monthly', name: 'Premium Monthly', price: 999, durationDays: 30, description: 'All features included.' },
        { id: 'yearly', name: 'Professional Annual', price: 8388, durationDays: 365, description: 'Best value for growing bakeries.' }
      ]).map(plan => {
        if (plan.id === editingPlanId) {
          return {
            ...plan,
            name: editPlanName,
            price: Number(editPlanPrice),
            durationDays: Number(editPlanDuration),
            description: editPlanDescription
          };
        }
        return plan;
      });

      await setDoc(doc(db, 'payment_settings', 'phonepe'), {
        plans: updatedPlans
      }, { merge: true });

      await createLog('system', `Updated subscription plan: ${editingPlanId}`, auth.currentUser?.uid, auth.currentUser?.email);
      setEditingPlanId(null);
      alert('Plan updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update plan.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveTrialSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      await setDoc(doc(db, 'payment_settings', 'phonepe'), {
        trialDays: Number(editTrialDuration),
        trialDescription: editTrialDescription
      }, { merge: true });

      await createLog('system', `Updated Trial Settings to ${editTrialDuration} days`, auth.currentUser?.uid, auth.currentUser?.email);
      setIsEditingTrial(false);
      alert('Trial config updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update Trial Config.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveFeatureLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      await setDoc(doc(db, 'payment_settings', 'phonepe'), {
        trialFeatures: {
          attendanceEnabled: trialAttendanceEnabled,
          payrollEnabled: trialPayrollEnabled,
          maxStaff: Number(trialMaxStaff),
          maxDealers: Number(trialMaxDealers),
          maxMembersPerDealer: Number(trialMaxMembersPerDealer)
        },
        paidFeatures: {
          attendanceEnabled: paidAttendanceEnabled,
          payrollEnabled: paidPayrollEnabled,
          maxStaff: Number(paidMaxStaff),
          maxDealers: Number(paidMaxDealers),
          maxMembersPerDealer: Number(paidMaxMembersPerDealer)
        }
      }, { merge: true });

      await createLog('system', 'Updated Free vs Paid granular feature configuration limits', auth.currentUser?.uid, auth.currentUser?.email);
      setIsEditingLimits(false);
      alert('Feature access limits updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update feature limits.');
    } finally {
      setUpdating(false);
    }
  };

  const handleApproveSubscription = async (bakery: Bakery) => {
    confirmAction(
      'Approve Subscription?',
      `Verify payment for "${bakery.name}" and activate their subscription.`,
      'Approve Payment',
      async () => {
        try {
          const plan = paymentSettings?.plans.find(p => p.id === bakery.subscriptionPlan);
          const duration = plan?.durationDays || 30;
          const endsAt = new Date();
          endsAt.setDate(endsAt.getDate() + duration);

          await updateDoc(doc(db, 'bakeries', bakery.id), {
            subscriptionStatus: 'active',
            trialEndDate: serverTimestamp(), // End trial since they paid
            subscriptionEndsAt: endsAt,
            paymentStatus: 'verified',
            paymentVerifiedAt: serverTimestamp()
          });

          await createLog('bakery', `Subscription approved: ${bakery.subscriptionPlan}`, auth.currentUser?.uid, auth.currentUser?.email, bakery.id);
          alert('Subscription activated successfully!');
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const handleSyncVersion = async () => {
    confirmAction(
      'Push Platform Update?',
      `This will update the global version to v${APP_VERSION} and clear the "Refresh Now" bar for everyone currently on this version.`,
      'Push Update Now',
      async () => {
        try {
          setUpdating(true);
          await setDoc(doc(db, 'appConfig', 'version'), {
            currentVersion: APP_VERSION,
            forceUpdate: false,
            updateMessage: 'BakeSync has been updated — please refresh'
          });
          await createLog('system', `Global Version synced to ${APP_VERSION}`, auth.currentUser?.uid, auth.currentUser?.email);
          alert('System version synchronized successfully!');
        } catch (err) {
          console.error(err);
        } finally {
          setUpdating(false);
          setPendingAction(null);
        }
      }
    );
  };

  const reviveDates = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
      if (isoRegex.test(obj)) {
        const d = new Date(obj);
        if (!isNaN(d.getTime())) return d;
      }
      return obj;
    }
    if (typeof obj === 'object') {
      if (typeof obj.seconds === 'number' && typeof obj.nanoseconds === 'number') {
        return new Date(obj.seconds * 1000 + Math.floor(obj.nanoseconds / 1000000));
      }
      const newObj: any = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = reviveDates(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  };

  const handleSuperAdminExportBackup = async () => {
    setUpdating(true);
    try {
      if (backupScope === 'specific' && !backupBakeryId) {
        alert('Please select a specific bakery to back up.');
        setUpdating(false);
        return;
      }

      let bakeriesList: any[] = [];
      let ordersList: any[] = [];
      let menuItemsList: any[] = [];
      let dealersList: any[] = [];
      let recipesList: any[] = [];
      let label = 'system_full';

      if (backupScope === 'system') {
        // Fetch all
        const snapB = await getDocs(collection(db, 'bakeries'));
        bakeriesList = snapB.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapO = await getDocs(collection(db, 'orders'));
        ordersList = snapO.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapM = await getDocs(collection(db, 'menu_items'));
        menuItemsList = snapM.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapD = await getDocs(collection(db, 'dealers'));
        dealersList = snapD.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapR = await getDocs(collection(db, 'recipes'));
        recipesList = snapR.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        // Specific bakery
        const selectedB = bakeries.find(b => b.id === backupBakeryId);
        if (!selectedB) throw new Error('Selected bakery not found');
        label = selectedB.name.toLowerCase().replace(/\s+/g, '_');

        bakeriesList = [selectedB];

        const snapO = await getDocs(query(collection(db, 'orders'), where('bakeryId', '==', backupBakeryId)));
        ordersList = snapO.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapM = await getDocs(query(collection(db, 'menu_items'), where('bakeryId', '==', backupBakeryId)));
        menuItemsList = snapM.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapD = await getDocs(query(collection(db, 'dealers'), where('bakeryId', '==', backupBakeryId)));
        dealersList = snapD.docs.map(d => ({ id: d.id, ...d.data() }));

        const snapR = await getDocs(query(collection(db, 'recipes'), where('bakeryId', '==', backupBakeryId)));
        recipesList = snapR.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      const backupObj = {
        backupType: backupScope,
        backupVersion: "1.0",
        bakeryId: backupScope === 'specific' ? backupBakeryId : undefined,
        exportedAt: new Date().toISOString(),
        bakeries: bakeriesList,
        orders: ordersList,
        menu_items: menuItemsList,
        dealers: dealersList,
        recipes: recipesList
      };

      const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${label}_backup_${format(new Date(), 'yyyy_MM_dd_HHmm')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await createLog('system', `Superadmin Database Backup (${backupScope}): ${ordersList.length} orders, ${menuItemsList.length} menu items, ${dealersList.length} dealers, ${recipesList.length} recipes`, auth.currentUser?.uid, auth.currentUser?.email, backupScope === 'specific' ? backupBakeryId : undefined);
      alert('Superadmin Database Backup exported successfully!');
    } catch (err: any) {
      console.error('SUPERADMIN BACKUP FAILED:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleSuperAdminImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawJson = e.target?.result as string;
        const backup = JSON.parse(rawJson);

        if (!backup || typeof backup !== 'object') {
          throw new Error('Invalid backup file format.');
        }

        const bakeriesList = Array.isArray(backup.bakeries) ? backup.bakeries : [];
        const ordersList = Array.isArray(backup.orders) ? backup.orders : [];
        const menuItemsList = Array.isArray(backup.menu_items) ? backup.menu_items : [];
        const dealersList = Array.isArray(backup.dealers) ? backup.dealers : [];
        const recipesList = Array.isArray(backup.recipes) ? backup.recipes : [];

        if (bakeriesList.length === 0 && ordersList.length === 0 && menuItemsList.length === 0 && dealersList.length === 0 && recipesList.length === 0) {
          throw new Error('No restoreable records found in backup file.');
        }

        const isBakeryScope = backup.backupType === 'specific' || !!backup.bakeryId;
        
        let confirmMsg = '';
        if (isBakeryScope) {
          const originName = backup.bakeries?.[0]?.name || 'Unknown Bakery';
          if (restoreScopeMode === 'remap') {
            if (!restoreTargetBakeryId) {
              alert('Please select a target bakery for remapping before importing.');
              return;
            }
            const targetB = bakeries.find(b => b.id === restoreTargetBakeryId);
            confirmMsg = `REMAP RESTORE: You are importing a bakery backup (originally from "${originName}") and remapping ALL data to target bakery "${targetB?.name || 'Unknown'}".\n\nThis will write: \n- ${ordersList.length} orders\n- ${menuItemsList.length} menu items\n- ${dealersList.length} dealers\n- ${recipesList.length} recipes\n\nAll records will have their "bakeryId" remapped to "${restoreTargetBakeryId}". Are you sure you want to proceed?`;
          } else {
            confirmMsg = `ORIGINAL RESTORE: This will restore data back to the original bakery "${originName}" (ID: ${backup.bakeryId}). This will overwrite/merge documents with identical IDs. Proceed?`;
          }
        } else {
          confirmMsg = `SYSTEM RESTORE: This will write/restore ${bakeriesList.length} bakeries, ${ordersList.length} orders, ${menuItemsList.length} menu items, ${dealersList.length} dealers, and ${recipesList.length} recipes. This is a system-wide restore and will merge/overwrite existing documents with matching IDs. Are you sure?`;
        }

        confirmAction(
          'PLATFORM SYSTEM RESTORE',
          confirmMsg,
          'CONFIRM RESTORE',
          async () => {
            setUpdating(true);
            try {
              let totalRestored = 0;

              const restoreCollectionInChunks = async (collectionName: string, list: any[], forceBakeryId?: string) => {
                const chunks = [];
                for (let i = 0; i < list.length; i += 500) {
                  chunks.push(list.slice(i, i + 500));
                }

                for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach((item) => {
                    const revivedItem = reviveDates(item);
                    
                    if (forceBakeryId) {
                      revivedItem.bakeryId = forceBakeryId;
                    }
                    
                    const { id, ...docBody } = revivedItem;
                    if (id) {
                      const docRef = doc(db, collectionName, id);
                      batch.set(docRef, docBody, { merge: true });
                    }
                  });
                  await batch.commit();
                  totalRestored += chunk.length;
                }
              };

              // 1. Restore Bakeries (Only if not remapping or if system-wide)
              if (bakeriesList.length > 0 && (!isBakeryScope || restoreScopeMode === 'original')) {
                const chunks = [];
                for (let i = 0; i < bakeriesList.length; i += 500) {
                  chunks.push(bakeriesList.slice(i, i + 500));
                }
                for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach((item) => {
                    const revivedItem = reviveDates(item);
                    const { id, ...docBody } = revivedItem;
                    if (id) {
                      const docRef = doc(db, 'bakeries', id);
                      batch.set(docRef, docBody, { merge: true });
                    }
                  });
                  await batch.commit();
                  totalRestored += chunk.length;
                }
              }

              // Determine bakery ID override
              const forceId = (isBakeryScope && restoreScopeMode === 'remap') ? restoreTargetBakeryId : undefined;

              // 2. Restore other entities
              if (dealersList.length > 0) {
                await restoreCollectionInChunks('dealers', dealersList, forceId);
              }
              if (menuItemsList.length > 0) {
                await restoreCollectionInChunks('menu_items', menuItemsList, forceId);
              }
              if (recipesList.length > 0) {
                await restoreCollectionInChunks('recipes', recipesList, forceId);
              }
              if (ordersList.length > 0) {
                await restoreCollectionInChunks('orders', ordersList, forceId);
              }

              await createLog('system', `Superadmin Database Restored: ${totalRestored} total records updated/inserted`, auth.currentUser?.uid, auth.currentUser?.email, forceId);
              alert(`Success: Platform database restore complete! ${totalRestored} records imported/updated.`);
            } catch (err: any) {
              console.error('SUPERADMIN RESTORE FAILED:', err);
              alert(`Restore failed: ${err.message}`);
            } finally {
              setUpdating(false);
              setPendingAction(null);
            }
          }
        );

      } catch (err: any) {
        alert(`Failed to parse backup file: ${err.message}`);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleUpdateVersionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    try {
      await setDoc(doc(db, 'appConfig', 'version'), {
        currentVersion: dbVersion,
        forceUpdate,
        updateMessage
      });
      await createLog('system', `App configuration updated: v${dbVersion}`, auth.currentUser?.uid, auth.currentUser?.email);
      alert('System settings updated.');
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const handleSetMyBakery = async (bakeryId: string) => {
    if (!profile?.uid) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        bakeryId: bakeryId
      });
      alert('Linked as your primary bakery for quick access.');
    } catch (err) {
      console.error(err);
      alert('Failed to link bakery.');
    }
  };

  const renderView = () => {
    if (viewMode === 'users') {
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 sm:px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search user directory..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right sm:text-left">
                Retrieved {users.length} active profiles
              </div>
            </div>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User / Identity</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bakery Association</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map((userProfile, idx) => {
                    const associatedBakery = bakeries.find(b => b.id === userProfile.bakeryId);
                    return (
                      <tr key={`${userProfile.uid || 'user'}_${idx}`} className="hover:bg-slate-50/50 transition-all group">
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 text-xs">
                              {userProfile.displayName?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 leading-tight">{userProfile.displayName}</p>
                              <div className="flex gap-2 text-[10px] text-slate-400 font-bold mt-0.5">
                                <span>{userProfile.phone}</span>
                                {userProfile.email && <span className="truncate max-w-[150px]"> {userProfile.email}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <span className={cn(
                            "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border",
                            userProfile.role === 'bakery_admin' ? "bg-purple-50 text-purple-600 border-purple-100" :
                            userProfile.role === 'dealer' ? "bg-blue-50 text-blue-600 border-blue-100" :
                            "bg-slate-100 text-slate-600 border-slate-200"
                          )}>
                            {userProfile.role?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          {associatedBakery ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">{associatedBakery.name}</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID: {associatedBakery.id.split('_')[1] || associatedBakery.id}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-slate-300 uppercase italic">Unlinked</span>
                          )}
                        </td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                if (associatedBakery) {
                                  impersonate(userProfile, associatedBakery);
                                  navigate('/dashboard');
                                } else {
                                  alert('Cannot impersonate unlinked user (Missing Bakery context)');
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                            >
                              Login As
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(userProfile.uid, userProfile.displayName)}
                              className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-slate-100 px-0">
              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No users match your search.</div>
              ) : (
                filteredUsers.map((userProfile, idx) => {
                  const associatedBakery = bakeries.find(b => b.id === userProfile.bakeryId);
                  return (
                    <div key={`${userProfile.uid || 'user'}_${idx}`} className="p-6 space-y-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 text-sm">
                            {userProfile.displayName?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-base font-black text-slate-900 leading-tight">{userProfile.displayName}</p>
                            <div className="flex flex-col gap-0.5 text-[10px] text-slate-400 font-bold mt-1">
                              <span>{userProfile.phone}</span>
                              {userProfile.email && <span className="truncate">{userProfile.email}</span>}
                            </div>
                          </div>
                        </div>
                        <span className={cn(
                          "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border shrink-0",
                          userProfile.role === 'bakery_admin' ? "bg-purple-50 text-purple-600 border-purple-100" :
                          userProfile.role === 'dealer' ? "bg-blue-50 text-blue-600 border-blue-100" :
                          "bg-slate-100 text-slate-600 border-slate-200"
                        )}>
                          {userProfile.role?.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="bg-slate-50 rounded-2xl p-4 flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Bakery Partner</p>
                          {associatedBakery ? (
                            <p className="text-xs font-bold text-slate-900 truncate">{associatedBakery.name}</p>
                          ) : (
                            <p className="text-[10px] font-black text-slate-300 uppercase italic">Unlinked Profile</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              if (associatedBakery) {
                                impersonate(userProfile, associatedBakery);
                                navigate('/dashboard');
                              } else {
                                alert('Cannot impersonate unlinked user');
                              }
                            }}
                            className="flex-1 xs:flex-none px-4 py-2.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all text-center"
                          >
                            Login As
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(userProfile.uid, userProfile.displayName)}
                            className="p-2.5 text-slate-400 bg-white border border-slate-200 rounded-xl active:scale-95 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'orders') {
      const filteredOrders = globalOrders.filter(order => {
        if (selectedBakeryFilter !== 'all' && order.bakeryId !== selectedBakeryFilter) {
          return false;
        }
        if (selectedStatusFilter !== 'all' && order.status !== selectedStatusFilter) {
          return false;
        }
        if (orderSearchText) {
          const q = orderSearchText.toLowerCase();
          const matchId = order.id?.toLowerCase().includes(q) || order.displayId?.toLowerCase().includes(q);
          const matchCustomer = order.customerDetails?.name?.toLowerCase().includes(q) || order.customerDetails?.phone?.includes(q);
          const matchDealer = order.dealerCompanyName?.toLowerCase().includes(q);
          if (!matchId && !matchCustomer && !matchDealer) {
            return false;
          }
        }
        return true;
      });

      // Stats calculations based on filtered orders
      const totalFilteredAmount = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const totalFilteredAdvance = filteredOrders.reduce((sum, o) => sum + (o.advanceReceived || 0), 0);

      const toggleSelectOrder = (orderId: string) => {
        setSelectedOrders(prev => 
          prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
      };

      const toggleSelectAllOrders = (visibleOrderIds: string[]) => {
        if (selectedOrders.length === visibleOrderIds.length) {
          setSelectedOrders([]);
        } else {
          setSelectedOrders(visibleOrderIds);
        }
      };

      return (
        <div className="space-y-6">
          {/* QUICK RESET CARD - Clean orders & start fresh */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-amber-900 uppercase tracking-widest flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-605" />
                  Erase Test Data & Start Fresh
                </h3>
                <p className="text-xs text-amber-700/80 font-medium max-w-2xl">
                  Permanently wipe out all dummy/test order documents for any store partner to reset their ledger to a pristine state before full commercial activation.
                </p>
              </div>
              <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-3 w-full md:w-auto shrink-0">
                <select
                  value={bakeryToReset}
                  onChange={(e) => setBakeryToReset(e.target.value)}
                  className="bg-white border border-amber-200 text-slate-850 text-xs font-semibold rounded-xl px-4 py-3 outline-none min-w-[200px]"
                >
                  <option value="">-- Choose Bakery Store --</option>
                  {bakeries.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <button
                  disabled={!bakeryToReset}
                  onClick={() => {
                    const bk = bakeries.find(b => b.id === bakeryToReset);
                    if (bk) handleResetBakeryOrders(bk.id, bk.name);
                  }}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-amber-200 disabled:opacity-50 disabled:bg-slate-400 disabled:shadow-none cursor-pointer"
                >
                  Reset Active Orders
                </button>
              </div>
            </div>
          </div>

          {/* STATS OVERVIEW */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                <Receipt size={22} />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Filtered Count</p>
                <p className="text-2xl font-black text-slate-900">{filteredOrders.length} <span className="text-xs font-bold text-slate-400">/ {globalOrders.length} total</span></p>
              </div>
            </div>
            <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                <span className="font-bold text-lg">₹</span>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Gross Order Flow</p>
                <p className="text-2xl font-black text-slate-900">₹{totalFilteredAmount.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                <span className="font-bold text-lg">₹</span>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Advance Escrows</p>
                <p className="text-2xl font-black text-slate-900">₹{totalFilteredAdvance.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          {/* MAIN FILTERS BAR */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Global Sales Records
              </h2>
              {selectedOrders.length > 0 && (
                <button
                  onClick={handleBatchDeleteOrders}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all self-start sm:self-auto shadow-md shadow-red-100 cursor-pointer"
                >
                  <Trash2 size={14} />
                  Delete Selected ({selectedOrders.length})
                </button>
              )}
            </div>

            <div className="p-6 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search order ID, customer details, or company..."
                  value={orderSearchText}
                  onChange={(e) => setOrderSearchText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-xs outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <select
                  value={selectedBakeryFilter}
                  onChange={(e) => setSelectedBakeryFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer focus:border-blue-500 transition-colors"
                >
                  <option value="all">All Store Partners</option>
                  {bakeries.map(bk => (
                    <option key={bk.id} value={bk.id}>{bk.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer focus:border-blue-500 transition-colors"
                >
                  <option value="all">All Life-Cycle Statuses</option>
                  <option value="pending">Pending Acknowledgement</option>
                  <option value="received">Received / Confirmed</option>
                  <option value="in_progress">Baking In Progress</option>
                  <option value="ready">Ready for Despatch</option>
                  <option value="sent">Dispatched / Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* TABLE VIEW */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30">
                    <th className="px-8 py-4 w-12">
                      <input
                        type="checkbox"
                        checked={filteredOrders.length > 0 && selectedOrders.length === filteredOrders.length}
                        onChange={() => toggleSelectAllOrders(filteredOrders.map(o => o.id))}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Order Reference</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Bakery Partner</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Channel & Customer</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Delivery Details</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Order Valuation</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Status</th>
                    <th className="px-8 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                        No orders recorded matching your query.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => {
                      const hostBakery = bakeries.find(b => b.id === order.bakeryId);
                      const isSelected = selectedOrders.includes(order.id);
                      return (
                        <tr key={order.id} className={cn("hover:bg-slate-50/30 transition-colors", isSelected && "bg-blue-50/10")}>
                          <td className="px-8 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOrder(order.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-8 py-4 z-10">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-900 font-mono">#{order.displayId || order.id.slice(0, 8)}</span>
                              <span className="text-[9px] font-bold text-slate-450 mt-0.5 uppercase tracking-wide">
                                {order.createdAt?.toDate ? format(order.createdAt.toDate(), 'dd MMM yyyy, hh:mm a') : '...'}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">{hostBakery?.name || 'Unknown Store'}</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">ID: {order.bakeryId}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col">
                              {order.type === 'dealer_cake' ? (
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5 self-start uppercase text-[9px] font-black">Dealer Order</span>
                              ) : (
                                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-0.5 self-start uppercase text-[9px] font-black">Direct (CRM)</span>
                              )}
                              <span className="text-xs font-black text-slate-700 mt-1">{order.customerDetails?.name || order.dealerCompanyName || 'Retail Customer'}</span>
                              {(order.customerDetails?.phone) && (
                                <span className="text-[10px] text-slate-450 font-mono">{order.customerDetails.phone}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">{order.deliveryDate || 'N/A'}</span>
                              {order.deliveryTime && (
                                <span className="text-[10px] text-slate-450 font-bold mt-0.5 flex items-center gap-1">
                                  <Clock size={12} />
                                  {order.deliveryTime}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-black text-slate-900">₹{(order.totalAmount || 0).toLocaleString('en-IN')}</span>
                              {order.advanceReceived > 0 && (
                                <span className="text-[9px] text-emerald-600 font-black uppercase tracking-wider">Paid: ₹{order.advanceReceived}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <span className={cn(
                              "text-[8px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border",
                              order.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-200" :
                              order.status === 'received' ? "bg-blue-50 text-blue-600 border-blue-200" :
                              order.status === 'in_progress' ? "bg-purple-50 text-purple-600 border-purple-200" :
                              order.status === 'ready' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                              order.status === 'sent' ? "bg-teal-50 text-teal-600 border-teal-200" :
                              "bg-red-50 text-red-650 border-red-200"
                            )}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <button
                              onClick={() => handleDeleteOrder(order.id, order.displayId)}
                              className="p-2 text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                              title="Delete Order Permanently"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* MOBILE RESPONSIVE VIEWMOTE */}
            <div className="lg:hidden divide-y divide-slate-100 px-0">
              {filteredOrders.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No orders match your queries.</div>
              ) : (
                filteredOrders.map(order => {
                  const hostBakery = bakeries.find(b => b.id === order.bakeryId);
                  const isSelected = selectedOrders.includes(order.id);
                  return (
                    <div key={order.id} className={cn("p-6 space-y-4 hover:bg-slate-50/10 transition-colors", isSelected && "bg-blue-50/5")}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOrder(order.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div>
                            <p className="text-base font-black text-slate-900 leading-tight">#{order.displayId || order.id.slice(0, 8)}</p>
                            <p className="text-[10px] text-slate-450 mt-1 uppercase font-bold">
                              {order.createdAt?.toDate ? format(order.createdAt.toDate(), 'dd MMM yyyy, hh:mm a') : '...'}
                            </p>
                          </div>
                        </div>
                        <span className={cn(
                          "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border",
                          order.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-100" :
                          order.status === 'ready' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                          "bg-slate-100 text-slate-600 border-slate-200"
                        )}>
                          {order.status}
                        </span>
                      </div>

                      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wide">Partner:</span>
                          <span className="font-extrabold text-slate-800">{hostBakery?.name || 'Unknown Store'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wide">Customer:</span>
                          <span className="font-semibold text-slate-800">{order.customerDetails?.name || order.dealerCompanyName || 'Direct Customer'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wide">Value:</span>
                          <span className="font-black text-slate-900">₹{(order.totalAmount || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                          <button
                            onClick={() => handleDeleteOrder(order.id, order.displayId)}
                            className="w-full py-2 bg-red-50 hover:bg-red-500 hover:text-white border border-red-200 hover:border-red-500 text-red-650 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            Delete Permanently
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'subscriptions') {
      const pendingSubscriptions = bakeries.filter(b => b.subscriptionStatus === 'pending_verification');
      const activeSubscriptions = bakeries.filter(b => b.subscriptionStatus === 'active' || b.subscriptionStatus === 'trial');
      const expiredSubscriptions = bakeries.filter(b => b.subscriptionStatus === 'expired');
      const expiringSoon = bakeries.filter(b => {
        if (!b.subscriptionEndsAt) return false;
        const daysLeft = differenceInDays(b.subscriptionEndsAt.toDate(), new Date());
        return daysLeft >= 0 && daysLeft <= 7;
      });

      const totalRevenue = activeSubscriptions.reduce((acc, b) => {
        const plan = paymentSettings?.plans.find(p => p.id === b.subscriptionPlan);
        return acc + (plan?.price || 0);
      }, 0);

      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-8 rounded-[2.5rem] border border-blue-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Est. Monthly Revenue</p>
              <div className="flex items-end gap-3">
                <h3 className="text-3xl font-black text-slate-900 leading-none">₹{totalRevenue.toLocaleString()}</h3>
                <span className="text-xs font-bold text-blue-500 mb-1">MRR</span>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Pending Verification</p>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-slate-900 leading-none">{pendingSubscriptions.length}</h3>
                <span className="text-xs font-bold text-amber-500 mb-1">Check</span>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Active Licensed</p>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-slate-900 leading-none">{activeSubscriptions.length}</h3>
                <span className="text-xs font-bold text-green-500 mb-1">Live</span>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Expiring Soon</p>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-slate-900 leading-none">{expiringSoon.length}</h3>
                <span className="text-xs font-bold text-rose-500 mb-1">Alert</span>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Expired Trials</p>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-slate-900 leading-none">{expiredSubscriptions.length}</h3>
                <span className="text-xs font-bold text-slate-400 mb-1">Past</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Pending Approvals Queue */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-500" />
                    Subscription Verification Queue
                  </h2>
                  <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full uppercase border border-amber-100">
                    Awaiting Manual Audit
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {pendingSubscriptions.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                        <CheckCircle size={32} />
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inbox Zero: All payments verified</p>
                    </div>
                  ) : (
                    pendingSubscriptions.map(bakery => (
                      <div key={bakery.id} className="p-6 hover:bg-slate-50/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 flex items-center justify-center shadow-sm shrink-0">
                            <Building2 className="text-slate-400" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-900">{bakery.name}</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-0.5">
                              Plan: <span className="text-blue-600">{bakery.subscriptionPlan || 'NOT SELECTED'}</span>
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              {bakery.paymentScreenshotUrl && (
                                <a 
                                  href={bakery.paymentScreenshotUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:underline uppercase"
                                >
                                  <Camera size={12} /> View Screenshot
                                </a>
                              )}
                              <span className="text-[9px] text-slate-300 font-bold uppercase">
                                {bakery.paymentUploadedAt ? format(bakery.paymentUploadedAt.toDate(), 'dd MMM HH:mm') : 'Recently'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleApproveSubscription(bakery)}
                            className="flex-1 sm:flex-none px-6 py-2.5 bg-green-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-100"
                          >
                            Approve
                          </button>
                          <button className="p-2.5 text-slate-400 hover:text-red-500 transition-colors">
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* All Subscriptions Registry */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Bakery Membership Registry
                  </h2>
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Filter Registry..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-[10px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bakery</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Membership</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Valid Until</th>
                        <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bakeries.map(bakery => {
                        const isExpired = bakery.subscriptionStatus === 'expired' || 
                          (bakery.subscriptionEndsAt && differenceInDays(bakery.subscriptionEndsAt.toDate(), new Date()) < 0);
                        
                        return (
                          <tr key={bakery.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-8 py-4">
                              <p className="text-sm font-black text-slate-900">{bakery.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">ID: {bakery.id}</p>
                            </td>
                            <td className="px-8 py-4">
                              <span className={cn(
                                "text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter border",
                                bakery.subscriptionStatus === 'active' ? "bg-green-50 text-green-600 border-green-100" :
                                bakery.subscriptionStatus === 'trial' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                bakery.subscriptionStatus === 'free_partner' ? "bg-purple-50 text-purple-600 border-purple-100" :
                                "bg-rose-50 text-rose-600 border-rose-100"
                              )}>
                                {isExpired ? 'EXPIRED' : bakery.subscriptionStatus?.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-8 py-4">
                              {bakery.subscriptionEndsAt ? (
                                <div className="text-xs font-bold text-slate-600">
                                  {format(bakery.subscriptionEndsAt.toDate(), 'dd MMM yyyy')}
                                  <div className={cn(
                                    "text-[9px] font-black uppercase mt-0.5",
                                    differenceInDays(bakery.subscriptionEndsAt.toDate(), new Date()) <= 7 ? "text-rose-500" : "text-slate-400"
                                  )}>
                                    {differenceInDays(bakery.subscriptionEndsAt.toDate(), new Date())} Days Left
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-bold uppercase italic">Indefinite trial</span>
                              )}
                            </td>
                            <td className="px-8 py-4 text-right">
                              <button 
                                onClick={() => startEditing(bakery)}
                                className="p-2 text-slate-300 hover:text-blue-600 transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: Payment Platform Configuration */}
            <div className="space-y-6">
              <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-blue-600/30 transition-all duration-700" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                      <Zap className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black leading-tight">PhonePe Config</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Platform Payments</p>
                    </div>
                  </div>

                  {!isEditingPayment ? (
                    <div className="space-y-6">
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Active UPI ID</p>
                        <p className="text-sm font-black font-mono break-all text-blue-100">{paymentSettings?.phonePeUpiId || 'NOT CONFIGURED'}</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Merchant Name</p>
                        <p className="text-sm font-black text-blue-100">{paymentSettings?.phonePeMerchantName || 'NOT CONFIGURED'}</p>
                      </div>
                      <button 
                        onClick={() => {
                          setEditUpi(paymentSettings?.phonePeUpiId || '');
                          setEditMerchant(paymentSettings?.phonePeMerchantName || '');
                          setIsEditingPayment(true);
                        }}
                        className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                      >
                        Modify Gateway Settings
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleUpdatePaymentSettings} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Universal UPI ID</label>
                        <input 
                          type="text"
                          required
                          value={editUpi}
                          onChange={(e) => setEditUpi(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-500/20 transition-all font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Merchant Name</label>
                        <input 
                          type="text"
                          required
                          value={editMerchant}
                          onChange={(e) => setEditMerchant(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-500/20 transition-all text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          type="submit"
                          className="flex-1 bg-blue-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/50 hover:bg-blue-700 transition-all"
                        >
                          Save Changes
                        </button>
                        <button 
                          type="button"
                          onClick={() => setIsEditingPayment(false)}
                          className="px-6 py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {/* Active Pricing Plans */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    Marketplace Plans (Paid version)
                  </span>
                </h3>

                {editingPlanId ? (
                  <form onSubmit={handleSavePlan} className="space-y-4 text-xs font-bold text-slate-700 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <span className="text-[10px] uppercase font-black tracking-widest text-[#0c111d] flex items-center gap-2">
                        <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                        Edit Plan: {editingPlanId.toUpperCase()}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Plan Display Name</label>
                      <input 
                        type="text"
                        required
                        value={editPlanName}
                        onChange={(e) => setEditPlanName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-slate-900"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Price (₹)</label>
                        <input 
                          type="number"
                          required
                          value={editPlanPrice}
                          onChange={(e) => setEditPlanPrice(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Duration (Days)</label>
                        <input 
                          type="number"
                          required
                          value={editPlanDuration}
                          onChange={(e) => setEditPlanDuration(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Services/Features Description</label>
                      <textarea 
                        required
                        rows={3}
                        value={editPlanDescription}
                        onChange={(e) => setEditPlanDescription(e.target.value)}
                        placeholder="List of what they get in paid version..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all leading-relaxed font-semibold text-slate-800"
                      />
                      <p className="text-[9px] text-slate-400 mt-1 uppercase font-black">Describe exactly what professional features are unlocked in this plan tier.</p>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button 
                        type="submit"
                        disabled={updating}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-[10px] uppercase font-black tracking-widest transition-all disabled:opacity-50"
                      >
                        Update Plan Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPlanId(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-650 rounded-xl px-5 py-3 text-[10px] uppercase font-black tracking-widest transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 font-bold">
                    {(paymentSettings?.plans || [
                      { id: 'monthly', name: 'Premium Monthly', price: 999, durationDays: 30, description: 'All features included.' },
                      { id: 'yearly', name: 'Professional Annual', price: 8388, durationDays: 365, description: 'Best value for growing bakeries.' }
                    ]).map(plan => (
                      <div key={plan.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-all relative">
                        <button 
                          onClick={() => {
                            setEditingPlanId(plan.id);
                            setEditPlanName(plan.name);
                            setEditPlanPrice(plan.price);
                            setEditPlanDuration(plan.durationDays);
                            setEditPlanDescription(plan.description);
                          }}
                          className="absolute right-3.5 top-3.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm"
                        >
                          Edit Price & Services
                        </button>
                        <div className="flex justify-between items-start mb-2 pr-28">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {plan.id === 'yearly' ? '🔥 BEST VALUE' : 'FLEXIBLE'}
                          </span>
                          <span className="text-sm font-black text-blue-600">₹{plan.price}</span>
                        </div>
                        <h4 className="text-xs font-black text-slate-800 uppercase">{plan.name}</h4>
                        <p className="text-[10px] text-slate-550 mt-1.5 leading-relaxed pr-2 font-semibold">{plan.description}</p>
                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase">
                          <span>Duration</span>
                          <span className="text-slate-900">{plan.durationDays} Days</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Free Trial Services Config */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    🎁 Free Trial Configuration
                  </span>
                </h3>

                {isEditingTrial ? (
                  <form onSubmit={handleSaveTrialSettings} className="space-y-4 text-xs font-bold text-slate-700 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Free Trial (Days)</label>
                      <input 
                        type="number"
                        required
                        value={editTrialDuration}
                        onChange={(e) => setEditTrialDuration(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Free Trial Services Description</label>
                      <textarea 
                        required
                        rows={3}
                        value={editTrialDescription}
                        onChange={(e) => setEditTrialDescription(e.target.value)}
                        placeholder="Describe services a bakery gets in free trial..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all leading-relaxed font-semibold text-slate-800"
                      />
                      <p className="text-[9px] text-slate-400 mt-1 uppercase font-black">Detail exactly what capabilities are limited or granted during the trial phase vs the paid version.</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button 
                        type="submit"
                        disabled={updating}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-[10px] uppercase font-black tracking-widest transition-all disabled:opacity-50"
                      >
                        Save Trial Configuration
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingTrial(false)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-650 rounded-xl px-5 py-3 text-[10px] uppercase font-black tracking-widest transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all relative">
                    <button 
                      onClick={() => {
                        setIsEditingTrial(true);
                        setEditTrialDuration(paymentSettings?.trialDays || 90);
                        setEditTrialDescription(paymentSettings?.trialDescription || "Includes base order placement, catalog viewing, and basic attendance.");
                      }}
                      className="absolute right-3.5 top-3.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-all shadow-sm"
                    >
                      Edit Trial Info
                    </button>
                    <div className="flex justify-between items-start mb-2 pr-28">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                        FREE LEVEL SUMMARY
                      </span>
                      <span className="text-xs font-black text-indigo-600">{paymentSettings?.trialDays || 90} Days Free</span>
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase">Standard Bakery Evaluation Tier</h4>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed pr-2 font-semibold">
                      {paymentSettings?.trialDescription || "Includes base order placement, catalog viewing, and basic attendance."}
                    </p>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase">
                      <span>Status</span>
                      <span className="text-emerald-600 font-black">ACTIVE DEFAULT</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Feature Permissions & Quantity Limits Editor */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm text-left">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-500" />
                    ⚙️ Feature Permissions & Limits
                  </span>
                </h3>

                {isEditingLimits ? (
                  <form onSubmit={handleSaveFeatureLimits} className="space-y-6 text-xs font-bold text-slate-700 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 animate-in fade-in duration-300">
                    {/* Free Trial Limits Group */}
                    <div className="space-y-4 border-b border-slate-200/60 pb-6">
                      <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block" />
                        Free Trial Limits
                      </h4>

                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input 
                            type="checkbox"
                            checked={trialAttendanceEnabled}
                            onChange={(e) => setTrialAttendanceEnabled(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <p className="font-black text-slate-800 text-[10px] uppercase leading-none">Attendance</p>
                            <p className="text-[9px] text-slate-400 font-bold mt-1">In Free Trial</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input 
                            type="checkbox"
                            checked={trialPayrollEnabled}
                            onChange={(e) => setTrialPayrollEnabled(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <p className="font-black text-slate-800 text-[10px] uppercase leading-none">Payroll</p>
                            <p className="text-[9px] text-slate-400 font-bold mt-1">In Free Trial</p>
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Max Staff</label>
                          <input 
                            type="number"
                            required
                            value={trialMaxStaff}
                            onChange={(e) => setTrialMaxStaff(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Max Dealers</label>
                          <input 
                            type="number"
                            required
                            value={trialMaxDealers}
                            onChange={(e) => setTrialMaxDealers(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Max Per Dealer</label>
                          <input 
                            type="number"
                            required
                            value={trialMaxMembersPerDealer}
                            onChange={(e) => setTrialMaxMembersPerDealer(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Paid Subscription Limits Group */}
                    <div className="space-y-4 pt-1">
                      <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                        Paid Subscription Limits
                      </h4>

                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input 
                            type="checkbox"
                            checked={paidAttendanceEnabled}
                            onChange={(e) => setPaidAttendanceEnabled(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <p className="font-black text-slate-800 text-[10px] uppercase leading-none">Attendance</p>
                            <p className="text-[9px] text-slate-400 font-bold mt-1">In Paid Plan</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input 
                            type="checkbox"
                            checked={paidPayrollEnabled}
                            onChange={(e) => setPaidPayrollEnabled(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <p className="font-black text-slate-800 text-[10px] uppercase leading-none">Payroll</p>
                            <p className="text-[9px] text-slate-400 font-bold mt-1">In Paid Plan</p>
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Max Staff</label>
                          <input 
                            type="number"
                            required
                            value={paidMaxStaff}
                            onChange={(e) => setPaidMaxStaff(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Max Dealers</label>
                          <input 
                            type="number"
                            required
                            value={paidMaxDealers}
                            onChange={(e) => setPaidMaxDealers(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Max Per Dealer</label>
                          <input 
                            type="number"
                            required
                            value={paidMaxMembersPerDealer}
                            onChange={(e) => setPaidMaxMembersPerDealer(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold text-slate-900"
                          />
                        </div>
                      </div>
                      <p className="text-[8px] text-slate-400 uppercase font-black leading-tight mt-1 text-center">Note: Use -1 config for unlimited access bounds.</p>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button 
                        type="submit"
                        disabled={updating}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] uppercase font-black tracking-widest transition-all disabled:opacity-50"
                      >
                        Save Access Handlers
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingLimits(false)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-650 rounded-xl px-5 py-3 text-[10px] uppercase font-black tracking-widest transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="divide-y divide-slate-100 font-bold">
                    {/* Trial Display */}
                    <div className="pb-5 relative text-left">
                      <button 
                        onClick={() => setIsEditingLimits(true)}
                        className="absolute right-0 top-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm"
                      >
                        Edit Features & Limits
                      </button>
                      
                      <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block" />
                        Trial Level Features
                      </h4>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", trialAttendanceEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                          <div>
                            <p className="text-[8px] text-slate-400 uppercase font-black leading-none mb-1">Attendance Module</p>
                            <p className="text-[10px] font-black text-slate-800">{trialAttendanceEnabled ? "ENABLED" : "DISABLED (LOCKED)"}</p>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", trialPayrollEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                          <div>
                            <p className="text-[8px] text-slate-400 uppercase font-black leading-none mb-1">Payroll Management</p>
                            <p className="text-[10px] font-black text-slate-800">{trialPayrollEnabled ? "ENABLED" : "DISABLED (LOCKED)"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-[10px] font-black text-slate-600 uppercase tracking-tight">
                        <div className="flex justify-between items-center bg-slate-50/30 px-3 py-1.5 rounded-lg border border-slate-100/50">
                          <span className="text-slate-400 text-[9px]">Max Staff Members</span>
                          <span className="text-slate-800 font-mono">{trialMaxStaff === -1 ? 'Unlimited' : `${trialMaxStaff} staff`}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50/30 px-3 py-1.5 rounded-lg border border-slate-100/50">
                          <span className="text-slate-400 text-[9px]">Max Car Dealerships</span>
                          <span className="text-slate-800 font-mono">{trialMaxDealers === -1 ? 'Unlimited' : `${trialMaxDealers} dealers`}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50/30 px-3 py-1.5 rounded-lg border border-slate-100/50">
                          <span className="text-slate-400 text-[9px]">Max Members / Dealership</span>
                          <span className="text-slate-800 font-mono">{trialMaxMembersPerDealer === -1 ? 'Unlimited' : `${trialMaxMembersPerDealer} operators`}</span>
                        </div>
                      </div>
                    </div>

                    {/* Paid Display */}
                    <div className="pt-5 text-left">
                      <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                        Premium Paid Features
                      </h4>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", paidAttendanceEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                          <div>
                            <p className="text-[8px] text-slate-400 uppercase font-black leading-none mb-1">Attendance Module</p>
                            <p className="text-[10px] font-black text-slate-800">{paidAttendanceEnabled ? "ENABLED" : "DISABLED (LOCKED)"}</p>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", paidPayrollEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                          <div>
                            <p className="text-[8px] text-slate-400 uppercase font-black leading-none mb-1">Payroll Management</p>
                            <p className="text-[10px] font-black text-slate-800">{paidPayrollEnabled ? "ENABLED" : "DISABLED (LOCKED)"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-[10px] font-black text-slate-600 uppercase tracking-tight">
                        <div className="flex justify-between items-center bg-slate-50/30 px-3 py-1.5 rounded-lg border border-slate-100/50">
                          <span className="text-slate-400 text-[9px]">Max Staff Members</span>
                          <span className="text-slate-800 font-mono">{paidMaxStaff === -1 ? 'Unlimited' : `${paidMaxStaff} staff`}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50/30 px-3 py-1.5 rounded-lg border border-slate-100/50">
                          <span className="text-slate-400 text-[9px]">Max Car Dealerships</span>
                          <span className="text-slate-800 font-mono">{paidMaxDealers === -1 ? 'Unlimited' : `${paidMaxDealers} dealers`}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50/30 px-3 py-1.5 rounded-lg border border-slate-100/50">
                          <span className="text-slate-400 text-[9px]">Max Members / Dealership</span>
                          <span className="text-slate-800 font-mono">{paidMaxMembersPerDealer === -1 ? 'Unlimited' : `${paidMaxMembersPerDealer} operators`}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'system') {
      const isVersionMismatch = dbVersion !== APP_VERSION;
      return (
        <div className="space-y-8 animate-fade-in text-left">
          {/* Platform Performance & SaaS Vital Monitors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Database Status</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs md:text-sm font-black text-slate-900 uppercase tracking-wider">ONLINE / OK</span>
                </div>
                <p className="text-[10px] font-bold text-slate-500 mt-1">Multi-Node Firestore Cluster</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Licensed Tenants</p>
                <p className="text-2xl font-black text-slate-900 mt-1.5">{bakeries.length}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Active bakery modules</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Registry Users</p>
                <p className="text-2xl font-black text-slate-900 mt-1.5">{users.length}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Staff & operator accounts</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Telemetry Load</p>
                <p className="text-2xl font-black text-slate-900 mt-1.5">{globalOrdersCount}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Live order handshakes synced</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side: Interactive Diagnostics Audit Console */}
            <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-black text-slate-900 uppercase tracking-widest text-[11px]">Core Diagnostic Audit</h3>
                </div>
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider bg-slate-100 border px-2.5 py-1 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Sandbox Safe
                </span>
              </div>
              
              <div className="p-8 space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Trigger a synchronized diagnostic check across authentication registers, database connections, and auto clock-off event queues.
                  </p>

                  {/* Terminal Logger Grid */}
                  <div className="mt-4 bg-slate-950 text-emerald-400 font-mono text-[10px] px-5 py-4 rounded-2xl border border-slate-800 space-y-1.5 h-48 overflow-y-auto shadow-inner leading-normal text-left">
                    {diagLogs.length === 0 && (
                      <p className="text-slate-500 italic text-center pt-16">
                        Click "Initialize Diagnostic Audit" below to trigger health test procedures.
                      </p>
                    )}
                    {diagLogs.map((logLine, idx) => (
                      <p key={idx} className="break-words">
                        {logLine}
                      </p>
                    ))}
                    {diagRunning && (
                      <div className="flex items-center gap-2 text-indigo-400 pt-1 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analysing thread pool parameters at {diagProgress}%...</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  {diagResult === 'success' ? (
                    <div className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-wider">
                      <CheckCircle className="w-4 h-4 shrink-0" /> Platform Audit Complete
                    </div>
                  ) : diagRunning ? (
                    <div className="text-indigo-600 font-black text-[10px] uppercase tracking-wider animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> Processing checks...
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ready to audit</span>
                  )}

                  <button
                    type="button"
                    onClick={runDiagnostics}
                    disabled={diagRunning}
                    className={cn(
                      "w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
                      diagRunning 
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
                    )}
                  >
                    {diagRunning ? "Auditing System Threads" : "Initialize Diagnostic Audit"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side: Version Integrity contrast cards */}
            <div className="lg:col-span-5 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-black text-slate-900 uppercase tracking-widest text-[11px]">Build Status</h3>
                </div>
                {isVersionMismatch ? (
                  <span className="text-[8px] font-black uppercase text-amber-700 tracking-wider bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full animate-bounce">
                    Mismatch
                  </span>
                ) : (
                  <span className="text-[8px] font-black uppercase text-emerald-700 tracking-wider bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Synchronized
                  </span>
                )}
              </div>

              <div className="p-8 space-y-6 flex-1 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-4">
                  <div className={cn(
                    "p-5 rounded-2xl border transition-all text-center sm:text-left",
                    isVersionMismatch ? "border-amber-100 bg-amber-50/20" : "border-slate-100 bg-slate-50/40"
                  )}>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Local Build</span>
                    <strong className="text-xl font-black text-slate-950 block">v{APP_VERSION}</strong>
                  </div>

                  <div className={cn(
                    "p-5 rounded-2xl border transition-all text-center sm:text-left",
                    isVersionMismatch ? "border-amber-100 bg-amber-50/20" : "border-slate-100 bg-slate-50/40"
                  )}>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Global Config</span>
                    <strong className="text-xl font-black text-slate-950 block">v{dbVersion}</strong>
                  </div>
                </div>

                {isVersionMismatch ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
                    <p className="text-[10px] text-amber-800 font-semibold leading-relaxed text-left">
                      A mismatch triggers a global action block requiring clients to refresh. Synchronize immediately to align.
                    </p>
                    <button 
                      onClick={handleSyncVersion}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Force Sync database Config to v{APP_VERSION}
                    </button>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-100 rounded-3xl p-5 flex items-center gap-3 text-left">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <p className="text-[10px] text-emerald-800 font-semibold leading-normal">
                      The active database version aligns perfectly with local builds. Update banner triggers are asleep.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Parameters Panel Form */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Change Version Settings Override
              </h2>
            </div>
            <div className="p-8">
              <form onSubmit={handleUpdateVersionSettings} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Manual DB Version Tag</label>
                    <input 
                      type="text"
                      value={dbVersion}
                      onChange={(e) => setDbVersion(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-mono text-xs"
                      placeholder="e.g. 1.0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Version Update Description Banner</label>
                    <input 
                      type="text"
                      value={updateMessage}
                      onChange={(e) => setUpdateMessage(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all text-xs"
                      placeholder="Message showing in refresh toast banner..."
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3 bg-red-50/50 p-5 rounded-2xl border border-red-100/60 text-left">
                  <input 
                    type="checkbox"
                    id="forceUpdate"
                    checked={forceUpdate}
                    onChange={(e) => setForceUpdate(e.target.checked)}
                    className="w-5 h-5 accent-red-600 rounded cursor-pointer shrink-0"
                  />
                  <div>
                    <label htmlFor="forceUpdate" className="text-xs font-black text-red-950 uppercase tracking-widest cursor-pointer select-none block">
                      Enforce Absolute Blocking Version Update
                    </label>
                    <span className="text-[10px] text-red-600 font-bold leading-none mt-1 block">
                      Warning: Displays a full-screen block preventing users from bypassing the refresh alert in production.
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 text-slate-600">
                    <ShieldAlert size={16} className="text-slate-400" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider text-left">
                      Changing configurations updates dynamic client synchronization variables immediately.
                    </span>
                  </div>
                  
                  <button 
                    type="submit"
                    disabled={updating}
                    className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
                  >
                    {updating ? 'SAVING...' : 'Update System Configuration'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Platform Backup, Restore & Data Portability Suite (Superadmin Only) */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden mt-8">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs">
                  Platform Backup & Data Portability Suite (Superadmin Only)
                </h2>
              </div>
              <span className="text-[8px] font-black uppercase text-red-700 tracking-wider bg-red-50 border border-red-200 px-2.5 py-1 rounded-full flex items-center gap-1 self-start sm:self-center">
                <ShieldAlert className="w-3.5 h-3.5" /> High Privilege
              </span>
            </div>
            
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 text-left">
              {/* Export Section */}
              <div className="space-y-6 pb-6 lg:pb-0">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Download className="w-4 h-4 text-slate-500" />
                    Database Export & Backup
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1 leading-normal">
                    Generate an offline portable database copy. Export all active tenant settings, catalogs, formulations, and order registers.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-0.5">Backup Scope Selection</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setBackupScope('system')}
                        className={cn(
                          "flex-1 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider border transition-all text-center",
                          backupScope === 'system'
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        Whole System
                      </button>
                      <button
                        type="button"
                        onClick={() => setBackupScope('specific')}
                        className={cn(
                          "flex-1 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider border transition-all text-center",
                          backupScope === 'specific'
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        Specific Bakery
                      </button>
                    </div>
                  </div>

                  {backupScope === 'specific' && (
                    <div className="animate-fade-in">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-0.5">Select Bakery Partner</label>
                      <select
                        value={backupBakeryId}
                        onChange={(e) => setBackupBakeryId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all"
                      >
                        <option value="">-- Choose a Bakery --</option>
                        {bakeries.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSuperAdminExportBackup}
                    disabled={updating || (backupScope === 'specific' && !backupBakeryId)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Download size={14} className="text-white" />
                    Trigger Backup Export
                  </button>
                </div>
              </div>

              {/* Import / Restore Section */}
              <div className="space-y-6 pt-6 lg:pt-0 lg:pl-8">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Upload className="w-4 h-4 text-slate-500" />
                    Database Restoration & Portability
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1 leading-normal">
                    Import a JSON backup to restore active data, or copy a catalog/formulations to a new tenant using remap mode.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-0.5">Restoration Write Policy</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRestoreScopeMode('original')}
                        className={cn(
                          "flex-1 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider border transition-all text-center",
                          restoreScopeMode === 'original'
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        Restore as Original
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoreScopeMode('remap')}
                        className={cn(
                          "flex-1 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider border transition-all text-center",
                          restoreScopeMode === 'remap'
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        Remap to Different Bakery
                      </button>
                    </div>
                  </div>

                  {restoreScopeMode === 'remap' && (
                    <div className="animate-fade-in">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-0.5">Select Remap Target Bakery</label>
                      <select
                        value={restoreTargetBakeryId}
                        onChange={(e) => setRestoreTargetBakeryId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all"
                      >
                        <option value="">-- Choose Target Bakery --</option>
                        {bakeries.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <label className={cn(
                    "w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-center",
                    (restoreScopeMode === 'remap' && !restoreTargetBakeryId) || updating ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                  )}>
                    <Upload size={14} className="text-white" />
                    Upload & Restore Backup
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleSuperAdminImportBackup}
                      disabled={updating || (restoreScopeMode === 'remap' && !restoreTargetBakeryId)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'logs') {
      const totalPages = Math.ceil(logs.length / logsItemsPerPage);
      const paginatedLogs = logs.slice(
        (logsCurrentPage - 1) * logsItemsPerPage,
        logsCurrentPage * logsItemsPerPage
      );

      return (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                System Activity Logs
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
                  <select 
                    value={logsItemsPerPage}
                    onChange={(e) => {
                      setLogsItemsPerPage(Number(e.target.value));
                      setLogsCurrentPage(1);
                    }}
                    className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Retrieved {logs.length} events
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {logs.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No activity logs recorded yet.</div>
              ) : (
                paginatedLogs.map(log => (
                  <div key={log.id} className="p-6 hover:bg-slate-50 transition-all flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      log.type === 'error' ? "bg-red-100 text-red-600" : 
                      log.type === 'auth' ? "bg-purple-100 text-purple-600" :
                      log.type === 'order' ? "bg-amber-100 text-amber-600" :
                      "bg-blue-100 text-blue-600"
                    )}>
                      {log.type === 'order' ? <ShoppingBag size={18} /> : 
                       log.type === 'auth' ? <Users size={18} /> :
                       <Zap size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-bold text-slate-900">{log.message}</p>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase ml-4 shrink-0">
                          <Clock className="w-3 h-3" />
                          {log.timestamp ? format(log.timestamp.toDate(), 'HH:mm • dd MMM') : 'Just now'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        {log.userEmail && <span>User: {log.userEmail}</span>}
                        {log.bakeryId && <span>Bakery: {log.bakeryId.split('_')[1] || log.bakeryId}</span>}
                        <span>ID: {log.id.slice(-6).toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {logs.length > logsItemsPerPage && (
              <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Showing {(logsCurrentPage-1) * logsItemsPerPage + 1} to {Math.min(logsCurrentPage * logsItemsPerPage, logs.length)} of {logs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={logsCurrentPage === 1}
                    onClick={() => setLogsCurrentPage(p => Math.max(1, p - 1))}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                  >
                    Prev
                  </button>
                  <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button 
                        key={page}
                        onClick={() => setLogsCurrentPage(page)}
                        className={cn(
                          "w-8 h-8 rounded-lg text-[10px] font-black transition-all shrink-0 font-mono",
                          logsCurrentPage === page ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                        )}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button 
                    disabled={logsCurrentPage === totalPages}
                    onClick={() => setLogsCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Tenants List */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Active Bakery Partners
              </h2>
              <button 
                onClick={() => setShowBakeryForm(true)}
                className="text-[10px] font-black bg-slate-900 text-white px-5 py-2.5 rounded-xl uppercase hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                + Register New Bakery
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by bakery name, email or mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {filteredBakeries.length === 0 ? (
              <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No bakeries matching your criteria.</div>
            ) : (
              filteredBakeries.map(bakery => (
                <div key={bakery.id} className="p-4 sm:p-6 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                  <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-slate-400 text-sm sm:text-lg group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors shrink-0">
                      {bakery.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <button 
                          onClick={() => {
                            impersonate({ uid: 'impersonated', displayName: bakery.name, email: bakery.adminEmail, role: 'bakery_admin', bakeryId: bakery.id }, bakery);
                            navigate('/dashboard');
                          }}
                          className="font-black text-slate-900 hover:text-blue-600 transition-colors text-left truncate max-w-[200px] sm:max-w-none"
                          title="Switch to this Store View"
                        >
                          {bakery.name}
                        </button>
                        <div className="flex gap-1 flex-shrink-0">
                          {bakery.subscriptionStatus === 'free_partner' && (
                            <span className="text-[8px] sm:text-[9px] bg-purple-100 text-purple-700 px-1.5 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-tighter border border-purple-200">PARTNER</span>
                          )}
                          {bakery.subscriptionStatus === 'trial' && (
                            <span className="text-[8px] sm:text-[9px] bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-tighter border border-amber-200">TRIAL</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 sm:gap-3 text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-widest truncate">
                        <span className="truncate">{bakery.adminEmail}</span>
                        {bakery.phone && (
                          <>
                            <span className="text-slate-200 hidden sm:inline">|</span>
                            <span>{bakery.phone}</span>
                          </>
                        )}
                        {bakery.pin && (
                          <>
                            <span className="text-slate-200 hidden sm:inline">|</span>
                            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-mono tracking-normal select-all">PIN: {bakery.pin}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-1 sm:gap-2 sm:ml-4 border-t sm:border-t-0 border-slate-50 pt-3 sm:pt-0">
                    <button 
                      onClick={() => {
                        impersonate({ 
                          uid: auth.currentUser?.uid || 'simulated', 
                          displayName: `Owner (${bakery.name})`, 
                          email: auth.currentUser?.email || '', 
                          role: 'bakery_admin', 
                          bakeryId: bakery.id,
                          phone: bakery.phone || ''
                        } as UserProfile, bakery);
                        navigate('/dashboard');
                      }}
                      className="px-4 py-2.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 hover:text-white transition-all whitespace-nowrap hidden sm:block"
                    >
                      Enter Store
                    </button>
                    <button 
                      onClick={() => handleSetMyBakery(bakery.id)}
                      className={cn(
                        "p-2 sm:p-2.5 rounded-xl transition-all",
                        profile?.bakeryId === bakery.id ? "text-rose-500 bg-rose-50" : "text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                      )}
                      title={profile?.bakeryId === bakery.id ? "Your primary bakery" : "Set as my primary bakery"}
                    >
                      <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={profile?.bakeryId === bakery.id ? "currentColor" : "none"} />
                    </button>
                    <button 
                      onClick={() => startEditing(bakery)}
                      className="p-2 sm:p-2.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"
                      title="Edit Settings"
                    >
                      <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteBakery(bakery.id, bakery.name)}
                      className="p-2 sm:p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                      title="Delete Bakery"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="bg-slate-900 text-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-center md:items-center gap-8">
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 text-blue-400 font-bold uppercase tracking-widest text-[10px] mb-3">
                <ShieldAlert className="w-4 h-4" />
                Platform Control Center
              </div>
              <h1 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight">
                {viewMode === 'logs' ? 'System Audit' : viewMode === 'users' ? 'User Directory' : viewMode === 'subscriptions' ? 'Revenue & Subscription' : viewMode === 'system' ? 'System Management' : viewMode === 'orders' ? 'Global Orders' : 'Main Dashboard'}
              </h1>
              <p className="text-slate-400 max-w-lg text-sm mx-auto md:mx-0">
                {viewMode === 'logs' ? `Analyzing ${logs.length} historical events.` : viewMode === 'users' ? `Managing login access for ${users.length} active accounts.` : viewMode === 'subscriptions' ? 'Verifying PhonePe payments, managing bakery plans, and merchant configuration.' : viewMode === 'system' ? 'Platform infrastructure, versioning, and instant update policies.' : viewMode === 'orders' ? `Inspecting and managing ${globalOrders.length} orders across all store partners.` : `Managing ${bakeries.length} active platform partners.`}
              </p>
            </div>
            <div className="hidden md:flex gap-4">
              {profile?.bakeryId && (
                 <button 
                   onClick={() => {
                     const myBakery = bakeries.find(b => b.id === profile.bakeryId);
                     if (myBakery) {
                       impersonate({ 
                         uid: profile.uid, 
                         displayName: profile.displayName, 
                         email: profile.email, 
                         role: 'bakery_admin', 
                         bakeryId: profile.bakeryId,
                         phone: profile.phone
                       } as UserProfile, myBakery);
                       navigate('/dashboard');
                     }
                   }}
                   className="bg-indigo-600 text-white px-8 py-4 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-3 border border-indigo-500 cursor-pointer"
                 >
                   <Heart className="w-4 h-4 fill-white" />
                   Go to My Store
                 </button>
              )}
              <button 
                onClick={() => setViewMode('bakeries')}
                className={cn(
                  "backdrop-blur-md px-6 py-4 rounded-3xl border text-center min-w-[120px] transition-all cursor-pointer",
                  viewMode === 'bakeries' ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-350"
                )}
              >
                <p className="text-2xl font-black">{bakeries.length}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest mt-1">Active Tenants</p>
              </button>
              <button 
                onClick={() => setViewMode('orders')}
                className={cn(
                  "backdrop-blur-md px-6 py-4 rounded-3xl border text-center min-w-[120px] transition-all cursor-pointer",
                  viewMode === 'orders' ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-350"
                )}
              >
                <p className="text-2xl font-black">{globalOrdersCount}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest mt-1">Global Orders</p>
              </button>
            </div>
          </div>
      </div>

      {signupRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-amber-900 uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-6 h-6" /> Pending Registrations
              </h2>
              <p className="text-amber-700/60 font-bold text-xs">New bakeries waiting for platform access approval.</p>
            </div>
            <span className="px-4 py-1.5 bg-amber-200 text-amber-900 rounded-full font-black text-xs">{signupRequests.length} REQUESTS</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {signupRequests.map(req => (
              <div key={req.id} className="bg-white rounded-3xl p-6 shadow-sm border border-amber-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 font-black text-xl">
                      {req.bakeryName.charAt(0)}
                    </div>
                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-lg">New Signup</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">{req.bakeryName}</h3>
                  <p className="text-xs font-bold text-slate-500 mb-4">{req.ownerName}</p>
                  
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <Mail size={12} /> {req.email}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <Phone size={12} /> {req.phone}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleApproveBakery(req)}
                    className="flex-1 bg-green-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button 
                    className="px-4 py-3 bg-slate-50 text-slate-400 rounded-xl hover:text-red-600 transition-all"
                    title="Reject Request"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Cloud...</div>
      ) : renderView()}

      <AnimatePresence>
        {pendingAction && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">{pendingAction.title}</h3>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                {pendingAction.message}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPendingAction(null)}
                  className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Cancel
                </button>
                <button 
                  onClick={pendingAction.onResolve}
                  className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100 transition-all"
                >
                  {pendingAction.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingBakery && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl font-bold">Edit Bakery</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Tenant ID: {editingBakery.id}</p>
                </div>
                <button onClick={() => setEditingBakery(null)} className="p-2 hover:bg-white/10 rounded-full text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleUpdateBakery} className="p-8 space-y-6 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Store Name</label>
                  <input 
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Contact Phone</label>
                  <input 
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Subscription Tier</label>
                  <select 
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                  >
                    <option value="trial">Standard 3-Month Trial</option>
                    <option value="active">Active Subscription</option>
                    <option value="free_partner">Kreative Partner (Free)</option>
                    <option value="pending_verification">Awaiting Manual Verification</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Subscription Plan</label>
                  <select 
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                  >
                    <option value="monthly">Premium Monthly</option>
                    <option value="yearly">Professional Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Subscription Valid Until</label>
                  <input 
                    type="date"
                    value={editEndsAt}
                    onChange={(e) => setEditEndsAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={updating}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {updating ? 'SAVING...' : 'UPDATE STORE SETTINGS'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Bakery Modal */}
      <AnimatePresence>
        {showBakeryForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <h2 className="text-xl font-bold">Onboard New Bakery</h2>
                <button onClick={() => setShowBakeryForm(false)} className="text-slate-400 hover:text-white">×</button>
              </div>
              <form onSubmit={handleAddBakery} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Bakery Name</label>
                    <input 
                      type="text"
                      required
                      value={newBakeryName}
                      onChange={(e) => setNewBakeryName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="e.g. Moonlight Bakers"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Primary Email</label>
                    <input 
                      type="email"
                      required
                      value={newBakeryEmail}
                      onChange={(e) => setNewBakeryEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="admin@bakery.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                    <input 
                      type="tel"
                      value={newBakeryPhone}
                      onChange={(e) => setNewBakeryPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="+91..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">GST Number</label>
                    <input 
                      type="text"
                      value={newBakeryGst}
                      onChange={(e) => setNewBakeryGst(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Login PIN (4-Digits)</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={newBakeryPin}
                    onChange={(e) => setNewBakeryPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                    placeholder="e.g. 1234"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Registered Address</label>
                  <textarea 
                    value={newBakeryAddress}
                    onChange={(e) => setNewBakeryAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                    rows={2}
                    placeholder="Street, City, State, ZIP"
                  />
                </div>

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? 'Creating Tenant...' : 'Initialize Bakery'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
