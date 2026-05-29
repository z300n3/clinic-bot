'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useRealtime } from '../contexts/RealtimeProvider';
import { supabase } from '../lib/supabase';

const links = [
  { href: '/',              label: 'الرئيسية',    icon: '🏠' },
  { href: '/appointments',  label: 'المواعيد',    icon: '📅' },
  { href: '/availability',  label: 'جدول الدوام', icon: '🗓️' },
  { href: '/patients',      label: 'المرضى',      icon: '👥' },
  { href: '/conversations', label: 'المحادثات',   icon: '💬' },
  { href: '/settings',      label: 'الإعدادات',   icon: '⚙️' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [open,       setOpen]       = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { awaitingHumanCount } = useRealtime();

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* ── Desktop + Tablet: fixed sidebar on the right ───────────────────── */}
      <aside className="hidden md:flex fixed top-0 right-0 h-screen flex-col bg-white border-l border-gray-200 shadow-sm z-40 w-[70px] xl:w-[260px] transition-[width] duration-200">
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100 overflow-hidden">
          <span className="text-2xl flex-shrink-0">🏥</span>
          <span className="font-bold text-lg text-brand-700 hidden xl:block whitespace-nowrap">لوحة التحكم</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
          {links.map((l) => {
            const active    = pathname === l.href;
            const showBadge = l.href === '/conversations' && awaitingHumanCount > 0;
            return (
              <div key={l.href} className="relative group px-2">
                <Link
                  href={l.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                    active
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="text-xl flex-shrink-0 leading-none relative">
                    {l.icon}
                    {showBadge && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                  </span>
                  <span className="hidden xl:block">{l.label}</span>
                  {showBadge && (
                    <span className="hidden xl:inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full mr-auto animate-pulse">
                      {awaitingHumanCount}
                    </span>
                  )}
                </Link>

                {/* Tablet tooltip */}
                <span className="xl:hidden absolute right-full top-1/2 -translate-y-1/2 flex items-center pl-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50">
                  <span className="bg-gray-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                    {l.label}
                    {showBadge && ` (${awaitingHumanCount})`}
                  </span>
                </span>
              </div>
            );
          })}
        </nav>

        {/* Bell alert */}
        {awaitingHumanCount > 0 && (
          <div className="px-2 pb-2">
            <Link
              href="/conversations"
              className="flex items-center justify-center xl:justify-start gap-2 px-3 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors min-h-[44px]"
            >
              <span className="text-xl relative">
                🔔
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
              </span>
              <span className="hidden xl:block">{awaitingHumanCount} بانتظار رد</span>
            </Link>
          </div>
        )}

        {/* Logout */}
        <div className="px-2 pb-4">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center xl:justify-start gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors min-h-[44px] disabled:opacity-50"
          >
            <span className="text-xl flex-shrink-0 leading-none">🚪</span>
            <span className="hidden xl:block">{loggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile: hamburger button ───────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="فتح القائمة"
        className="md:hidden fixed top-3 right-3 z-50 w-11 h-11 flex items-center justify-center bg-white border border-gray-200 rounded-xl shadow-sm"
      >
        <span className="text-xl leading-none relative">
          ☰
          {awaitingHumanCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </span>
      </button>

      {/* Mobile bell icon (top-left) */}
      {awaitingHumanCount > 0 && (
        <Link
          href="/conversations"
          className="md:hidden fixed top-3 left-3 z-50 w-11 h-11 flex items-center justify-center bg-red-50 border border-red-200 rounded-xl shadow-sm"
          aria-label={`${awaitingHumanCount} محادثة بانتظار رد`}
        >
          <span className="text-lg relative">
            🔔
            <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
              {awaitingHumanCount}
            </span>
          </span>
        </Link>
      )}

      {/* Mobile: dark backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile: drawer ─────────────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed top-0 right-0 h-screen w-72 bg-white z-[60] shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏥</span>
            <span className="font-bold text-lg text-brand-700">لوحة التحكم</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
            className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Drawer links */}
        <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
          {links.map((l) => {
            const active    = pathname === l.href;
            const showBadge = l.href === '/conversations' && awaitingHumanCount > 0;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-xl leading-none relative">
                  {l.icon}
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                  )}
                </span>
                <span>{l.label}</span>
                {showBadge && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full mr-auto">
                    {awaitingHumanCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Drawer bell alert */}
        {awaitingHumanCount > 0 && (
          <div className="px-4 pb-2">
            <Link
              href="/conversations"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors"
            >
              <span className="text-xl">🔔</span>
              <span>{awaitingHumanCount} محادثة بانتظار تدخل بشري</span>
            </Link>
          </div>
        )}

        {/* Drawer logout */}
        <div className="px-4 pb-4">
          <button
            onClick={() => { setOpen(false); handleLogout(); }}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors min-h-[44px] disabled:opacity-50"
          >
            <span className="text-xl">🚪</span>
            <span>{loggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
