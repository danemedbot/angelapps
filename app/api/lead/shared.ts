import crypto from "node:crypto";

export type CrmStatus = "viejo" | "nuevo" | "desconocido";

export type CedulaRecord = {
  cedula?: string;
  tipo?: string;
  nombre?: string;
  carrera?: string;
  universidad?: string;
  estado?: string;
  anio?: string;
};

export type LeadPayload = {
  quienAsigna: string;
  fuente: string;
  producto: string;
  agente: string;
  nombre: string;
  whatsapp: string;
  ciudad: string;
  cedula: string;
  profesion?: string;
  crmAnterior?: string;
  colorCrm?: string;
  interes: string;
  eraDeEseAsesor?: string;
};

export const CRM_ENDPOINT = process.env.CRM_CHECK_ENDPOINT || "https://app.daneapp.com/danemed/index.php/api/leads/check-client";
export const CRM_API_TOKEN = process.env.CRM_API_TOKEN || process.env.CRM_CHECK_TOKEN || "";
export const CEDULAS_ENDPOINT = process.env.CEDULAS_API_ENDPOINT || "https://cedulas-profesionales.vercel.app/api/cedulas";
export const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1VQd6et38O5P81NGphmlAVZHy6aaqdPQvZnGCz33jRvg";
const knownAgents = ["amairani", "amejia", "btostado", "zulay", "bperez2", "selene2", "DISTRITATI", "cristina", "diana", "marisa2", "micaela", "stefany", "moncho", "josecarlos", "katerin", "mariel", "daisy", "lupita", "juan", "pefa", "reison", "distribuidores", "gerson", "temporal"];
const agentAliases: Record<string, string> = {
  "alejandra guzman pinedo": "daisy",
  "alejandra guzmán pinedo": "daisy",
  "alejandra pinedo": "lupita",
  "blanca perez": "bperez2",
  "blanca pérez": "bperez2",
};
const knownCrmColors = ["Verde - Me ha comprado", "Amarillo - Parece que me va a comprar", "Café - Esperando respuesta", "Naranja - Ha comprado en la empresa pero a mí aún no", "Rojo - Imposible de contactar", "Gris - Nunca responde mis mensajes", "Azul - Debo contactarlo", "Rosado - Cambiarle a otro asesor", "Blanco - Contacto recuperado", "Negro - No desea ser contactado por la empresa", "Vino - Necesita curso de aplicación", "Morado - No aplica por perfil", "Magenta - CLIENTE VETADO", "Índigo - Pendiente Cédula o Carta poder", "Verde Manzana - Cliente NO INYECTABLES", "Verde oscuro - Clientes VIP", "Verde Claro - Cliente Compras Esporádicas", "Vacío"];
const defaultExistingCrmColor = "Café - Esperando respuesta";

export function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) { return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function normalizeKnownValue(value: string, options: string[]) {
  const normalized = normalizeText(value);
  const direct = options.find((option) => normalizeText(option) === normalized || normalized.includes(normalizeText(option)) || normalizeText(option).includes(normalized));
  if (direct) return direct;
  return options.find((option) => normalized.startsWith(normalizeText(option.split(" - ")[0]))) || cleanText(value);
}
function normalizeAgent(value: string) {
  const clean = cleanText(value)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^asesor,?\s*/i, "")
    .replace(/^(el|la)\s+/i, "")
    .replace(/^(lic\.?|licenciado|licenciada)\s*/i, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  if (/usuario temporal/i.test(clean)) return "temporal";
  const alias = agentAliases[normalizeText(clean)];
  if (alias) return alias;
  return normalizeKnownValue(clean, knownAgents);
}
function normalizeCrmColor(value: string) {
  if (!value || normalizeText(value) === "existente") return "";
  return normalizeKnownValue(value, knownCrmColors);
}

function rawString(raw: Record<string, unknown> | undefined, keys: string[]) {
  if (!raw) return "";
  const normalizedKeys = keys.map((key) => cleanText(key).toLowerCase());
  const visited = new Set<unknown>();
  const find = (value: unknown): string => {
    if (!value || typeof value !== "object" || visited.has(value)) return "";
    visited.add(value);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (normalizedKeys.includes(cleanText(key).toLowerCase()) && entry != null && cleanText(entry)) return cleanText(entry);
    }
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const nested = find(entry);
      if (nested) return nested;
    }
    return "";
  };
  return find(raw);
}

