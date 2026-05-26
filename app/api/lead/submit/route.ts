import { NextResponse } from "next/server";
import { appendLeadToSheet, checkCedula, checkCrm, normalizeLead, validateLeadFields } from "../shared";

export async function POST(request: Request) {
  try {
    const lead = normalizeLead(await request.json());
    const fieldErrors = validateLeadFields(lead);
    if (Object.keys(fieldErrors).length) return NextResponse.json({ ok: false, fieldErrors }, { status: 422 });

    const [crm, cedula] = await Promise.all([checkCrm(lead.whatsapp, lead.cedula), checkCedula(lead.cedula)]);
    const sheet = await appendLeadToSheet(lead, crm, cedula);
    return NextResponse.json({ ok: true, crm, cedula, sheet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el lead.";
    const status = message.includes("credenciales") || message.includes("GOOGLE") ? 503 : 500;
    return NextResponse.json({ ok: false, errors: [message] }, { status });
  }
}
