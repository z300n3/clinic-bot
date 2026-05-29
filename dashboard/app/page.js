'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useClinicId } from '../hooks/useClinicId';

// ── Baghdad timezone helpers (UTC+3, no DST) ────────────────────────────────
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function getBaghdadToday() {
  const shifted = new Date(Date.now() + BAGHDAD_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, d) - BAGHDAD_OFFSET_MS),
    end:   new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - BAGHDAD_OFFSET_MS),
  };
}

function fmtDateHeader() {
  return new Date().toLocaleDateString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ── Status config ────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  scheduled:           'محجوز',
  confirmed:           'مؤكد',
  completed:           'اكتمل',
  cancelled:           'ملغى',
  cancelled_by_clinic: 'ملغى (عيادة)',
  no_show:             'لم يحضر',
};

const STATUS_CLASSES = {
  scheduled:           'bg-blue-50 text-blue-700',
  confirmed:           'bg-green-50 text-green-700',
  completed:           'bg-slate-50 text-slate-600',
  cancelled:           'bg-red-50 text-red-600',
  cancelled_by_clinic: 'bg-orange-50 text-orange-600',
  no_show:             'bg-yellow-50 text-yellow-700',
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TodayViewPage() {
  const { clinicId, loading: clinicLoading, error: clinicError } = useClinicId();

  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [toast,        setToast]        = useState(null);
  const [updatingId,   setUpdatingId]   = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Fetch today's appointments ────────────────────────────────────────────
  const fetchToday = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);

    const { start, end } = getBaghdadToday();

    const { data, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, patient_name, scheduled_at, status, queue_number, reason, patients(phone_number)')
      .eq('clinic_id', clinicId)
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: true })
      .order('queue_number', { ascending: true });

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setAppointments(data || []);
    }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    const ch = supabase
      .channel('today-view-rt')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinicId}` },
        () => fetchToday()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [clinicId, fetchToday]);

  // ── Update status (optimistic) ────────────────────────────────────────────
  async function updateStatus(id, newStatus) {
    setUpdatingId(id);

    // Optimistic UI update
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', id)
      .eq('clinic_id', clinicId);

    if (updateErr) {
      // Revert on failure
      fetchToday();
      showToast('فشل تحديث الحالة: ' + updateErr.message, 'error');
    } else {
      showToast(
        newStatus === 'completed' ? 'تم تسجيل الحضور ✅' : 'تم تسجيل عدم الحضور',
        'success'
      );
    }
    setUpdatingId(null);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const completed     = appointments.filter((a) => a.status === 'completed').length;
  const remaining     = appointments.filter((a) => a.status === 'confirmed').length;
  const cancelNoShow  = appointments.filter((a) =>
    ['cancelled', 'cancelled_by_clinic', 'no_show'].includes(a.status)
  ).length;
  const total         = appointments.length;

  // ── Clinic loading / error guard ─────────────────────────────────────────
  if (clinicLoading) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3" />
        <p>جاري التحميل...</p>
      </div>
    );
  }
  if (clinicError) {
    return <div className="text-center py-16 text-red-500">{clinicError}</div>;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📋 صفحة اليوم</h1>
        <p className="text-gray-500 mt-1 text-sm">{fmtDateHeader()}</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed z-50 text-sm font-medium text-white
          top-0 left-0 right-0 px-4 py-3 text-center
          md:top-auto md:bottom-4 md:left-4 md:right-auto md:rounded-xl md:shadow-lg md:px-5 md:max-w-sm md:text-right
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2 flex-wrap">
          <span>⚠️ خطأ في تحميل البيانات: {error}</span>
          <button onClick={fetchToday} className="underline font-medium hover:text-red-900">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 md:p-5">
          <p className="text-green-600 text-xs md:text-sm font-medium">✅ اكتمل</p>
          <p className="text-2xl md:text-3xl font-bold text-green-700 mt-1">{completed}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 md:p-5">
          <p className="text-blue-600 text-xs md:text-sm font-medium">⏳ متبقي</p>
          <p className="text-2xl md:text-3xl font-bold text-blue-700 mt-1">{remaining}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 md:p-5">
          <p className="text-red-500 text-xs md:text-sm font-medium">❌ ملغى / لم يحضر</p>
          <p className="text-2xl md:text-3xl font-bold text-red-700 mt-1">{cancelNoShow}</p>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>تقدم اليوم</span>
            <span>{completed} / {completed + remaining} ({(completed + remaining) > 0 ? Math.round((completed / (completed + remaining)) * 100) : 0}%)</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(completed + remaining) > 0 ? (completed / (completed + remaining)) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Live badge + count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          تحديث مباشر
        </div>
        <span className="text-sm text-gray-400">{total} موعد اليوم</span>
      </div>

      {/* Appointment list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p>جاري التحميل...</p>
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-4xl mb-2">📭</p>
          <p>لا توجد مواعيد اليوم</p>
        </div>
      ) : (
        <>
          {/* ── Mobile: card list ─────────────────────────────────────────── */}
          <div className="md:hidden space-y-3">
            {appointments.map((appt) => (
              <div
                key={appt.id}
                className={`bg-white rounded-2xl border p-4 shadow-sm space-y-3 transition-opacity ${
                  updatingId === appt.id ? 'opacity-60 pointer-events-none' : ''
                } ${appt.status === 'confirmed' ? 'border-green-200' : 'border-gray-200'}`}
              >
                {/* Name + status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-base break-words">
                      {appt.patient_name || '—'}
                    </p>
                    {appt.queue_number != null && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 mt-1">
                        🔢 الدور:
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {appt.queue_number}
                        </span>
                      </span>
                    )}
                  </div>
                  <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    STATUS_CLASSES[appt.status] || 'bg-gray-100 text-gray-600'
                  }`}>
                    {STATUS_LABELS[appt.status] || appt.status}
                  </span>
                </div>

                {/* Phone */}
                {appt.patients?.phone_number && (
                  <p className="text-xs text-gray-500 font-mono">{appt.patients.phone_number}</p>
                )}

                {/* Reason */}
                {appt.reason && (
                  <p className="text-sm text-gray-500 break-words">💬 {appt.reason}</p>
                )}

                {/* Action buttons — confirmed only */}
                {appt.status === 'confirmed' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => updateStatus(appt.id, 'completed')}
                      disabled={updatingId === appt.id}
                      className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      ✅ حضر
                    </button>
                    <button
                      onClick={() => updateStatus(appt.id, 'no_show')}
                      disabled={updatingId === appt.id}
                      className="flex-1 min-h-[44px] bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      ❌ لم يحضر
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Desktop: table ────────────────────────────────────────────── */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['الدور', 'المريض', 'الهاتف', 'السبب', 'الحالة', 'الإجراء'].map((h) => (
                      <th key={h} className="px-4 py-3 text-right font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {appointments.map((appt) => (
                    <tr
                      key={appt.id}
                      className={`transition-all ${
                        updatingId === appt.id ? 'opacity-60' : 'hover:bg-gray-50/50'
                      } ${appt.status === 'confirmed' ? 'bg-green-50/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        {appt.queue_number != null ? (
                          <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                            {appt.queue_number}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 break-words">
                        {appt.patient_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {appt.patients?.phone_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs break-words">
                        {appt.reason || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          STATUS_CLASSES[appt.status] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {STATUS_LABELS[appt.status] || appt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {appt.status === 'confirmed' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateStatus(appt.id, 'completed')}
                              disabled={updatingId === appt.id}
                              className="text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 min-h-[36px]"
                            >
                              ✅ حضر
                            </button>
                            <button
                              onClick={() => updateStatus(appt.id, 'no_show')}
                              disabled={updatingId === appt.id}
                              className="text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 min-h-[36px]"
                            >
                              ❌ لم يحضر
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
              {total} موعد اليوم
            </div>
          </div>
        </>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        {[
          { href: '/appointments',  label: 'إدارة المواعيد',  icon: '📅', desc: 'عرض وإلغاء المواعيد' },
          { href: '/patients',      label: 'قائمة المرضى',   icon: '👥', desc: 'بيانات وتاريخ المرضى' },
          { href: '/conversations', label: 'المحادثات',       icon: '💬', desc: 'سجل محادثات الواتساب' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-brand-400 hover:shadow-md transition-all group"
          >
            <span className="text-3xl">{item.icon}</span>
            <p className="font-semibold mt-2 text-gray-900 group-hover:text-brand-700">{item.label}</p>
            <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
