import { supabase, CLINIC_ID } from '../../lib/supabase';
import Link from 'next/link';

export const revalidate = 30;

async function fetchPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select(`
      id,
      name,
      phone_number,
      first_seen_at,
      last_seen_at,
      appointments(count)
    `)
    .eq('clinic_id', CLINIC_ID)
    .order('last_seen_at', { ascending: false });

  if (error) return [];
  return data || [];
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-IQ', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default async function PatientsPage() {
  const patients = await fetchPatients();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">👥 المرضى</h1>
        <span className="text-sm text-gray-500">{patients.length} مريض</span>
      </div>

      {patients.length === 0 ? (
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
                    <span className="font-semibold text-gray-900 text-base break-words min-w-0">
                      {p.name || <span className="text-gray-400 italic">غير محدد</span>}
                    </span>
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
                        <td className="px-4 py-3 font-medium text-gray-900 break-words">
                          {p.name || <span className="text-gray-400 italic">غير محدد</span>}
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
    </div>
  );
}
