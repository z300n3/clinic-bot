'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',               label: 'الرئيسية'  },
  { href: '/appointments',   label: 'المواعيد'  },
  { href: '/availability',   label: 'جدول الدوام' },
  { href: '/patients',       label: 'المرضى'    },
  { href: '/conversations',  label: 'المحادثات' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏥</span>
          <span className="font-bold text-lg text-brand-700">لوحة التحكم</span>
        </div>

        {/* Nav links */}
        <div className="flex gap-1">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
