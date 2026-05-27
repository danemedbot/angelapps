import { NextResponse } from "next/server";
import { checkCrm, digits } from "../shared";
import { audit, getClientIp, maskDigits, rateLimit, requireSession } from "../../../../lib/security";

export async function POST(request: Request) {
  let user = "unknown";
  try {
    const session = await requireSession();
    user = session.username;
    const ip = await getClientIp();
    const body = await request.json();
    const whatsapp = digits(body?.whatsapp);
    const cedula = digits(body?.cedula);
    if (whatsapp.length !== 10) return NextResponse.json({ ok: false, errors: ["WhatsApp inválido; debe tener 10 dígitos."] }, { status: 422 });
    if (cedula.length < 4 || cedula.length > 10) return NextResponse.json({ ok: false, errors: ["Cédula inválida."] }, { status: 422 });
    const limited = await rateLimit(`crm:${user}:${ip}`, 30, 60 * 1000);
    if (!limited.allowed) {
      audit({ action: "crm_lookup", user, ok: false, target: `${maskDigits(whatsapp)}/${maskDigits(cedula)}`, detail: { reason: "rate_limited" } });
      return NextResponse.json({ ok: false, errors: ["Demasiadas consultas CRM. Intenta de nuevo en un minuto."] }, { status: 429 });
    }
    const crm = await checkCrm(whatsapp, cedula);
    audit({ action: "crm_lookup", user, ok: true, target: `${maskDigits(whatsapp)}/${maskDigits(cedula)}`, detail: { cliente: crm.cliente } });
    return NextResponse.json({ ok: true, crm });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar CRM.";
    audit({ action: "crm_lookup", user, ok: false, detail: { error: message } });
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === "No autenticado." ? 401 : 500 });
  }
}
