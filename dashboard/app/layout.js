import './globals.css';
import ConditionalLayout from '../components/ConditionalLayout';

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
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