function rawNumber(raw: Record<string, unknown>, keys: string[]) {
  const value = rawString(raw, keys);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function crmStatusFromApi(data: Record<string, unknown>): { cliente: CrmStatus; valor: number } {
  const clienteText = rawString(data, ["cliente", "estatus", "status", "tipo", "crmAnterior", "crm_anterior"]).toLowerCase();
  const valor = rawNumber(data, ["valor", "exists", "existe", "encontrado", "found"]);
  if (["viejo", "existente", "existe", "si", "sí", "true", "encontrado"].includes(clienteText)) return { cliente: "viejo", valor: valor ?? 0 };
  if (["nuevo", "no", "false", "no encontrado"].includes(clienteText)) return { cliente: "nuevo", valor: valor ?? 1 };
  if (valor === 0) return { cliente: "viejo", valor };
  if (valor === 1) return { cliente: "nuevo", valor };
  if (valor && valor > 1) return { cliente: "viejo", valor };
  return { cliente: "desconocido", valor: valor ?? -1 };
}

function flattenCrmRaw(data: Record<string, unknown>) {
  const raw: Record<string, unknown> = { ...data, source: "check-client-api" };
  const mappings: Record<string, string[]> = {
    agente: ["agente", "asesor", "agent", "assigned_agent", "usuario", "nombre_agente", "agente_asignado", "asesor_asignado", "asesor_nombre", "datos_asesor", "vendedor", "usuario_asignado"],
    color: ["color", "colorCrm", "color_crm", "color en crm", "status_color", "colorcrm", "color_contacto", "color_lead", "lead_tipo"],
    nombre: ["nombre", "name", "cliente_nombre", "nombre_cliente"],
    whatsapp: ["whatsapp", "telefono", "teléfono", "celular", "phone", "numero_asesor", "asesor_whatsapp"],
    cedula: ["cedula", "cédula", "cedula_profesional", "cedulaProf"],
  };
  for (const [target, keys] of Object.entries(mappings)) {
    const value = rawString(data, keys);
    if (value) raw[target] = target === "agente" ? normalizeAgent(value) : target === "color" ? normalizeCrmColor(value) : value;
  }
  if (!raw.color && crmStatusFromApi(data).cliente === "viejo") raw.color = defaultExistingCrmColor;
  return raw;
}

export function normalizeLead(input: Partial<LeadPayload>): LeadPayload {
  return {
    quienAsigna: cleanText(input.quienAsigna),
    fuente: cleanText(input.fuente),
    producto: cleanText(input.producto),
    agente: cleanText(input.agente),
    nombre: cleanText(input.nombre),
    whatsapp: digits(input.whatsapp),
    ciudad: cleanText(input.ciudad),
    cedula: digits(input.cedula),
    profesion: cleanText(input.profesion),
    crmAnterior: cleanText(input.crmAnterior),
    colorCrm: cleanText(input.colorCrm),
    interes: cleanText(input.interes),
    eraDeEseAsesor: cleanText(input.eraDeEseAsesor),
  };
}

export function validateLeadFields(lead: LeadPayload) {
  const errors: Record<string, string> = {};
  const canContinueWithoutAgent = lead.crmAnterior === "SI" && lead.eraDeEseAsesor === "NO" && lead.colorCrm === "No Definido";
  if (!lead.quienAsigna) errors.quienAsigna = "Indica quién asignará.";
  if (!lead.fuente) errors.fuente = "Selecciona la fuente.";
  if (!lead.producto) errors.producto = "Selecciona el producto.";
  if (!lead.agente && !canContinueWithoutAgent) errors.agente = "Selecciona o escribe el agente.";
  if (lead.nombre.length < 3) errors.nombre = "Escribe el nombre completo.";
  if (lead.whatsapp.length !== 10) errors.whatsapp = "El WhatsApp debe tener exactamente 10 dígitos.";
  if (!lead.ciudad) errors.ciudad = "Escribe la ciudad.";
  if (lead.cedula.length < 4 || lead.cedula.length > 10) errors.cedula = "La cédula debe tener entre 4 y 10 dígitos.";
  if (!lead.interes) errors.interes = "Describe el interés del lead.";
  return errors;
}

function htmlText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function selectedOptionFromSelect(html: string, hints: string[]) {
  const selects = [...html.matchAll(/<select\b[\s\S]*?<\/select>/gi)].map((m) => m[0]);
  for (const select of selects) {
    const haystack = stripTags(select).toLowerCase() + " " + select.toLowerCase();
    if (!hints.some((hint) => haystack.includes(hint.toLowerCase()))) continue;
    const selected = select.match(/<option\b(?=[^>]*\bselected\b)[^>]*>([\s\S]*?)<\/option>/i)?.[1];
    if (selected) {
      const cleaned = stripTags(selected);
      if (cleaned && !/^seleccione/i.test(cleaned) && cleaned !== "-") return cleaned;
    }
  }
  return "";
}

function nearestKnownValue(text: string, values: string[]) {
  const normalized = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  return values.find((value) => normalized.includes(` ${value.toLowerCase()} `)) || "";
}

function parseCrmWebResult(html: string, mode: "telefono" | "cedula", query: string) {
  const text = htmlText(html);
  if (/Inicio de Sesión Invalido|Iniciar Sesión|Olvidé mi Contraseña/i.test(text)) {
    throw new Error("El CRM respondió pantalla de login; la consulta no está autenticada.");
  }
  const countMatch = text.match(/Usuarios que coinciden con el parametro a buscar\s*\((\d+)\)/i);
  if (!countMatch) {
    throw new Error("El CRM respondió un formato inesperado; no se pudo confirmar si el contacto existe.");
  }
  const count = countMatch ? Number(countMatch[1]) : 0;
  const raw: Record<string, unknown> = { source: "consultarcliente-web", mode, query, count, text: text.slice(0, 6000) };
  if (count <= 0) return { count, raw };

  const knownAgents = ["admin", "laprueba", "rgonzalez", "amairani", "amejia", "btostado", "zulay", "bperez2", "selene2", "DISTRITATI", "cristina", "diana", "marisa2", "micaela", "stefany", "moncho", "josecarlos", "katerin", "mariel", "daisy", "lupita", "juan", "pefa", "reison", "distribuidores", "gerson", "temporal"];
  const knownColors = ["Contacto cafe CRM", "Contacto gris CRM", "Contacto verde claro CRM", "Contacto verde CRM", "Contacto amarillo CRM", "Contacto sin color CRM", "Contacto rosa CRM", "Contacto naranja CRM", "Contacto morado CRM", "Contacto azul CRM", "Contacto rojo CRM", "Verde - Me ha comprado", "Amarillo - Para seguimiento", "Rojo", "Azul", "Morado", "Naranja", "Rosa"];

  // La página del CRM trae selects con todas las opciones; antes el parser tomaba el texto completo
  // (“Seleccione un Valor admin laprueba…”). Solo aceptamos una opción marcada como selected,
  // o un valor conocido claramente encontrado; nunca usamos capturas amplias por etiqueta.
  const selectedAgent = selectedOptionFromSelect(html, ["agente", "asesor", "usuario", "admin", "laprueba", "rgonzalez", "katerin"]);
  const selectedColor = selectedOptionFromSelect(html, ["color", "crm", "verde", "amarillo", "rojo", "azul"]);
  const agent = selectedAgent || nearestKnownValue(text, knownAgents);
  const color = selectedColor || knownColors.find((colorValue) => text.toLowerCase().includes(colorValue.toLowerCase())) || "";

  if (agent) raw.agente = agent;
  if (color) raw.color = color;
  return { count, raw };
}

async function queryCrmWeb(modeValue: "1" | "4", query: string) {
  const tokenHeaders: Record<string, string> = CRM_API_TOKEN ? { authorization: `Bearer ${CRM_API_TOKEN}`, "x-api-key": CRM_API_TOKEN } : {};
  const cookieResponse = await fetch(CRM_ENDPOINT, { cache: "no-store" });
  const cookie = cookieResponse.headers.get("set-cookie")?.split(";")[0] || "";
  const response = await fetch(CRM_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html,application/xhtml+xml",
      referer: CRM_ENDPOINT,
      ...tokenHeaders,
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams({ optionsRadios: modeValue, "Consultaview[nombres]": query, yt0: "Buscar" }),
    cache: "no-store",
  });
  const html = await response.text();
  if (!response.ok) throw new Error("No se pudo consultar el CRM web.");
  return parseCrmWebResult(html, modeValue === "1" ? "telefono" : "cedula", query);
}

