'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const DEFAULT_WEEKLY = Array.from({ length: 7 }, (_, i) => ({
  day_of_week:    i,
  is_working_day: i !== 5,   // Friday off by default
  daily_capacity: null,      // null = unlimited / open (الخيار الطبيعي)
  start_time:     '09:00',   // لحساب وقت الدور التقريبي
  end_time:       '17:00',
}));

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const [tab,       setTab]       = useState('weekly');
  const [clinicId,  setClinicId]  = useState(null);
  const [loadingId, setLoadingId] = useState(true);
  const [idError,   setIdError]   = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIdError('غير مسجّل الدخول'); setLoadingId(false); return; }

      const { data: clinic, error } = await supabase
        .from('clinics')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (error || !clinic) { setIdError('لم يتم العثور على العيادة'); setLoadingId(false); return; }
      setClinicId(clinic.id);
      setLoadingId(false);
    })();
  }, []);

  const tabs = [
    { id: 'weekly',  label: '📅 أيام الدوام والعدد' },
    { id: 'blocks',  label: '🚫 فترات الغياب'       },
    { id: 'special', label: '⭐ أيام خاصة'          },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🗓️ إدارة مواعيد الدكتور</h1>

      {/* Tab bar — scrollable on mobile */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px min-h-[44px] ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {loadingId ? (
          <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
        ) : idError ? (
          <div className="text-center py-12 text-red-500">{idError}</div>
        ) : (
          <>
            {tab === 'weekly'  && <WeeklyTab        clinicId={clinicId} />}
            {tab === 'blocks'  && <BlockedPeriodsTab clinicId={clinicId} />}
            {tab === 'special' && <SpecialDaysTab    clinicId={clinicId} />}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Weekly schedule
// ══════════════════════════════════════════════════════════════════════════════

function WeeklyTab({ clinicId }) {
  const [schedule, setSchedule] = useState(DEFAULT_WEEKLY);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    (async () => {
      // Load existing weekly rules
      const { data } = await supabase
        .from('availability_schedules')
        .select('day_of_week, is_working_day, daily_capacity, shifts')
        .eq('clinic_id', clinicId)
        .is('specific_date', null);

      if (data && data.length > 0) {
        setSchedule(DEFAULT_WEEKLY.map((def) => {
          const found = data.find((d) => d.day_of_week === def.day_of_week);
          if (!found) return def;
          return {
            ...def,
            is_working_day: found.is_working_day,
            daily_capacity: found.daily_capacity ?? null,
            start_time:     found.shifts?.[0]?.open  || def.start_time,
            end_time:       found.shifts?.[0]?.close || def.end_time,
          };
        }));
      } else {
        // Try to load working/closed days from clinic.working_hours as starting point
        const { data: clinic } = await supabase
          .from('clinics').select('working_hours').eq('id', clinicId).single();
        if (clinic?.working_hours) {
          const keys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
          setSchedule(DEFAULT_WEEKLY.map((def, i) => {
            const wh = clinic.working_hours[keys[i]];
            if (!wh) return def;
            return {
              ...def,
              is_working_day: !wh.closed,
              daily_capacity: null,
              start_time:     wh.open  || def.start_time,
              end_time:       wh.close || def.end_time,
            };
          }));
        }
      }
      setLoading(false);
    })();
  }, [clinicId]);

  async function handleSave() {
    setSaving(true);
    try {
      // Delete all existing weekly rules, then bulk-insert
      await supabase
        .from('availability_schedules')
        .delete()
        .eq('clinic_id', clinicId)
        .is('specific_date', null);

      const rows = schedule.map((day) => ({
        clinic_id:      clinicId,
        day_of_week:    day.day_of_week,
        specific_date:  null,
        is_working_day: day.is_working_day,
        shifts:         day.is_working_day
          ? [{ open: day.start_time, close: day.end_time }]
          : [],
        daily_capacity: day.is_working_day ? day.daily_capacity : null,
      }));

      const { error } = await supabase.from('availability_schedules').insert(rows);
      if (error) throw error;

      showToast('تم حفظ جدول الدوام بنجاح ✅', 'success');
    } catch (err) {
      showToast('فشل الحفظ: ' + err.message, 'error');
    }
    setSaving(false);
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleDay(i) {
    setSchedule((prev) => prev.map((d, idx) =>
      idx !== i ? d : { ...d, is_working_day: !d.is_working_day }
    ));
  }

  function setTime(i, field, value) {
    setSchedule((prev) => prev.map((d, idx) =>
      idx !== i ? d : { ...d, [field]: value }
    ));
  }

  function toggleUnlimited(i, unlimited) {
    setSchedule((prev) => prev.map((d, idx) =>
      idx !== i ? d : { ...d, daily_capacity: unlimited ? null : 10 }
    ));
  }

  function setCapacity(i, value) {
    const n = parseInt(value, 10);
    setSchedule((prev) => prev.map((d, idx) =>
      idx !== i ? d : { ...d, daily_capacity: Number.isNaN(n) ? null : Math.max(1, n) }
    ));
  }

  if (loading) return <div className="text-center py-12 text-gray-400">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        حدّد أيام الدوام وكم مريض يستقبل الدكتور بكل يوم. اختر "العدد مفتوح" إذا ما تريد تحديد عدد.
      </p>

      {schedule.map((day, i) => {
        const unlimited = day.daily_capacity === null || day.daily_capacity === undefined;
        return (
          <div key={i} className={`rounded-xl border p-4 transition-colors ${day.is_working_day ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Day name + toggle */}
              <div className="flex items-center gap-3 w-32 flex-shrink-0">
                <button
                  onClick={() => toggleDay(i)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${day.is_working_day ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${day.is_working_day ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className={`font-semibold text-sm ${day.is_working_day ? 'text-gray-900' : 'text-gray-400'}`}>
                  {DAY_NAMES[day.day_of_week]}
                </span>
              </div>

              {/* Capacity + working hours or "Off" */}
              {!day.is_working_day ? (
                <span className="text-sm text-gray-400 italic">إجازة</span>
              ) : (
                <div className="flex flex-col gap-2 flex-1">
                  {/* Working hours row — stacks on mobile */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-6">من</span>
                      <input type="time" value={day.start_time}
                        onChange={(e) => setTime(i, 'start_time', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-6">إلى</span>
                      <input type="time" value={day.end_time}
                        onChange={(e) => setTime(i, 'end_time', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                    </div>
                    <span className="text-xs text-gray-400 hidden sm:inline">(لحساب وقت الدور)</span>
                  </div>

                  {/* Capacity row */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={unlimited}
                        onChange={(e) => toggleUnlimited(i, e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700">العدد مفتوح (غير محدود)</span>
                    </label>

                    {!unlimited && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">الحد الأقصى:</label>
                        <input type="number" min={1} value={day.daily_capacity}
                          onChange={(e) => setCapacity(i, e.target.value)}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        <span className="text-xs text-gray-500">مريض/اليوم</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-4 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : 'حفظ الجدول'}
        </button>
        {toast && (
          <span className={`text-sm font-medium ${toast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {toast.msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Blocked periods
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_BLOCK = {
  start_date: '', end_date: '', is_full_day: true,
  start_time: '08:00', end_time: '17:00', reason: '',
};

function BlockedPeriodsTab({ clinicId }) {
  const [blocks,      setBlocks]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [form,        setForm]        = useState(EMPTY_BLOCK);
  const [saving,      setSaving]      = useState(false);
  const [showPast,    setShowPast]    = useState(false);
  const [toast,       setToast]       = useState(null);

  const loadBlocks = useCallback(async () => {
    const { data } = await supabase
      .from('blocked_periods')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('start_at', { ascending: true });
    setBlocks(data || []);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  async function handleAdd() {
    setSaving(true);
    try {
      const startAt = form.is_full_day
        ? new Date(form.start_date + 'T00:00:00+03:00').toISOString()
        : new Date(form.start_date + 'T' + form.start_time + ':00+03:00').toISOString();
      const endAt = form.is_full_day
        ? new Date(form.end_date + 'T23:59:59+03:00').toISOString()
        : new Date(form.end_date + 'T' + form.end_time + ':59+03:00').toISOString();

      const { error } = await supabase.from('blocked_periods').insert({
        clinic_id:   clinicId,
        start_at:    startAt,
        end_at:      endAt,
        is_full_day: form.is_full_day,
        reason:      form.reason || null,
      });
      if (error) throw error;
      setShowModal(false);
      setForm(EMPTY_BLOCK);
      showToast('تمت إضافة فترة الغياب ✅', 'success');
      loadBlocks();
    } catch (err) {
      showToast('فشل الإضافة: ' + err.message, 'error');
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm('هل تريد حذف هذه الفترة؟')) return;
    await supabase.from('blocked_periods').delete().eq('id', id);
    loadBlocks();
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const now        = new Date().toISOString();
  const upcoming   = blocks.filter((b) => b.end_at >= now);
  const past       = blocks.filter((b) => b.end_at  < now);

  function fmtBlock(b) {
    const s = new Date(b.start_at).toLocaleDateString('ar-IQ', { weekday:'short', day:'numeric', month:'short' });
    const e = new Date(b.end_at  ).toLocaleDateString('ar-IQ', { weekday:'short', day:'numeric', month:'short' });
    return s === e ? s : `${s} — ${e}`;
  }

  if (loading) return <div className="text-center py-12 text-gray-400">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">أضف فترات يكون فيها الدكتور غير متاح (سفر، إجازة، مؤتمر…)</p>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[44px]">
          + أضف فترة غياب
        </button>
      </div>

      {toast && (
        <p className={`text-sm font-medium ${toast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{toast.msg}</p>
      )}

      {/* Upcoming blocks */}
      {upcoming.length === 0 ? (
        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-300 rounded-xl">
          لا توجد فترات غياب قادمة
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((b) => (
            <BlockRow key={b.id} block={b} fmtBlock={fmtBlock} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Past blocks toggle */}
      {past.length > 0 && (
        <div>
          <button onClick={() => setShowPast((v) => !v)}
            className="text-sm text-gray-400 hover:text-gray-600 underline">
            {showPast ? 'إخفاء' : 'عرض'} الفترات السابقة ({past.length})
          </button>
          {showPast && (
            <div className="space-y-2 mt-2 opacity-60">
              {past.map((b) => (
                <BlockRow key={b.id} block={b} fmtBlock={fmtBlock} onDelete={handleDelete} past />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add modal */}
      {showModal && (
        <Modal title="إضافة فترة غياب" onClose={() => { setShowModal(false); setForm(EMPTY_BLOCK); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">تاريخ البداية</label>
                <input type="date" value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">تاريخ النهاية</label>
                <input type="date" value={form.end_date} min={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_full_day}
                onChange={(e) => setForm((f) => ({ ...f, is_full_day: e.target.checked }))}
                className="w-4 h-4 accent-blue-600" />
              <span className="text-sm text-gray-700">يوم كامل</span>
            </label>

            {!form.is_full_day && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">وقت البداية</label>
                  <input type="time" value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">وقت النهاية</label>
                  <input type="time" value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-600 block mb-1">السبب (اختياري)</label>
              <input type="text" placeholder="سفر، إجازة، مؤتمر…" value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleAdd} disabled={saving || !form.start_date || !form.end_date}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-xl text-sm disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_BLOCK); }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2 rounded-xl text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BlockRow({ block, fmtBlock, onDelete, past }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${past ? 'border-gray-200 bg-gray-50' : 'border-orange-200 bg-orange-50'}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{past ? '📁' : '🚫'}</span>
        <div>
          <p className="font-medium text-sm text-gray-800">{fmtBlock(block)}</p>
          <p className="text-xs text-gray-500">
            {block.is_full_day ? 'يوم كامل' : `${new Date(block.start_at).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})} – ${new Date(block.end_at).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})}`}
            {block.reason && ` · ${block.reason}`}
          </p>
        </div>
      </div>
      {!past && (
        <button onClick={() => onDelete(block.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">
          حذف
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Special days (specific-date overrides)
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_SPECIAL = { specific_date: '', is_working_day: true, daily_capacity: null };

function SpecialDaysTab({ clinicId }) {
  const [specials,   setSpecials]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [form,       setForm]       = useState(EMPTY_SPECIAL);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);

  const loadSpecials = useCallback(async () => {
    const { data } = await supabase
      .from('availability_schedules')
      .select('*')
      .eq('clinic_id', clinicId)
      .not('specific_date', 'is', null)
      .order('specific_date', { ascending: true });
    setSpecials(data || []);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { loadSpecials(); }, [loadSpecials]);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase.from('availability_schedules').upsert(
        {
          clinic_id:      clinicId,
          specific_date:  form.specific_date,
          day_of_week:    null,
          is_working_day: form.is_working_day,
          shifts:         [],
          daily_capacity: form.is_working_day ? form.daily_capacity : null,
        },
        { onConflict: 'clinic_id,specific_date' }
      );
      if (error) throw error;
      setShowModal(false);
      setForm(EMPTY_SPECIAL);
      showToast('تم حفظ اليوم الخاص ✅', 'success');
      loadSpecials();
    } catch (err) {
      showToast('فشل الحفظ: ' + err.message, 'error');
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm('حذف هذا اليوم الخاص؟')) return;
    await supabase.from('availability_schedules').delete().eq('id', id);
    loadSpecials();
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">تجاوز جدول الدوام الأسبوعي ليوم واحد محدد</p>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[44px]">
          + إضافة يوم خاص
        </button>
      </div>

      {toast && (
        <p className={`text-sm font-medium ${toast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{toast.msg}</p>
      )}

      {specials.length === 0 ? (
        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-300 rounded-xl">
          لا توجد أيام خاصة مضافة
        </div>
      ) : (
        <div className="space-y-2">
          {specials.map((s) => {
            const d = new Date(s.specific_date).toLocaleDateString('ar-IQ', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
            return (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-purple-200 bg-purple-50">
                <div>
                  <p className="font-medium text-sm text-gray-800">⭐ {d}</p>
                  <p className="text-xs text-gray-500">
                    {s.is_working_day
                      ? (s.daily_capacity === null || s.daily_capacity === undefined
                          ? 'مفتوح للحجز — العدد غير محدود'
                          : `مفتوح للحجز — ${s.daily_capacity} موعد`)
                      : 'إجازة / غير متاح'}
                  </p>
                </div>
                <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                  حذف
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <Modal title="إضافة يوم خاص" onClose={() => { setShowModal(false); setForm(EMPTY_SPECIAL); }}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-600 block mb-1">التاريخ</label>
              <input type="date" value={form.specific_date}
                onChange={(e) => setForm((f) => ({ ...f, specific_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_working_day}
                onChange={(e) => setForm((f) => ({ ...f, is_working_day: e.target.checked }))}
                className="w-4 h-4 accent-blue-600" />
              <span className="text-sm text-gray-700">يوم عمل (إلغاء التحديد = إجازة)</span>
            </label>

            {form.is_working_day && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox"
                    checked={form.daily_capacity === null || form.daily_capacity === undefined}
                    onChange={(e) => setForm((f) => ({ ...f, daily_capacity: e.target.checked ? null : 10 }))}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">العدد مفتوح (غير محدود)</span>
                </label>

                {form.daily_capacity !== null && form.daily_capacity !== undefined && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">عدد المواعيد:</label>
                    <input type="number" min={1} value={form.daily_capacity}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setForm((f) => ({ ...f, daily_capacity: Number.isNaN(n) ? null : Math.max(1, n) }));
                      }}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
                    <span className="text-xs text-gray-500">مريض/اليوم</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving || !form.specific_date}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-xl text-sm disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_SPECIAL); }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2 rounded-xl text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared Modal ──────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center md:p-4 bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
