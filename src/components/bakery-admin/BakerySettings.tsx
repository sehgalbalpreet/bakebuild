import React, { useState, useEffect } from 'react';
import { collection, query, where, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { createLog } from '../../services/logService';
import { Bakery, Order, OperationType } from '../../types';
import { SOUND_PATHS } from '../../constants';
import { APP_VERSION } from '../../version';
import { exportOrdersToExcel } from '../../lib/exportUtils';
import { cn } from '../../lib/utils';
import { 
  Settings, Zap, CheckCircle2, ExternalLink, ShieldAlert, FileText, Database, Volume2, MapPin, Navigation, Locate, Bell, Upload, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';

interface BakerySettingsProps {
  bakery: Bakery | null;
}

export const BakerySettings: React.FC<BakerySettingsProps> = ({ bakery }) => {
  const [updating, setUpdating] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const [pushEnabled, setPushEnabled] = useState(() => {
    const saved = localStorage.getItem('bakesync_push_enabled');
    return saved === null ? true : saved === 'true';
  });

  const [pwaEnabled, setPwaEnabled] = useState(() => {
    const saved = localStorage.getItem('bakesync_pwa_enabled');
    return saved === null ? true : saved === 'true';
  });

  const handleTogglePush = async (val: boolean) => {
    localStorage.setItem('bakesync_push_enabled', String(val));
    setPushEnabled(val);
    if (val && typeof Notification !== 'undefined') {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
    }
  };

  const handleTogglePwa = async (val: boolean) => {
    localStorage.setItem('bakesync_pwa_enabled', String(val));
    setPwaEnabled(val);
    if (!val) {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
        console.log("PWA Service Worker unregistered because user disabled PWA.");
      }
    } else {
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js');
          console.log("PWA Service Worker registered.");
        } catch (err) {
          console.error("Error registering SW", err);
        }
      }
    }
  };

  const [googleReviewLink, setGoogleReviewLink] = useState(bakery?.settings?.googleReviewLink || '');
  const [whatsappNumber, setWhatsappNumber] = useState(bakery?.settings?.whatsappNumber || bakery?.phone || '');

  const [geoEnabled, setGeoEnabled] = useState(bakery?.attendanceSettings?.enabled ?? false);
  const [geoLat, setGeoLat] = useState(bakery?.attendanceSettings?.latitude ?? 0);
  const [geoLng, setGeoLng] = useState(bakery?.attendanceSettings?.longitude ?? 0);
  const [geoRadius, setGeoRadius] = useState(bakery?.attendanceSettings?.radius ?? 20);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop notifications");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    
    if (permission === 'granted') {
      new Notification("Kreative Chocolates", {
        body: "Success! You will now receive alerts for new orders.",
        icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
      });
    }
  };

  // Action State for Modal
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onResolve: () => void;
  } | null>(null);

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void) => {
    setPendingAction({ title, message, confirmText, onResolve });
  };

  const [notifs, setNotifs] = useState({
    newOrderSound: bakery?.notificationSettings?.newOrderSound || SOUND_PATHS.PENDING,
    readySound: bakery?.notificationSettings?.readySound || SOUND_PATHS.READY,
    sentSound: bakery?.notificationSettings?.sentSound || SOUND_PATHS.SENT
  });

  // Sync state if bakery settings load later
  useEffect(() => {
    if (bakery?.notificationSettings) {
      setNotifs({
        newOrderSound: bakery.notificationSettings.newOrderSound || SOUND_PATHS.PENDING,
        readySound: bakery.notificationSettings.readySound || SOUND_PATHS.READY,
        sentSound: bakery.notificationSettings.sentSound || SOUND_PATHS.SENT
      });
    }
    if (bakery?.attendanceSettings) {
      setGeoEnabled(bakery.attendanceSettings.enabled ?? false);
      setGeoLat(bakery.attendanceSettings.latitude ?? 0);
      setGeoLng(bakery.attendanceSettings.longitude ?? 0);
      setGeoRadius(bakery.attendanceSettings.radius ?? 20);
    }
    if (bakery?.settings) {
      if (bakery.settings.googleReviewLink !== undefined) setGoogleReviewLink(bakery.settings.googleReviewLink || '');
      if (bakery.settings.whatsappNumber !== undefined) setWhatsappNumber(bakery.settings.whatsappNumber || bakery.phone || '');
    }
  }, [bakery]);

  const updateSettings = async () => {
    if (!bakery?.id) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'bakeries', bakery.id), {
        settings: {
          ...(bakery.settings || {}),
          googleReviewLink: googleReviewLink.trim(),
          whatsappNumber: whatsappNumber.trim()
        },
        notificationSettings: notifs,
        attendanceSettings: {
          enabled: geoEnabled,
          latitude: Number(geoLat),
          longitude: Number(geoLng),
          radius: Number(geoRadius)
        }
      });
      alert('Settings Saved');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bakeries/${bakery.id}`);
    } finally {
      setUpdating(false);
    }
  };

  const soundOptions = [
    { name: 'Standard Alert', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
    { name: 'Success Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3' },
    { name: 'Ding Dong (Classic)', url: 'https://assets.mixkit.co/active_storage/sfx/585/585-preview.mp3' },
    { name: 'Doorbell (Double)', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3' },
    { name: 'Technical', url: 'https://assets.mixkit.co/active_storage/sfx/1484/1484-preview.mp3' }
  ];

  const handleExportAll = async () => {
    if (!bakery?.id) return;
    setUpdating(true);
    try {
      const q = query(collection(db, 'orders'), where('bakeryId', '==', bakery.id));
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      exportOrdersToExcel(orders, bakery.name);
      await createLog('system', `Order History Exported: ${snapshot.size} records`, auth.currentUser?.uid, auth.currentUser?.email, bakery.id);
    } catch (err: any) {
      console.error('EXPORT FAILED:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const clearDemoOrders = async () => {
    if (!bakery?.id) return;
    
    confirmAction(
      'WIPE DATA: IRREVERSIBLE ACTION',
      "This will PERMANENTLY DELETE ALL ORDERS for this bakery. This is intended strictly for clearing test data before launch. Are you ABSOLUTELY sure?",
      'YES, WIPE ALL DATA',
      async () => {
        setUpdating(true);
        try {
          const q = query(collection(db, 'orders'), where('bakeryId', '==', bakery.id));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            alert("System Check: No orders found to clear.");
            return;
          }

          const docs = snapshot.docs;
          const chunks = [];
          for (let i = 0; i < docs.length; i += 500) {
            chunks.push(docs.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          await createLog('system', `Bulk Data Maintenance: ${snapshot.size} orders permanently cleared`, auth.currentUser?.uid, auth.currentUser?.email, bakery.id);
          alert(`Success: ${snapshot.size} demo orders have been removed.`);
        } catch (err: any) {
          handleFirestoreError(err, OperationType.DELETE, `orders(bulk)/${bakery.id}`);
        } finally {
          setUpdating(false);
          setPendingAction(null);
        }
      }
    );
  };


  return (
    <div className="max-w-4xl space-y-6">
      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShieldAlert className="w-8 h-8 text-rose-500" />
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
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100 transition-all text-xs"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-400 border-none" /> General Configuration
          </h2>
          <button 
            onClick={updateSettings} 
            disabled={updating}
            className="w-full sm:w-auto bg-slate-900 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 text-xs"
          >
            {updating ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bakery Name</label>
              <input readOnly value={bakery?.name || ''} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-bold text-slate-500 cursor-not-allowed text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Number</label>
              <input readOnly value={bakery?.phone || ''} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-bold text-slate-500 cursor-not-allowed text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Support WhatsApp Number (for Partners)</label>
              <input 
                value={whatsappNumber} 
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full bg-white border border-slate-200 p-4 rounded-2xl font-bold text-slate-900 text-xs focus:outline-none focus:border-slate-900" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Google Reviews Review URL</label>
              <input 
                value={googleReviewLink} 
                onChange={(e) => setGoogleReviewLink(e.target.value)}
                placeholder="https://g.page/r/..../review"
                className="w-full bg-white border border-slate-200 p-4 rounded-2xl font-bold text-slate-900 text-xs focus:outline-none focus:border-slate-900" 
              />
              <p className="text-[10px] text-slate-400 font-bold mt-1">4 & 5 star customer feedback ratings will automatically redirect customers to post reviews directly to Google.</p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-950 uppercase tracking-wide">Duty Geofencing</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Restrict clock-in to physical location</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={geoEnabled} 
                    onChange={e => setGeoEnabled(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {geoEnabled && (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 text-left">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bakery Coordinates</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          alert("Geolocation is not supported by your browser");
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setGeoLat(Number(pos.coords.latitude.toFixed(6)));
                            setGeoLng(Number(pos.coords.longitude.toFixed(6)));
                            alert(`Captured Location!\nLat: ${pos.coords.latitude.toFixed(6)}\nLng: ${pos.coords.longitude.toFixed(6)}`);
                          },
                          (err) => {
                            console.error(err);
                            alert("Failed to capture location automatically. Please enter coordinates manually.");
                          },
                          { enableHighAccuracy: true }
                        );
                      }}
                      className="bg-white border border-slate-200 hover:border-purple-500 hover:text-purple-600 text-slate-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 shrink-0"
                    >
                      <Locate size={10} className="text-purple-500" />
                      Pin Current GPS
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-left">Latitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        value={geoLat || ''} 
                        onChange={e => setGeoLat(Number(e.target.value))} 
                        className="w-full bg-white border border-slate-200 p-2 text-xs font-bold rounded-lg" 
                        placeholder="e.g. 30.7333"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-left">Longitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        value={geoLng || ''} 
                        onChange={e => setGeoLng(Number(e.target.value))} 
                        className="w-full bg-white border border-slate-200 p-2 text-xs font-bold rounded-lg" 
                        placeholder="e.g. 76.7794"
                      />
                    </div>
                  </div>

                  {/* Dynamic Google Maps Locator & Search */}
                  <div className="mt-1 overflow-hidden rounded-2xl border border-slate-200">
                    {(() => {
                      const MAPS_KEY = (process.env.GOOGLE_MAPS_PLATFORM_KEY || (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY || '');
                      if (MAPS_KEY) {
                        return (
                          <APIProvider apiKey={MAPS_KEY}>
                            <div style={{ width: '100%', height: '160px', position: 'relative' }}>
                              <Map
                                disableDefaultUI={false}
                                defaultZoom={15}
                                center={{ lat: geoLat || 30.7333, lng: geoLng || 76.7794 }}
                                onClick={(e: any) => {
                                  if (e.detail?.latLng) {
                                    const lat = Number(e.detail.latLng.lat.toFixed(6));
                                    const lng = Number(e.detail.latLng.lng.toFixed(6));
                                    setGeoLat(lat);
                                    setGeoLng(lng);
                                  }
                                }}
                                mapId="bf51a910020fa25a"
                                gestureHandling="greedy"
                                style={{ width: '100%', height: '100%' }}
                                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio'] as any}
                              >
                                {(geoLat !== 0 || geoLng !== 0) && (
                                  <AdvancedMarker 
                                    position={{ lat: geoLat, lng: geoLng }}
                                    title="Bakery Pin Location"
                                  />
                                )}
                              </Map>
                            </div>
                            <div className="p-2 bg-slate-100 text-[8px] font-bold text-slate-500 text-center uppercase tracking-wider border-t border-slate-200">
                              🗺️ Click anywhere on the map above to select and pinpoint the bakery boundary instantly!
                            </div>
                          </APIProvider>
                        );
                      } else {
                        return (
                          <div className="p-4 bg-slate-100 text-center space-y-2">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">🗺️ Interactive Google Map Locked</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase leading-relaxed">
                              To map selection: Add your API credential key as `GOOGLE_MAPS_PLATFORM_KEY` inside Settings.
                            </p>
                            <p className="text-[7px] text-purple-600 font-bold leading-normal">
                              (Settings ⚙️ → Secrets → Key: `GOOGLE_MAPS_PLATFORM_KEY` → Value: Your Google Maps API Key)
                            </p>
                          </div>
                        );
                      }
                    })()}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Allowed Radius (10 - 50 meters)</label>
                      <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">{geoRadius} Meters</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="50" 
                      value={geoRadius} 
                      onChange={e => setGeoRadius(Number(e.target.value))} 
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-[8px] font-black text-slate-300 mt-1 uppercase">
                      <span>10m (Tight)</span>
                      <span>30m</span>
                      <span>50m (Generous)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6 text-center sm:text-left">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Account Tier</h3>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border",
                  bakery?.subscriptionStatus === 'free_partner' ? "bg-purple-100 text-purple-700 border-purple-200" :
                  bakery?.subscriptionStatus === 'active' ? "bg-green-100 text-green-700 border-green-200" :
                  "bg-amber-100 text-amber-700 border-amber-200"
                )}>
                  {bakery?.subscriptionStatus?.replace('_', ' ') || 'TRIAL'}
                </span>
                {bakery?.subscriptionStatus === 'free_partner' && (
                  <p className="text-[9px] text-purple-600 font-bold italic">Official Partner Account - Lifetime Free Access</p>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-6 text-center sm:text-left">Production Sounds</h3>
              <div className="space-y-4">
                {([
                  { key: 'newOrderSound', label: 'New Order' },
                  { key: 'readySound', label: 'Order Ready' },
                  { key: 'sentSound', label: 'Dispatched' }
                ] as const).map((s) => (
                  <div key={s.key}>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 text-center sm:text-left">{s.label}</label>
                    <div className="flex gap-2">
                      <select 
                        value={notifs[s.key]} 
                        onChange={e => setNotifs({ ...notifs, [s.key]: e.target.value })}
                        className="flex-1 bg-white border border-blue-100 rounded-lg p-2 text-xs font-bold"
                      >
                        {soundOptions.map(opt => <option key={opt.url} value={opt.url}>{opt.name}</option>)}
                      </select>
                      <button 
                        onClick={() => {
                          if (notifs[s.key]) {
                            const a = new Audio(notifs[s.key]);
                            a.play().catch(e => console.warn('Preview blocked:', e));
                          }
                        }} 
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                        disabled={!notifs[s.key]}
                      >
                        <Volume2 className="w-4 h-4 border-none text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-900 text-white p-6 rounded-2xl text-center sm:text-left">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Service Status</h3>
              <div className="flex justify-center sm:justify-start items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> <span className="text-sm font-black text-white">ACTIVE & SYNCED</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center sm:text-left" id="push-pwa-settings">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
              <Zap size={24} className="text-indigo-600 border-none" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Push Notifications & PWA</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-normal">Configure browser and app background settings</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Push Notifications Toggle */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="max-w-md text-center sm:text-left">
              <h4 className="text-sm font-black text-slate-900 mb-1">Push Notifications</h4>
              <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                Receive real-time popups even when the tab is in the background. (Allowed by default)
              </p>
            </div>
            <button
              type="button"
              id="push-toggle-btn"
              onClick={() => handleTogglePush(!pushEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                pushEnabled ? "bg-indigo-600" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                  pushEnabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Browser Alert Permission Status if Push is Enabled */}
          {pushEnabled && (
            <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="max-w-md text-center sm:text-left">
                <h4 className="text-sm font-black text-slate-900 mb-1">Browser Alerts Permission</h4>
                <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                  Required by the browser to deliver push notifications.
                  <span className="block mt-2 font-bold text-indigo-600 italic">Current Browser State: {notifPermission.toUpperCase()}</span>
                </p>
              </div>
              
              {notifPermission !== 'granted' ? (
                <button 
                  onClick={requestNotificationPermission}
                  className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-xs"
                >
                  Allow Notifications
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest text-xs">
                  <CheckCircle2 size={16} />
                  Permission Granted
                </div>
              )}
            </div>
          )}

          {/* PWA Toggle */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="max-w-md text-center sm:text-left">
              <h4 className="text-sm font-black text-slate-900 mb-1">PWA (Progressive Web App)</h4>
              <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                Enable offline caching, fast background sync, and application loading from home screen. (Allowed by default)
              </p>
            </div>
            <button
              type="button"
              id="pwa-toggle-btn"
              onClick={() => handleTogglePwa(!pwaEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                pwaEnabled ? "bg-indigo-600" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                  pwaEnabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50 flex items-start gap-4 text-left">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
              <ExternalLink size={20} className="text-blue-600 border-none" />
            </div>
            <div>
              <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Mobile Background Tip</h4>
              <p className="text-[10px] font-medium text-blue-700 leading-relaxed">
                For the best experience on mobile, tap the <span className="font-bold underline">"Add to Home Screen"</span> or <span className="font-bold underline">"Install App"</span> option in your browser menu. This allows the system to prioritize background processes and notification delivery.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 p-8 rounded-3xl border border-red-100 mt-10">
        <div className="flex items-start gap-4 text-left">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <ShieldAlert size={24} className="text-rose-500 border-none" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-red-900 flex items-center gap-2 text-rose-900 font-black">
              Maintenance & Data Management
            </h2>
            <p className="text-sm font-bold text-red-700/70 mt-1 mb-6">
              Critical system actions. Use these features to prepare your environment for production.
            </p>
            
            <div className="bg-white/50 border border-red-200 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
                <div className="text-center sm:text-left">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Step 1: Backup Order History</h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">Download your current orders to Excel/CSV for your records.</p>
                </div>
                <button 
                  onClick={handleExportAll}
                  disabled={updating}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-xs font-black"
                >
                  <FileText size={14} className="text-white border-none" />
                  Export to Excel
                </button>
              </div>

              <div className="h-px bg-red-100" />

              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
                <div className="text-center sm:text-left">
                  <h3 className="text-sm font-black text-red-900 uppercase tracking-tight text-rose-900 font-black">Step 2: Clear Demo Orders</h3>
                  <p className="text-[11px] font-bold text-red-600/70 mt-1">Permanently remove all order history for this bakery after backup.</p>
                </div>
                <button 
                  onClick={clearDemoOrders}
                  disabled={updating}
                  className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-xs font-black"
                >
                  <Database size={14} className="text-white border-none" />
                  Wipe Order History
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col items-center">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Bakesync Business Suite</p>
        <p className="text-[10px] font-bold text-slate-400 mt-1">App Version: {APP_VERSION}</p>
      </div>
    </div>
  );
};
