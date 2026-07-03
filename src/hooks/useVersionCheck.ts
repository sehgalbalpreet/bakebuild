import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { APP_VERSION } from '../version';

export const useVersionCheck = (isSuperAdmin: boolean) => {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [bypassVersion, setBypassVersion] = useState<string | null>(() => {
    try {
      return localStorage.getItem('bakesync_bypass_version');
    } catch {
      return null;
    }
  });

  const dismissModalAndBypass = () => {
    if (appConfig?.currentVersion) {
      try {
        localStorage.setItem('bakesync_bypass_version', appConfig.currentVersion);
      } catch (e) {
        console.error(e);
      }
      setBypassVersion(appConfig.currentVersion);
      setShowUpdateModal(false);
    }
  };

  const isVersionNewer = (dbVer: string, localVer: string) => {
    if (!dbVer || !localVer) return false;
    const dbParts = dbVer.replace(/^v/, '').split('.').map(Number);
    const localParts = localVer.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(dbParts.length, localParts.length); i++) {
      const dbVal = dbParts[i] || 0;
      const localVal = localParts[i] || 0;
      if (dbVal > localVal) return true;
      if (dbVal < localVal) return false;
    }
    return false;
  };

  useEffect(() => {
    // Handle URL-based deep repair
    const params = new URLSearchParams(window.location.search);
    if (params.get('repair') === 'true' || params.get('force_upgrade') === 'true') {
      console.log("REPAIR MODE: Clearing all caches...");
      
      const executeRepair = async () => {
        try {
          localStorage.clear();
          sessionStorage.clear();

          // Clear Service Worker Caches
          if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => caches.delete(key)));
            console.log("Deleted all browser caches successfully.");
          }

          // Unregister all Service Workers
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
            console.log("Unregistered all service workers successfully.");
          }
        } catch (err) {
          console.error("Failed during deep cache/SW clear:", err);
        } finally {
          // Force a reload using a timestamp to completely bust browser-level HTTP cache for index.html/js
          const cleanPath = window.location.pathname;
          window.location.href = `${cleanPath}?b=${Date.now()}`;
        }
      };

      executeRepair();
      return;
    }

    if (isSuperAdmin) {
      setShowUpdateBanner(false);
      setShowUpdateModal(false);
      return;
    }

    const configRef = doc(db, 'appConfig', 'version');
    
    // Switch to real-time listener for "Instant Pushes"
    const unsub = onSnapshot(configRef, async (snap) => {
      if (snap.exists()) {
        const config = snap.data();
        setAppConfig(config);

        const needsUpdate = isVersionNewer(config.currentVersion, APP_VERSION);
        const isBypassed = bypassVersion === config.currentVersion;
        const isCritical = config.forceUpdate === true && needsUpdate && !isBypassed;

        if (isCritical) {
          setShowUpdateModal(true);
          setShowUpdateBanner(false);
          // Force clear some caches if critical
          localStorage.removeItem('bakesync_orders_cache');
          localStorage.removeItem('bakesync_version_status');
        } else if (needsUpdate) {
          setShowUpdateBanner(true);
          // If it's a minor update, we still want to ensure they aren't stuck on old data
          localStorage.removeItem('bakesync_orders_cache');
          if (!isBypassed) {
            setShowUpdateModal(false);
          }
        } else {
          setShowUpdateBanner(false);
          setShowUpdateModal(false);
        }
      }
    });

    return () => unsub();
  }, [isSuperAdmin, bypassVersion]);

  return { showUpdateModal, showUpdateBanner, appConfig, dismissModalAndBypass };
};