async function queryCrmApi(payload: { whatsapp?: string; cedula?: string }) {
  if (!CRM_API_TOKEN) throw new Error("Falta configurar CRM_API_TOKEN en el servidor.");
  const response = await fetch(CRM_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${CRM_API_TOKEN}` },
    body: JSON.stringify({ whatsapp: payload.whatsapp || "", cedula: payload.cedula || "" }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") throw new Error("El CRM respondió un formato inválido.");
  const isExistingWithoutAdvisor = data?.ok === false && data?.error === "NO_ADVISOR_AVAILABLE" && rawString(data, ["cliente"]).toLowerCase() === "viejo";
  if (!response.ok || (data?.ok === false && !isExistingWithoutAdvisor)) throw new Error(cleanText(data?.mensaje || data?.error) || "No se pudo consultar CRM.");
  return data;
}

function normalizeCrmResponse(data: Record<string, unknown>) {
  const { cliente, valor } = crmStatusFromApi(data);
  const raw = flattenCrmRaw(data);
  return { ok: true, valor, cliente, raw };
}

export async function checkCrm(whatsapp: string, cedula: string) {
  const whatsappData = await queryCrmApi({ whatsapp });
  const whatsappResult = normalizeCrmResponse(whatsappData);

  if (whatsappResult.cliente === "viejo" || !cedula) return whatsappResult;

  const cedulaData = await queryCrmApi({ cedula });
  return normalizeCrmResponse(cedulaData);
}

export async function checkCedula(cedula: string) {
  const token = process.env.CEDULAS_API_TOKEN;
  if (!token) throw new Error("Falta configurar CEDULAS_API_TOKEN en el servidor.");
  const url = new URL(CEDULAS_ENDPOINT);
  url.searchParams.set("cedula", cedula);
  const response = await fetch(url, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || "No se pudo validar la cédula profesional.");
  const results: CedulaRecord[] = Array.isArray(data?.results) ? data.results : [];
  const exact = results.find((item) => digits(item.cedula) === cedula) || results[0] || null;
  return { source: data?.source || "cedulas-profesionales", count: Number(data?.count ?? results.length), result: exact, results };
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function googleAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Faltan credenciales de Google Sheets en variables de entorno.");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || "Google no entregó token de acceso.");
  return data.access_token as string;
}

async function sheetsFetch(path: string, init: RequestInit = {}) {
  const token = await googleAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "Error consultando Google Sheets.");
  return data;
}

export async function readLeadsSheet() {
  const sheetName = "Ene-Dic 2026";
  const data = await sheetsFetch(`/values/${encodeURIComponent(`${sheetName}!A1:ZZ5000`)}?majorDimension=ROWS`);
  const values: string[][] = data?.values || [];
  const headers = values[0] || [];
  const normalizeHeader = (header: string) => header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const rows = values.slice(1).filter((row) => row.some((cell) => cleanText(cell))).map((row) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[normalizeHeader(String(header))] = cleanText(row[index]); });
    return {
      mes: raw["MES"] || "",
      fecha: raw["FECHA"] || "",
      hora: raw["HORA"] || "",
      fuente: raw["FUENTE"] || "",
      nombre: raw["NOMBRE DEL CLIENTE"] || raw["NOMBRE"] || "",
      whatsapp: raw["WHATSAPP"] || "",
      ciudad: raw["CIUDAD"] || "",
      cedula: raw["CEDULA"] || raw["CEDULA PROFESIONAL"] || "",
      profesion: raw["PROFESION"] || "",
      agente: raw["AGENTE"] || "",
      quienAsigna: raw["QUIEN ASIGNA"] || raw["QUIEN ASIGNARA"] || "",
      crmAnterior: raw["CRM ANTERIOR"] || "",
      colorCrm: raw["COLOR EN CRM"] || raw["COLOR CRM"] || "",
      eraDeEseAsesor: raw["ERA DE ESE ASESOR?"] || "",
      interes: raw["INTERES"] || raw["PRODUCTO"] || "",
    };
  });
  return { sheetName, headers, rows };
}

export async function appendLeadToSheet(lead: LeadPayload, crm: Awaited<ReturnType<typeof checkCrm>>, cedulaCheck: Awaited<ReturnType<typeof checkCedula>>) {
  const meta = await sheetsFetch("?fields=sheets(properties(title))");
  const sheetName = process.env.GOOGLE_SHEET_TAB || meta?.sheets?.[0]?.properties?.title;
  if (!sheetName) throw new Error("No se encontró una pestaña válida en Google Sheets.");

  const quoted = `'${String(sheetName).replace(/'/g, "''")}'`;
  const headerData = await sheetsFetch(`/values/${encodeURIComponent(`${sheetName}!1:1`)}?majorDimension=ROWS`);
  const headers: string[] = headerData?.values?.[0] || [];
  if (!headers.length) throw new Error("La hoja no tiene encabezados; no se agregó información para evitar modificar estructura.");

  const now = new Date();
  const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeZone: "America/Cancun" }).format(now);
  const hora = new Intl.DateTimeFormat("es-MX", { timeStyle: "short", timeZone: "America/Cancun" }).format(now);
  const profession = lead.profesion || cedulaCheck.result?.carrera || "";
  const crmAnterior = lead.crmAnterior || (crm.cliente === "viejo" ? "SI" : crm.cliente === "nuevo" ? "NO" : "Desconocido");
  const colorCrm = lead.colorCrm || cleanText(crm.raw?.color) || (crm.cliente === "viejo" ? "Café - Esperando respuesta" : "N/A");
  const observaciones = [
    lead.producto ? `Producto: ${lead.producto}` : "",
    lead.eraDeEseAsesor ? `Era de ese asesor: ${lead.eraDeEseAsesor}` : "",
    cedulaCheck.result?.nombre ? `Nombre cédula: ${cedulaCheck.result.nombre}` : "",
    cedulaCheck.result?.universidad ? `Universidad: ${cedulaCheck.result.universidad}` : "",
    cedulaCheck.result?.estado ? `Estado cédula: ${cedulaCheck.result.estado}` : "",
    cedulaCheck.result?.anio ? `Año: ${cedulaCheck.result.anio}` : "",
  ].filter(Boolean).join(" | ");

  const normalizeHeader = (header: string) => header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const base: Record<string, string> = {
    "MES": new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Cancun" }).format(now),
    "FECHA": fecha,
    "HORA": hora,
    "FUENTE": lead.fuente,
    "NOMBRE": lead.nombre || cedulaCheck.result?.nombre || "",
    "NOMBRE DEL CLIENTE": lead.nombre || cedulaCheck.result?.nombre || "",
    "WHATSAPP": lead.whatsapp,
    "CIUDAD": lead.ciudad,
    "CEDULA": lead.cedula,
    "PROFESION": profession,
    "AGENTE": lead.agente,
    "QUIEN ASIGNA": lead.quienAsigna,
    "QUIEN ASIGNARA": lead.quienAsigna,
    "QUIEN LO ASIGNO": lead.quienAsigna,
    "CRM ANTERIOR": crmAnterior,
    "COLOR CRM": crmAnterior === "SI" ? colorCrm : "N/A",
    "COLOR EN CRM": crmAnterior === "SI" ? colorCrm : "N/A",
    "ERA DE ESE ASESOR?": crmAnterior === "SI" ? lead.eraDeEseAsesor || "" : "N/A",
    "INTERES": lead.interes,
    "PRODUCTO": lead.producto,
    "UNIVERSIDAD": cedulaCheck.result?.universidad || "",
    "ESTADO": cedulaCheck.result?.estado || "",
    "ANO": cedulaCheck.result?.anio || "",
    "OBSERVACIONES": observaciones,
    "LINK REDSOCIAL": "",
  };

  const row = headers.map((header) => base[normalizeHeader(String(header))] ?? "");
  const append = await sheetsFetch(`/values/${encodeURIComponent(`${sheetName}!A:ZZ`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
  return { sheetName, updatedRange: append?.updates?.updatedRange };
}
