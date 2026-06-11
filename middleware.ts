import { NextRequest, NextResponse } from "next/server";

// Optional HTTP Basic Auth for the whole dashboard. Set DASHBOARD_PASSWORD to
// enable (username is ignored). The cron route authenticates via CRON_SECRET
// instead, so it is excluded here.
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/cron")) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const [, pass] = atob(auth.slice(6)).split(":");
      if (pass === password) return NextResponse.next();
    } catch {
      // fall through to challenge
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Marketing Influence Dashboard"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
