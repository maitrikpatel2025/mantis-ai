import NextAuth from "next-auth";
import { authConfig } from "./edge-config.js";
import { NextResponse } from "next/server";
const { auth } = NextAuth(authConfig);
const middleware = auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api")) return;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot|mp4|webm)$/i.test(pathname)) {
    return;
  }
  if (pathname === "/login") {
    if (req.auth) return NextResponse.redirect(new URL("/", req.url));
    return;
  }
  if (!req.auth) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    const cookieNames = Object.keys(
      req.cookies.getAll().reduce((acc, c) => {
        acc[c.name] = true;
        return acc;
      }, {})
    );
    const staleSessionCookies = cookieNames.filter(
      (name) => name === "authjs.session-token" || name === "__Secure-authjs.session-token" || /^authjs\.session-token\.\d+$/.test(name) || /^__Secure-authjs\.session-token\.\d+$/.test(name)
    );
    if (staleSessionCookies.length > 0) {
      for (const name of staleSessionCookies) {
        response.cookies.set(name, "", { maxAge: 0, path: "/" });
      }
    }
    return response;
  }
});
const config = {
  // Exclude all _next internal paths (static chunks, HMR, images, Turbopack dev assets)
  matcher: ["/((?!_next|favicon.ico).*)"]
};
export {
  config,
  middleware
};
