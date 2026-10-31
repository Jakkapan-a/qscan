import { NextResponse, type NextRequest } from "next/server"

/**
 * Locale routing without a prefix for the default language:
 *   /th/...  → served as-is (Thai)
 *   /en/...  → 308 redirect to /... (one canonical URL per English page)
 *   /...     → rewritten internally to /en/... (URL bar keeps the clean path)
 *
 * No Accept-Language redirects: crawlers must see the same page for the same URL.
 * Users switch language with the EN / TH links.
 *
 * Kept self-contained (Proxy should not rely on shared modules), so the locale
 * list is duplicated from src/app/[lang]/dictionaries.ts.
 */
const DEFAULT_LOCALE = "en"
const PREFIXED_LOCALES = ["th"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/"
    return NextResponse.redirect(url, 308)
  }

  if (PREFIXED_LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    // Skip the API, Next.js internals and any file with an extension
    // (robots.txt, sitemap.xml, llms.txt, icons, logo, og images...).
    "/((?!api/|_next/|.*\\.[\\w]+$).*)",
  ],
}
