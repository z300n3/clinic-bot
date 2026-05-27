import './globals.css';
import Navbar from '../components/Navbar';
import { RealtimeProvider } from '../contexts/RealtimeProvider';
import { Toaster } from 'sonner';

export const metadata = {
  title:       'لوحة تحكم العيادة',
  description: 'إدارة مواعيد وبيانات مرضى العيادة',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-slate-50">
        <RealtimeProvider>
          <Toaster
            position="top-center"
            dir="rtl"
            toastOptions={{
              className: 'font-[Cairo]',
              style: { fontFamily: 'Cairo, Tajawal, system-ui, sans-serif' },
            }}
            richColors
            closeButton
          />
          <Navbar />
          <main className="mr-0 md:mr-[70px] xl:mr-[260px] transition-[margin] duration-200 min-h-screen">
            <div className="max-w-7xl mx-auto px-4 pt-20 pb-6 md:pt-6">
              {children}
            </div>
          </main>
        </RealtimeProvider>
      </body>
    </html>
  );
}
