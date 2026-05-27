import { NextResponse } from "next/server";
import { audit, getSession, SESSION_COOKIE } from "../../../../lib/security";

export async function POST() {
  const session = await getSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  audit({ action: "logout", user: session?.username || "unknown", ok: true });
  return response;
}
