import { NextResponse } from "next/server";
import { checkCrm, digits } from "../shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const whatsapp = digits(body?.whatsapp);
    const cedula = digits(body?.cedula);
    if (whatsapp.length !== 10) return NextResponse.json({ ok: false, errors: ["WhatsApp inválido; debe tener 10 dígitos."] }, { status: 422 });
    if (cedula.length < 4 || cedula.length > 10) return NextResponse.json({ ok: false, errors: ["Cédula inválida."] }, { status: 422 });
    const crm = await checkCrm(whatsapp, cedula);
    return NextResponse.json({ ok: true, crm });
  } catch (error) {
    return NextResponse.json({ ok: false, errors: [error instanceof Error ? error.message : "No se pudo consultar CRM."] }, { status: 500 });
  }
}
