'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, CLINIC_ID } from '../../lib/supabase';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  scheduled:           'محجوز',
  confirmed:           'مؤكد',
  completed:           'تم العلاج ✅',
  cancelled:           'ملغى (مريض)',
  cancelled_by_clinic: 'ملغى (عيادة)',
  no_show:             'لم يحضر ❌',
};

const STATUS_CLASSES = {
  scheduled:           'bg-blue-100   text-blue-800',
  confirmed:           'bg-green-100  text-green-800',
  completed:           'bg-emerald-100 text-emerald-700',
  cancelled:           'bg-gray-100   text-gray-500',
  cancelled_by_clinic: 'bg-orange-100 text-orange-700',
  no_show:             'bg-red-100    text-red-700',
};

// Day-only (booking is per-day, not per-hour)
function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('ar-IQ', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

// Returns true if the appointment timestamp is before right now
function isPast(iso) {
  return new Date(iso).getTime() < Date.now();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [appointments,    setAppointments]    = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [dateFilter,      setDateFilter]      = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter,    setStatusFilter]    = useState('all');

  // Cancel modal state
  const [modal,         setModal]         = useState(null);   // { appointment }
  const [cancelReason,  setCancelReason]  = useState('ظرف طارئ');
  const [cancelLoading, setCancelLoading] = useState(false);

  // Attendance loading set (tracks which appt IDs are in-flight)
  const [attendanceLoading, setAttendanceLoading] = useState(new Set());

  // Toast
  const [toast, setToast] = useState(null); // { msg, type }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('appointments')
      .select('id, scheduled_at, queue_number, status, reason, patient_name, created_at, patients(phone_number, no_show_count)')
      .eq('clinic_id', CLINIC_ID)
      .order('scheduled_at', { ascending: true })
      .order('queue_number', { ascending: true });

    if (dateFilter) {
      const start = new Date(dateFilter); start.setHours(0,  0,  0,   0);
      const end   = new Date(dateFilter); end.setHours(23, 59, 59, 999);
      query = query.gte('scheduled_at', start.toISOString()).lte('scheduled_at', end.toISOString());
    }
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (!error) setAppointments(data || []);
    setLoading(false);
  }, [dateFilter, statusFilter]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('appts-rt')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${CLINIC_ID}` },
        () => fetchAppointments()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchAppointments]);

  function openCancelModal(appt) {
    setModal({ appointment: appt });
    setCancelReason('ظرف طارئ');
  }

  async function handleConfirmCancel() {
    if (!modal) return;
    setCancelLoading(true);

    try {
      const res  = await fetch(`${BACKEND_URL}/api/appointments/${modal.appointment.id}/cancel-by-clinic`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'فشل الإلغاء');

      showToast(data.message || 'تم الإلغاء وإرسال إشعار للمريض ✅', 'success');
      setModal(null);
      fetchAppointments();
    } catch (err) {
      showToast('فشل الإلغاء: ' + err.message, 'error');
    }

    setCancelLoading(false);
  }

  // ── Attendance handler ────────────────────────────────────────────────────

  async function handleAttendance(apptId, status) {
    // Optimistic update
    setAppointments((prev) =>
      prev.map((a) => a.id === apptId ? { ...a, status } : a)
    );
    setAttendanceLoading((prev) => new Set(prev).add(apptId));

    try {
      const res  = await fetch(`${BACKEND_URL}/api/appointments/${apptId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'فشل التحديث');

      showToast(
        status === 'completed' ? 'تم تسجيل الحضور ✅' : 'تم تسجيل الغياب ❌',
        status === 'completed' ? 'success' : 'error'
      );
      // Refresh to get updated no_show_count from DB
      fetchAppointments();
    } catch (err) {
      // Rollback optimistic update
      fetchAppointments();
      showToast('فشل التحديث: ' + err.message, 'error');
    } finally {
      setAttendanceLoading((prev) => {
        const next = new Set(prev);
        next.delete(apptId);
        return next;
      });
    }
  }

  // ── Action buttons helper ─────────────────────────────────────────────────
  //
  // Bot always creates appointments as 'scheduled' (never 'confirmed'),
  // so both statuses must be treated equally here.
  //
  // Logic:
  //   scheduled|confirmed + past   → ✅ حضر / ❌ لم يحضر
  //   scheduled|confirmed + future → إلغاء
  //   completed                    → badge
  //   no_show                      → badge
  //   cancelled*                   → badge

  function renderActions(appt, isMobile = false) {
    const { status, scheduled_at, id } = appt;
    const past = new Date(scheduled_at).getTime() < Date.now();
    const busy = attendanceLoading.has(id);

    if ((status === 'confirmed' || status === 'scheduled') && past) {
      // ── Past appointment: mark attendance ─────────────────────────────
      if (isMobile) {
        return (
          <div className="flex flex-col gap-2 mt-1">
            <button
              onClick={() => handleAttendance(id, 'completed')}
              disabled={busy}
              className="w-full min-h-[44px] bg-emerald-50 border border-emerald-300 text-emerald-700 font-semibold text-sm rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              ✅ حضر
            </button>
            <button
              onClick={() => handleAttendance(id, 'no_show')}
              disabled={busy}
              className="w-full min-h-[44px] bg-red-50 border border-red-300 text-red-700 font-semibold text-sm rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              ❌ لم يحضر
            </button>
          </div>
        );
      }
      return (
        <div className="flex gap-1.5">
          <button
            onClick={() => handleAttendance(id, 'completed')}
            disabled={busy}
            className="min-h-[36px] px-2.5 py-1 bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            ✅ حضر
          </button>
          <button
            onClick={() => handleAttendance(id, 'no_show')}
            disabled={busy}
            className="min-h-[36px] px-2.5 py-1 bg-red-50 border border-red-300 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            ❌ لم يحضر
          </button>
        </div>
      );
    }

    if ((status === 'confirmed' || status === 'scheduled') && !past) {
      // ── Future appointment: cancel ────────────────────────────────────
      if (isMobile) {
        return (
          <button
            onClick={() => openCancelModal(appt)}
            className="w-full min-h-[44px] text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors"
          >
            إلغاء الموعد
          </button>
        );
      }
      return (
        <button
          onClick={() => openCancelModal(appt)}
          className="text-red-600 hover:text-red-800 text-xs font-semibold border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors min-h-[36px]"
        >
          إلغاء
        </button>
      );
    }

    if (status === 'completed') {
      return (
        <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full whitespace-nowrap">
          تم العلاج ✅
        </span>
      );
    }

    if (status === 'no_show') {
      return (
        <span className="inline-block px-2.5 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full whitespace-nowrap">
          لم يحضر ❌
        </span>
      );
    }

    if (status === 'cancelled' || status === 'cancelled_by_clinic') {
      return (
        <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full whitespace-nowrap">
          ملغي
        </span>
      );
    }

    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">📅 المواعيد</h1>
        <div className="flex gap-3 flex-wrap">
          <input type="date" value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]">
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button onClick={() => { setDateFilter(''); setStatusFilter('all'); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline min-h-[44px] px-2">
            إعادة تعيين
          </button>
        </div>
      </div>

      {/* Live badge */}
      <div className="flex items-center gap-2 text-sm text-green-600">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
        تحديث مباشر
      </div>

      {/* Toast — top full-width on mobile, bottom-left on desktop */}
      {toast && (
        <div className={`fixed z-50 text-sm font-medium text-white
          top-0 left-0 right-0 px-4 py-3 text-center
          md:top-auto md:bottom-4 md:left-4 md:right-auto md:rounded-xl md:shadow-lg md:px-5 md:max-w-sm md:text-right
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-4xl mb-2">📭</p>
          <p>لا توجد مواعيد</p>
        </div>
      ) : (
        <>
          {/* ── Mobile: card list ─────────────────────────────────────────── */}
          <div className="md:hidden space-y-3">
            {appointments.map((appt) => {
              const noShowCount = appt.patients?.no_show_count || 0;
              return (
                <div key={appt.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-2.5">
                  {/* Name + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-900 text-base leading-snug break-words">
                        {appt.patient_name || '—'}
                      </span>
                      {noShowCount >= 3 && (
                        <span className="mr-2 inline-block px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                          ⚠️ تغيّب {noShowCount} مرات
                        </span>
                      )}
                    </div>
                    <span className={`inline-block flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_CLASSES[appt.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[appt.status] || appt.status}
                    </span>
                  </div>

                  {/* Phone */}
                  <p className="text-xs text-gray-500 font-mono">{appt.patients?.phone_number}</p>

                  {/* Date + queue */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span>📅 {fmtDay(appt.scheduled_at)}</span>
                    {appt.queue_number != null && (
                      <span className="flex items-center gap-1.5">
                        🔢 الدور:
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {appt.queue_number}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Reason */}
                  {appt.reason && (
                    <p className="text-sm text-gray-500 break-words">💬 {appt.reason}</p>
                  )}

                  {/* Actions */}
                  {renderActions(appt, true)}
                </div>
              );
            })}
          </div>

          {/* ── Desktop: table ────────────────────────────────────────────── */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['المريض','الهاتف','اليوم','الدور','السبب','الحالة',''].map((h) => (
                      <th key={h} className="px-4 py-3 text-right font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {appointments.map((appt) => {
                    const noShowCount = appt.patients?.no_show_count || 0;
                    return (
                      <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="break-words">{appt.patient_name || '—'}</span>
                            {noShowCount >= 3 && (
                              <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full whitespace-nowrap">
                                ⚠️ تغيّب {noShowCount} مرات
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {appt.patients?.phone_number}
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDay(appt.scheduled_at)}</td>
                        <td className="px-4 py-3">
                          {appt.queue_number != null ? (
                            <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                              {appt.queue_number}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs break-words">{appt.reason || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_CLASSES[appt.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[appt.status] || appt.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {renderActions(appt, false)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
              {appointments.length} موعد
            </div>
          </div>
        </>
      )}

      {/* Cancel confirmation modal — centered on desktop, bottom sheet on mobile */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center md:p-4 bg-black/40">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">تأكيد إلغاء الموعد</h3>
              <button onClick={() => setModal(null)} className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Appointment summary */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5 text-sm">
                <p>
                  <span className="text-gray-500">المريض: </span>
                  <span className="font-semibold text-gray-800 break-words">{modal.appointment.patient_name || '—'}</span>
                </p>
                <p>
                  <span className="text-gray-500">الهاتف: </span>
                  <span className="font-mono text-gray-700">{modal.appointment.patients?.phone_number}</span>
                </p>
                <p>
                  <span className="text-gray-500">الموعد: </span>
                  <span className="font-semibold text-gray-800">{fmtDay(modal.appointment.scheduled_at)}</span>
                  {modal.appointment.queue_number != null && (
                    <span className="text-gray-500"> · الدور رقم {modal.appointment.queue_number}</span>
                  )}
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="text-sm text-gray-600 block mb-1.5 font-medium">
                  سبب الإلغاء <span className="text-gray-400 font-normal">(سيُرسل للمريض)</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>

              <p className="text-xs text-gray-400">
                ⚡ سيصل إشعار واتساب للمريض تلقائياً بعد التأكيد
              </p>

              <div className="flex gap-3">
                <button onClick={handleConfirmCancel} disabled={cancelLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm min-h-[44px]">
                  {cancelLoading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء وإرسال إشعار'}
                </button>
                <button onClick={() => setModal(null)} disabled={cancelLoading}
                  className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-colors min-h-[44px]">
                  رجوع
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
