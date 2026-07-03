
import { useEffect, useRef, useCallback } from 'react';
import { SOUND_PATHS } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export function useSound() {
  const { bakery } = useAuth();
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    const s = bakery?.notificationSettings;
    
    const sounds = {
      PENDING: s?.newOrderSound || SOUND_PATHS.PENDING,
      READY: s?.readySound || SOUND_PATHS.READY,
      SENT: s?.sentSound || SOUND_PATHS.SENT
    };

    // Preload sounds with safety checks
    Object.entries(sounds).forEach(([key, path]) => {
      if (!path || typeof path !== 'string' || path === 'undefined') return;
      
      try {
        const audio = new Audio(path);
        
        // Loop for alerts (Pending = New Order, should loop until acknowledged)
        if (key === 'PENDING') {
          audio.loop = true;
        }

        // Catch errors on individual audio elements
        audio.addEventListener('error', (e) => {
          const err = audio.error;
          let msg = 'Unknown audio error';
          if (err) {
            switch(err.code) {
              case 1: msg = 'Aborted'; break;
              case 2: msg = 'Network error'; break;
              case 3: msg = 'Decode error'; break;
              case 4: msg = 'Source not supported / 404'; break;
            }
          }
          console.error(`Audio Loading Error [${key}]: ${msg} - URL: ${path}`, err);
        });

        audioRefs.current[key] = audio;
      } catch (err) {
        console.error(`Audio initialization failed for ${key}`, err);
      }
    });

    return () => {
      // Clean up
      Object.values(audioRefs.current).forEach((audio: HTMLAudioElement) => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (e) {}
      });
      audioRefs.current = {};
    };
  }, [bakery?.id, bakery?.notificationSettings]);

  const playPending = useCallback(() => {
    const audio = audioRefs.current['PENDING'];
    if (audio) {
      audio.loop = true; 
      if (audio.paused) {
        audio.play().catch(e => {
          if (e.name !== 'AbortError') console.warn('Audio play blocked:', e);
        });
      }
    }
  }, []);

  const stopPending = useCallback(() => {
    const audio = audioRefs.current['PENDING'];
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    }
  }, []);

  const playReady = useCallback((loop = false) => {
    const audio = audioRefs.current['READY'];
    if (audio) {
      audio.loop = loop;
      if (audio.paused) {
        audio.play().catch(e => {
          if (e.name !== 'AbortError') console.error('Error playing ready sound:', e);
        });
      }
    }
  }, []);

  const playReadySingle = useCallback(() => {
    const audio = audioRefs.current['READY'];
    if (audio) {
      audio.loop = false;
      audio.currentTime = 0;
      audio.play().catch(e => {
        if (e.name !== 'AbortError') console.error('Error playing ready single sound:', e);
      });
    }
  }, []);

  const stopReady = useCallback(() => {
    const audio = audioRefs.current['READY'];
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    }
  }, []);

  const stopAllSounds = useCallback(() => {
    Object.values(audioRefs.current).forEach((audio: HTMLAudioElement) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
  }, []);

  const playSent = useCallback(() => {
    const audio = audioRefs.current['SENT'];
    if (audio) {
      audio.loop = false;
      audio.currentTime = 0;
      audio.play().catch(e => console.error('Error playing sound:', e));
    }
  }, []);

  return { playPending, stopPending, playReady, playReadySingle, stopReady, playSent, stopAllSounds };
}
