// Build 2026-05-15-v150 - CRITICAL CACHE BUSTER
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APP_VERSION } from './version';
import { ErrorBoundary } from './components/ErrorBoundary';

console.log(`%c Kreative Portal Booting... v${APP_VERSION} `, "background: #4f46e5; color: #fff; font-weight: bold; padding: 4px; border-radius: 4px;");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
