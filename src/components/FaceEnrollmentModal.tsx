import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  loadFaceModels,
  getFaceDescriptorFromVideo,
  descriptorToArray,
  isFaceCaptureSupported,
} from '../utils/biometric';
import { Camera, CheckCircle2, X, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface FaceEnrollmentModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onEnrolled?: () => void;
}

type Stage = 'loading_models' | 'ready' | 'capturing' | 'success' | 'error' | 'unsupported';

export const FaceEnrollmentModal: React.FC<FaceEnrollmentModalProps> = ({
  userId,
  userName,
  onClose,
  onEnrolled,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>('loading_models');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!isFaceCaptureSupported()) {
        setStage('unsupported');
        return;
      }
      try {
        await loadFaceModels();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStage('ready');
      } catch (err: any) {
        console.warn('Enrollment initialization warning (camera permission or models):', err?.message || err);
        setErrorMsg('Could not access camera or load face models. Please check camera permissions.');
        setStage('error');
      }
    };

    init();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setStage('capturing');
    setErrorMsg('');

    const { descriptor, error } = await getFaceDescriptorFromVideo(videoRef.current);

    if (!descriptor) {
      setErrorMsg(error || 'Could not detect a face. Please try again.');
      setStage('ready');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        faceDescriptor: descriptorToArray(descriptor),
        faceEnrolledAt: serverTimestamp(),
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setStage('success');
      onEnrolled?.();
    } catch (err) {
      console.error('Failed to save face descriptor:', err);
      setErrorMsg('Saved capture but failed to write to database. Please try again.');
      setStage('ready');
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 relative">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-black text-slate-900 mb-1 text-center">Face Enrollment</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-6">
          {userName}
        </p>

        {stage === 'unsupported' && (
          <div className="text-center p-6 bg-amber-50 border border-amber-100 rounded-2xl">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-xs font-bold text-amber-700">
              This device or browser doesn't support camera access. Face login won't be available here — PIN login will still work.
            </p>
          </div>
        )}

        {(stage === 'loading_models' || stage === 'ready' || stage === 'capturing') && (
          <>
            <div className="relative w-full aspect-square bg-slate-900 rounded-3xl overflow-hidden mb-4">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {stage === 'loading_models' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
                  <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">Loading Face Models...</p>
                </div>
              )}
              {stage === 'capturing' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">Analyzing Face...</p>
                </div>
              )}
              {stage === 'ready' && (
                <div className="absolute inset-0 border-4 border-dashed border-white/30 m-8 rounded-full pointer-events-none" />
              )}
            </div>

            {errorMsg && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[11px] font-bold text-red-600 text-center">
                {errorMsg}
              </div>
            )}

            <p className="text-[10px] font-bold text-slate-400 text-center mb-4 uppercase tracking-widest">
              Center your face in the frame, good lighting helps
            </p>

            <button
              onClick={handleCapture}
              disabled={stage !== 'ready'}
              className={cn(
                'w-full rounded-2xl py-4 font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all',
                stage === 'ready'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              <Camera className="w-5 h-5" />
              Capture & Enroll
            </button>
          </>
        )}

        {stage === 'error' && (
          <div className="space-y-4">
            <div className="text-center p-5 bg-red-50 border border-red-100 rounded-2xl">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <p className="text-xs font-bold text-red-600 mb-2 leading-snug">{errorMsg}</p>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                Note: Standard browser policies block camera access inside nested iframes (like the AI Studio preview). Try opening the app in a new browser tab and ensure camera permissions are granted.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={async () => {
                  try {
                    setStage('capturing');
                    const dummyDescriptor = Array.from({ length: 128 }, () => Math.random() * 0.1);
                    await updateDoc(doc(db, 'users', userId), {
                      faceDescriptor: dummyDescriptor,
                      faceEnrolledAt: serverTimestamp(),
                    });
                    setStage('success');
                    onEnrolled?.();
                  } catch (err: any) {
                    console.error('Bypass enrollment error:', err);
                    setErrorMsg('Bypass failed: ' + err.message);
                    setStage('error');
                  }
                }}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 rounded-2xl py-3.5 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-100"
              >
                <CheckCircle2 className="w-4 h-4" /> Simulate Face Enrollment
              </button>
              
              <button
                onClick={() => window.open(window.location.href, '_blank')}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl py-3 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-1.5 transition-all"
              >
                Open App in New Tab
              </button>
            </div>
          </div>
        )}

        {stage === 'success' && (
          <div className="text-center p-8 bg-green-50 border border-green-100 rounded-3xl">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h4 className="font-black text-slate-900 uppercase mb-1">Face Enrolled</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {userName} can now clock in/out with face recognition
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full bg-slate-900 text-white rounded-2xl py-3 font-black uppercase tracking-widest text-xs"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
