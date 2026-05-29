'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, error, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 mr-0.5"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();

  // Section 1 — Account
  const [fullName,          setFullName]          = useState('');
  const [email,             setEmail]             = useState('');
  const [password,          setPassword]          = useState('');
  const [confirmPassword,   setConfirmPassword]   = useState('');
  const [showPassword,      setShowPassword]      = useState(false);
  const [showConfirmPass,   setShowConfirmPass]   = useState(false);

  // Section 2 — Clinic
  const [clinicName, setClinicName] = useState('');
  const [specialty,  setSpecialty]  = useState('');
  const [price,      setPrice]      = useState('');
  const [address,    setAddress]    = useState('');
  const [mapLink,    setMapLink]    = useState('');
  const [phone,      setPhone]      = useState('');

  // UI state
  const [errors,      setErrors]      = useState({});
  const [globalError, setGlobalError] = useState('');
  const [loading,     setLoading]     = useState(false);

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate() {
    const e = {};
    if (!fullName.trim())       e.fullName        = 'الاسم الكامل مطلوب';
    if (!email.trim())          e.email           = 'البريد الإلكتروني مطلوب';
    if (!password)              e.password        = 'كلمة المرور مطلوبة';
    else if (password.length < 8) e.password      = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    if (password !== confirmPassword) e.confirmPassword = 'كلمات المرور غير متطابقة';
    if (!clinicName.trim())     e.clinicName      = 'اسم العيادة مطلوب';
    if (!specialty)             e.specialty       = 'التخصص مطلوب';
    if (!price)                 e.price           = 'سعر الكشفية مطلوب';
    else if (Number(price) <= 0) e.price          = 'أدخل سعراً صحيحاً';
    if (!address.trim())        e.address         = 'عنوان العيادة مطلوب';
    if (!phone.trim())          e.phone           = 'رقم الهاتف مطلوب';
    return e;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setGlobalError('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        const msg = authError.message || '';
        if (msg.includes('already registered') || authError.code === 'user_already_exists') {
          setGlobalError('البريد الإلكتروني مستخدم مسبقاً');
        } else if (msg.includes('Password') || msg.includes('password')) {
          setGlobalError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
        } else {
          setGlobalError('حدث خطأ، حاول مرة أخرى');
        }
        setLoading(false);
        return;
      }

      const user = authData?.user;
      if (!user) {
        // Email confirmation required
        setGlobalError('تم إنشاء الحساب! تحقق من بريدك الإلكتروني لتفعيل الحساب.');
        setLoading(false);
        return;
      }

      // 2. Create clinic row
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          name:                 clinicName.trim(),
          doctor_name:          fullName.trim(),
          specialty,
          address:              address.trim(),
          map_link:             mapLink.trim() || null,
          consultation_price:   parseInt(price, 10),
          phone_number:         phone.trim(),
          auth_user_id:         user.id,
        })
        .select('id')
        .single();

      if (clinicError) {
        setGlobalError('حدث خطأ في إنشاء العيادة، حاول مرة أخرى');
        setLoading(false);
        return;
      }

      // 3. Create clinic_users row
      await supabase.from('clinic_users').insert({
        clinic_id:    clinicData.id,
        auth_user_id: user.id,
        role:         'admin',
      });

      router.push('/');
      router.refresh();
    } catch {
      setGlobalError('حدث خطأ، حاول مرة أخرى');
      setLoading(false);
    }
  }

  // ── Shared input classes ────────────────────────────────────────────────────

  const inputCls = (field) =>
    `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12"
      dir="rtl"
    >
      <div className="w-full max-w-[520px]">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-10">

          {/* Logo + Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-4">
              <span className="text-4xl leading-none">🏥</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">إنشاء حساب جديد</h1>
            <p className="text-gray-500 text-sm mt-1">أنشئ حسابك وابدأ بإدارة عيادتك</p>
          </div>

          {/* Global error */}
          {globalError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {globalError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>

            {/* ── Section 1: Account ── */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="flex-1 h-px bg-gray-200" />
                بيانات الحساب
                <span className="flex-1 h-px bg-gray-200" />
              </h2>
              <div className="space-y-4">

                {/* Full name */}
                <Field label="الاسم الكامل" error={errors.fullName} required>
                  <input
                    type="text" autoComplete="name"
                    value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="د. أحمد علي"
                    className={inputCls('fullName')}
                  />
                </Field>

                {/* Email */}
                <Field label="البريد الإلكتروني" error={errors.email} required>
                  <input
                    type="email" autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="doctor@clinic.com"
                    className={inputCls('email')}
                    dir="ltr"
                  />
                </Field>

                {/* Password */}
                <Field label="كلمة المرور" error={errors.password} required>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="8 أحرف على الأقل"
                      className={`${inputCls('password')} pr-12`}
                      dir="ltr"
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded">
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </Field>

                {/* Confirm password */}
                <Field label="تأكيد كلمة المرور" error={errors.confirmPassword} required>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="أعد كتابة كلمة المرور"
                      className={`${inputCls('confirmPassword')} pr-12`}
                      dir="ltr"
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowConfirmPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded">
                      {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </Field>
              </div>
            </div>

            {/* ── Section 2: Clinic ── */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="flex-1 h-px bg-gray-200" />
                بيانات العيادة
                <span className="flex-1 h-px bg-gray-200" />
              </h2>
              <div className="space-y-4">

                {/* Clinic name */}
                <Field label="اسم العيادة" error={errors.clinicName} required>
                  <input
                    type="text"
                    value={clinicName} onChange={e => setClinicName(e.target.value)}
                    placeholder="عيادة النور التخصصية"
                    className={inputCls('clinicName')}
                  />
                </Field>

                {/* Specialty */}
                <Field label="التخصص" error={errors.specialty} required>
                  <select
                    value={specialty} onChange={e => setSpecialty(e.target.value)}
                    className={inputCls('specialty')}
                  >
                    <option value="">اختر التخصص...</option>
                    {SPECIALTIES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>

                {/* Consultation price */}
                <Field label="سعر الكشفية" error={errors.price} required>
                  <div className="relative">
                    <input
                      type="number" min="1"
                      value={price} onChange={e => setPrice(e.target.value)}
                      placeholder="15000"
                      className={`${inputCls('price')} pl-28`}
                      dir="ltr"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                      دينار عراقي
                    </span>
                  </div>
                </Field>

                {/* Address */}
                <Field label="عنوان العيادة" error={errors.address} required>
                  <input
                    type="text"
                    value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="بغداد، الكرادة، شارع فلسطين"
                    className={inputCls('address')}
                  />
                </Field>

                {/* Phone number */}
                <Field label="رقم هاتف العيادة" error={errors.phone} required>
                  <input
                    type="text"
                    value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+9647XXXXXXXXX"
                    className={inputCls('phone')}
                    dir="ltr"
                    maxLength={16}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    هذا الرقم سيُستخدم لربط واتساب العيادة
                  </p>
                </Field>

                {/* Map link (optional) */}
                <Field label="رابط موقع العيادة على الخارطة" error={errors.mapLink}>
                  <input
                    type="text"
                    value={mapLink} onChange={e => setMapLink(e.target.value)}
                    placeholder="رابط Google Maps (اختياري)"
                    className={inputCls('mapLink')}
                    dir="ltr"
                  />
                </Field>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? <><Spinner /> جاري الإنشاء...</> : 'إنشاء حساب'}
            </button>
          </form>

          {/* Login link */}
          <p className="text-center text-sm text-gray-500 mt-6">
            لديك حساب؟{' '}
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline underline-offset-2"
            >
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
