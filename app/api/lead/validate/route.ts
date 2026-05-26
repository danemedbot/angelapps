import { NextResponse } from "next/server";
import { checkCedula, checkCrm, normalizeLead, validateLeadFields } from "../shared";

export async function POST(request: Request) {
  try {
    const lead = normalizeLead(await request.json());
    const fieldErrors = validateLeadFields(lead);
    if (Object.keys(fieldErrors).length) return NextResponse.json({ ok: false, fieldErrors }, { status: 422 });

    const [crmResult, cedulaResult] = await Promise.allSettled([
      checkCrm(lead.whatsapp, lead.cedula),
      checkCedula(lead.cedula),
    ]);

    const errors: string[] = [];
    if (crmResult.status === "rejected") errors.push(crmResult.reason?.message || "CRM no disponible.");
    if (cedulaResult.status === "rejected") errors.push(cedulaResult.reason?.message || "Validación profesional no disponible.");

    if (errors.length || crmResult.status !== "fulfilled" || cedulaResult.status !== "fulfilled") {
      return NextResponse.json({ ok: false, errors: errors.length ? errors : ["No se pudieron completar las validaciones."] }, { status: 502 });
    }

    return NextResponse.json({ ok: true, lead, crm: crmResult.value, cedula: cedulaResult.value });
  } catch {
    return NextResponse.json({ ok: false, errors: ["Solicitud inválida."] }, { status: 400 });
  }
}
