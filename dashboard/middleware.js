import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const AUTH_PAGES = new Set(['/login', '/register']);

export async function middleware(req) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Always use getUser() — getSession() is not secure in middleware
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  const isAuthPage = AUTH_PAGES.has(pathname);
  const isPatientPage = pathname.startsWith('/c/');

  // Not logged in → redirect to /login (except on auth pages and patient pages)
  if (!user && !isAuthPage && !isPatientPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Already logged in → redirect away from auth pages
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
