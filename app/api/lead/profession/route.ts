import { NextResponse } from "next/server";
import { checkCedula, digits } from "../shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cedula = digits(body?.cedula);
    if (cedula.length < 4 || cedula.length > 10) return NextResponse.json({ ok: false, errors: ["Cédula inválida."] }, { status: 422 });
    const result = await checkCedula(cedula);
    return NextResponse.json({ ok: true, cedula: result });
  } catch (error) {
    return NextResponse.json({ ok: false, errors: [error instanceof Error ? error.message : "No se pudo consultar la cédula."] }, { status: 500 });
  }
}
