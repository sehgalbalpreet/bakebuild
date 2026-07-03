// Pro-level Error Tracking & Diagnostics Hub for Bakesync
import { auth } from '../firebase';

export interface AppError {
  id: string;
  message: string;
  name: string;
  stack?: string;
  timestamp: string;
  type: 'render' | 'async' | 'database' | 'auth' | 'network';
  context?: any;
}

type ErrorListener = (error: AppError) => void;

class ErrorHub {
  private listeners: Set<ErrorListener> = new Set();
  private errors: AppError[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      // Catch native global errors
      window.addEventListener('error', (event) => {
        // Prevent infinite loops if error belongs to our hub UI
        if (event.error?.isHubIndicator) return;
        
        this.emit({
          id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          message: event.message || 'Unknown runtime error',
          name: event.error?.name || 'Error',
          stack: event.error?.stack,
          timestamp: new Date().toISOString(),
          type: 'async',
          context: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          }
        });
      });

      // Catch unhandled promise rejections (very common in Firebase/Async onSnapshot!)
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        if (reason?.isHubIndicator) return;

        let message = 'Uncaught Promise Rejection';
        let name = 'PromiseRejection';
        let stack = '';
        let type: AppError['type'] = 'async';
        let context: any = {};

        if (reason) {
          message = reason.message || String(reason);
          name = reason.name || 'PromiseRejection';
          stack = reason.stack || '';
          
          // Check for Firestore specific permission or internal errors
          const msgLower = message.toLowerCase();
          if (msgLower.includes('permission') || msgLower.includes('insufficient permissions')) {
            type = 'database';
            context.firestoreError = true;
            context.resolutionHint = 'This resource read or write was denied by Firestore Security Rules. Ensure your user profile corresponds to the appropriate Tenant and Role permissions.';
          } else if (msgLower.includes('network') || msgLower.includes('offline') || msgLower.includes('failed to fetch')) {
            type = 'network';
          }
        }

        this.emit({
          id: `rejection_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          message,
          name,
          stack,
          timestamp: new Date().toISOString(),
          type,
          context: {
            ...context,
            rawReason: typeof reason === 'object' ? JSON.stringify(reason) : String(reason)
          }
        });
      });
    }
  }

  public subscribe(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    // Emit previously accumulated active errors to new subscriber if desired
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(error: Omit<AppError, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) {
    const fullError: AppError = {
      id: error.id || `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: error.timestamp || new Date().toISOString(),
      ...error
    };

    // Prevent duplicates of the exact same error within a short window
    const isDuplicate = this.errors.some(
      e => e.message === fullError.message && 
      (Date.now() - new Date(e.timestamp).getTime() < 3000)
    );

    if (isDuplicate) return;

    this.errors.push(fullError);
    // Keep internal history capped to 20 errors
    if (this.errors.length > 20) this.errors.shift();

    // Notify all active interfaces or boundaries
    this.listeners.forEach(listener => {
      try {
        listener(fullError);
      } catch (err) {
        console.error('Error executing ErrorHub listener:', err);
      }
    });
  }

  public getErrors(): AppError[] {
    return [...this.errors];
  }

  public clear() {
    this.errors = [];
  }
}

export const errorHub = new ErrorHub();
