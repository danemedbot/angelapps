import { NextResponse } from "next/server";
import { appendLeadToSheet, checkCedula, checkCrm, normalizeLead, validateLeadFields } from "../shared";
import { audit, getClientIp, maskDigits, rateLimit, requireSession } from "../../../../lib/security";

export async function POST(request: Request) {
  let user = "unknown";
  try {
    const session = await requireSession();
    user = session.username;
    const ip = await getClientIp();
    const lead = normalizeLead(await request.json());
    const fieldErrors = validateLeadFields(lead);
    if (Object.keys(fieldErrors).length) return NextResponse.json({ ok: false, fieldErrors }, { status: 422 });
    const limited = await rateLimit(`submit:${user}:${ip}`, 20, 60 * 1000);
    if (!limited.allowed) {
      audit({ action: "lead_submit", user, ok: false, target: maskDigits(lead.whatsapp), detail: { reason: "rate_limited" } });
      return NextResponse.json({ ok: false, errors: ["Demasiados envíos. Intenta de nuevo en un minuto."] }, { status: 429 });
    }

    const [crm, cedula] = await Promise.all([checkCrm(lead.whatsapp, lead.cedula), checkCedula(lead.cedula)]);
    const sheet = await appendLeadToSheet(lead, crm, cedula);
    audit({ action: "lead_submit", user, ok: true, target: maskDigits(lead.whatsapp), detail: { crm: crm.cliente, sheet: sheet.updatedRange } });
    return NextResponse.json({ ok: true, crm, cedula, sheet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el lead.";
    const status = message.includes("credenciales") || message.includes("GOOGLE") ? 503 : 500;
    audit({ action: "lead_submit", user, ok: false, detail: { error: message } });
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === "No autenticado." ? 401 : status });
  }
}
