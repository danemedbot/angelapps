"use client";

import { useMemo, useState } from "react";

type Contact = { nombre: string; cedula: string; whatsapp: string; ciudad: string; correo: string };
type CrmInfo = { cliente: "viejo" | "nuevo" | "desconocido"; valor?: number; raw?: Record<string, unknown> };
type CedulaInfo = { result: null | { cedula?: string; nombre?: string; carrera?: string; universidad?: string; estado?: string; anio?: string }; source?: string; count?: number };
type ResultRow = { mes: string; fecha: string; hora: string; fuente: string; nombre: string; whatsapp: string; ciudad: string; cedula: string; profesion: string; agente: string; quienAsigna: string; crmAnterior: string; colorCrm: string; contactoAsesor: string; interes: string; sheetStatus?: "ok" | "error"; sheetMessage?: string };

const emptyContact: Contact = { nombre: "", cedula: "", whatsapp: "", ciudad: "", correo: "" };

const asignadores = ["Angel", "Antonio", "Kiara"];
const fuentes = ["Instagram Danemed", "Facebook Danemed", "Rejeunesse - Formulario Med-Dent 2026-copy", "Instagram Pink Intimate", "Facebook Pink Intimate", "Web Pink Intimate", "Instagram Rejeunesse", "Facebook Rejeunesse", "Web Rejeunesse", "Instagram LusciousLips", "Facebook LusciousLips", "Formulario lUCIOS LIPS", "Web LusciousLips", "Instagram CursosMedEstetica", "Facebook CursosMedEstetica", "Whatsapp Danemed", "Emagister", "Formulario LAPUROON Aurora"];
const productos = ["Rejeunesse", "Pink Intimate System", "LusciousLips", "V-Tech System", "ExoTech Gel", "SkinFill BACIO", "Cursos", "Catálogo de Productos", "Kenacort / Triamcinolona", "Renovah", "Toxina Botulínica", "Productos BCN", "Libros", "Hilos PDO", "AGF", "Lapuroon"];
const agentes = ["amairani", "amejia", "btostado", "zulay", "bperez2", "selene2", "DISTRITATI", "cristina", "diana", "marisa2", "micaela", "stefany", "moncho", "josecarlos", "katerin", "mariel", "daisy", "lupita", "juan", "pefa", "reison", "distribuidores", "gerson", "temporal"];
const coloresCrm = ["Verde - Me ha comprado", "Amarillo - Parece que me va a comprar", "Café - Esperando respuesta", "Naranja - Ha comprado en la empresa pero a mí aún no", "Rojo - Imposible de contactar", "Gris - Nunca responde mis mensajes", "Azul - Debo contactarlo", "Rosado - Cambiarle a otro asesor", "Blanco - Contacto recuperado", "Negro - No desea ser contactado por la empresa", "Vino - Necesita curso de aplicación", "Morado - No aplica por perfil", "Magenta - CLIENTE VETADO", "Índigo - Pendiente Cédula o Carta poder", "Verde Manzana - Cliente NO INYECTABLES", "Verde oscuro - Clientes VIP", "Verde Claro - Cliente Compras Esporádicas", "Vacío"];
const colorCrmDefaultExistente = "Café - Esperando respuesta";
const profesionesDetectables = [
  { canonical: "Médico", aliases: ["medico"] },
  { canonical: "Cirujano Plástico", aliases: ["cirujano plastico", "cirujano platico"] },
  { canonical: "Otorrino", aliases: ["otorrino"] },
  { canonical: "Otorrinolaringología", aliases: ["otorrinolaringologia"] },
  { canonical: "Otorrinolaringólogo", aliases: ["otorrinolaringologo"] },
  { canonical: "Ginecología", aliases: ["ginecologia"] },
  { canonical: "Ginecóloga", aliases: ["ginecologa"] },
  { canonical: "Dentista", aliases: ["dentista"] },
  { canonical: "Estomatología", aliases: ["estomatologia"] },
  { canonical: "Estomatóloga", aliases: ["estomatologa"] },
  { canonical: "Enfermería", aliases: ["enfermeria"] },
  { canonical: "Enfermera", aliases: ["enfermera"] },
  { canonical: "Enfermero", aliases: ["enfermero"] },
  { canonical: "Cosmetología", aliases: ["cosmetologia"] },
  { canonical: "Cosmetóloga", aliases: ["cosmetologa"] },
  { canonical: "Cosmeatría", aliases: ["cosmeatria"] },
  { canonical: "Cosmeatra", aliases: ["cosmeatra"] },
  { canonical: "Por definir", aliases: ["por definir"] },
];

