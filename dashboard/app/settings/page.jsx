'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPECIALTIES = [
  'طب عام', 'أسنان', 'جلدية', 'عيون',
  'أنف وأذن وحنجرة', 'باطنية', 'قلبية', 'عظام',
  'نسائية وتوليد', 'أطفال', 'مسالك بولية', 'أخرى',
];

// ── Icons ─────────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
      viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none"
      viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {hint && <span className="font-normal text-gray-400 mr-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow';
const disabledCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 text-gray-400 cursor-not-allowed';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Current user / clinic
  const [currentUser,  setCurrentUser]  = useState(null);
  const [loading,      setLoading]      = useState(true);

  // Section 1 — Doctor
  const [fullName, setFullName] = useState('');

  // Section 1 — Password change
  const [showPassSection,   setShowPassSection]   = useState(false);
  const [currentPass,       setCurrentPass]       = useState('');
  const [newPassword,       setNewPassword]       = useState('');
  const [confirmNewPass,    setConfirmNewPass]     = useState('');
  const [showCurrentPass,   setShowCurrentPass]   = useState(false);
  const [showNewPass,       setShowNewPass]        = useState(false);
  const [showConfirmNewPass,setShowConfirmNewPass] = useState(false);

  // Section 2 — Clinic
  const [clinicName,    setClinicName]    = useState('');
  const [specialty,     setSpecialty]     = useState('');
  const [price,         setPrice]         = useState('');
  const [address,       setAddress]       = useState('');
  const [mapLink,       setMapLink]       = useState('');
  const [waStatus,      setWaStatus]      = useState(null);  // 'pending' | 'completed' | null
  const [waPhoneId,     setWaPhoneId]     = useState('');

  // Save state
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState('');
  const [saveSuccess,  setSaveSuccess]  = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    setCurrentUser(user);

    const { data: clinic } = await supabase
      .from('clinics')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (clinic) {
      setFullName(clinic.doctor_name  || '');
      setClinicName(clinic.name       || '');
      setSpecialty(clinic.specialty   || '');
      setPrice(clinic.consultation_price != null ? String(clinic.consultation_price) : '');
      setAddress(clinic.address       || '');
      setMapLink(clinic.map_link      || '');
      setWaStatus(clinic.whatsapp_setup_status || 'pending');
      setWaPhoneId(clinic.whatsapp_phone_number_id || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!currentUser) return;
    setSaveError('');
    setSaveSuccess(false);

    // Validate password fields if shown
    if (showPassSection) {
      if (!currentPass) { setSaveError('أدخل كلمة المرور الحالية'); return; }
      if (!newPassword)  { setSaveError('أدخل كلمة المرور الجديدة'); return; }
      if (newPassword.length < 8) { setSaveError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'); return; }
      if (newPassword !== confirmNewPass) { setSaveError('كلمات المرور الجديدة غير متطابقة'); return; }
    }

    setSaving(true);
    try {
      // 1. Update clinic info
      const { error: clinicErr } = await supabase
        .from('clinics')
        .update({
          doctor_name:        fullName.trim(),
          name:               clinicName.trim(),
          specialty,
          consultation_price: price ? parseInt(price, 10) : null,
          address:            address.trim(),
          map_link:           mapLink.trim() || null,
        })
        .eq('auth_user_id', currentUser.id);

      if (clinicErr) throw new Error(clinicErr.message);

      // 2. Update password if the section is open
      if (showPassSection && newPassword) {
        // Re-authenticate first so Supabase accepts the update
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email:    currentUser.email,
          password: currentPass,
        });
        if (signInErr) { setSaveError('كلمة المرور الحالية غير صحيحة'); setSaving(false); return; }

        const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
        if (passErr) throw new Error(passErr.message);

        // Reset password fields after success
        setCurrentPass('');
        setNewPassword('');
        setConfirmNewPass('');
        setShowPassSection(false);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setSaveError('فشل الحفظ: ' + err.message);
    }
    setSaving(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Spinner />
        <span className="mr-3 text-sm">جاري التحميل...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[640px]" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">⚙️ الإعدادات</h1>

      {/* ── WhatsApp status card ─────────────────────────────────────────── */}
      {waStatus === 'completed' ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="font-semibold text-green-800 text-sm">✅ واتساب العيادة مفعّل</p>
            {waPhoneId && (
              <p className="text-green-700 text-sm">
                📱 رقم متصل:{' '}
                <span className="font-mono">
                  {'•'.repeat(Math.max(0, waPhoneId.length - 4))}{waPhoneId.slice(-4)}
                </span>
              </p>
            )}
          </div>
          <span className="inline-block flex-shrink-0 px-3 py-1 bg-green-100 border border-green-300 text-green-700 text-xs font-semibold rounded-full">
            مفعّل
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <p className="font-semibold text-yellow-800 text-sm">⏳ واتساب العيادة غير مفعّل بعد</p>
            <p className="text-yellow-700 text-sm">سيتواصل معك فريقنا لإكمال الإعداد</p>
          </div>
          <span className="inline-block flex-shrink-0 px-3 py-1 bg-yellow-100 border border-yellow-300 text-yellow-700 text-xs font-semibold rounded-full">
            في الانتظار
          </span>
        </div>
      )}

      {/* ── Success / Error toast ─────────────────────────────────────────── */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          تم حفظ التعديلات بنجاح ✅
        </div>
      )}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* ── Section 1: Doctor info ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h2 className="font-semibold text-gray-800 text-base flex items-center gap-2">
          <span>👤</span> بيانات الطبيب
        </h2>

        <Field label="الاسم الكامل">
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="د. أحمد علي"
            className={inputCls}
          />
        </Field>

        <Field label="البريد الإلكتروني" hint="لا يمكن تغييره">
          <input
            type="email"
            value={currentUser?.email || ''}
            readOnly
            className={disabledCls}
            dir="ltr"
          />
        </Field>

        {/* Password change toggle */}
        <div>
          <button
            type="button"
            onClick={() => { setShowPassSection(v => !v); setSaveError(''); }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5"
          >
            <span>{showPassSection ? '▲' : '▼'}</span>
            تغيير كلمة المرور
          </button>

          {showPassSection && (
            <div className="mt-4 space-y-4 bg-gray-50 rounded-xl p-4 border border-gray-200">

              {/* Current password */}
              <Field label="كلمة المرور الحالية">
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPass}
                    onChange={e => setCurrentPass(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} pr-12`}
                    dir="ltr"
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowCurrentPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded">
                    {showCurrentPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </Field>

              {/* New password */}
              <Field label="كلمة المرور الجديدة">
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="8 أحرف على الأقل"
                    className={`${inputCls} pr-12`}
                    dir="ltr"
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowNewPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded">
                    {showNewPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </Field>

              {/* Confirm new password */}
              <Field label="تأكيد كلمة المرور الجديدة">
                <div className="relative">
                  <input
                    type={showConfirmNewPass ? 'text' : 'password'}
                    value={confirmNewPass}
                    onChange={e => setConfirmNewPass(e.target.value)}
                    placeholder="أعد كتابة كلمة المرور الجديدة"
                    className={`${inputCls} pr-12`}
                    dir="ltr"
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowConfirmNewPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded">
                    {showConfirmNewPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Clinic info ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h2 className="font-semibold text-gray-800 text-base flex items-center gap-2">
          <span>🏥</span> بيانات العيادة
        </h2>

        <Field label="اسم العيادة">
          <input
            type="text"
            value={clinicName}
            onChange={e => setClinicName(e.target.value)}
            placeholder="عيادة النور التخصصية"
            className={inputCls}
          />
        </Field>

        <Field label="التخصص">
          <select
            value={specialty}
            onChange={e => setSpecialty(e.target.value)}
            className={inputCls}
          >
            <option value="">اختر التخصص...</option>
            {SPECIALTIES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="سعر الكشفية">
          <div className="relative">
            <input
              type="number"
              min="1"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="15000"
              className={`${inputCls} pl-28`}
              dir="ltr"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
              دينار عراقي
            </span>
          </div>
        </Field>

        <Field label="عنوان العيادة">
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="بغداد، الكرادة، شارع فلسطين"
            className={inputCls}
          />
        </Field>

        <Field label="رابط الخارطة" hint="اختياري">
          <input
            type="text"
            value={mapLink}
            onChange={e => setMapLink(e.target.value)}
            placeholder="https://maps.google.com/..."
            className={inputCls}
            dir="ltr"
          />
        </Field>
      </div>

      {/* ── Save button ───────────────────────────────────────────────────── */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
      >
        {saving ? <><Spinner /> جاري الحفظ...</> : 'حفظ التعديلات'}
      </button>
    </div>
  );
}
