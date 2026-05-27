import { createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";

export const SESSION_COOKIE = "danemed_session";
const DEFAULT_SESSION_HOURS = 12;

type AuditEvent = {
  action: string;
  user?: string;
  ok?: boolean;
  target?: string;
  detail?: Record<string, unknown>;
};

function getAuthSecret() {
  return process.env.APP_AUTH_SECRET || process.env.AUTH_SECRET || "";
}

function getAllowedUsers() {
  return (process.env.APP_USERS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [username, password] = item.split(":");
      return { username: username?.trim(), password: password?.trim() };
    })
    .filter((item) => item.username && item.password);
}

function sign(payload: string) {
  const secret = getAuthSecret();
  if (!secret) throw new Error("Falta APP_AUTH_SECRET.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyCredentials(username: string, password: string) {
  const normalizedUser = username.trim().toLowerCase();
  return getAllowedUsers().some((user) => user.username.toLowerCase() === normalizedUser && safeEqual(user.password, password));
}

export function createSessionToken(username: string) {
  const expiresAt = Date.now() + DEFAULT_SESSION_HOURS * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ username: username.trim().toLowerCase(), expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    if (!safeEqual(sign(payload), signature)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { username?: string; expiresAt?: number };
    if (!data.username || !data.expiresAt || data.expiresAt < Date.now()) return null;
    return { username: data.username, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return parseSessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("No autenticado.");
  return session;
}

export async function getClientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recordKey = `rl:${key}`;
  const globalForRateLimit = globalThis as typeof globalThis & { __danemedRateLimit?: Map<string, { count: number; resetAt: number }> };
  const store = globalForRateLimit.__danemedRateLimit || new Map<string, { count: number; resetAt: number }>();
  globalForRateLimit.__danemedRateLimit = store;
  const current = store.get(recordKey);
  if (!current || current.resetAt <= now) {
    store.set(recordKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (current.count >= limit) return { allowed: false, remaining: 0, resetAt: current.resetAt };
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

export function maskDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function audit(event: AuditEvent) {
  const entry = {
    ts: new Date().toISOString(),
    app: "angelapps",
    ...event,
  };
  console.info("DANEMED_AUDIT", JSON.stringify(entry));
}