function digits(value: string) { return value.replace(/\D/g, ""); }
function titleCase(value: string) { return value.toLowerCase().split(/\s+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeKnownValue(value: string, options: string[]) {
  const normalized = normalize(value);
  const direct = options.find((option) => normalize(option) === normalized || normalized.includes(normalize(option)) || normalize(option).includes(normalized));
  if (direct) return direct;
  return options.find((option) => normalized.startsWith(normalize(option.split(" - ")[0]))) || value.trim();
}
function normalizeAgent(value: string) {
  const clean = value.replace(/^asesor,?\s*(el|la)?\s*/i, "").replace(/^(lic\.?|licenciado|licenciada)\s*/i, "").trim();
  if (/usuario temporal/i.test(clean)) return "temporal";
  return normalizeKnownValue(clean, agentes);
}
function normalizeCrmColor(value: string) {
  if (!value || normalize(value) === "existente") return "";
  return normalizeKnownValue(value, coloresCrm);
}
function detectedProfession(value: string) {
  const normalized = normalize(value).replace(/\s+/g, " ").trim();
  const aliases = profesionesDetectables.flatMap((item) => item.aliases.map((alias) => ({ ...item, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  for (const item of aliases) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(item.alias)}([^a-z0-9]|$)`, "i");
    if (pattern.test(normalized)) return item.canonical;
  }
  return "";
}
function normalizeProfessionChoice(value: string) { return detectedProfession(value) || value.trim(); }
function nowParts() {
  const d = new Date();
  return {
    mes: new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Cancun" }).format(d).toUpperCase(),
    fecha: new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeZone: "America/Cancun" }).format(d),
    hora: new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/Cancun" }).format(d).toLowerCase(),
  };
}

function parseContact(text: string): Contact {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const contact: Contact = { ...emptyContact, nombre: lines[0] || "" };
  const rest = lines.slice(1);
  for (const line of rest) {
    const clean = line.trim();
    const ds = digits(clean);
    if (!contact.correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) contact.correo = clean.toLowerCase();
    else if (!contact.whatsapp && ds.length >= 10 && ds.length <= 13) contact.whatsapp = ds.slice(-10);
    else if (!contact.cedula && /^\d{4,10}$/.test(ds)) contact.cedula = ds;
    else if (!contact.ciudad) contact.ciudad = clean;
  }
  if (!contact.ciudad) {
    const city = rest.find((line) => !line.includes("@") && !/^\+?[\d\s()\-.]{4,}$/.test(line));
    if (city) contact.ciudad = city;
  }
  return contact;
}

function rawString(raw: Record<string, unknown> | undefined, keys: string[]) {
  if (!raw) return "";
  const normalizedKeys = keys.map(normalize);
  const visited = new Set<unknown>();
  const find = (value: unknown): string => {
    if (!value || typeof value !== "object" || visited.has(value)) return "";
    visited.add(value);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (normalizedKeys.includes(normalize(key)) && entry != null && String(entry).trim()) return String(entry).trim();
    }
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const nested = find(entry);
      if (nested) return nested;
    }
    return "";
  };
  return find(raw);
}

export default function Home() {
  const [quienAsigna, setQuienAsigna] = useState("");
  const [datos, setDatos] = useState("");
  const [fuente, setFuente] = useState("");
  const [producto, setProducto] = useState("");
  const [agente, setAgente] = useState("");
  const [crmAnterior, setCrmAnterior] = useState("");
  const [colorCrm, setColorCrm] = useState("");
  const [contactoAsesor, setContactoAsesor] = useState("");
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [profesion, setProfesion] = useState("");
  const [crm, setCrm] = useState<CrmInfo | null>(null);
  const [cedula, setCedula] = useState<CedulaInfo | null>(null);
  const [reviewSource, setReviewSource] = useState<"capturado" | "oficial" | "">("");
  const [pendingProfession, setPendingProfession] = useState("");
  const [pendingProfessionSource, setPendingProfessionSource] = useState<"capturado" | "oficial" | "">("");
  const [professionSource, setProfessionSource] = useState<"capturado" | "oficial" | "">("");
  const [showProfessionModal, setShowProfessionModal] = useState(false);
  const [showCrmModal, setShowCrmModal] = useState(false);
  const [resultado, setResultado] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [error, setError] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [busy, setBusy] = useState("");

  const parsed = useMemo(() => parseContact(datos), [datos]);
  const profesionCapturada = useMemo(() => detectedProfession(datos), [datos]);
  const activeContact = { ...parsed, ...Object.fromEntries(Object.entries(contact).filter(([, v]) => v)) } as Contact;
  const capturedProfessionOnly = profesionCapturada;
  const activeProfession = profesion || profesionCapturada;
  const crmAgent = normalizeAgent(rawString(crm?.raw, ["agente", "asesor", "agent", "assigned_agent", "usuario", "nombre_agente", "agente_asignado", "asesor_asignado", "asesor_nombre", "datos_asesor", "vendedor", "usuario_asignado"]));
  const crmColor = normalizeCrmColor(rawString(crm?.raw, ["color", "colorCrm", "color_crm", "color en crm", "status_color", "colorcrm", "color_contacto", "color_lead"])) || (crm?.cliente === "viejo" ? colorCrm || colorCrmDefaultExistente : "");

  function syncParsed() {
    const next = parseContact(datos);
    setContact(next);
    return next;
  }

  async function buscarProfesion() {
    setError("");
    const found = activeContact;
    if (!found.cedula) { setError("No detecté una cédula profesional en Datos del contacto."); return; }
    setBusy("profesion");
    try {
      const response = await fetch("/api/lead/profession", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: found.cedula }) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo consultar la profesión.");
      setCedula(data.cedula);
      setReviewSource("");
      setPendingProfession("");
      setPendingProfessionSource("");
      setShowProfessionModal(true);
    } catch (e) {
      setCedula({ result: null, source: e instanceof Error ? e.message : "No se pudo consultar la profesión." });
      setReviewSource("");
      setPendingProfession("");
      setPendingProfessionSource("");
      setShowProfessionModal(true);
    }
    finally { setBusy(""); }
  }

  async function buscarCrm() {
    setError("");
    const found = activeContact;
    if (found.whatsapp.length !== 10) { setError("El WhatsApp debe tener exactamente 10 dígitos."); return; }
    if (!found.cedula) { setError("No detecté una cédula para consultar CRM."); return; }
    setBusy("crm");
    try {
      const response = await fetch("/api/lead/crm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ whatsapp: found.whatsapp, cedula: found.cedula }) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo consultar CRM.");
      setCrm(data.crm);
      if (data.crm.cliente === "viejo") {
        setCrmAnterior("SI");
        setColorCrm(normalizeCrmColor(rawString(data.crm.raw, ["color", "colorCrm", "color_crm", "color en crm", "status_color", "colorcrm", "color_contacto", "color_lead"])) || colorCrmDefaultExistente);
        setShowCrmModal(true);
      } else {
        setCrmAnterior("NO");
        setColorCrm("");
        setContactoAsesor("");
        setShowCrmModal(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar CRM."); }
    finally { setBusy(""); }
  }

  function usarCapturado() {
    const capturedProfession = normalizeProfessionChoice(capturedProfessionOnly);
    setPendingProfession(capturedProfession);
    setPendingProfessionSource("capturado");
    setReviewSource("capturado");
  }

  function usarOficial() {
    const result = cedula?.result;
    setPendingProfession(result?.carrera ? normalizeProfessionChoice(result.carrera) : "");
    setPendingProfessionSource("oficial");
    setReviewSource("oficial");
  }

  function continuarProfesion() {
    if (pendingProfession) setProfesion(pendingProfession);
    else setProfesion("");
    setProfessionSource(pendingProfessionSource);
    setShowProfessionModal(false);
  }

  function mantenerAsignacion() {
    if (crmAgent) setAgente(crmAgent);
    if (crmColor) setColorCrm(crmColor);
    setContactoAsesor("SI");
    setCrmAnterior("SI");
    setShowCrmModal(false);
  }
  function reasignar() {
    setAgente("");
    if (crmColor) setColorCrm(crmColor);
    setContactoAsesor("NO");
    setCrmAnterior("SI");
    setShowCrmModal(false);
  }

  function buildOrganizedData() {
    const found = syncParsed();
    const finalContact = { ...found, ...Object.fromEntries(Object.entries(contact).filter(([, v]) => v)) } as Contact;
    const missing: { key: string; label: string }[] = [];
    if (!quienAsigna) missing.push({ key: "quienAsigna", label: "Quién asignará" });
    if (!fuente) missing.push({ key: "fuente", label: "Fuente" });
    if (!producto) missing.push({ key: "producto", label: "Producto / Interés" });
    if (!agente) missing.push({ key: "agente", label: "Agente" });
    if (!crmAnterior) missing.push({ key: "crmAnterior", label: "CRM Anterior" });
    if (!finalContact.nombre) missing.push({ key: "nombre", label: "Nombre" });
    if (!finalContact.whatsapp) missing.push({ key: "whatsapp", label: "WhatsApp" });
    else if (finalContact.whatsapp.length !== 10) missing.push({ key: "whatsapp", label: "WhatsApp debe tener exactamente 10 dígitos" });
    if (!finalContact.cedula) missing.push({ key: "cedula", label: "Cédula" });
    if (!finalContact.ciudad) missing.push({ key: "ciudad", label: "Ciudad" });
    if (crmAnterior === "SI" && !colorCrm) missing.push({ key: "colorCrm", label: "Color CRM" });
    if (crmAnterior === "SI" && !contactoAsesor) missing.push({ key: "contactoAsesor", label: "El contacto es de ese asesor" });
    setMissingFields(missing.map((item) => item.key));
    if (missing.length) throw new Error(`Faltan estos datos: ${missing.map((item) => item.label).join(", ")}.`);
    const productosEspeciales = ["Rejeunesse", "Pink Intimate System", "LusciousLips", "Hilos PDO", "Lapuroon"];
    const tieneFormulario = fuente.includes("Formulario");
    const finalProfesion = titleCase(normalizeProfessionChoice(profesion || profesionCapturada || "Por Definir"));
    const encabezado = tieneFormulario
      ? `*Contacto Campaña ${titleCase(producto)}*\n${fuente}`
      : productosEspeciales.includes(producto)
        ? `*Contacto Campaña ${titleCase(producto)}:*`
        : `*Contacto ${fuente}:*`;
    const crmPrefix = crmAnterior === "SI"
      ? contactoAsesor === "SI" ? "Existe en CRM y *es tuyo*\n" : "Existe en CRM, se te *REASIGNÓ*\n"
      : "Contacto *NUEVO* *️⃣\n\n";
    const colorLine = crmAnterior === "SI" ? `Color: ${colorCrm}\n\n` : "";
    const text = `${crmPrefix}${colorLine}${encabezado}\n\n${titleCase(finalContact.nombre)}\nCiudad: ${titleCase(finalContact.ciudad)}\n${finalContact.correo ? `Correo: ${finalContact.correo}\n` : ""}Cédula Prof: ${finalContact.cedula}\nProfesión: ${finalProfesion}\nWhatsapp: ${finalContact.whatsapp}\n\nInterés en *${titleCase(producto)}*`;
    const fh = nowParts();
    const row: ResultRow = { mes: fh.mes, fecha: fh.fecha, hora: fh.hora, fuente, nombre: titleCase(finalContact.nombre), whatsapp: finalContact.whatsapp, ciudad: titleCase(finalContact.ciudad), cedula: finalContact.cedula, profesion: finalProfesion, agente, quienAsigna, crmAnterior, colorCrm: crmAnterior === "SI" ? colorCrm : "N/A", contactoAsesor: crmAnterior === "SI" ? contactoAsesor : "N/A", interes: titleCase(producto) };
    return { text, row, finalContact };
  }

  function generarResultado() {
    setError("");
    try {
      const { text } = buildOrganizedData();
      setMissingFields([]);
      setResultado(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo organizar la información.");
    }
  }

  async function enviarTablaYCopiar() {
    setError("");
    setBusy("save");
    let built: ReturnType<typeof buildOrganizedData> | null = null;
    try {
      built = buildOrganizedData();
      setMissingFields([]);
      const { text, row, finalContact } = built;
      setResultado(text);
      const body = { quienAsigna, fuente, producto, agente: row.agente, nombre: row.nombre, whatsapp: row.whatsapp, ciudad: row.ciudad, cedula: row.cedula, profesion: row.profesion, crmAnterior: row.crmAnterior, colorCrm: row.colorCrm, interes: row.interes, eraDeEseAsesor: row.contactoAsesor };
      const response = await fetch("/api/lead/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo guardar en Google Sheets.");
      setRows((current) => [{ ...row, sheetStatus: "ok", sheetMessage: data.sheet?.updatedRange || "Google Sheets" }, ...current]);
      setQuienAsigna("");
      setFuente("");
      setProducto("");
      setDatos("");
      setContact(emptyContact);
      setProfesion("");
      setPendingProfession("");
      setPendingProfessionSource("");
      setProfessionSource("");
      setAgente("");
      setCrmAnterior("");
      setColorCrm("");
      setContactoAsesor("");
      setCrm(null);
      setCedula(null);
      try {
        await navigator.clipboard.writeText(text);
        setError(`Enviado a tabla y copiado. Guardado en ${data.sheet?.updatedRange || "Google Sheets"}`);
      } catch {
        setError(`Guardado en ${data.sheet?.updatedRange || "Google Sheets"}, pero no se pudo copiar al portapapeles.`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo enviar a tabla y copiar.";
      if (built) setRows((current) => [{ ...built!.row, sheetStatus: "error", sheetMessage: message }, ...current]);
      setError(message);
    }
    finally { setBusy(""); }
  }

  return <main className="page-shell compact">
    <section className="lead-card">
      <div className="section-title"><span>01</span><div><h2>Entrada de datos</h2><p>Pega los datos en cualquier orden. La primera línea siempre es el nombre.</p></div></div>
      <div className="grid three">
        <Field label="Quién asignará" required missing={missingFields.includes("quienAsigna")}><select value={quienAsigna} onChange={(e) => setQuienAsigna(e.target.value)}><option value="">-</option>{asignadores.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Fuente" required missing={missingFields.includes("fuente")}><select value={fuente} onChange={(e) => setFuente(e.target.value)}><option value="">-</option>{fuentes.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Producto / Interés" required missing={missingFields.includes("producto")}><select value={producto} onChange={(e) => setProducto(e.target.value)}><option value="">-</option>{productos.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Datos del contacto" required missing={["nombre", "whatsapp", "cedula", "ciudad"].some((key) => missingFields.includes(key))}><textarea value={datos} onChange={(e) => { setDatos(e.target.value); setContact(emptyContact); }} rows={7} placeholder={"Juan Pérez López\n12345678\n5512345678\nMonterrey, Nuevo León\ncorreo@ejemplo.com"} /></Field>
        <div className="detected featured readonly"><h3>Detectado</h3>{activeContact.nombre && <DetectedValue label="Nombre" value={activeContact.nombre} />}{activeContact.cedula && <DetectedValue label="Cédula" value={activeContact.cedula} />}{activeContact.whatsapp && <DetectedValue label="WhatsApp" value={activeContact.whatsapp} />}{activeContact.ciudad && <DetectedValue label="Ciudad" value={activeContact.ciudad} />}{activeContact.correo && <DetectedValue label="Correo" value={activeContact.correo} />}{activeProfession && <DetectedValue label="Profesión" value={activeProfession} highlighted={professionSource === "oficial"} />}{!activeContact.nombre && !activeContact.cedula && !activeContact.whatsapp && !activeContact.ciudad && !activeContact.correo && !activeProfession && <p className="detected-empty">Pega datos del contacto para detectar información.</p>}</div>
        <div className="stacked-actions"><button className="primary" type="button" disabled={!!busy} onClick={buscarProfesion}>{busy === "profesion" ? "Buscando..." : "Buscar Profesión"}</button><button className="primary" type="button" disabled={!!busy} onClick={buscarCrm}>{busy === "crm" ? "Buscando..." : "Buscar CRM"}</button><div className="crm-fields"><Field label="Agente" required missing={missingFields.includes("agente")}><select value={agente} onChange={(e) => setAgente(e.target.value)}><option value="">-</option>{agentes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="CRM Anterior" required missing={missingFields.includes("crmAnterior")}><select value={crmAnterior} onChange={(e) => setCrmAnterior(e.target.value)}><option value="">-</option><option>SI</option><option>NO</option></select></Field>{crmAnterior === "SI" && <><Field label="Color CRM" required missing={missingFields.includes("colorCrm")}><select value={colorCrm} onChange={(e) => setColorCrm(e.target.value)}><option value="">-</option>{coloresCrm.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="El contacto es de ese asesor" required missing={missingFields.includes("contactoAsesor")}><select value={contactoAsesor} onChange={(e) => setContactoAsesor(e.target.value)}><option value="">-</option><option>SI</option><option>NO</option></select></Field></>}</div></div>
      </div>
      {error && <div className={error.startsWith("Guardado") || error.startsWith("Enviado") ? "alert success" : "alert error"}>{error}</div>}
      <div className="actions"><button className="secondary" type="button" onClick={generarResultado}>Organizar Datos</button></div>
    </section>
    {resultado && <section className="lead-card result-output"><div className="section-title"><span>03</span><div><h2>Resultado</h2><p>Formato compatible con datos.danemed.com</p></div></div><pre>{resultado}</pre><button className="primary" type="button" disabled={!!busy} onClick={enviarTablaYCopiar}>{busy === "save" ? "Enviando..." : "Enviar a Tabla y Copiar"}</button></section>}

    <section className="lead-card table-card">
      <div className="section-title"><span>04</span><div><h2>Tabla</h2><p>Misma estructura visual y operativa de datos.danemed.com</p></div></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Mes</th><th>Fecha</th><th>Hora</th><th>Fuente</th><th>Nombre</th><th>Whatsapp</th><th>Ciudad</th><th>Cédula</th><th>Profesión</th><th>Agente</th><th>Quién asigna</th><th>CRM Anterior</th><th>Color CRM</th><th>Era de ese Asesor?</th><th>Interés</th><th>Acciones</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={16} className="empty-cell">Aún no hay filas enviadas desde esta sesión.</td></tr> : rows.map((row, index) => <tr key={`${row.whatsapp}-${index}`} className={index === 0 ? "ultima-fila" : ""}><td>{row.mes}</td><td>{row.fecha}</td><td>{row.hora}</td><td>{row.fuente}</td><td>{row.nombre}</td><td>{row.whatsapp}</td><td>{row.ciudad}</td><td>{row.cedula}</td><td>{row.profesion}</td><td>{row.agente}</td><td>{row.quienAsigna}</td><td>{row.crmAnterior}</td><td>{row.colorCrm}</td><td>{row.contactoAsesor}</td><td>{row.interes}</td><td><div className={`sheet-status ${row.sheetStatus === "ok" ? "ok" : "error"}`} title={row.sheetMessage || "Google Sheets"}><span>{row.sheetStatus === "ok" ? "✓" : "✕"}</span><small>{row.sheetStatus === "ok" ? "Google Sheet" : "No copiado"}</small></div></td></tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {showProfessionModal && <div className="modal-backdrop"><section className={cedula?.result ? "modal wide" : "modal simple-modal"}><button className="close" type="button" onClick={() => setShowProfessionModal(false)} aria-label="Cerrar">×</button>{!cedula?.result ? <><p className="eyebrow">Consulta de profesión</p><div className="empty-state"><span className="empty-icon">×</span><h2>No se encontró información con esa cédula.</h2><p>{cedula?.source && cedula.source !== "cedulas-profesionales" ? cedula.source : "Revisa el número capturado o intenta más tarde; el servidor puede no estar respondiendo."}</p></div></> : <><p className="eyebrow">Comparativo de profesión</p><h2>Elige qué columna se usará</h2><div className="compare column-decisions"><div className={reviewSource === "capturado" ? "selected-column" : ""}><h3>Capturado</h3><ReviewLine label="Nombre" value={activeContact.nombre} /><ReviewLine label="Profesión" value={capturedProfessionOnly || "Sin profesión capturada"} /><button className="column-choice" type="button" onClick={usarCapturado}>Usar datos capturados</button></div><div className={reviewSource === "oficial" ? "selected-column" : ""}><h3>Consulta oficial</h3><ReviewLine label="Nombre" value={cedula.result.nombre || "Sin resultado"} /><ReviewLine label="Profesión" value={cedula.result.carrera ? normalizeProfessionChoice(cedula.result.carrera) : "Sin resultado"} /><button className="column-choice" type="button" onClick={usarOficial}>Usar datos oficiales</button></div></div><p className="modal-hint">Selecciona una columna completa para definir nombre y profesión.</p><div className="modal-actions"><button className="primary" disabled={!reviewSource} onClick={continuarProfesion}>Continuar</button></div></>}</section></div>}

    {showCrmModal && <div className="modal-backdrop"><section className={crm?.cliente === "viejo" ? "modal" : "modal simple-modal"}><button className="close" type="button" onClick={() => setShowCrmModal(false)} aria-label="Cerrar">×</button>{crm?.cliente === "viejo" ? <><p className="eyebrow">Resultado CRM</p><h2>Contacto existente</h2><ReviewLine label="Agente asignado" value={crmAgent || "El CRM no devolvió agente"} /><ReviewLine label="Color CRM" value={crmColor || "El CRM no devolvió color"} /><p className="subtitle small">¿Desea mantener la asignación actual o reasignar este contacto?</p><div className="modal-actions"><button className="secondary" onClick={reasignar}>Reasignar</button><button className="primary" onClick={mantenerAsignacion}>Mantener asignación</button></div></> : <><p className="eyebrow">Resultado CRM</p><div className="empty-state"><span className="empty-icon">×</span><h2>El contacto no existe en CRM.</h2><p>Se marcó automáticamente CRM Anterior como NO.</p></div></>}</section></div>}
  </main>;
}

function DetectedValue({ label, value, highlighted }: { label: string; value: string; highlighted?: boolean }) { return <div className={`detected-row ${highlighted ? "changed" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, error, required, missing, children }: { label: string; error?: string; required?: boolean; missing?: boolean; children: React.ReactNode }) { return <label className={`field ${missing ? "missing" : ""}`}><span>{label} {required && <b>*</b>}</span>{children}{error && <small className="field-error">{error}</small>}</label>; }
function ReviewLine({ label, value }: { label: string; value: string }) { return <div className="review"><span>{label}</span><strong>{value || "-"}</strong></div>; }
