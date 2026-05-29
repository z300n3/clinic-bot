'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns the clinic ID for the currently authenticated user.
 * Queries clinics.auth_user_id to get the right row dynamically,
 * so it works after auth-based registration (no env-var dependency).
 */
export function useClinicId() {
  const [clinicId, setClinicId] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('غير مسجّل الدخول');
        setLoading(false);
        return;
      }

      const { data: clinic, error: dbErr } = await supabase
        .from('clinics')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (dbErr || !clinic) {
        setError('لم يتم العثور على العيادة');
        setLoading(false);
        return;
      }

      setClinicId(clinic.id);
      setLoading(false);
    })();
  }, []);

  return { clinicId, loading, error };
}
