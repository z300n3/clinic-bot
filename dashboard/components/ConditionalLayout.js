'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import { RealtimeProvider } from '../contexts/RealtimeProvider';
import { Toaster } from 'sonner';

const AUTH_PATHS = new Set(['/login', '/register']);

const TOASTER_PROPS = {
  position:     'top-center',
  dir:          'rtl',
  richColors:   true,
  closeButton:  true,
  toastOptions: {
    className: 'font-[Cairo]',
    style:     { fontFamily: 'Cairo, Tajawal, system-ui, sans-serif' },
  },
};

export default function ConditionalLayout({ children }) {
  const pathname = usePathname();

  // Auth pages: no sidebar, no realtime provider
  if (AUTH_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  // Dashboard pages: full sidebar layout
  return (
    <RealtimeProvider>
      <Toaster {...TOASTER_PROPS} />
      <Navbar />
      <main className="mr-0 md:mr-[70px] xl:mr-[260px] transition-[margin] duration-200 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 pt-20 pb-6 md:pt-6">
          {children}
        </div>
      </main>
    </RealtimeProvider>
  );
}
