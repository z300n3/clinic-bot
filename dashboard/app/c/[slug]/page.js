'use client';

import { useState, useEffect, use } from 'react';
import { notFound } from 'next/navigation';

const DAYS_MAP = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const formatTime12Hour = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${minutes} ${ampm}`;
};

export default function ClinicLandingPage(props) {
  const params = use(props.params);
  const { slug } = params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [patientName, setPatientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [scheduledAt, setScheduledAt] = useState(''); // Now stores YYYY-MM-DD
  const [bookingStatus, setBookingStatus] = useState('idle'); // idle, loading, success, error
  const [formError, setFormError] = useState(null);
  const [confirmingQueue, setConfirmingQueue] = useState(null);

  // UI State
  const [showDiseases, setShowDiseases] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [theme, setTheme] = useState('dark'); // 'dark', 'light', 'eyecare'

  useEffect(() => {
    async function fetchData() {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
        const res = await fetch(`${backendUrl}/api/clinics/${slug}`);
        if (!res.ok) {
          if (res.status === 404) return notFound();
          throw new Error('فشل في جلب البيانات');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Fetch error:', err.message);
        // Fallback default data in case the backend is down
        setData({
          clinic: {
            id: 'fallback-id',
            name: 'العيادة الطبية',
            doctor_name: 'طبيب العيادة',
            specialty: 'طب عام',
            address: 'العنوان غير متاح مؤقتاً',
            consultation_price: null,
            treated_diseases: 'استشارة طبية، تشخيص عام، متابعة دورية'
          },
          faqs: [],
          schedules: [],
          blocked_periods: []
        });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  const handleBooking = async (e) => {
    e && e.preventDefault();
    setFormError(null);

    // 1. Same-day 2-hours check
    const isToday = scheduledAt === new Date().toISOString().split('T')[0];
    if (isToday && data.schedules) {
      const todayDayOfWeek = new Date().getDay(); // 0 is Sunday
      const todaySched = data.schedules.find(s => s.day_of_week === todayDayOfWeek);
      if (todaySched && todaySched.is_working_day && todaySched.shifts && todaySched.shifts.length > 0) {
        const firstShiftOpen = todaySched.shifts[0].open; // e.g. "14:00"
        const [openHour, openMin] = firstShiftOpen.split(':').map(Number);
        const now = new Date();
        const currentTotalMins = now.getHours() * 60 + now.getMinutes();
        const openTotalMins = openHour * 60 + openMin;

        if (currentTotalMins >= openTotalMins + 120) {
          setFormError('عذراً، لقد مضى على بدء الدوام أكثر من ساعتين. يرجى الحجز ليوم غد أو مراجعة العيادة مباشرة.');
          return;
        }
      }
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    // 2. Fetch expected queue number if not confirmed yet
    if (confirmingQueue === null) {
      setBookingStatus('loading');
      try {
        const res = await fetch(`${backendUrl}/api/appointments/queue-estimate?clinic_id=${data.clinic.id}&date=${scheduledAt}`);
        if (!res.ok) throw new Error('فشل في حساب الموعد المتوقع');
        const json = await res.json();
        setConfirmingQueue(json.expected_queue);
        setBookingStatus('idle');
        return; // Wait for user confirmation
      } catch (err) {
        setFormError('حدث خطأ أثناء الاتصال. يرجى المحاولة مرة أخرى.');
        setBookingStatus('idle');
        return;
      }
    }

    // 3. Confirm booking
    setBookingStatus('loading');
    
    try {
      const isoDate = new Date(scheduledAt).toISOString();
      const res = await fetch(`${backendUrl}/api/appointments/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: data.clinic.id,
          patient_name: patientName,
          phone_number: phoneNumber,
          scheduled_at: isoDate,
        })
      });

      if (!res.ok) throw new Error('فشل في تسجيل الحجز');
      
      const resJson = await res.json();
      
      if (resJson.whatsappSent) {
        setBookingStatus('success');
      } else {
        setBookingStatus('success_no_whatsapp');
      }
      
      setConfirmingQueue(null);
      setPatientName('');
      setPhoneNumber('');
      setScheduledAt('');
    } catch (err) {
      console.error(err);
      setFormError('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.');
      setBookingStatus('idle');
    }
  };

  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('eyecare');
    else setTheme('dark');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
        <p className="text-xl">جاري تحميل البيانات...</p>
      </div>
    );
  }

  const { clinic, faqs, schedules, blocked_periods } = data;
  const diseases = clinic.treated_diseases ? clinic.treated_diseases.split('،').map(d => d.trim()) : [];

  // Determine theme classes
  let themeClasses = '';
  let glassClasses = '';
  
  if (theme === 'dark') {
    themeClasses = 'dark bg-slate-950 text-slate-200';
    glassClasses = 'bg-slate-900/60 border-slate-700/50 text-slate-200';
  } else if (theme === 'eyecare') {
    themeClasses = 'bg-[#fdf6e3] text-[#655b53] sepia-[.2] contrast-100'; // Warm tone
    glassClasses = 'bg-[#fffbf0]/80 border-[#d4cbb3] text-[#5b5149] shadow-md';
  } else {
    themeClasses = 'bg-slate-50 text-slate-800';
    glassClasses = 'bg-white/60 border-white/40 text-slate-800 shadow-xl';
  }

  return (
    <div className={`min-h-screen relative overflow-hidden font-sans transition-colors duration-500 ${themeClasses}`} dir="rtl">
      
      {/* Decorative Blobs */}
      {theme === 'dark' && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[30rem] h-[30rem] bg-blue-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-pulse"></div>
          <div className="absolute top-[20%] right-[-10%] w-[30rem] h-[30rem] bg-teal-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-[-20%] left-[20%] w-[30rem] h-[30rem] bg-indigo-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-pulse" style={{ animationDelay: '4s' }}></div>
        </>
      )}
      {theme === 'light' && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[30rem] h-[30rem] bg-blue-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-pulse"></div>
          <div className="absolute top-[20%] right-[-10%] w-[30rem] h-[30rem] bg-teal-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-[-20%] left-[20%] w-[30rem] h-[30rem] bg-indigo-400/20 rounded-full mix-blend-multiply filter blur-[100px] animate-pulse" style={{ animationDelay: '4s' }}></div>
        </>
      )}

      {/* Theme Toggler Button - Removed from fixed position */}

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8">
        
        {/* Header / Hero Section (Glass Card) */}
        <header className={`backdrop-blur-xl border rounded-3xl p-8 text-center transition-all relative ${glassClasses}`}>
          {/* Theme Toggler Moved Here */}
          <button 
            onClick={cycleTheme}
            className={`absolute top-4 right-4 z-50 p-3 rounded-full backdrop-blur-md transition-transform hover:scale-110 bg-black/10 border-black/10 dark:bg-white/10 dark:border-white/10`}
            title="تغيير المظهر"
          >
            {theme === 'dark' && <span className="text-xl leading-none">🌙</span>}
            {theme === 'light' && <span className="text-xl leading-none">☀️</span>}
            {theme === 'eyecare' && <span className="text-xl leading-none">👁️</span>}
          </button>

          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-l from-blue-600 to-teal-500 mt-6">
            {clinic.name}
          </h1>
          <h2 className="text-2xl font-semibold mb-2">
            {clinic.doctor_name}
          </h2>
          <p className="text-lg mb-6 font-medium opacity-80">
            أخصائي {clinic.specialty}
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium">
            <span className="px-4 py-2 bg-black/5 rounded-full backdrop-blur-sm border border-black/10">
              📍 {clinic.address}
            </span>
            {clinic.consultation_price && (
              <span className="px-4 py-2 bg-black/5 rounded-full backdrop-blur-sm border border-black/10">
                💵 سعر الكشفية: {clinic.consultation_price} د.ع
              </span>
            )}
          </div>
        </header>

        {/* Schedule & Blocked Periods Section */}
        <section className={`backdrop-blur-lg border rounded-3xl p-6 md:p-8 ${glassClasses}`}>
            <button 
              onClick={() => setShowSchedule(!showSchedule)}
              className="w-full flex items-center justify-between text-2xl font-bold focus:outline-none transition-opacity hover:opacity-80"
            >
              <div className="flex items-center gap-2">
                <span>📅</span> جدول الدوام
              </div>
              <svg 
                className={`w-6 h-6 transition-transform duration-300 ${showSchedule ? 'rotate-180' : ''}`} 
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showSchedule && (
              <div className="mt-6 flex flex-col gap-4">
                {/* Working Days */}
                {schedules && schedules.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {schedules.map((sched, idx) => (
                      <div key={idx} className="p-4 bg-black/5 rounded-2xl border border-black/5 flex justify-between items-center">
                        <span className="font-bold text-lg">
                          {sched.day_of_week !== null ? DAYS_MAP[sched.day_of_week] : sched.specific_date}
                        </span>
                        <div className="flex flex-col text-sm opacity-90 text-left" dir="ltr">
                          {sched.is_working_day && sched.shifts && sched.shifts.length > 0 ? (
                            sched.shifts.map((shift, sIdx) => (
                              <span key={sIdx}>{formatTime12Hour(shift.open)} - {formatTime12Hour(shift.close)}</span>
                            ))
                          ) : (
                            <span className="text-red-500 font-bold">مغلق</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="opacity-80">لم يتم تحديد أوقات الدوام بعد.</p>
                )}

                {/* Substitute Doctors / Blocked Periods */}
                {blocked_periods && blocked_periods.length > 0 && (
                  <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                    <h4 className="font-bold text-amber-700 dark:text-amber-400 mb-2">⚠️ تنبيهات هامة:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {blocked_periods.map((bp, idx) => {
                        const startDate = new Date(bp.start_at).toLocaleDateString('ar-IQ');
                        return (
                          <li key={idx} className="opacity-90">
                            في يوم <span className="font-bold">{startDate}</span>: 
                            {bp.substitute_doctor_name 
                              ? ` سيتواجد الطبيب البديل (${bp.substitute_doctor_name}) لتقديم الرعاية الطبية.` 
                              : ` العيادة مغلقة (${bp.reason || 'إجازة'}).`}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
        </section>

        {/* Treated Diseases Section */}
        {diseases.length > 0 && (
          <section className={`backdrop-blur-lg border rounded-3xl p-6 md:p-8 ${glassClasses}`}>
            <button 
              onClick={() => setShowDiseases(!showDiseases)}
              className="w-full flex items-center justify-between text-2xl font-bold focus:outline-none transition-opacity hover:opacity-80"
            >
              <div className="flex items-center gap-2">
                <span>🩺</span> الحالات التي نعالجها
              </div>
              <svg 
                className={`w-6 h-6 transition-transform duration-300 ${showDiseases ? 'rotate-180' : ''}`} 
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showDiseases && (
              <div className="flex flex-wrap gap-3 mt-6">
                {diseases.map((disease, idx) => (
                  <span key={idx} className="px-4 py-2 bg-black/5 border border-black/10 rounded-xl shadow-sm hover:scale-105 transition-transform cursor-default">
                    {disease}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Booking Form Section */}
        <section className={`backdrop-blur-lg border rounded-3xl p-8 relative overflow-hidden ${glassClasses}`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full filter blur-2xl"></div>
          
          <h3 className="text-2xl font-bold mb-2 relative z-10">
            احجز موعدك الآن 📅
          </h3>
          <p className="opacity-80 mb-6 relative z-10">
            أدخل بياناتك وسنقوم بتأكيد موعدك مباشرة عبر الواتساب.
          </p>

          {bookingStatus.startsWith('success') ? (
            <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-2xl text-center relative z-10">
              <span className="text-4xl mb-2 block">✅</span>
              <h4 className="text-xl font-bold text-green-700 dark:text-green-400 mb-2">تم استلام طلبك بنجاح!</h4>
              {bookingStatus === 'success' ? (
                <p className="opacity-90">ستصلك رسالة تأكيد على واتساب قريباً.</p>
              ) : (
                <p className="opacity-90 text-amber-700 dark:text-amber-400">
                  تم تأكيد الموعد، لكن يرجى مراسلة العيادة على الواتساب لتفعيل الإشعارات والتأكيد النهائي.
                </p>
              )}
              <button onClick={() => { setBookingStatus('idle'); setConfirmingQueue(null); setFormError(null); }} className="mt-4 px-6 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors">
                حجز موعد آخر
              </button>
            </div>
          ) : confirmingQueue !== null ? (
            <div className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-center relative z-10">
              <span className="text-4xl mb-2 block">🔢</span>
              <h4 className="text-xl font-bold text-blue-700 dark:text-blue-400 mb-2">تأكيد الموعد</h4>
              <p className="opacity-90 text-lg mb-4">رقمك المتوقع في الحجز هو: <strong className="text-2xl">{confirmingQueue}</strong></p>
              
              {formError && (
                <p className="text-red-500 font-bold mb-4">{formError}</p>
              )}

              <div className="flex flex-wrap gap-4 justify-center">
                <button 
                  onClick={handleBooking} 
                  disabled={bookingStatus === 'loading'}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-70"
                >
                  {bookingStatus === 'loading' ? 'جاري التأكيد...' : 'نعم، تأكيد الحجز'}
                </button>
                <button 
                  onClick={() => { setConfirmingQueue(null); setFormError(null); }} 
                  disabled={bookingStatus === 'loading'}
                  className="px-6 py-3 bg-black/10 text-slate-800 dark:text-white rounded-xl font-medium hover:bg-black/20 transition-colors disabled:opacity-70"
                >
                  إلغاء وتعديل
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleBooking} className="flex flex-col gap-5 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-2">
                  <label className="font-semibold opacity-90">الاسم الكامل</label>
                  <input 
                    type="text" 
                    required 
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="p-3 rounded-xl bg-black/5 border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition-all"
                    placeholder="مثال: أحمد محمد"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="font-semibold opacity-90">رقم الهاتف (واتساب)</label>
                  <input 
                    type="tel" 
                    required 
                    pattern="^07[0-9]{9}$"
                    maxLength={11}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="p-3 rounded-xl bg-black/5 border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition-all text-left"
                    placeholder="مثال: 07729243035"
                    dir="ltr"
                    title="يجب أن يتكون الرقم من 11 رقماً ويبدأ بـ 07"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="font-semibold opacity-90">اختر التاريخ (اليوم)</label>
                <input 
                  type="date" 
                  required 
                  min={new Date().toISOString().split('T')[0]}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="p-3 rounded-xl bg-black/5 border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition-all"
                />
              </div>

              {formError && (
                <p className="text-red-500 font-bold text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{formError}</p>
              )}

              <button 
                type="submit" 
                disabled={bookingStatus === 'loading'}
                className="mt-2 py-4 bg-gradient-to-r from-blue-600 to-teal-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-70 disabled:hover:scale-100"
              >
                {bookingStatus === 'loading' ? 'جاري التأكيد...' : 'احجز موعدك الآن'}
              </button>
            </form>
          )}
        </section>

        {/* Social Media / Contact Section */}
        <section className={`backdrop-blur-lg border rounded-3xl p-8 text-center ${glassClasses}`}>
            <h3 className="text-2xl font-bold mb-4">تواصل معنا 💬</h3>
            <p className="opacity-80 mb-6">يمكنك الاستفسار أو تأكيد الحجز بالتواصل المباشر مع العيادة عبر واتساب.</p>
            <a 
              href="https://wa.me/9647700000000" // ضع رقم العيادة الحقيقي هنا (مثال: 9647729243035)
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20bd5a] text-white px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:scale-105 shadow-lg"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z"/></svg>
              تواصل عبر واتساب
            </a>
        </section>

        {/* FAQs Section */}
        {faqs && faqs.length > 0 && (
          <section className={`backdrop-blur-lg border rounded-3xl p-6 md:p-8 ${glassClasses}`}>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span>❓</span> الأسئلة الشائعة
            </h3>
            <div className="flex flex-col gap-4">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-4 bg-black/5 border border-black/10 rounded-2xl">
                  <h4 className="font-bold text-lg mb-2">{faq.question}</h4>
                  <p className="opacity-90">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
