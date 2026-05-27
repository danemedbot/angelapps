import { NextResponse } from "next/server";
import { checkCedula, checkCrm, normalizeLead, validateLeadFields } from "../shared";
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
    const limited = await rateLimit(`validate:${user}:${ip}`, 30, 60 * 1000);
    if (!limited.allowed) {
      audit({ action: "lead_validate", user, ok: false, target: maskDigits(lead.whatsapp), detail: { reason: "rate_limited" } });
      return NextResponse.json({ ok: false, errors: ["Demasiadas validaciones. Intenta de nuevo en un minuto."] }, { status: 429 });
    }

    const [crmResult, cedulaResult] = await Promise.allSettled([
      checkCrm(lead.whatsapp, lead.cedula),
      checkCedula(lead.cedula),
    ]);

    const errors: string[] = [];
    if (crmResult.status === "rejected") errors.push(crmResult.reason?.message || "CRM no disponible.");
    if (cedulaResult.status === "rejected") errors.push(cedulaResult.reason?.message || "Validación profesional no disponible.");

    if (errors.length || crmResult.status !== "fulfilled" || cedulaResult.status !== "fulfilled") {
      audit({ action: "lead_validate", user, ok: false, target: maskDigits(lead.whatsapp), detail: { errors } });
      return NextResponse.json({ ok: false, errors: errors.length ? errors : ["No se pudieron completar las validaciones."] }, { status: 502 });
    }

    audit({ action: "lead_validate", user, ok: true, target: maskDigits(lead.whatsapp), detail: { crm: crmResult.value.cliente } });
    return NextResponse.json({ ok: true, lead, crm: crmResult.value, cedula: cedulaResult.value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Solicitud inválida.";
    audit({ action: "lead_validate", user, ok: false, detail: { error: message } });
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === "No autenticado." ? 401 : 400 });
  }
}
