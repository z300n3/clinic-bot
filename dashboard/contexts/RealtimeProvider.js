'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useClinicId } from '../hooks/useClinicId';
import { toast } from 'sonner';

// ── Programmatic "ding-dong" — no MP3 file needed ────────────────────────────
function playNotificationSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Two-note ding: A5 (880 Hz) → E5 (660 Hz)
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.65);
  } catch (_) {
    // Web Audio API not available — silently skip
  }
}

const RealtimeContext = createContext({
  awaitingHumanCount: 0,
  awaitingPhones:     [],
  clearAwaitingFor:   () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ children }) {
  const { clinicId } = useClinicId();

  const [awaitingPhones, setAwaitingPhones] = useState([]);
  const mountedRef = useRef(true);

  // ── Load initial awaiting_human count on mount ────────────────────────────
  const loadInitialState = useCallback(async () => {
    if (!clinicId) return;
    const { data } = await supabase
      .from('conversation_state')
      .select('patient_phone')
      .eq('clinic_id', clinicId)
      .eq('state', 'awaiting_human');

    if (data && mountedRef.current) {
      setAwaitingPhones(data.map((r) => r.patient_phone));
    }
  }, [clinicId]);

  useEffect(() => {
    loadInitialState();
    return () => { mountedRef.current = false; };
  }, [loadInitialState]);

  // ── Realtime: new appointments ────────────────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    const channel = supabase
      .channel('global-appointments-insert')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          const appt = payload.new;
          const name = appt.patient_name || 'مريض جديد';

          playNotificationSound();

          toast.success(`حجز جديد 🔔: ${name}`, {
            description: appt.reason || 'موعد جديد تم حجزه عبر البوت',
            duration:    6000,
            position:    'top-center',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId]);

  // ── Realtime: conversation_state changes ──────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    const channel = supabase
      .channel('global-conv-state')
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'conversation_state',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row || !row.patient_phone) return;

          if (row.state === 'awaiting_human') {
            // Add to awaiting list (avoid duplicates)
            setAwaitingPhones((prev) =>
              prev.includes(row.patient_phone) ? prev : [...prev, row.patient_phone]
            );

            toast.error('🚨 طلب تدخل بشري', {
              description: `المريض ${row.patient_phone} يحتاج مساعدة`,
              duration:    8000,
              position:    'top-center',
            });
          } else {
            // Remove from awaiting list (state changed away from awaiting_human)
            setAwaitingPhones((prev) =>
              prev.filter((p) => p !== row.patient_phone)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId]);

  // ── Helper: clear a specific phone from awaiting (e.g., after doctor replies)
  const clearAwaitingFor = useCallback((phone) => {
    setAwaitingPhones((prev) => prev.filter((p) => p !== phone));
  }, []);

  const value = {
    awaitingHumanCount: awaitingPhones.length,
    awaitingPhones,
    clearAwaitingFor,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
