import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

// Routes that are always public (no login required)
const PUBLIC_PATHS = new Set(["/", "/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and the landing page
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // If SESSION_SECRET is not configured, skip auth (local dev without setup)
  if (!process.env.SESSION_SECRET) return NextResponse.next();

  // Validate session cookie
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    return NextResponse.next();
  }

  // Redirect to login, preserving the destination
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes — auth-simple login/logout don't need protection)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
