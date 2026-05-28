import { NextResponse } from "next/server";
import { audit, getClientIp, rateLimit, requireSession } from "../../../lib/security";
import { readLeadsSheet } from "../lead/shared";

export async function GET() {
  let user = "unknown";
  try {
    const session = await requireSession();
    user = session.username;
    const ip = await getClientIp();
    const limited = await rateLimit(`leads:${user}:${ip}`, 20, 60 * 1000);
    if (!limited.allowed) return NextResponse.json({ ok: false, errors: ["Demasiadas consultas. Intenta de nuevo en un minuto."] }, { status: 429 });
    const data = await readLeadsSheet();
    audit({ action: "leads_dashboard_read", user, ok: true, detail: { rows: data.rows.length, sheet: data.sheetName } });
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron leer los leads.";
    audit({ action: "leads_dashboard_read", user, ok: false, detail: { error: message } });
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === "No autenticado." ? 401 : 500 });
  }
}
