'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useClinicId } from '../../hooks/useClinicId';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-IQ', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

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

export default function PatientsPage() {
  const { clinicId, loading: clinicLoading, error: clinicError } = useClinicId();

  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);

  // History Modal State
  const [historyModal, setHistoryModal] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Report Modal State
  const [reportModal, setReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('today');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [clinicDetails, setClinicDetails] = useState(null);

  // Fetch clinic details for the header and price
  useEffect(() => {
    if (!clinicId) return;
    supabase.from('clinics').select('*').eq('id', clinicId).single().then(({data}) => {
      if (data) setClinicDetails(data);
    });
  }, [clinicId]);

  async function handleGenerateReport() {
    setReportLoading(true);
    let start, end;
    const now = new Date();
    
    // Calculate dates based on reportPeriod
    if (reportPeriod === 'today') {
      start = new Date(now.setHours(0,0,0,0));
      end = new Date(now.setHours(23,59,59,999));
    } else if (reportPeriod === 'week') {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      end = new Date(now.setHours(23,59,59,999));
    } else if (reportPeriod === 'month') {
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      end = new Date(now.setHours(23,59,59,999));
    }

    let query = supabase
      .from('appointments')
      .select('id, scheduled_at, status, patient_name, reason, queue_number, patients(phone_number)')
      .eq('clinic_id', clinicId)
      .order('scheduled_at', { ascending: false });

    if (reportPeriod !== 'all') {
      query = query.gte('scheduled_at', start.toISOString()).lte('scheduled_at', end.toISOString());
    }

    const { data } = await query;
    const appts = data || [];

    // Calculate stats
    const total = appts.length;
    const completed = appts.filter(a => a.status === 'completed').length;
    const noShow = appts.filter(a => a.status === 'no_show').length;
    const cancelled = appts.filter(a => ['cancelled', 'cancelled_by_clinic'].includes(a.status)).length;
    
    const price = clinicDetails?.consultation_price || 0;
    const expectedRevenue = completed * price;

    setReportData({
      appointments: appts,
      stats: { total, completed, noShow, cancelled, expectedRevenue },
      period: reportPeriod,
      date: new Date().toLocaleDateString('ar-IQ'),
    });
    setReportLoading(false);
  }

  // Effect to trigger PDF download after render
  useEffect(() => {
    if (reportData && !reportLoading) {
      setTimeout(async () => {
        const element = document.getElementById('report-content');
        if (element) {
          try {
            // make it block for rendering
            element.style.display = 'block';
            
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`تقرير_${reportPeriod}_${new Date().getTime()}.pdf`);
            
            element.style.display = 'none';
            setReportData(null);
            setReportModal(false);
          } catch (err) {
            console.error('PDF generation error', err);
            alert('حدث خطأ أثناء تصدير الـ PDF');
            setReportData(null);
          }
        }
      }, 800); // give React time to render
    }
  }, [reportData, reportLoading, reportPeriod]);

  async function openHistoryModal(patient) {
    setHistoryModal(patient);
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('id, scheduled_at, reason, status, patient_name, queue_number')
      .eq('patient_id', patient.id)
      .order('scheduled_at', { ascending: false });
    
    if (!error) {
      setHistory(data || []);
    } else {
      setHistory([]);
    }
    setHistoryLoading(false);
  }

  // Delete Appointment State
  const [deleteLoading, setDeleteLoading] = useState(new Set());

  async function handleDeleteAppointment(apptId) {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموعد نهائياً من السجل؟')) return;
    
    setDeleteLoading((prev) => new Set(prev).add(apptId));
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', apptId);
      
    if (!error) {
      setHistory((prev) => prev.filter((a) => a.id !== apptId));
      // Refresh patients silently
      if (clinicId) {
        supabase
          .from('patients')
          .select('id, name, phone_number, first_seen_at, last_seen_at, appointments(count)')
          .eq('clinic_id', clinicId)
          .order('last_seen_at', { ascending: false })
          .then(({ data }) => {
            if (data) setPatients(data);
          });
      }
    } else {
      alert('فشل الحذف: ' + error.message);
    }
    setDeleteLoading((prev) => {
      const next = new Set(prev);
      next.delete(apptId);
      return next;
    });
  }

  useEffect(() => {
    if (!clinicId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('patients')
        .select(`
          id,
          name,
          phone_number,
          first_seen_at,
          last_seen_at,
          appointments(count)
        `)
        .eq('clinic_id', clinicId)
        .order('last_seen_at', { ascending: false });
      setPatients(data || []);
      setLoading(false);
    })();
  }, [clinicId]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">👥 المرضى</h1>
          <button 
            onClick={() => setReportModal(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span>📄 تقرير PDF</span>
          </button>
        </div>
        <span className="text-sm text-gray-500">{loading ? '...' : `${patients.length} مريض`}</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p>جاري التحميل...</p>
        </div>
      ) : patients.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-4xl mb-2">👤</p>
          <p>لا يوجد مرضى مسجلون بعد</p>
        </div>
      ) : (
        <>
          {/* ── Mobile: card list ───────────────────────────────────────── */}
          <div className="md:hidden space-y-3">
            {patients.map((p) => {
              const apptCount = p.appointments?.[0]?.count ?? 0;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-2.5">
                  {/* Name + appointment count */}
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => openHistoryModal(p)} className="text-right font-semibold text-brand-600 hover:text-brand-800 hover:underline text-base break-words min-w-0 transition-colors">
                      {p.name || <span className="text-gray-400 italic">غير محدد</span>}
                    </button>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-semibold text-xs flex-shrink-0">
                      {apptCount}
                    </span>
                  </div>

                  {/* Phone */}
                  <p className="text-xs text-gray-500 font-mono break-all">{p.phone_number}</p>

                  {/* Dates */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>أول تواصل: {fmtDate(p.first_seen_at)}</span>
                    <span>آخر تواصل: {fmtDate(p.last_seen_at)}</span>
                  </div>

                  {/* Conversation link */}
                  <Link
                    href={`/conversations?phone=${encodeURIComponent(p.phone_number)}`}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 border border-brand-200 rounded-xl text-sm text-brand-600 font-medium hover:bg-brand-50 transition-colors"
                  >
                    عرض المحادثة →
                  </Link>
                </div>
              );
            })}
          </div>

          {/* ── Desktop: table ──────────────────────────────────────────── */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['الاسم', 'الهاتف', 'عدد المواعيد', 'أول تواصل', 'آخر تواصل', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-right font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {patients.map((p) => {
                    const apptCount = p.appointments?.[0]?.count ?? 0;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium break-words">
                          <button onClick={() => openHistoryModal(p)} className="text-right text-brand-600 hover:text-brand-800 hover:underline transition-colors">
                            {p.name || <span className="text-gray-400 italic">غير محدد</span>}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.phone_number}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-semibold text-xs">
                            {apptCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(p.first_seen_at)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(p.last_seen_at)}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/conversations?phone=${encodeURIComponent(p.phone_number)}`}
                            className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                          >
                            المحادثة →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Patient History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center md:p-4 bg-black/40">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">سجل مواعيد المريض</h3>
                <p className="text-sm text-gray-500 font-mono mt-0.5">{historyModal.phone_number}</p>
              </div>
              <button onClick={() => setHistoryModal(null)} className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl leading-none bg-gray-50 hover:bg-gray-100 rounded-full transition-colors">×</button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin mb-3" />
                  <p className="text-sm">جاري جلب المواعيد...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-sm">لا توجد مواعيد سابقة لهذا المريض.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((appt) => (
                    <div key={appt.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:border-gray-200 transition-colors">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div>
                          <span className="font-semibold text-gray-900 block">{fmtDate(appt.scheduled_at)}</span>
                          <span className="text-xs text-gray-500">اسم الحجز: <span className="font-medium text-gray-700">{appt.patient_name || '—'}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_CLASSES[appt.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[appt.status] || appt.status}
                          </span>
                          <button 
                            onClick={() => handleDeleteAppointment(appt.id)}
                            disabled={deleteLoading.has(appt.id)}
                            title="حذف الموعد نهائياً"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                        {appt.queue_number != null && (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            🔢 الدور: <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{appt.queue_number}</span>
                          </div>
                        )}
                      </div>
                      
                      {appt.reason && (
                        <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">💬 {appt.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setHistoryModal(null)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-sm transition-colors min-h-[44px]">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">تصدير تقرير PDF</h3>
              <button onClick={() => setReportModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اختر الفترة الزمنية:</label>
                <select 
                  value={reportPeriod} 
                  onChange={(e) => setReportPeriod(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="today">اليوم</option>
                  <option value="week">هذا الأسبوع</option>
                  <option value="month">هذا الشهر</option>
                  <option value="all">كل المواعيد</option>
                </select>
              </div>
              <button 
                onClick={handleGenerateReport} 
                disabled={reportLoading || !!reportData}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex justify-center items-center gap-2"
              >
                {(reportLoading || reportData) ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري التجهيز للتحميل...</span>
                  </>
                ) : (
                  <span>تحميل التقرير</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF Canvas Template */}
      {reportData && (
        <div style={{ position: 'fixed', top: '-20000px', left: '-20000px', width: '800px', zIndex: -1 }}>
          <div id="report-content" className="p-10 bg-white text-black font-sans" style={{ width: '800px', minHeight: '1131px', direction: 'rtl', display: 'none' }}>
            
            {/* Header */}
            <div className="text-center border-b-2 border-gray-800 pb-6 mb-6">
              <h1 className="text-3xl font-bold mb-2">{clinicDetails?.name || 'اسم العيادة'}</h1>
              <h2 className="text-xl text-gray-700">الدكتور: {clinicDetails?.doctor_name || '—'}</h2>
              <p className="text-gray-500 mt-2">تاريخ التقرير: {reportData.date}</p>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-100 p-4 rounded-lg text-center">
                <p className="text-gray-500 text-sm">إجمالي المواعيد</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{reportData.stats.total}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg text-center">
                <p className="text-emerald-600 text-sm">تم العلاج (حضروا)</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{reportData.stats.completed}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <p className="text-red-600 text-sm">لم يحضروا</p>
                <p className="text-2xl font-bold text-red-700 mt-1">{reportData.stats.noShow}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <p className="text-gray-600 text-sm">ملغى</p>
                <p className="text-2xl font-bold text-gray-700 mt-1">{reportData.stats.cancelled}</p>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-brand-50 border border-brand-100 p-5 rounded-xl mb-8 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-brand-900 text-lg">الخلاصة المالية المتوقعة</h3>
                <p className="text-sm text-brand-700 mt-1">بناءً على عدد المواعيد المكتملة وسعر الكشفية ({clinicDetails?.consultation_price || 0} دينار)</p>
              </div>
              <div className="text-3xl font-bold text-brand-700">
                {reportData.stats.expectedRevenue.toLocaleString()} <span className="text-lg">دينار</span>
              </div>
            </div>

            {/* Detailed Table */}
            <div>
              <h3 className="font-bold text-gray-900 text-lg mb-4">تفاصيل المرضى</h3>
              <table className="w-full text-sm text-right border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 font-semibold">الدور</th>
                    <th className="border border-gray-300 px-4 py-2 font-semibold">تاريخ الموعد</th>
                    <th className="border border-gray-300 px-4 py-2 font-semibold">اسم المريض</th>
                    <th className="border border-gray-300 px-4 py-2 font-semibold">رقم الهاتف</th>
                    <th className="border border-gray-300 px-4 py-2 font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.appointments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="border border-gray-300 px-4 py-8 text-center text-gray-500">لا توجد مواعيد في هذه الفترة</td>
                    </tr>
                  ) : (
                    reportData.appointments.map((a) => (
                      <tr key={a.id}>
                        <td className="border border-gray-300 px-4 py-2 text-center font-bold text-blue-600">{a.queue_number || '—'}</td>
                        <td className="border border-gray-300 px-4 py-2">{fmtDate(a.scheduled_at)}</td>
                        <td className="border border-gray-300 px-4 py-2 font-medium">{a.patient_name || '—'}</td>
                        <td className="border border-gray-300 px-4 py-2 font-mono">{a.patients?.phone_number || '—'}</td>
                        <td className="border border-gray-300 px-4 py-2">{STATUS_LABELS[a.status] || a.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
