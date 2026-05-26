'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, CLINIC_ID } from '../../lib/supabase';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  scheduled:           'محجوز',
  confirmed:           'مؤكد',
  completed:           'مكتمل',
  cancelled:           'ملغى (مريض)',
  cancelled_by_clinic: 'ملغى (عيادة)',
  no_show:             'لم يحضر',
};

const STATUS_CLASSES = {
  scheduled:           'bg-blue-100   text-blue-800',
  confirmed:           'bg-green-100  text-green-800',
  completed:           'bg-gray-100   text-gray-700',
  cancelled:           'bg-gray-100   text-gray-500',
  cancelled_by_clinic: 'bg-orange-100 text-orange-700',
  no_show:             'bg-yellow-100 text-yellow-800',
};

function fmtDate(iso) {
  return new Date(iso).toLocaleString('ar-IQ', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Day-only (booking is now per-day, not per-hour)
function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('ar-IQ', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [dateFilter,   setDateFilter]   = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('all');

  // Cancel modal state
  const [modal,         setModal]         = useState(null);   // { appointment }
  const [cancelReason,  setCancelReason]  = useState('ظرف طارئ');
  const [cancelLoading, setCancelLoading] = useState(false);

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
      .select('id, scheduled_at, queue_number, status, reason, patient_name, created_at, patients(phone_number)')
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">📅 المواعيد</h1>
        <div className="flex gap-3 flex-wrap">
          <input type="date" value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button onClick={() => { setDateFilter(''); setStatusFilter('all'); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">
            إعادة تعيين
          </button>
        </div>
      </div>

      {/* Live badge */}
      <div className="flex items-center gap-2 text-sm text-green-600">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
        تحديث مباشر
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-4xl mb-2">📭</p>
          <p>لا توجد مواعيد</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
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
                {appointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {appt.patient_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {appt.patients?.phone_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtDay(appt.scheduled_at)}</td>
                    <td className="px-4 py-3">
                      {appt.queue_number != null ? (
                        <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {appt.queue_number}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{appt.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_CLASSES[appt.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[appt.status] || appt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(appt.status === 'scheduled' || appt.status === 'confirmed') && (
                        <button onClick={() => openCancelModal(appt)}
                          className="text-red-600 hover:text-red-800 text-xs font-semibold border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors">
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
            {appointments.length} موعد
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">تأكيد إلغاء الموعد</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Appointment summary */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5 text-sm">
                <p>
                  <span className="text-gray-500">المريض: </span>
                  <span className="font-semibold text-gray-800">{modal.appointment.patient_name || '—'}</span>
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
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm">
                  {cancelLoading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء وإرسال إشعار'}
                </button>
                <button onClick={() => setModal(null)} disabled={cancelLoading}
                  className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-colors">
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
