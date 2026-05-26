import { supabase, CLINIC_ID } from '../lib/supabase';
import StatsCard from '../components/StatsCard';
import Link from 'next/link';

export const revalidate = 60; // ISR: refresh every minute

async function fetchHomeData() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [todayRes, nextRes, patientsRes, weekRes] = await Promise.all([
    // Today's appointment count
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', CLINIC_ID)
      .gte('scheduled_at', todayStart.toISOString())
      .lte('scheduled_at', todayEnd.toISOString())
      .neq('status', 'cancelled'),

    // Next upcoming appointment with patient info
    supabase
      .from('appointments')
      .select('id, scheduled_at, reason, status, patients(name, phone_number)')
      .eq('clinic_id', CLINIC_ID)
      .gte('scheduled_at', new Date().toISOString())
      .in('status', ['scheduled', 'confirmed'])
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Total patient count
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', CLINIC_ID),

    // This week's appointments
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', CLINIC_ID)
      .gte('scheduled_at', (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d.toISOString(); })())
      .neq('status', 'cancelled'),
  ]);

  return {
    todayCount:   todayRes.count ?? 0,
    nextAppt:     nextRes.data,
    totalPatients: patientsRes.count ?? 0,
    weekCount:    weekRes.count ?? 0,
  };
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('ar-IQ', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  });
}

export default async function HomePage() {
  const { todayCount, nextAppt, totalPatients, weekCount } = await fetchHomeData();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">لوحة التحكم</h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="مواعيد اليوم"      value={todayCount}    icon="📅" color="blue"   />
        <StatsCard label="مواعيد هذا الأسبوع" value={weekCount}     icon="📊" color="purple" />
        <StatsCard label="إجمالي المرضى"     value={totalPatients} icon="👥" color="green"  />
        <StatsCard label="الموعد القادم"       value={nextAppt ? '⏰' : 'لا يوجد'} icon="🔔" color="orange" />
      </div>

      {/* Next appointment card */}
      {nextAppt ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">⏰ الموعد القادم</h2>
          <div className="flex flex-col gap-2 text-gray-700">
            <p><span className="font-medium">المريض: </span>{nextAppt.patients?.name || nextAppt.patients?.phone_number || 'غير معروف'}</p>
            <p><span className="font-medium">الهاتف: </span>{nextAppt.patients?.phone_number}</p>
            <p><span className="font-medium">الوقت: </span>{fmtDate(nextAppt.scheduled_at)}</p>
            {nextAppt.reason && <p><span className="font-medium">السبب: </span>{nextAppt.reason}</p>}
          </div>
          <div className="mt-4">
            <Link href="/appointments" className="text-brand-600 hover:text-brand-700 text-sm font-medium">
              عرض كل المواعيد ←
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>لا توجد مواعيد قادمة</p>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
