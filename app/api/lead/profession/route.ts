import { NextResponse } from "next/server";
import { checkCedula, digits } from "../shared";
import { audit, getClientIp, maskDigits, rateLimit, requireSession } from "../../../../lib/security";

export async function POST(request: Request) {
  let user = "unknown";
  try {
    const session = await requireSession();
    user = session.username;
    const ip = await getClientIp();
    const body = await request.json();
    const cedula = digits(body?.cedula);
    if (cedula.length < 4 || cedula.length > 10) return NextResponse.json({ ok: false, errors: ["Cédula inválida."] }, { status: 422 });
    const limited = await rateLimit(`profession:${user}:${ip}`, 30, 60 * 1000);
    if (!limited.allowed) {
      audit({ action: "profession_lookup", user, ok: false, target: maskDigits(cedula), detail: { reason: "rate_limited" } });
      return NextResponse.json({ ok: false, errors: ["Demasiadas consultas. Intenta de nuevo en un minuto."] }, { status: 429 });
    }
    const result = await checkCedula(cedula);
    audit({ action: "profession_lookup", user, ok: true, target: maskDigits(cedula), detail: { found: !!result.result } });
    return NextResponse.json({ ok: true, cedula: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar la cédula.";
    audit({ action: "profession_lookup", user, ok: false, detail: { error: message } });
    return NextResponse.json({ ok: false, errors: [message] }, { status: message === "No autenticado." ? 401 : 500 });
  }
}
