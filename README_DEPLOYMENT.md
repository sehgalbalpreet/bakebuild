# BakeSync Update & Deploy Guide

This guide details how the automated cache-busting, service worker registry, and database-versioning model are structured, and how you can run clean updates without getting stuck in cache loops.

---

## 🛠️ Cache-Busting Blueprint

When user devices load BakeSync, they coordinate three items to check if they are running stale code:
1. **`firebase.json` Header Guarding**: `/sw.js` and all static `.html` files explicitly set `no-cache, no-store, must-revalidate` caching. They are loaded fresh from the server on every check.
2. **Dynamic Service Worker Hash**: `vite.config.ts` runs an `inject-sw-timestamp` plugin that overrides the `CACHE_NAME` version string inside `dist/sw.js` with a brand-new build timestamp on every target compilation (`npm run build`). This acts as an automated revision flag.
3. **Rollup Asset Hashing**: Built JavaScript and CSS assets output as uniquely hashed identifiers (e.g. `assets/index-Ab12Cd.js`), forcing the CDN & client devices to never retain old code.

---

## 🚀 True Update Flow (Step-by-Step)

To deploy an application update cleanly across all user devices (Dealers, Production Staff, and Admins):

### Step 1: Upgrading the Code
1. In `/src/version.ts`, bump the version string to the target revision (e.g. `1.6.0`).
2. Implement your code changes.
3. Commit and run the production build system via the AI Studio deploy pipeline.

### Step 2: Running the Database Sync
1. Log into Bakesync as the **SuperAdmin** (`sehgalbalpreet@gmail.com`).
2. Go to the **System Management** tab on your SuperAdmin dashboard.
3. Under the **Version Control & Platform Sync** card, you will see:
   - Your local build version (e.g. `v1.6.0`)
   - The current database version configured globally in Firestore (e.g. `v1.5.0`)
4. Hover and click **Sync Platform to v1.6.0**. This updates `/appConfig/version` in Firestore cleanly.
   - **Important**: The SuperAdmin no longer overwrites the database version silently on load. It is controlled entirely by this physical dashboard click, ensuring updates go live when *you* are ready.

### Step 3: Global Notification Execution
1. As soon as Firestore's version shifts to `v1.6.0`, all active users immediately catch the `currentVersion !== APP_VERSION` change event in real-time through the Firestore snapshot listener.
2. A beautiful **Update Banner & Modal** informs users that a new version of BakeSync is live.
3. When clicked, it deletes all local IndexedDB/localStorage order caches and triggers an unregistration event for the browser's Service Worker before performing a clean, cash-busted page refresh (`window.location.href = ...?b=timestamp`).

---

## ⚠️ Troubleshooting Updates
If an offline-first phone is struggling to sync:
- Advise them to use the **Force Repair** flow from the login portal. This clears all app storage, deletes IndexedDB state, unregisters previous Service Workers, clean-wipes cache buckets, and forces an immediate server-original reload.
