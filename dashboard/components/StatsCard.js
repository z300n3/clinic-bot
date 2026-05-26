export default function StatsCard({ label, value, icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    green:  'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  return (
    <div className={`rounded-2xl border p-5 flex items-center gap-4 ${colors[color]}`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-sm font-medium opacity-70">{label}</p>
        <p className="text-2xl font-bold">{value ?? '—'}</p>
      </div>
    </div>
  );
}
