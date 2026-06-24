import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define public routes that don't require authentication
const isDisabledRoute = createRouteMatcher([
  '/cases(.*)',
])

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/api/chat', '/api/chat/history', '/api/webhooks(.*)', '/api/vapi(.*)', '/api/voicera(.*)',
  '/api/admin/watch-channels',
  '/api/notifications(.*)',
  '/api/user/profile',
  '/api/context(.*)',
  '/api/debug-env',
  '/api/admin/seed-capacities',
  '/api/auth/google(.*)',
  '/api/pusher/auth',
  '/api/cron(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/onboarding(.*)',
])

// Clean URL → /v2/* rewrite map
const APP_ROUTES = [
  '/dashboard',
  '/chat',
  '/meetings',
  '/coaching',
  '/goals',
  '/kpis',
  '/stakeholders',
  '/projects',
  '/wins',
  '/insights',
]

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl

  // Block disabled routes
  if (isDisabledRoute(request)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect old /v2/* URLs to clean URLs
  if (pathname === '/v2') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  if (pathname.startsWith('/v2/')) {
    const clean = pathname.replace('/v2/', '/')
    return NextResponse.redirect(new URL(clean + request.nextUrl.search, request.url))
  }

  // Rewrite clean URLs to /v2/* internally
  if (pathname === '/dashboard') {
    return NextResponse.rewrite(new URL('/v2' + request.nextUrl.search, request.url))
  }
  for (const route of APP_ROUTES) {
    if (route === '/dashboard') continue
    if (pathname === route || pathname.startsWith(route + '/')) {
      const rewritten = '/v2' + pathname
      return NextResponse.rewrite(new URL(rewritten + request.nextUrl.search, request.url))
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
