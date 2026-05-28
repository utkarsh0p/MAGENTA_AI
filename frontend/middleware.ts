import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Unauthenticated — redirect to sign-in
  if (!user && (pathname.startsWith('/admin') || pathname.startsWith('/onboarding'))) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  // Authenticated — check onboarding status
  if (user && pathname.startsWith('/admin')) {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (token) {
      const statusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)

      if (statusRes?.ok) {
        const { completed } = await statusRes.json() as { completed: boolean }
        if (!completed) {
          return NextResponse.redirect(new URL('/onboarding', request.url))
        }
      }
    }
  }

  // Redirect authenticated + onboarded users away from auth pages
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
