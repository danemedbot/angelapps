import { NextResponse } from "next/server";
import { audit, createSessionToken, getClientIp, rateLimit, SESSION_COOKIE, verifyCredentials } from "../../../../lib/security";

export async function POST(request: Request) {
  const ip = await getClientIp();
  const limited = await rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.allowed) {
    audit({ action: "login_rate_limited", ok: false, target: ip });
    return NextResponse.json({ ok: false, errors: ["Demasiados intentos. Intenta más tarde."] }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!username || !password || !verifyCredentials(username, password)) {
    audit({ action: "login", user: username || "unknown", ok: false, target: ip });
    return NextResponse.json({ ok: false, errors: ["Usuario o contraseña inválidos."] }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(username), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  audit({ action: "login", user: username, ok: true, target: ip });
  return response;
}
