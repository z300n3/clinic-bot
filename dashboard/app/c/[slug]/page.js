'use client';

import { useState, useEffect, use } from 'react';
import { notFound } from 'next/navigation';

export default function ClinicLandingPage(props) {
  const params = use(props.params);
  const { slug } = params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [patientName, setPatientName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [bookingStatus, setBookingStatus] = useState('idle'); // idle, loading, success, error

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
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  const handleBooking = async (e) => {
    e.preventDefault();
    setBookingStatus('loading');
    
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
      const res = await fetch(`${backendUrl}/api/appointments/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: data.clinic.id,
          patient_name: patientName,
          phone_number: phoneNumber,
          scheduled_at: new Date(scheduledAt).toISOString(),
        })
      });

      if (!res.ok) throw new Error('فشل في تسجيل الحجز');
      
      setBookingStatus('success');
      setPatientName('');
      setPhoneNumber('');
      setScheduledAt('');
    } catch (err) {
      console.error(err);
      setBookingStatus('error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
        <p className="text-xl">{error || 'حدث خطأ غير متوقع'}</p>
      </div>
    );
  }

  const { clinic, faqs } = data;
  const diseases = clinic.treated_diseases ? clinic.treated_diseases.split('،').map(d => d.trim()) : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 relative overflow-hidden text-slate-800 dark:text-slate-200 font-sans" dir="rtl">
      {/* Decorative Blobs for Glassmorphism Background */}
      <div className="absolute top-[-10%] left-[-10%] w-[30rem] h-[30rem] bg-blue-400/20 dark:bg-blue-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] animate-pulse"></div>
      <div className="absolute top-[20%] right-[-10%] w-[30rem] h-[30rem] bg-teal-400/20 dark:bg-teal-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[30rem] h-[30rem] bg-indigo-400/20 dark:bg-indigo-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[100px] animate-pulse" style={{ animationDelay: '4s' }}></div>

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8">
        
        {/* Header / Hero Section (Glass Card) */}
        <header className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 rounded-3xl p-8 shadow-xl text-center transition-all hover:bg-white/70 dark:hover:bg-slate-900/70">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-l from-blue-600 to-teal-500">
            {clinic.name}
          </h1>
          <h2 className="text-2xl font-semibold mb-2 text-slate-700 dark:text-slate-300">
            {clinic.doctor_name}
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 font-medium">
            أخصائي {clinic.specialty}
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium">
            <span className="px-4 py-2 bg-blue-100/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full backdrop-blur-sm">
              📍 {clinic.address}
            </span>
            {clinic.consultation_price && (
              <span className="px-4 py-2 bg-teal-100/50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full backdrop-blur-sm">
                💵 سعر الكشفية: {clinic.consultation_price} د.ع
              </span>
            )}
          </div>
        </header>

        {/* Treated Diseases Section */}
        {diseases.length > 0 && (
          <section className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg border border-white/30 dark:border-slate-700/50 rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>🩺</span> الحالات التي نعالجها
            </h3>
            <div className="flex flex-wrap gap-3">
              {diseases.map((disease, idx) => (
                <span key={idx} className="px-4 py-2 bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 rounded-xl text-slate-700 dark:text-slate-300 shadow-sm hover:scale-105 transition-transform cursor-default">
                  {disease}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Booking Form Section */}
        <section className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg border border-white/30 dark:border-slate-700/50 rounded-3xl p-8 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full filter blur-2xl"></div>
          
          <h3 className="text-2xl font-bold mb-2 text-slate-800 dark:text-slate-100 relative z-10">
            احجز موعدك الآن 📅
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6 relative z-10">
            أدخل بياناتك وسنقوم بتأكيد موعدك مباشرة عبر الواتساب.
          </p>

          {bookingStatus === 'success' ? (
            <div className="p-6 bg-green-100/50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-2xl text-center backdrop-blur-md relative z-10">
              <span className="text-4xl mb-2 block">✅</span>
              <h4 className="text-xl font-bold text-green-800 dark:text-green-300 mb-2">تم استلام طلبك بنجاح!</h4>
              <p className="text-green-700 dark:text-green-400">ستصلك رسالة تأكيد على واتساب قريباً.</p>
              <button onClick={() => setBookingStatus('idle')} className="mt-4 px-6 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors">
                حجز موعد آخر
              </button>
            </div>
          ) : (
            <form onSubmit={handleBooking} className="flex flex-col gap-5 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-2">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">الاسم الكامل</label>
                  <input 
                    type="text" 
                    required 
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition-all"
                    placeholder="مثال: أحمد محمد"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">رقم الواتساب</label>
                  <input 
                    type="tel" 
                    required 
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition-all text-left"
                    placeholder="+964..."
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300">اختر التاريخ والوقت</label>
                <input 
                  type="datetime-local" 
                  required 
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition-all"
                />
              </div>

              {bookingStatus === 'error' && (
                <p className="text-red-500 font-medium text-sm">حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.</p>
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

        {/* FAQs Section */}
        {faqs && faqs.length > 0 && (
          <section className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg border border-white/30 dark:border-slate-700/50 rounded-3xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>❓</span> الأسئلة الشائعة
            </h3>
            <div className="flex flex-col gap-4">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-4 bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl">
                  <h4 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-2">{faq.question}</h4>
                  <p className="text-slate-600 dark:text-slate-400">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
