import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "danemed_session";
const publicPaths = ["/login", "/api/auth/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, errors: ["No autenticado."] }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "same-origin");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
